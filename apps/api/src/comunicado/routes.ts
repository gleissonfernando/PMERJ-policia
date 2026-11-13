import { Hono } from "hono";
import { z } from "zod";
import { isAdmin, requirePainel, type PainelEnv } from "../auth/guards.js";
import type { Session } from "../auth/sessions.js";
import { botAtivo, listCategories, listRoles, listTextChannels, memberRoles } from "../discord/bot.js";
import { gatewayStatus } from "../discord/gateway.js";
import { lerMidia } from "../doesp/media.js";
import { env } from "../env.js";
import { rateLimit } from "../security/rate-limit.js";
import { acesso, ComunicadoError, publicarPainel } from "./service.js";
import { comunicadoStore } from "./store.js";

const snowflake = z.string().regex(/^\d{17,20}$/);
const cargos = z.array(snowflake).max(25, "muitos_cargos").transform((l) => [...new Set(l)]);
const configBody = z.object({
  painelCanalId: snowflake.nullable(),
  categoriaId: snowflake.nullable(),
  cargosPublicar: cargos,
  cargosGestores: cargos,
});

async function acessoWeb(session: Session) {
  const roles = (await memberRoles(session.user.id)) ?? session.roles;
  return acesso(session.user.id, roles, isAdmin(session));
}

async function estado(session: Session) {
  const ac = await acessoWeb(session);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const [listaCargos, canais, categorias] = await Promise.all([ac.podeVer ? listRoles() : [], ac.podeVer ? listTextChannels() : [], ac.podeConfigurar ? listCategories() : []]);
  return {
    acesso: ac,
    config: comunicadoStore.config(),
    botAtivo,
    gateway: gatewayStatus(),
    guildId: env.DISCORD_GUILD_ID ?? null,
    hoje: comunicadoStore.contar(hoje.getTime()),
    mes: comunicadoStore.contar(Date.now() - 30 * 86_400_000),
    abertos: comunicadoStore.rascunhos().filter((r) => r.status === "OPEN").length,
    registros: ac.podeVer ? [...comunicadoStore.registros()].reverse().slice(0, 200) : [],
    cargos: listaCargos,
    canais,
    categorias,
  };
}

const erro = (err: unknown) => (err instanceof ComunicadoError ? err.message : "Não foi possível concluir. Tente novamente.");

export const comunicadoRoutes = new Hono<PainelEnv>();
const writeLimiter = rateLimit({ name: "comunicado", limit: 20, windowMs: 60_000 });

comunicadoRoutes.use("*", requirePainel);

comunicadoRoutes.get("/", async (c) => c.json(await estado(c.get("session"))));

comunicadoRoutes.put("/config", writeLimiter, async (c) => {
  const session = c.get("session");
  if (!(await acessoWeb(session)).podeConfigurar) return c.json({ error: "proibido" }, 403);
  const parsed = configBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message === "muitos_cargos" ? "muitos_cargos" : "dados_invalidos" }, 422);
  const atual = comunicadoStore.config();
  await comunicadoStore.saveConfig({
    ...parsed.data,
    ...(parsed.data.painelCanalId !== atual.painelCanalId ? { painelMensagemId: null } : {}),
    atualizadoEm: Date.now(),
    atualizadoPor: session.user.id,
  });
  console.info(`[comunicado] configuração alterada por discord:${session.user.id}`);
  return c.json(await estado(session));
});

comunicadoRoutes.post("/painel", writeLimiter, async (c) => {
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

/** Foto/vídeo de um comunicado (com Range, para o vídeo avançar). */
comunicadoRoutes.get("/:id/midia/:midiaId", async (c) => {
  const session = c.get("session");
  if (!(await acessoWeb(session)).podeVer) return c.json({ error: "proibido" }, 403);
  const reg = comunicadoStore.registro(c.req.param("id"));
  const m = reg?.midias.find((x) => x.id === c.req.param("midiaId"));
  if (!reg || !m) return c.json({ error: "nao_encontrado" }, 404);
  const dados = await lerMidia(reg.id, m.id, "comunicado");
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
