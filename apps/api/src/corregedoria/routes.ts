import { Hono, type Context } from "hono";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { isAdmin, requireAdmin, requirePainel, type PainelEnv } from "../auth/guards.js";
import { getSession, type Session } from "../auth/sessions.js";
import { botAtivo, listCategories, listRoles, listTextChannels, memberRoles } from "../discord/bot.js";
import { gatewayStatus } from "../discord/gateway.js";
import { rateLimit } from "../security/rate-limit.js";
import { lerAnexo, TIPO_POR_EXT } from "./arquivos.js";
import { atualizarPainelPublicado, publicarPainel } from "./discord.js";
import { ehCorregedor } from "./service.js";
import { corregStore, type Ticket } from "./store.js";

const snowflake = z.string().regex(/^\d{17,20}$/);
const linha = (min: number, max: number) =>
  z
    .string()
    .transform((s) => s.normalize("NFC").replace(/\s+/g, " ").trim())
    .pipe(z.string().min(min, "texto_curto").max(max, "texto_longo").refine((s) => !/@(everyone|here)|<@&?\d+>/i.test(s), "mencao_proibida"));

const configBody = z
  .object({
    tipos: z
      .array(z.object({ id: z.string().regex(/^[a-z0-9-]{1,40}$/), nome: linha(2, 60), descricao: linha(0, 100), emoji: z.string().max(16).regex(/^\S*$/u, "emoji_invalido") }))
      .min(1, "sem_tipos")
      .max(25, "muitos_tipos"),
    cargosCorregedoria: z.array(snowflake).max(25, "muitos_cargos").transform((l) => [...new Set(l)]),
    categoriaId: snowflake.nullable(),
    logCanalId: snowflake.nullable(),
    nomeExibicao: linha(2, 80),
  })
  .superRefine((c, ctx) => {
    const ids = c.tipos.map((t) => t.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["tipos"], message: "tipos_repetidos" });
  });

function issueCode(err: z.ZodError): string {
  const msg = err.issues[0]?.message ?? "";
  return /^[a-z_]+$/.test(msg) ? msg : "dados_invalidos";
}

const cargosDe = async (s: Session) => (await memberRoles(s.user.id)) ?? s.roles;

/* ---------- Transcript: o que cada um pode ver ---------- */

/**
 * Para quem abriu: a equipe aparece SÓ pelo nome de exibição — nenhum ID, nome ou avatar real.
 * Para a corregedoria/admin: mostra também quem foi o agente (uso interno).
 */
export function transcript(t: Ticket, equipe: boolean) {
  const exib = corregStore.config().nomeExibicao;
  return {
    id: t.id,
    numero: t.numero,
    tipo: t.tipo,
    motivo: t.motivo,
    assunto: t.assunto,
    descricao: t.descricao,
    provas: t.provas,
    status: t.status,
    abertoEm: t.abertoEm,
    fechadoEm: t.fechadoEm,
    denunciante: { id: t.userId, username: t.username, avatar: t.avatar, nome: t.nome, insignia: t.insignia },
    nomeExibicao: exib,
    assumido: Boolean(t.assumidoPor),
    ...(equipe ? { interno: { assumidoPor: t.assumidoPor, fechadoPor: t.fechadoPor } } : {}),
    eventos: t.eventos.map((e) => ({
      id: e.id,
      tipo: e.tipo,
      papel: e.papel,
      conteudo: e.conteudo,
      anexos: e.anexos,
      em: e.em,
      autor:
        e.papel === "denunciante"
          ? { nome: t.nome, avatar: t.avatar, id: t.userId }
          : // Equipe e sistema: anônimos para quem abriu.
            { nome: exib, avatar: null, id: null, ...(equipe && e.autor ? { agente: e.autor.nome, agenteId: e.autor.id } : {}) },
    })),
  };
}

/** Chave do link conferida em tempo constante (não vaza nada por tempo de resposta). */
function chaveConfere(t: Ticket, chave: string | undefined): boolean {
  if (!chave || chave.length > 64) return false;
  const a = Buffer.from(t.chave);
  const b = Buffer.from(chave);
  return a.length === b.length && timingSafeEqual(a, b);
}

function ticketPelaChave(ticketId: string | undefined, chave: string | undefined): Ticket | null {
  if (!ticketId || !/^[0-9a-f-]{36}$/.test(ticketId)) return null;
  const t = corregStore.byId(ticketId);
  return t && chaveConfere(t, chave) ? t : null;
}

/** Sessão de qualquer contexto (o policial pode ter entrado pelo portal civil também). */
async function acesso(c: Context, userId: string): Promise<{ ok: true; equipe: boolean } | { ok: false; status: 401 | 403 }> {
  const s = getSession(c);
  if (!s) return { ok: false, status: 401 };
  const equipe = isAdmin(s) || ehCorregedor(await cargosDe(s));
  if (s.user.id !== userId && !equipe) return { ok: false, status: 403 };
  return { ok: true, equipe };
}

