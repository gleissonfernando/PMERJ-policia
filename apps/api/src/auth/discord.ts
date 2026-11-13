import { Discord, generateCodeVerifier, generateState } from "arctic";
import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { setCommandRoles } from "../discord/bot.js";
import { alvoVisibilidade, voltaVisibilidade } from "../discord/visibilidade.js";
import { env, isProd } from "../env.js";
import { rateLimit } from "../security/rate-limit.js";
import { isAdmin } from "./guards.js";
import { createSession, destroySession, getSession, type LoginContext } from "./sessions.js";

/**
 * Login com Discord — OAuth2 Authorization Code + PKCE.
 *  - `state` aleatório, de uso único e com validade de 10 min (anti-CSRF no login)
 *  - PKCE: o code_verifier nunca sai do servidor
 *  - O access token do Discord é usado só no callback e descartado; nada
 *    sensível do Discord fica guardado
 */
const discord = new Discord(env.DISCORD_CLIENT_ID, env.DISCORD_CLIENT_SECRET, env.DISCORD_REDIRECT_URI);

const DISCORD_API = "https://discord.com/api/v10";
const OAUTH_COOKIE = isProd ? "__Host-pmerj_oauth" : "pmerj_oauth";
const OAUTH_TTL_MS = 10 * 60_000;

const CONTEXT_REDIRECT: Record<LoginContext, { ok: string; fail: string }> = {
  painel: { ok: "/painel", fail: "/entrar" },
  civil: { ok: "/cidadao", fail: "/acesso" },
};

interface PendingLogin {
  verifier: string;
  context: LoginContext;
  /** Para onde voltar depois do login (só endereços de transcript, validados). */
  volta: string | null;
  expiresAt: number;
  /** Fluxo "Aplicar no Discord" (quais cargos veem um comando): NÃO é login, não mexe na sessão. */
  visibilidade?: { chave: string; userId: string };
}
const pending = new Map<string, PendingLogin>();

setInterval(() => {
  const now = Date.now();
  for (const [k, p] of pending) if (p.expiresAt <= now) pending.delete(k);
}, 60_000).unref();

/** Retorno permitido depois do login: SÓ o transcript (evita redirecionar para outros sites). */
const VOLTA_PERMITIDA = /^\/transcript\/\d{17,20}(\?ticket=[0-9a-f-]{36})?$/;
const startQuery = z.object({
  context: z.enum(["painel", "civil"]).default("painel"),
  volta: z.string().max(120).regex(VOLTA_PERMITIDA).optional().catch(undefined),
});
const callbackQuery = z.object({
  code: z.string().min(1).max(512),
  state: z.string().min(1).max(128),
});

const discordUser = z.object({
  id: z.string().regex(/^\d{17,20}$/),
  username: z.string().max(64),
  global_name: z.string().max(64).nullable().optional(),
  avatar: z.string().max(64).nullable().optional(),
});
const guildMember = z.object({ roles: z.array(z.string()) });

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Redireciona com um código de erro conhecido (nunca repassa texto vindo de fora). */
type LoginError = "cancelado" | "expirado" | "invalido" | "nao_membro" | "falha_discord";
const fail = (path: string, code: LoginError) => `${path}?erro=${code}`;

export const authRoutes = new Hono();

const authLimiter = rateLimit({ name: "auth", limit: 20, windowMs: 60_000 });

authRoutes.get("/discord", authLimiter, (c) => {
  const parsed = startQuery.safeParse(c.req.query());
  if (!parsed.success) return c.redirect(fail("/", "invalido"));
  const { context, volta } = parsed.data;

  const state = generateState();
  const verifier = generateCodeVerifier();
  pending.set(state, { verifier, context, volta: volta ?? null, expiresAt: Date.now() + OAUTH_TTL_MS });

  // Amarra o fluxo ao navegador que iniciou o login.
  setCookie(c, OAUTH_COOKIE, state, {
    httpOnly: true,
    secure: isProd,
    sameSite: "Lax",
    path: "/",
    maxAge: OAUTH_TTL_MS / 1000,
  });

  const scopes = env.DISCORD_GUILD_ID ? ["identify", "guilds.members.read"] : ["identify"];
  const url = discord.createAuthorizationURL(state, verifier, scopes);
  url.searchParams.set("prompt", "none");
  return c.redirect(url.toString());
});

/**
 * "Aplicar no Discord": o ADMIN autoriza (escopo applications.commands.permissions.update) e o
 * callback define quais cargos veem o comando. O token é usado uma vez e revogado; a sessão não muda.
 * O Discord ainda exige que a conta tenha "Gerenciar servidor" e "Gerenciar cargos" no servidor.
 */
authRoutes.get("/discord/visibilidade", authLimiter, (c) => {
  const chave = c.req.query("comando") ?? "";
  const alvo = /^[a-z0-9-]{1,40}$/.test(chave) ? alvoVisibilidade(chave) : undefined;
  if (!alvo) return c.redirect("/painel");
  const session = getSession(c);
  if (!session || session.context !== "painel" || !session.guildMember || !isAdmin(session, chave)) return c.redirect(voltaVisibilidade(alvo.volta, "proibido"));

  const state = generateState();
  const verifier = generateCodeVerifier();
  pending.set(state, { verifier, context: "painel", volta: null, expiresAt: Date.now() + OAUTH_TTL_MS, visibilidade: { chave, userId: session.user.id } });
  setCookie(c, OAUTH_COOKIE, state, { httpOnly: true, secure: isProd, sameSite: "Lax", path: "/", maxAge: OAUTH_TTL_MS / 1000 });

  const url = discord.createAuthorizationURL(state, verifier, ["identify", "applications.commands.permissions.update"]);
  return c.redirect(url.toString());
});

