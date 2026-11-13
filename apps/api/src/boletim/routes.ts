import { Hono } from "hono";
import { z } from "zod";
import { isAdmin, requireAdmin, requirePainel, type PainelEnv } from "../auth/guards.js";
import type { Session } from "../auth/sessions.js";
import { botAtivo, listRoles, listTextChannels } from "../discord/bot.js";
import { gatewayStatus } from "../discord/gateway.js";
import { env } from "../env.js";
import { rateLimit } from "../security/rate-limit.js";
import { fimDoPeriodo, publicarRelatorio } from "./relatorio.js";
import { boletimStore, LIMITES } from "./store.js";

const snowflake = z.string().regex(/^\d{17,20}$/);

const semMencao = (s: string) => !/@(everyone|here)|<@[&!]?\d+>/i.test(s);
const linhaTexto = (max: number, vazio: string) =>
  z
    .string()
    .transform((s) => s.normalize("NFC").replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1, vazio).max(max, "texto_longo").refine(semMencao, "mencao_proibida"));
const blocoTexto = (max: number, obrigatorio: boolean) =>
  z
    .string()
    .transform((s) => s.normalize("NFC").replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "").replace(/\n{3,}/g, "\n\n").trim())
    .pipe(z.string().min(obrigatorio ? 1 : 0, "texto_vazio").max(max, "texto_longo").refine(semMencao, "mencao_proibida"));

const configBody = z.object({
  canalId: snowflake.nullable(),
  cargosPermitidos: z.array(snowflake).max(25, "muitos_cargos").transform((l) => [...new Set(l)]),
  cor: z.number().int().min(0).max(0xffffff),
  rodape: z
    .string()
    .transform((s) => s.normalize("NFC").replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1, "rodape_vazio").max(LIMITES.rodape, "rodape_longo").refine((s) => !/@(everyone|here)|<@[&!]?\d+>/i.test(s), "mencao_proibida")),
  relatorio: z
    .object({
      ativo: z.boolean(),
      canalId: snowflake.nullable(),
      intervaloHoras: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(6), z.literal(8), z.literal(12), z.literal(24)]),
      pularVazio: z.boolean(),
      unidade: linhaTexto(80, "unidade_vazia"),
      sigla: linhaTexto(30, "sigla_vazia"),
      resumoTexto: blocoTexto(500, true),
      determinacoes: blocoTexto(1500, false),
      assinatura: linhaTexto(60, "assinatura_vazia"),
    })
    .optional(),
});

function issueCode(err: z.ZodError): string {
  const msg = err.issues[0]?.message ?? "";
  return /^[a-z_]+$/.test(msg) ? msg : "dados_invalidos";
}

async function estado(session: Session) {
  const admin = isAdmin(session);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const [cargos, canais] = admin ? await Promise.all([listRoles(), listTextChannels()]) : [[], []];
  return {
    config: boletimStore.config(),
    admin,
    botAtivo,
    gateway: gatewayStatus(),
    guildId: env.DISCORD_GUILD_ID ?? null,
    hoje: boletimStore.contar(hoje.getTime()),
    semana: boletimStore.contar(Date.now() - 7 * 86_400_000),
    recentes: boletimStore.recentes(100),
    /** Quando sai o próximo relatório automático (null = desligado). */
    proximoRelatorio: (() => {
      const r = boletimStore.config().relatorio;
      return r.ativo && r.canalId ? fimDoPeriodo(Date.now(), r.intervaloHoras) + r.intervaloHoras * 3_600_000 : null;
    })(),
    limites: LIMITES,
    cargos,
    canais,
  };
}

export const boletimRoutes = new Hono<PainelEnv>();
const writeLimiter = rateLimit({ name: "boletim", limit: 20, windowMs: 60_000 });

boletimRoutes.use("*", requirePainel);

boletimRoutes.get("/", async (c) => c.json(await estado(c.get("session"))));

boletimRoutes.put("/config", writeLimiter, requireAdmin, async (c) => {
  const session = c.get("session");
  const parsed = configBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: issueCode(parsed.error) }, 422);
  const atual = boletimStore.config();
  const { relatorio: rel, ...resto } = parsed.data;
  // Ligou (ou mudou canal/intervalo): o primeiro relatório cobre o próximo período cheio, sem repetir o passado.
  const relatorio = rel
    ? {
        ...rel,
        numero: atual.relatorio.numero,
        ano: atual.relatorio.ano,
        ultimoFim:
          rel.ativo && (!atual.relatorio.ativo || rel.canalId !== atual.relatorio.canalId || rel.intervaloHoras !== atual.relatorio.intervaloHoras)
            ? fimDoPeriodo(Date.now(), rel.intervaloHoras)
            : atual.relatorio.ultimoFim,
      }
    : atual.relatorio;
  await boletimStore.saveConfig({ ...resto, relatorio, atualizadoEm: Date.now(), atualizadoPor: session.user.id });
  console.info(`[boletim] configuração alterada por discord:${session.user.id}`);
  return c.json(await estado(session));
});

/** Manda agora o relatório do último intervalo (para conferir como fica). Não mexe na agenda. */
boletimRoutes.post("/relatorio", writeLimiter, requireAdmin, async (c) => {
  const session = c.get("session");
  const r = boletimStore.config().relatorio;
  if (!botAtivo) return c.json({ error: "bot_desligado" }, 409);
  if (!r.canalId) return c.json({ error: "sem_canal_relatorio" }, 409);
  const n = await publicarRelatorio(Date.now() - r.intervaloHoras * 3_600_000, Date.now(), true);
  if (n <= 0) return c.json({ error: "falha_relatorio" }, 502);
  console.info(`[relatorio] enviado manualmente por discord:${session.user.id} (${n} mensagem(ns))`);
  return c.json(await estado(session));
});
