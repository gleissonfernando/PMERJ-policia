import { Hono } from "hono";
import { z } from "zod";
import { isAdmin, requireAdmin, requirePainel, type PainelEnv } from "../auth/guards.js";
import type { Session } from "../auth/sessions.js";
import { botAtivo, listRoles, listTextChannels, memberRoles } from "../discord/bot.js";
import { gatewayStatus } from "../discord/gateway.js";
import { env } from "../env.js";
import { rateLimit } from "../security/rate-limit.js";
import { atualizarPainelPublicado, podeUsar, publicarPainel } from "./discord.js";
import { inteligenciaStore, MAX_FOTOS, MAX_LINKS, MAX_POLICIAIS } from "./store.js";
import type { InteligenciaConfig } from "./types.js";

/* ---------- Validação ---------- */

const snowflake = z.string().regex(/^\d{17,20}$/);
const semMencao = (s: string) => !/@(everyone|here)|<[@#][&!]?\d+>/i.test(s);
const linha = (max: number, vazio: string, longo: string) =>
  z
    .string()
    .transform((s) => s.normalize("NFC").replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1, vazio).max(max, longo).refine(semMencao, "mencao_proibida"));

const rotulo = z.object({
  label: linha(45, "campo_vazio", "campo_longo"),
  descricao: z
    .string()
    .transform((s) => s.normalize("NFC").replace(/\s+/g, " ").trim())
    .pipe(z.string().max(100, "descricao_campo_longa").refine(semMencao, "mencao_proibida")),
});

const configBody = z.object({
  nome: linha(40, "nome_vazio", "nome_longo"),
  emoji: z.string().trim().max(16, "emoji_invalido").refine((s) => s === "" || /^\p{Extended_Pictographic}/u.test(s), "emoji_invalido"),
  descricao: z
    .string()
    .transform((s) => s.normalize("NFC").replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim())
    .pipe(z.string().min(1, "descricao_vazia").max(600, "descricao_longa").refine(semMencao, "mencao_proibida")),
  cor: z.number().int().min(0).max(0xffffff),
  ativa: z.boolean(),
  cargosPermitidos: z.array(snowflake).max(25, "muitos_cargos").transform((l) => [...new Set(l)]),
  canalResultadoId: snowflake.nullable(),
  objetos: z
    .array(linha(100, "objeto_vazio", "objeto_longo"))
    .max(25, "muitos_objetos")
    .transform((l) => [...new Set(l)]),
  maxPoliciais: z.number().int().min(1).max(MAX_POLICIAIS),
  exigirFoto: z.boolean(),
  mencionar: z.boolean(),
  campos: z.object({ quantidade: rotulo, policiais: rotulo, objeto: rotulo, fotos: rotulo, link: rotulo }),
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
  const pode = podeUsar(roles);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const [canais, cargos] = admin ? await Promise.all([listTextChannels(), listRoles()]) : [[], []];
  return {
    config: inteligenciaStore.config(),
    admin,
    podeUsar: pode,
    guildId: env.DISCORD_GUILD_ID ?? null,
    botAtivo,
    gateway: gatewayStatus(),
    limites: { policiais: MAX_POLICIAIS, fotos: MAX_FOTOS, links: MAX_LINKS },
    hoje: inteligenciaStore.contar(hoje.getTime()),
    semana: inteligenciaStore.contar(Date.now() - 7 * 86_400_000),
    // Informação de inteligência: registros só para quem usa ou administra.
    recentes: admin || pode ? inteligenciaStore.recentes(100) : [],
    canais,
    cargos,
  };
}

/* ---------- Rotas ---------- */

export const inteligenciaRoutes = new Hono<PainelEnv>();
const writeLimiter = rateLimit({ name: "inteligencia", limit: 20, windowMs: 60_000 });

inteligenciaRoutes.use("*", requirePainel);

inteligenciaRoutes.get("/", async (c) => c.json(await estado(c.get("session"))));

inteligenciaRoutes.put("/config", writeLimiter, requireAdmin, async (c) => {
  const session = c.get("session");
  const parsed = configBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: issueCode(parsed.error) }, 422);

  const config: InteligenciaConfig = {
    ...parsed.data,
    painel: inteligenciaStore.config().painel,
    atualizadoEm: Date.now(),
    atualizadoPor: session.user.id,
  };
  await inteligenciaStore.saveConfig(config);
  void atualizarPainelPublicado();
  console.info(`[inteligencia] configuração alterada por discord:${session.user.id}`);
  return c.json(await estado(session));
});

inteligenciaRoutes.post("/painel", writeLimiter, requireAdmin, async (c) => {
  const session = c.get("session");
  const parsed = z.object({ canalId: snowflake }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "canal_invalido" }, 422);
  if (!botAtivo) return c.json({ error: "bot_desligado" }, 409);

  const painel = await publicarPainel(parsed.data.canalId);
  if (!painel) return c.json({ error: "falha_publicar" }, 502);
  await inteligenciaStore.saveConfig({ ...inteligenciaStore.config(), painel });
  console.info(`[inteligencia] painel publicado no canal ${painel.canalId} por discord:${session.user.id}`);
  return c.json(await estado(session));
});
