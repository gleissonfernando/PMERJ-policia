import { Hono } from "hono";
import { z } from "zod";
import { isAdmin, requirePainel, type PainelEnv } from "../auth/guards.js";
import type { Session } from "../auth/sessions.js";
import { botAtivo, listCategories, listRoles, listTextChannels, memberRoles } from "../discord/bot.js";
import { gatewayStatus } from "../discord/gateway.js";
import { lerMidia } from "../doesp/media.js";
import { env } from "../env.js";
import { rateLimit } from "../security/rate-limit.js";
import { acesso, OcorrenciaError, publicarPainel } from "./service.js";
import { dadosResumo, publicarResumo, segundaDaSemana, semanaAtual } from "./resumo.js";
import { LIMITES, ocorrenciaStore } from "./store.js";

const snowflake = z.string().regex(/^\d{17,20}$/);
const cargos = z.array(snowflake).max(25, "muitos_cargos").transform((l) => [...new Set(l)]);
const linhaUnica = (max: number, vazio: string) =>
  z
    .string()
    .transform((s) => s.normalize("NFC").replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1, vazio).max(max, "texto_longo"));

const configBody = z.object({
  painelCanalId: snowflake.nullable(),
  destinoCanalId: snowflake.nullable(),
  categoriaId: snowflake.nullable(),
  cargosRegistrar: cargos,
  cargosGestores: cargos,
  canalResumoId: snowflake.nullable().default(null),
  tipos: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9-]{1,40}$/),
        nome: linhaUnica(LIMITES.tipoNome, "tipo_sem_nome"),
        emoji: z.string().trim().max(64),
        descricao: z.string().transform((s) => s.replace(/\s+/g, " ").trim()).pipe(z.string().max(LIMITES.tipoDescricao, "texto_longo")),
      }),
    )
    .max(LIMITES.tipos, "muitos_tipos")
    .refine((l) => new Set(l.map((t) => t.id)).size === l.length, "tipo_repetido"),
});

function issueCode(err: z.ZodError): string {
  const msg = err.issues[0]?.message ?? "";
  return /^[a-z_]+$/.test(msg) ? msg : "dados_invalidos";
}

async function acessoWeb(session: Session) {
  const roles = (await memberRoles(session.user.id)) ?? session.roles;
  return acesso(session.user.id, roles, isAdmin(session));
}

async function estado(session: Session) {
  const ac = await acessoWeb(session);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const [listaCargos, canais, categorias] = ac.podeConfigurar ? await Promise.all([listRoles(), listTextChannels(), listCategories()]) : [[], [], []];
  return {
    acesso: ac,
    config: ocorrenciaStore.config(),
    botAtivo,
    gateway: gatewayStatus(),
    guildId: env.DISCORD_GUILD_ID ?? null,
    hoje: ocorrenciaStore.contar(hoje.getTime()),
    semana: ocorrenciaStore.contar(Date.now() - 7 * 86_400_000),
    abertos: ocorrenciaStore.rascunhos().filter((r) => r.status === "OPEN").length,
    /** Últimos 7 dias (o que o resumo traria agora) e quando sai o próximo resumo automático. */
    resumo: (() => {
      const r = dadosResumo(Date.now() - 7 * 86_400_000, Date.now());
      return { apreensoes: r.apreensoes.length, presos: r.presos, ocorrencias: r.semana.length, proximo: segundaDaSemana(Date.now()) + 7 * 86_400_000 + 9 * 3_600_000 };
    })(),
    registros: ac.podeVer ? [...ocorrenciaStore.registros()].reverse().slice(0, 200) : [],
    limites: LIMITES,
    cargos: listaCargos,
    canais,
    categorias,
  };
}

const erro = (err: unknown) => (err instanceof OcorrenciaError ? err.message : "Não foi possível concluir. Tente novamente.");

export const ocorrenciaRoutes = new Hono<PainelEnv>();
const writeLimiter = rateLimit({ name: "ocorrencia", limit: 20, windowMs: 60_000 });

ocorrenciaRoutes.use("*", requirePainel);

ocorrenciaRoutes.get("/", async (c) => c.json(await estado(c.get("session"))));

