import { Hono } from "hono";
import { z } from "zod";
import { isAdmin, requirePainel, type PainelEnv } from "../auth/guards.js";
import type { Session } from "../auth/sessions.js";
import { botAtivo, listCategories, listRoles, listTextChannels, memberRoles } from "../discord/bot.js";
import { gatewayStatus } from "../discord/gateway.js";
import { env } from "../env.js";
import { rateLimit } from "../security/rate-limit.js";
import { lerMidia } from "./media.js";
import { acesso, DoespError, publicarPainel, republicarMidias } from "./service.js";
import { doespStore } from "./store.js";

const snowflake = z.string().regex(/^\d{17,20}$/);
const cargos = z.array(snowflake).max(25, "muitos_cargos").transform((l) => [...new Set(l)]);
const configBody = z.object({
  panelChannelId: snowflake.nullable(),
  requestsChannelId: snowflake.nullable(),
  resultsChannelId: snowflake.nullable(),
  draftCategoryId: snowflake.nullable(),
  requesterRoleIds: cargos,
  commanderRoleIds: cargos,
  companyRoleIds: cargos,
  managerRoleIds: cargos.optional(),
});

async function acessoWeb(session: Session) {
  const roles = (await memberRoles(session.user.id)) ?? session.roles;
  return acesso(session.user.id, roles, isAdmin(session));
}

async function estado(session: Session) {
  const ac = await acessoWeb(session);
  const [listaCargos, canais, categorias] = ac.canManage ? await Promise.all([listRoles(), listTextChannels(), listCategories()]) : [[], [], []];
  return {
    acesso: ac,
    guildId: env.DISCORD_GUILD_ID ?? null,
    config: doespStore.config(),
    botAtivo,
    gateway: gatewayStatus(),
    requests: ac.canManage
      ? [...doespStore.requests()]
          .reverse()
          .slice(0, 300)
          // Publicação que ficou no meio (ex.: restart) há mais de 15 min: oferece "Publicar de novo".
          .map((r) => ({ ...r, mediaTravada: r.mediaStatus === "FAILED" || (r.mediaStatus !== null && r.mediaStatus !== "COMPLETED" && r.resultAt !== null && Date.now() - r.resultAt > 15 * 60_000) }))
      : [],
    cargos: listaCargos,
    canais,
    categorias,
  };
}

const erro = (err: unknown) => (err instanceof DoespError ? err.message : "Não foi possível concluir. Tente novamente.");

export const doespRoutes = new Hono<PainelEnv>();
const writeLimiter = rateLimit({ name: "doesp", limit: 20, windowMs: 60_000 });

doespRoutes.use("*", requirePainel);

doespRoutes.get("/", async (c) => c.json(await estado(c.get("session"))));

/** Salva canais e cargos; se o painel já tem canal, ele é atualizado no Discord (igual ao BOPE). */
doespRoutes.put("/config", writeLimiter, async (c) => {
  const session = c.get("session");
  const ac = await acessoWeb(session);
  if (!ac.canManage) return c.json({ error: "Você não tem permissão para gerenciar os requerimentos." }, 403);
  const parsed = configBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message === "muitos_cargos" ? "No máximo 25 cargos em cada lista." : "Dados inválidos." }, 422);
  const atual = doespStore.config();
  const { managerRoleIds, ...resto } = parsed.data;
  await doespStore.updateConfig({
    ...resto,
    ...(ac.canConfigure && managerRoleIds ? { managerRoleIds } : {}),
    ...(resto.panelChannelId !== atual.panelChannelId ? { panelMessageId: null } : {}),
  });
  console.info(`[doesp] configuração alterada por discord:${session.user.id}`);
  let aviso: string | null = null;
  if (doespStore.config().panelChannelId && botAtivo) {
    await publicarPainel(false).catch((err: unknown) => {
      aviso = `Configurações salvas, mas não foi possível atualizar o painel no Discord: ${erro(err)}`;
    });
  }
  return c.json({ ...(await estado(session)), aviso });
});

doespRoutes.post("/painel", writeLimiter, async (c) => {
  const session = c.get("session");
  if (!(await acessoWeb(session)).canManage) return c.json({ error: "Você não tem permissão para gerenciar os requerimentos." }, 403);
  if (!botAtivo) return c.json({ error: "O bot não está configurado no servidor." }, 409);
  const recriar = Boolean(((await c.req.json().catch(() => ({}))) as { recreate?: unknown }).recreate);
  try {
    await publicarPainel(recriar);
  } catch (err) {
    return c.json({ error: erro(err) }, 502);
  }
  return c.json(await estado(session));
});

/** Publica de novo os resultados (imagens/vídeos) de um requerimento concluído. */
doespRoutes.post("/:id/midias", writeLimiter, async (c) => {
  const session = c.get("session");
  if (!(await acessoWeb(session)).canManage) return c.json({ error: "Você não tem permissão para gerenciar os requerimentos." }, 403);
  try {
    await republicarMidias(c.req.param("id"));
  } catch (err) {
    return c.json({ error: erro(err) }, 502);
  }
  return c.json(await estado(session));
});

/** Arquivo de uma mídia (com Range, para o vídeo avançar no navegador). Só gestores. */
doespRoutes.get("/:id/midia/:midiaId", async (c) => {
  const session = c.get("session");
  if (!(await acessoWeb(session)).canManage) return c.json({ error: "proibido" }, 403);
  const r = doespStore.get(c.req.param("id"));
  const m = r?.media.find((x) => x.id === c.req.param("midiaId"));
  if (!r || !m) return c.json({ error: "nao_encontrado" }, 404);
  const dados = await lerMidia(r.id, m.id);
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