async function concluirVisibilidade(c: Context, login: PendingLogin & { visibilidade: { chave: string; userId: string } }, code: string) {
  const alvo = alvoVisibilidade(login.visibilidade.chave);
  if (!alvo) return c.redirect("/painel");
  const voltar = (r: string) => c.redirect(voltaVisibilidade(alvo.volta, r));
  // Quem autorizou precisa continuar logado como o mesmo admin.
  const session = getSession(c);
  if (!session || session.user.id !== login.visibilidade.userId || !isAdmin(session, login.visibilidade.chave)) return voltar("proibido");

  let token: string | null = null;
  try {
    const tokens = await discord.validateAuthorizationCode(code, login.verifier);
    token = tokens.accessToken();
    const userRes = await fetch(`${DISCORD_API}/users/@me`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8_000) });
    if (!userRes.ok) throw new Error(`users/@me ${userRes.status}`);
    // A conta autorizada no Discord tem que ser a mesma da sessão.
    if (discordUser.parse(await userRes.json()).id !== session.user.id) return voltar("conta_diferente");

    const cargos = alvo.cargos();
    const r = await setCommandRoles(token, alvo.comando, cargos);
    if (!r.ok) return voltar(r.erro);
    await alvo.aoAplicar(cargos, { id: session.user.id, nome: session.user.globalName ?? session.user.username });
    console.info(`[auth] visibilidade de /${alvo.comando} aplicada por discord:${session.user.id} (${cargos.length} cargos)`);
    return voltar("ok");
  } catch (err) {
    console.error("[auth] falha ao aplicar visibilidade:", err instanceof Error ? err.message : err);
    return voltar("falha_discord");
  } finally {
    if (token) discord.revokeToken(token).catch(() => {});
  }
}

authRoutes.get("/discord/callback", authLimiter, async (c) => {
  const cookieState = getCookie(c, OAUTH_COOKIE);
  deleteCookie(c, OAUTH_COOKIE, { path: "/", secure: isProd });

  // Usuário clicou em "Cancelar" na tela do Discord.
  if (c.req.query("error")) {
    const p = cookieState ? pending.get(cookieState) : undefined;
    if (cookieState) pending.delete(cookieState);
    const alvo = p?.visibilidade ? alvoVisibilidade(p.visibilidade.chave) : undefined;
    if (alvo) return c.redirect(voltaVisibilidade(alvo.volta, "cancelado"));
    return c.redirect(fail(CONTEXT_REDIRECT[p?.context ?? "painel"].fail, "cancelado"));
  }

  const parsed = callbackQuery.safeParse(c.req.query());
  if (!parsed.success || !cookieState || !safeEqual(parsed.data.state, cookieState)) {
    return c.redirect(fail("/entrar", "invalido"));
  }

  const login = pending.get(parsed.data.state);
  pending.delete(parsed.data.state); // uso único
  if (!login || login.expiresAt <= Date.now()) {
    return c.redirect(fail("/entrar", "expirado"));
  }
  if (login.visibilidade) return concluirVisibilidade(c, { ...login, visibilidade: login.visibilidade }, parsed.data.code);
  const target = CONTEXT_REDIRECT[login.context];

  try {
    const tokens = await discord.validateAuthorizationCode(parsed.data.code, login.verifier);
    const headers = { Authorization: `Bearer ${tokens.accessToken()}` };

    const userRes = await fetch(`${DISCORD_API}/users/@me`, { headers, signal: AbortSignal.timeout(8_000) });
    if (!userRes.ok) throw new Error(`users/@me ${userRes.status}`);
    const user = discordUser.parse(await userRes.json());

    let isMember = !env.DISCORD_GUILD_ID; // sem guild configurada (apenas dev) → liberado
    let roles: string[] = [];
    if (env.DISCORD_GUILD_ID) {
      const memberRes = await fetch(`${DISCORD_API}/users/@me/guilds/${env.DISCORD_GUILD_ID}/member`, {
        headers,
        signal: AbortSignal.timeout(8_000),
      });
      if (memberRes.ok) {
        isMember = true;
        roles = guildMember.parse(await memberRes.json()).roles;
      } else if (memberRes.status !== 404) {
        throw new Error(`guild member ${memberRes.status}`);
      }
    }

    // Revoga o token do Discord: não precisamos mais dele.
    discord.revokeToken(tokens.accessToken()).catch(() => {});

    if (login.context === "painel" && !isMember) {
      return c.redirect(fail(target.fail, "nao_membro"));
    }

    destroySession(c); // evita fixação de sessão
    createSession(c, {
      user: {
        id: user.id,
        username: user.username,
        globalName: user.global_name ?? null,
        avatar: user.avatar ?? null,
      },
      context: login.context,
      guildMember: isMember,
      roles,
    });

    console.info(`[auth] login ${login.context} discord:${user.id}`);
    return c.redirect(login.volta && VOLTA_PERMITIDA.test(login.volta) ? login.volta : target.ok);
  } catch (err) {
    console.error("[auth] falha no callback do Discord:", err instanceof Error ? err.message : err);
    return c.redirect(fail(target.fail, "falha_discord"));
  }
});

authRoutes.post("/logout", (c) => {
  const session = getSession(c);
  destroySession(c);
  if (session) console.info(`[auth] logout discord:${session.user.id}`);
  return c.body(null, 204);
});
