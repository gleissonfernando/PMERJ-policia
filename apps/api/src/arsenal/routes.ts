import { Hono } from "hono";
import { z } from "zod";
import { isAdmin, requirePainel, type PainelEnv } from "../auth/guards.js";
import type { Session } from "../auth/sessions.js";
import { botAtivo, listRoles, listTextChannels, memberRoles } from "../discord/bot.js";
import { gatewayStatus } from "../discord/gateway.js";
import { env } from "../env.js";
import { rateLimit } from "../security/rate-limit.js";
import { acesso, ArsenalError, devolver, publicarPainel, recuperar } from "./service.js";
import { arsenalStore, LIMITES } from "./store.js";

const snowflake = z.string().regex(/^\d{17,20}$/);
const cargos = z.array(snowflake).max(25, "muitos_cargos").transform((l) => [...new Set(l)]);
const configBody = z.object({
  painelCanalId: snowflake.nullable(),
  canalRetiradasId: snowflake.nullable(),
  canalPerdasId: snowflake.nullable(),
  cargosUsar: cargos,
  cargosGestao: cargos,
  armas: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9-]{1,40}$/),
        nome: z
          .string()
          .transform((s) => s.normalize("NFC").replace(/\s+/g, " ").trim())
          .pipe(z.string().min(1, "arma_sem_nome").max(LIMITES.armaNome, "texto_longo")),
        emoji: z.string().trim().max(64),
      }),
    )
    .max(LIMITES.armas, "muitas_armas")
    .refine((l) => new Set(l.map((a) => a.id)).size === l.length, "arma_repetida"),
});

async function acessoWeb(session: Session) {
  const roles = (await memberRoles(session.user.id)) ?? session.roles;
  return acesso(session.user.id, roles, isAdmin(session));
}

async function estado(session: Session) {
  const ac = await acessoWeb(session);
  const [listaCargos, canais] = ac.podeConfigurar ? await Promise.all([listRoles(), listTextChannels()]) : [[], []];
  const itens = arsenalStore.itens();
  return {
    acesso: ac,
    config: arsenalStore.config(),
    botAtivo,
    gateway: gatewayStatus(),
    guildId: env.DISCORD_GUILD_ID ?? null,
    emUso: ac.gestao ? itens.filter((i) => i.status === "retirada").sort((a, b) => b.desde - a.desde) : [],
    perdidas: ac.gestao ? itens.filter((i) => i.status === "perdida").sort((a, b) => b.desde - a.desde) : [],
    movimentos: ac.gestao ? [...arsenalStore.movimentos()].reverse().slice(0, 300) : [],
    limites: LIMITES,
    cargos: listaCargos,
    canais,
  };
}

const erro = (err: unknown) => (err instanceof ArsenalError ? err.message : "Não foi possível concluir. Tente novamente.");

export const arsenalRoutes = new Hono<PainelEnv>();
const writeLimiter = rateLimit({ name: "arsenal", limit: 30, windowMs: 60_000 });

arsenalRoutes.use("*", requirePainel);

arsenalRoutes.get("/", async (c) => c.json(await estado(c.get("session"))));

arsenalRoutes.put("/config", writeLimiter, async (c) => {
  const session = c.get("session");
  if (!(await acessoWeb(session)).podeConfigurar) return c.json({ error: "proibido" }, 403);
  const parsed = configBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "";
    return c.json({ error: /^[a-z_]+$/.test(msg) ? msg : "dados_invalidos" }, 422);
  }
  const atual = arsenalStore.config();
  await arsenalStore.saveConfig({
    ...parsed.data,
    ...(parsed.data.painelCanalId !== atual.painelCanalId ? { painelMensagemId: null } : {}),
    atualizadoEm: Date.now(),
    atualizadoPor: session.user.id,
  });
  console.info(`[arsenal] configuração alterada por discord:${session.user.id}`);
  // Painel já publicado acompanha a lista de armas.
  let aviso: string | null = null;
  if (arsenalStore.config().painelMensagemId && botAtivo) await publicarPainel(false).catch((err: unknown) => void (aviso = `Salvo, mas o painel não foi atualizado: ${erro(err)}`));
  return c.json({ ...(await estado(session)), aviso });
});

arsenalRoutes.post("/painel", writeLimiter, async (c) => {
  const session = c.get("session");
  if (!(await acessoWeb(session)).podeConfigurar) return c.json({ error: "proibido" }, 403);
  if (!botAtivo) return c.json({ error: "O bot não está configurado no servidor." }, 409);
  const recriar = Boolean(((await c.req.json().catch(() => ({}))) as { recreate?: unknown }).recreate);
  try {
    await publicarPainel(recriar);
  } catch (err) {
    return c.json({ error: erro(err) }, 502);
  }
  return c.json(await estado(session));
});

/** Gestão pelo site: dar baixa (devolvida) numa arma retirada ou recuperar uma perdida. */
arsenalRoutes.post("/acao", writeLimiter, async (c) => {
  const session = c.get("session");
  const ac = await acessoWeb(session);
  if (!ac.gestao) return c.json({ error: "proibido" }, 403);
  const parsed = z
    .object({ chave: z.string().min(3).max(90), acao: z.enum(["devolver", "recuperar"]), motivo: z.string().max(LIMITES.motivo).optional() })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "dados_invalidos" }, 422);
  const quem = { id: session.user.id, nome: (session.user.globalName ?? session.user.username).slice(0, 80) };
  try {
    const texto =
      parsed.data.acao === "devolver"
        ? await devolver(quem, parsed.data.chave, { gestao: true, web: true })
        : await recuperar(quem, parsed.data.chave, parsed.data.motivo ?? null, { gestao: true, web: true });
    return c.json({ ...(await estado(session)), aviso: /⚠️/.test(texto) ? texto.split("\n").pop() : null });
  } catch (err) {
    return c.json({ error: erro(err) }, 409);
  }
});
