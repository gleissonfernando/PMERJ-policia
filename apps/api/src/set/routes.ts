import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { isAdmin, requireAdmin, requirePainel, type PainelEnv } from "../auth/guards.js";
import type { Session } from "../auth/sessions.js";
import { botAtivo, listCategories, listRoles, listTextChannels, memberRoles } from "../discord/bot.js";
import { gatewayStatus } from "../discord/gateway.js";
import { rateLimit } from "../security/rate-limit.js";
import { APELIDO_MAX } from "./apelido.js";
import { atualizarPainelPublicado, publicarPainel } from "./discord.js";
import { cancelarPedido, decidirSet, issueCode, itemId, podeAprovar, solicitarSet, type Aprovador } from "./service.js";
import { setStore } from "./store.js";
import type { SetConfig } from "./types.js";

/* ---------- Validação da configuração ---------- */

const clean = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim();
const snowflake = z.string().regex(/^\d{17,20}$/);

const texto = (max: number) =>
  z
    .string()
    .transform(clean)
    .pipe(z.string().min(1).max(max).regex(/^[\p{L}\p{M}\p{N}º°ª .,'()\/—–-]+$/u));

const prefixo = z
  .string()
  .transform(clean)
  .pipe(z.string().min(1).max(10).regex(/^[\p{L}\p{M}\p{N}º°ª .\/-]+$/u));

const novoId = (v: string | undefined) => v ?? randomUUID().slice(0, 8);

const configBody = z
  .object({
    campos: z.object({ orgao: z.boolean() }),
    formato: z
      .string()
      .transform(clean)
      .pipe(
        z
          .string()
          .min(4)
          .max(48)
          .regex(/^[^`@#:\\<>*_~]+$/, "formato_invalido")
          .refine((f) => f.includes("{nome}"), "formato_sem_nome"),
      ),
    alterarApelido: z.boolean(),
    // Máx. 25: é o limite de opções do menu de seleção do Discord.
    patentes: z
      .array(z.object({ id: itemId.optional(), nome: texto(40), prefixo, cargoId: snowflake.nullish() }))
      .min(1, "sem_patentes")
      .max(25, "muitas_patentes"),
    orgaos: z.array(z.object({ id: itemId.optional(), nome: texto(60), sigla: prefixo })).max(25, "muitos_orgaos"),
    modo: z.enum(["automatico", "aprovacao"]),
    cargosAprovadores: z.array(snowflake).max(25, "muitos_cargos"),
    aprovacaoCategoriaId: snowflake.nullable(),
    cargosAoAprovar: z.array(snowflake).max(10, "muitos_cargos"),
    expulsarAoReprovar: z.boolean(),
    logCanalId: snowflake.nullable(),
  })
  .transform((c) => ({
    ...c,
    patentes: c.patentes.map((p) => ({ ...p, id: novoId(p.id), cargoId: p.cargoId ?? null })),
    orgaos: c.orgaos.map((o) => ({ ...o, id: novoId(o.id) })),
    cargosAprovadores: [...new Set(c.cargosAprovadores)],
    cargosAoAprovar: [...new Set(c.cargosAoAprovar)],
  }))
  .superRefine((c, ctx) => {
    for (const key of ["patentes", "orgaos"] as const) {
      const ids = c[key].map((x) => x.id);
      if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: [key], message: "ids_repetidos" });
    }
    // O cargo identifica a patente no sistema todo (promoção, hierarquia, horas): um cargo por patente.
    const cargosPatentes = c.patentes.map((p) => p.cargoId).filter(Boolean);
    if (new Set(cargosPatentes).size !== cargosPatentes.length) ctx.addIssue({ code: "custom", path: ["patentes"], message: "cargo_repetido" });
    if (c.campos.orgao && c.orgaos.length === 0) ctx.addIssue({ code: "custom", path: ["orgaos"], message: "sem_orgaos" });
    if (c.modo === "aprovacao" && c.cargosAprovadores.length === 0) {
      ctx.addIssue({ code: "custom", path: ["cargosAprovadores"], message: "sem_aprovadores" });
    }
  });

/* ---------- Quem está no painel como aprovador ---------- */

/** Usa os cargos ATUAIS do Discord (não os do login): quem perde o cargo perde o acesso na hora. */
async function aprovadorDaSessao(session: Session): Promise<Aprovador> {
  const roles = (await memberRoles(session.user.id)) ?? session.roles;
  return { id: session.user.id, username: session.user.username, roles };
}

/* ---------- Estado devolvido ao painel ---------- */

async function estado(session: Session) {
  const admin = isAdmin(session);
  const aprova = podeAprovar(await aprovadorDaSessao(session));
  const [canais, cargos, categorias] = admin ? await Promise.all([listTextChannels(), listRoles(), listCategories()]) : [[], [], []];
  return {
    config: setStore.config(),
    admin,
    podeAprovar: aprova,
    botAtivo,
    gateway: gatewayStatus(),
    limiteApelido: APELIDO_MAX,
    /** Set valendo. */
    meu: setStore.atual(session.user.id) ?? null,
    /** Último pedido (pendente, reprovado…), para mostrar a situação. */
    meuPedido: setStore.ultimoPedido(session.user.id) ?? null,
    pendentes: aprova ? setStore.pendentes() : [],
    recentes: setStore.recentes(60),
    canais,
    cargos,
    categorias,
  };
}

/* ---------- Rotas ---------- */

export const setRoutes = new Hono<PainelEnv>();
const writeLimiter = rateLimit({ name: "set", limit: 30, windowMs: 60_000 });

setRoutes.use("*", requirePainel);

setRoutes.get("/", async (c) => c.json(await estado(c.get("session"))));

/** Pedir set (aplica na hora no modo automático; vira pedido no modo aprovação). */
setRoutes.post("/", writeLimiter, async (c) => {
  const session = c.get("session");
  const r = await solicitarSet(session.user, await c.req.json().catch(() => null), "painel");
  if (!r.ok) return c.json({ error: r.erro }, 422);
  return c.json(await estado(session), 201);
});

setRoutes.post("/cancelar", writeLimiter, async (c) => {
  const session = c.get("session");
  const r = await cancelarPedido(session.user.id);
  if (!r.ok) return c.json({ error: r.erro }, 409);
  return c.json(await estado(session));
});

const decisaoBody = z.object({ motivo: z.string().max(400).nullish() });

setRoutes.post("/:id/:decisao{aprovar|reprovar}", writeLimiter, async (c) => {
  const session = c.get("session");
  const id = z.uuid().safeParse(c.req.param("id"));
  if (!id.success) return c.json({ error: "nao_encontrado" }, 404);
  const body = decisaoBody.safeParse(await c.req.json().catch(() => ({})));
  const decisao = c.req.param("decisao") as "aprovar" | "reprovar";

  const r = await decidirSet(id.data, await aprovadorDaSessao(session), decisao, body.success ? body.data.motivo : null);
  if (!r.ok) {
    const status = r.erro === "nao_encontrado" ? 404 : r.erro === "ja_decidido" ? 409 : 403;
    return c.json({ error: r.erro }, status);
  }
  return c.json(await estado(session));
});

setRoutes.put("/config", writeLimiter, requireAdmin, async (c) => {
  const session = c.get("session");
  const parsed = configBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: issueCode(parsed.error) }, 422);

  const atual = setStore.config();
  const config: SetConfig = { ...parsed.data, painel: atual.painel, atualizadoEm: Date.now(), atualizadoPor: session.user.id };
  await setStore.saveConfig(config);
  void atualizarPainelPublicado();
  console.info(`[set] configuração alterada por discord:${session.user.id}`);
  return c.json(await estado(session));
});

/** Publica (ou atualiza) a mensagem "Pedir Set" com botão num canal do Discord. */
setRoutes.post("/painel", writeLimiter, requireAdmin, async (c) => {
  const session = c.get("session");
  const parsed = z.object({ canalId: snowflake }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "canal_invalido" }, 422);
  if (!botAtivo) return c.json({ error: "bot_desligado" }, 409);

  const painel = await publicarPainel(parsed.data.canalId);
  if (!painel) return c.json({ error: "falha_publicar" }, 502);
  await setStore.saveConfig({ ...setStore.config(), painel });
  console.info(`[set] painel publicado no canal ${painel.canalId} por discord:${session.user.id}`);
  return c.json(await estado(session));
});
