import { Hono } from "hono";
import { z } from "zod";
import { isAdmin, requireAdmin, requirePainel, type PainelEnv } from "../auth/guards.js";
import type { Session } from "../auth/sessions.js";
import { botAtivo, listRoles, listTextChannels } from "../discord/bot.js";
import { gatewayStatus } from "../discord/gateway.js";
import { rateLimit } from "../security/rate-limit.js";
import { setStore } from "../set/store.js";
import { apagarPainel, HierarquiaError, montar, niveisEfetivos, publicar } from "./service.js";
import { hierarquiaStore, LIMITES } from "./store.js";

const snowflake = z.string().regex(/^\d{17,20}$/);
const umaLinha = (max: number) => z.string().transform((s) => s.normalize("NFC").replace(/\s+/g, " ").trim()).pipe(z.string().max(max, "texto_longo"));
const semMencao = (s: string) => !/@(everyone|here)|<@[&!]?\d+>/i.test(s);

const configBody = z.object({
  canalId: snowflake.nullable(),
  titulo: umaLinha(LIMITES.titulo).pipe(z.string().min(1, "titulo_vazio")).refine(semMencao, "mencao_proibida"),
  cor: z.number().int().min(0).max(0xffffff),
  rodape: umaLinha(LIMITES.rodape).pipe(z.string().min(1, "rodape_vazio")).refine(semMencao, "mencao_proibida"),
  mostrarVagos: z.boolean(),
  origem: z.enum(["patentes", "manual"]).default("patentes"),
  emojisPatentes: z.record(z.string().regex(/^[a-z0-9-]{1,40}$/), z.string().trim().max(64)).default({}),
  niveis: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9-]{1,40}$/),
        cargoId: snowflake,
        titulo: umaLinha(LIMITES.tituloNivel).refine(semMencao, "mencao_proibida"),
        emoji: z.string().trim().max(64),
      }),
    )
    .max(LIMITES.niveis, "muitos_niveis")
    .refine((l) => new Set(l.map((n) => n.cargoId)).size === l.length, "cargo_repetido"),
});

function issueCode(err: z.ZodError): string {
  const msg = err.issues[0]?.message ?? "";
  return /^[a-z_]+$/.test(msg) ? msg : "dados_invalidos";
}

async function estado(session: Session) {
  const admin = isAdmin(session);
  const [cargos, canais, arvore] = await Promise.all([listRoles(), admin ? listTextChannels() : Promise.resolve([]), montar()]);
  return {
    admin,
    config: hierarquiaStore.config(),
    botAtivo,
    gateway: gatewayStatus(),
    /** null = lista de membros ainda carregando (ou bot offline). */
    arvore: arvore?.map((n) => ({ nivelId: n.nivel.id, cargoId: n.nivel.cargoId, titulo: n.titulo, emoji: n.nivel.emoji, membros: n.membros })) ?? null,
    limites: LIMITES,
    /** Patentes do Pedir Set (da mais baixa para a mais alta), para o modo sincronizado. */
    patentes: setStore.config().patentes.map((p) => ({ id: p.id, nome: p.nome, prefixo: p.prefixo, cargoId: p.cargoId ?? null })),
    /** Níveis que valem agora (extras + patentes, ou só os manuais). */
    niveisEfetivos: niveisEfetivos(),
    cargos,
    canais,
  };
}

const erro = (err: unknown) => (err instanceof HierarquiaError ? err.message : "Não foi possível concluir. Tente novamente.");

export const hierarquiaRoutes = new Hono<PainelEnv>();
const writeLimiter = rateLimit({ name: "hierarquia", limit: 20, windowMs: 60_000 });

hierarquiaRoutes.use("*", requirePainel);

hierarquiaRoutes.get("/", async (c) => c.json(await estado(c.get("session"))));

/** Salva; com o painel já publicado, ele é redesenhado na hora. */
hierarquiaRoutes.put("/config", writeLimiter, requireAdmin, async (c) => {
  const session = c.get("session");
  const parsed = configBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: issueCode(parsed.error) }, 422);
  const atual = hierarquiaStore.config();
  const trocouCanal = parsed.data.canalId !== atual.canalId;
  if (trocouCanal && atual.canalId && atual.mensagemIds.length) await apagarPainel(atual.canalId, atual.mensagemIds);
  await hierarquiaStore.saveConfig({ ...parsed.data, ...(trocouCanal ? { mensagemIds: [] } : {}), atualizadoEm: Date.now(), atualizadoPor: session.user.id });
  console.info(`[hierarquia] configuração alterada por discord:${session.user.id}`);

  let aviso: string | null = null;
  const cfg = hierarquiaStore.config();
  if (botAtivo && cfg.mensagemIds.length) {
    await publicar(false).catch((err: unknown) => {
      aviso = `Configurações salvas, mas o painel não foi atualizado: ${erro(err)}`;
    });
  }
  return c.json({ ...(await estado(session)), aviso });
});

hierarquiaRoutes.post("/publicar", writeLimiter, requireAdmin, async (c) => {
  const session = c.get("session");
  if (!botAtivo) return c.json({ error: "O bot não está configurado no servidor." }, 409);
  const recriar = Boolean(((await c.req.json().catch(() => ({}))) as { recreate?: unknown }).recreate);
  try {
    await publicar(recriar);
  } catch (err) {
    return c.json({ error: erro(err) }, 502);
  }
  return c.json(await estado(session));
});
