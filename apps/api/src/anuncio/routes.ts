import { Hono } from "hono";
import { z } from "zod";
import { isAdmin, requireAdmin, requirePainel, type PainelEnv } from "../auth/guards.js";
import type { Session } from "../auth/sessions.js";
import { botAtivo, listRoles, listTextChannels, memberRoles } from "../discord/bot.js";
import { gatewayStatus } from "../discord/gateway.js";
import { env } from "../env.js";
import { rateLimit } from "../security/rate-limit.js";
import { atualizarPainelPublicado, podeAnunciar, publicarPainel } from "./discord.js";
import { IMAGEM_MAX_BYTES, LIMITE_TOTAL, TITULO_MAX } from "./mensagem.js";
import { anuncioStore } from "./store.js";
import type { AnuncioConfig } from "./types.js";

/* ---------- Validação ---------- */

const snowflake = z.string().regex(/^\d{17,20}$/);
const semMencaoGeral = (s: string) => !/@(everyone|here)|<@&?\d+>/i.test(s);

const configBody = z.object({
  cargosPermitidos: z.array(snowflake).max(25, "muitos_cargos").transform((l) => [...new Set(l)]),
  rodape: z
    .string()
    .transform((s) => s.normalize("NFC").replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1, "rodape_vazio").max(120, "rodape_longo").refine(semMencaoGeral, "mencao_proibida")),
  mostrarAutor: z.boolean(),
  cor: z.number().int().min(0).max(0xffffff),
  logCanalId: snowflake.nullable(),
});

function issueCode(err: z.ZodError): string {
  const msg = err.issues[0]?.message ?? "";
  return /^[a-z_]+$/.test(msg) ? msg : "dados_invalidos";
}

/* ---------- Estado ---------- */

async function estado(session: Session) {
  const admin = isAdmin(session);
  // Cargos ATUAIS do Discord: quem perde o cargo deixa de ver o histórico na hora.
  const roles = (await memberRoles(session.user.id)) ?? session.roles;
  const pode = podeAnunciar(roles);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const [canais, cargos] = admin ? await Promise.all([listTextChannels(), listRoles()]) : [[], []];
  return {
    config: anuncioStore.config(),
    admin,
    podeAnunciar: pode,
    /** Para montar o link das mensagens (discord.com/channels/servidor/canal/mensagem). */
    guildId: env.DISCORD_GUILD_ID ?? null,
    botAtivo,
    gateway: gatewayStatus(),
    limites: { total: LIMITE_TOTAL, titulo: TITULO_MAX, imagemBytes: IMAGEM_MAX_BYTES },
    hoje: anuncioStore.contar(hoje.getTime()),
    semana: anuncioStore.contar(Date.now() - 7 * 86_400_000),
    // Os anúncios podem estar em canais restritos: histórico só para quem anuncia ou administra.
    recentes: admin || pode ? anuncioStore.recentes(50) : [],
    canais,
    cargos,
  };
}

/* ---------- Rotas ---------- */

export const anuncioRoutes = new Hono<PainelEnv>();
const writeLimiter = rateLimit({ name: "anuncio", limit: 20, windowMs: 60_000 });

anuncioRoutes.use("*", requirePainel);

anuncioRoutes.get("/", async (c) => c.json(await estado(c.get("session"))));

anuncioRoutes.put("/config", writeLimiter, requireAdmin, async (c) => {
  const session = c.get("session");
  const parsed = configBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: issueCode(parsed.error) }, 422);

  const config: AnuncioConfig = {
    ...parsed.data,
    painel: anuncioStore.config().painel,
    atualizadoEm: Date.now(),
    atualizadoPor: session.user.id,
  };
  await anuncioStore.saveConfig(config);
  void atualizarPainelPublicado();
  console.info(`[anuncio] configuração alterada por discord:${session.user.id}`);
  return c.json(await estado(session));
});

/** Publica (ou atualiza) a mensagem com o botão "Realizar anúncio" num canal. */
anuncioRoutes.post("/painel", writeLimiter, requireAdmin, async (c) => {
  const session = c.get("session");
  const parsed = z.object({ canalId: snowflake }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "canal_invalido" }, 422);
  if (!botAtivo) return c.json({ error: "bot_desligado" }, 409);

  const painel = await publicarPainel(parsed.data.canalId);
  if (!painel) return c.json({ error: "falha_publicar" }, 502);
  await anuncioStore.saveConfig({ ...anuncioStore.config(), painel });
  console.info(`[anuncio] painel publicado no canal ${painel.canalId} por discord:${session.user.id}`);
  return c.json(await estado(session));
});