/** Salva; se o painel já foi publicado, ele é atualizado no Discord (tipos novos aparecem). */
ocorrenciaRoutes.put("/config", writeLimiter, async (c) => {
  const session = c.get("session");
  if (!(await acessoWeb(session)).podeConfigurar) return c.json({ error: "proibido" }, 403);
  const parsed = configBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: issueCode(parsed.error) }, 422);
  const atual = ocorrenciaStore.config();
  // Canal do resumo escolhido agora (fora da segunda): o primeiro resumo automático sai na próxima segunda.
  const novoCanalResumo = parsed.data.canalResumoId && !atual.canalResumoId;
  const segunda = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short" }).format(Date.now()) === "Mon";
  await ocorrenciaStore.saveConfig({
    ...parsed.data,
    ...(novoCanalResumo && !segunda ? { ultimoResumo: semanaAtual() } : {}),
    ...(parsed.data.painelCanalId !== atual.painelCanalId ? { painelMensagemId: null } : {}),
    atualizadoEm: Date.now(),
    atualizadoPor: session.user.id,
  });
  console.info(`[ocorrencia] configuração alterada por discord:${session.user.id}`);
  let aviso: string | null = null;
  if (ocorrenciaStore.config().painelMensagemId && botAtivo) {
    await publicarPainel(false).catch((err: unknown) => {
      aviso = `Configurações salvas, mas o painel no Discord não foi atualizado: ${erro(err)}`;
    });
  }
  return c.json({ ...(await estado(session)), aviso });
});

ocorrenciaRoutes.post("/painel", writeLimiter, async (c) => {
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

/** Manda agora o resumo dos últimos 7 dias no canal de logs (para conferir como fica). */
ocorrenciaRoutes.post("/resumo", writeLimiter, async (c) => {
  const session = c.get("session");
  if (!(await acessoWeb(session)).podeConfigurar) return c.json({ error: "proibido" }, 403);
  if (!botAtivo) return c.json({ error: "O bot não está configurado no servidor." }, 409);
  if (!ocorrenciaStore.config().canalResumoId) return c.json({ error: "Escolha e salve o canal do resumo semanal primeiro." }, 409);
  const n = await publicarResumo(Date.now() - 7 * 86_400_000, Date.now(), "📦 Resumo de apreensões · últimos 7 dias");
  if (!n) return c.json({ error: "O bot não conseguiu enviar no canal do resumo (confira as permissões)." }, 502);
  console.info(`[ocorrencia] resumo manual enviado por discord:${session.user.id}`);
  return c.json(await estado(session));
});

/** Foto/vídeo de uma ocorrência (com Range, para o vídeo avançar). Só gestores. */
ocorrenciaRoutes.get("/:id/midia/:midiaId", async (c) => {
  const session = c.get("session");
  if (!(await acessoWeb(session)).podeVer) return c.json({ error: "proibido" }, 403);
  const o = ocorrenciaStore.registro(c.req.param("id"));
  const m = o?.midias.find((x) => x.id === c.req.param("midiaId"));
  if (!o || !m) return c.json({ error: "nao_encontrado" }, 404);
  const dados = await lerMidia(o.id, m.id, "ocorrencia");
  if (!dados) return c.json({ error: "nao_encontrado" }, 404);
  const tamanho = dados.length;
  const base = { "Content-Type": m.contentType, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" };
  const range = /^bytes=(\d*)-(\d*)$/.exec(c.req.header("range") ?? "");
  if (range && (range[1] || range[2])) {
    const inicio = range[1] ? Number(range[1]) : Math.max(0, tamanho - Number(range[2]));
    const fim = range[1] && range[2] ? Math.min(Number(range[2]), tamanho - 1) : tamanho - 1;
    if (inicio > fim || inicio >= tamanho) return c.body(null, 416, { "Content-Range": `bytes */${tamanho}` });
    return c.body(new Uint8Array(dados.subarray(inicio, fim + 1)), 206, { ...base, "Content-Range": `bytes ${inicio}-${fim}/${tamanho}`, "Content-Length": String(fim - inicio + 1) });
  }
  return c.body(new Uint8Array(dados), 200, { ...base, "Content-Length": String(tamanho) });
});