/* ---------- Rotas ---------- */

export const corregedoriaRoutes = new Hono<PainelEnv>();
const writeLimiter = rateLimit({ name: "corregedoria", limit: 20, windowMs: 60_000 });
const leituraLimiter = rateLimit({ name: "transcript", limit: 120, windowMs: 60_000 });

/* Transcript (antes do requirePainel: quem abriu pode não ter acesso ao painel militar). */

corregedoriaRoutes.get("/transcript/:userId", leituraLimiter, async (c) => {
  const userId = c.req.param("userId");
  if (!/^\d{17,20}$/.test(userId)) return c.json({ error: "nao_encontrado" }, 404);
  // Link com a chave do ticket: abre SEM login (só aquele ticket, e só depois de fechado).
  const porChave = ticketPelaChave(c.req.query("ticket"), c.req.query("chave"));
  if (porChave && porChave.userId === userId && porChave.status === "fechado") return c.json({ tickets: [transcript(porChave, false)], equipe: false });
  const a = await acesso(c, userId);
  if (!a.ok) return c.json({ error: a.status === 401 ? "nao_autenticado" : "proibido" }, a.status);
  const tickets = corregStore
    .doUsuario(userId)
    .filter((t) => t.status === "fechado" || a.equipe)
    .sort((x, y) => y.abertoEm - x.abertoEm)
    .map((t) => transcript(t, a.equipe));
  return c.json({ tickets, equipe: a.equipe });
});

corregedoriaRoutes.get("/arquivos/:ticketId/:arquivo", leituraLimiter, async (c) => {
  const t = corregStore.byId(c.req.param("ticketId"));
  if (!t) return c.json({ error: "nao_encontrado" }, 404);
  const comChave = chaveConfere(t, c.req.query("chave"));
  const a = comChave ? { ok: true as const } : await acesso(c, t.userId);
  if (!a.ok) return c.json({ error: a.status === 401 ? "nao_autenticado" : "proibido" }, a.status);
  const nome = c.req.param("arquivo");
  const dados = await lerAnexo(t.id, nome);
  if (!dados) return c.json({ error: "nao_encontrado" }, 404);
  return new Response(new Uint8Array(dados), {
    headers: {
      "Content-Type": TIPO_POR_EXT[nome.split(".").pop() ?? ""] ?? "application/octet-stream",
      "Content-Length": String(dados.length),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, max-age=3600",
    },
  });
});

/* Painel militar */

corregedoriaRoutes.use("*", requirePainel);

async function estado(session: Session) {
  const admin = isAdmin(session);
  const equipe = ehCorregedor(await cargosDe(session));
  const [cargos, canais, categorias] = admin ? await Promise.all([listRoles(), listTextChannels(), listCategories()]) : [[], [], []];
  const tickets = admin || equipe ? [...corregStore.tickets()].sort((a, b) => b.abertoEm - a.abertoEm).slice(0, 100) : [];
  return {
    config: corregStore.config(),
    admin,
    equipe,
    botAtivo,
    gateway: gatewayStatus(),
    tickets: tickets.map((t) => ({
      id: t.id,
      numero: t.numero,
      userId: t.userId,
      username: t.username,
      avatar: t.avatar,
      nome: t.nome,
      insignia: t.insignia,
      tipo: t.tipo,
      assunto: t.assunto,
      status: t.status,
      assumido: Boolean(t.assumidoPor),
      agente: t.assumidoPor?.nome ?? null,
      provas: t.provas.length,
      abertoEm: t.abertoEm,
      fechadoEm: t.fechadoEm,
      canalId: t.canalId,
    })),
    abertos: corregStore.tickets().filter((t) => t.status === "aberto").length,
    cargos,
    canais,
    categorias,
  };
}

corregedoriaRoutes.get("/", async (c) => c.json(await estado(c.get("session"))));

corregedoriaRoutes.put("/config", writeLimiter, requireAdmin, async (c) => {
  const session = c.get("session");
  const parsed = configBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: issueCode(parsed.error) }, 422);
  await corregStore.saveConfig({ ...parsed.data, painel: corregStore.config().painel, atualizadoEm: Date.now(), atualizadoPor: session.user.id });
  void atualizarPainelPublicado();
  console.info(`[corregedoria] configuração alterada por discord:${session.user.id}`);
  return c.json(await estado(session));
});

corregedoriaRoutes.post("/painel", writeLimiter, requireAdmin, async (c) => {
  const session = c.get("session");
  const parsed = z.object({ canalId: snowflake }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "canal_invalido" }, 422);
  if (!botAtivo) return c.json({ error: "bot_desligado" }, 409);
  const painel = await publicarPainel(parsed.data.canalId);
  if (!painel) return c.json({ error: "falha_publicar" }, 502);
  await corregStore.saveConfig({ ...corregStore.config(), painel });
  return c.json(await estado(session));
});
