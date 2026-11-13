import { Hono } from "hono";
import { z } from "zod";
import { isAdmin, requireAdmin, requirePainel, type PainelEnv } from "../auth/guards.js";
import type { Session } from "../auth/sessions.js";
import { botAtivo, listRoles, listTextChannels, memberRoles } from "../discord/bot.js";
import { gatewayStatus } from "../discord/gateway.js";
import { env } from "../env.js";
import { rateLimit } from "../security/rate-limit.js";
import { atualizarPaineisPublicados, podeUsar, publicarPainel, removerPainel } from "./discord.js";
import { assuncaoStore, MAX_ASSUNCOES, MAX_DEMAIS } from "./store.js";
import type { Assuncao } from "./types.js";

/* ---------- Validação ---------- */

const snowflake = z.string().regex(/^\d{17,20}$/);
const semMencao = (s: string) => !/@(everyone|here)|<[@#][&!]?\d+>/i.test(s);
const linha = (max: number, vazio: string, longo: string) =>
  z
    .string()
    .transform((s) => s.normalize("NFC").replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1, vazio).max(max, longo).refine(semMencao, "mencao_proibida"));
const cargos = z.array(snowflake).max(25, "muitos_cargos").transform((l) => [...new Set(l)]);

const rotulo = z.object({
  label: linha(45, "campo_vazio", "campo_longo"),
  descricao: z
    .string()
    .transform((s) => s.normalize("NFC").replace(/\s+/g, " ").trim())
    .pipe(z.string().max(100, "descricao_campo_longa").refine(semMencao, "mencao_proibida")),
});

const assuncaoBody = z.object({
  id: z.string().regex(/^[a-z0-9_-]{3,24}$/, "id_invalido"),
  nome: linha(40, "nome_vazio", "nome_longo"),
  // Um emoji Unicode curto (sem emoji personalizado, que o botão não aceita em texto).
  emoji: z.string().trim().max(16, "emoji_invalido").refine((s) => s === "" || /^\p{Extended_Pictographic}/u.test(s), "emoji_invalido"),
  descricao: z
    .string()
    .transform((s) => s.normalize("NFC").replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim())
    .pipe(z.string().min(1, "descricao_vazia").max(600, "descricao_longa").refine(semMencao, "mencao_proibida")),
  cor: z.number().int().min(0).max(0xffffff),
  ativa: z.boolean(),
  cargosPermitidos: cargos,
  cargosComandante: cargos,
  canalResultadoId: snowflake.nullable(),
  setores: z
    .array(linha(60, "setor_vazio", "setor_longo"))
    .max(25, "muitos_setores")
    .transform((l) => [...new Set(l)]),
  maxDemais: z.number().int().min(0).max(MAX_DEMAIS),
  mencionar: z.boolean(),
  campos: z.object({ setor: rotulo, viatura: rotulo, comandante: rotulo, motopol: rotulo, demais: rotulo }),
});

const configBody = z.object({
  assuncoes: z
    .array(assuncaoBody)
    .min(1, "nenhuma_assuncao")
    .max(MAX_ASSUNCOES, "muitas_assuncoes")
    .refine((l) => new Set(l.map((a) => a.id)).size === l.length, "id_repetido"),
});

function issueCode(err: z.ZodError): string {
  const msg = err.issues[0]?.message ?? "";
  return /^[a-z_]+$/.test(msg) ? msg : "dados_invalidos";
}

/* ---------- Estado ---------- */

async function estado(session: Session) {
  const admin = isAdmin(session);
  // Cargos ATUAIS do Discord: quem perde o cargo deixa de ver os registros na hora.
  const roles = (await memberRoles(session.user.id)) ?? session.roles;
  const lista = assuncaoStore.lista();
  const minhas = lista.filter((a) => podeUsar(a, roles)).map((a) => a.id);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const [canais, cargosServidor] = admin ? await Promise.all([listTextChannels(), listRoles()]) : [[], []];
  const ver = admin || minhas.length > 0;
  return {
    assuncoes: lista,
    ...assuncaoStore.meta(),
    admin,
    /** IDs das assunções que esta pessoa pode registrar no Discord. */
    minhas,
    guildId: env.DISCORD_GUILD_ID ?? null,
    botAtivo,
    gateway: gatewayStatus(),
    limites: { assuncoes: MAX_ASSUNCOES, demais: MAX_DEMAIS },
    hoje: assuncaoStore.contar(hoje.getTime()),
    semana: assuncaoStore.contar(Date.now() - 7 * 86_400_000),
    recentes: ver ? assuncaoStore.recentes(100) : [],
    canais,
    cargos: cargosServidor,
  };
}

/* ---------- Rotas ---------- */

export const assuncaoRoutes = new Hono<PainelEnv>();
const writeLimiter = rateLimit({ name: "assuncao", limit: 20, windowMs: 60_000 });

assuncaoRoutes.use("*", requirePainel);

assuncaoRoutes.get("/", async (c) => c.json(await estado(c.get("session"))));

assuncaoRoutes.put("/config", writeLimiter, requireAdmin, async (c) => {
  const session = c.get("session");
  const parsed = configBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: issueCode(parsed.error) }, 422);

  const antigas = new Map(assuncaoStore.lista().map((a) => [a.id, a]));
  const novas: Assuncao[] = parsed.data.assuncoes.map((a) => ({ ...a, painel: antigas.get(a.id)?.painel ?? null }));
  const ficam = new Set(novas.map((a) => a.id));
  for (const a of antigas.values()) if (!ficam.has(a.id)) removerPainel(a);

  await assuncaoStore.salvarLista(novas, session.user.id);
  void atualizarPaineisPublicados();
  console.info(`[assuncao] configuração alterada por discord:${session.user.id}`);
  return c.json(await estado(session));
});

/** Publica (ou atualiza) o painel com o botão "Assumir serviço" de uma assunção. */
assuncaoRoutes.post("/painel", writeLimiter, requireAdmin, async (c) => {
  const session = c.get("session");
  const parsed = z.object({ assuncaoId: z.string().max(24), canalId: snowflake }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "canal_invalido" }, 422);
  if (!botAtivo) return c.json({ error: "bot_desligado" }, 409);
  const a = assuncaoStore.buscar(parsed.data.assuncaoId);
  if (!a) return c.json({ error: "salve_antes" }, 404);

  const painel = await publicarPainel(a, parsed.data.canalId);
  if (!painel) return c.json({ error: "falha_publicar" }, 502);
  await assuncaoStore.definirPainel(a.id, painel);
  console.info(`[assuncao] painel "${a.nome}" publicado no canal ${painel.canalId} por discord:${session.user.id}`);
  return c.json(await estado(session));
});
