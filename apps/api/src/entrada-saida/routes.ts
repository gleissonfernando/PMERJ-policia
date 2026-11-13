import { Hono } from "hono";
import { z } from "zod";
import { isAdmin, requireAdmin, requirePainel, type PainelEnv } from "../auth/guards.js";
import type { Session } from "../auth/sessions.js";
import { botAtivo, listTextChannels } from "../discord/bot.js";
import { gatewayStatus, infoServidor, onMembroEntrou, onMembroSaiu } from "../discord/gateway.js";
import { rateLimit } from "../security/rate-limit.js";
import { esStore, registrarEvento } from "./anuncio.js";
import type { EntradaSaidaConfig } from "./types.js";

/* ---------- Eventos do Discord ---------- */

onMembroEntrou((m) => registrarEvento("entrada", m).then(() => undefined));
onMembroSaiu((m) => registrarEvento("saida", m).then(() => undefined));

/* ---------- Validação ---------- */

const clean = (s: string) => s.normalize("NFC").replace(/[^\S\n]+/g, " ").trim();
const semMencaoGeral = (s: string) => !/@(everyone|here)|<@&\d+>/i.test(s);

const anuncioBody = z.object({
  ativo: z.boolean(),
  canalId: z.string().regex(/^\d{17,20}$/).nullable(),
  titulo: z.string().transform(clean).pipe(z.string().min(1, "titulo_vazio").max(80, "titulo_longo")),
  mensagem: z
    .string()
    .transform(clean)
    .pipe(z.string().min(1, "mensagem_vazia").max(600, "mensagem_longa").refine(semMencaoGeral, "mencao_proibida")),
  cor: z.number().int().min(0).max(0xffffff),
  detalhes: z.boolean(),
  mencionar: z.boolean(),
});

const configBody = z
  .object({ entrada: anuncioBody, saida: anuncioBody, ignorarBots: z.boolean() })
  .superRefine((c, ctx) => {
    for (const tipo of ["entrada", "saida"] as const) {
      if (c[tipo].ativo && !c[tipo].canalId) ctx.addIssue({ code: "custom", path: [tipo, "canalId"], message: "sem_canal" });
    }
  });

function issueCode(err: z.ZodError): string {
  const msg = err.issues[0]?.message ?? "";
  return /^[a-z_]+$/.test(msg) ? msg : "dados_invalidos";
}

/* ---------- Estado ---------- */

async function estado(session: Session) {
  const admin = isAdmin(session);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return {
    config: esStore.config(),
    admin,
    botAtivo,
    gateway: gatewayStatus(),
    servidor: infoServidor(),
    hoje: esStore.contar(hoje.getTime()),
    semana: esStore.contar(Date.now() - 7 * 86_400_000),
    eventos: esStore.recentes(50),
    canais: admin ? await listTextChannels() : [],
  };
}

/* ---------- Rotas ---------- */

export const entradaSaidaRoutes = new Hono<PainelEnv>();
const writeLimiter = rateLimit({ name: "entrada-saida", limit: 20, windowMs: 60_000 });

entradaSaidaRoutes.use("*", requirePainel);

entradaSaidaRoutes.get("/", async (c) => c.json(await estado(c.get("session"))));

entradaSaidaRoutes.put("/config", writeLimiter, requireAdmin, async (c) => {
  const session = c.get("session");
  const parsed = configBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: issueCode(parsed.error) }, 422);
  const config: EntradaSaidaConfig = { ...parsed.data, atualizadoEm: Date.now(), atualizadoPor: session.user.id };
  await esStore.saveConfig(config);
  console.info(`[entrada-saida] configuração alterada por discord:${session.user.id}`);
  return c.json(await estado(session));
});

/** Envia um anúncio de teste usando os dados de quem clicou (não entra no histórico). */
entradaSaidaRoutes.post("/teste", writeLimiter, requireAdmin, async (c) => {
  const session = c.get("session");
  const parsed = z.object({ tipo: z.enum(["entrada", "saida"]) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "dados_invalidos" }, 422);
  if (!botAtivo) return c.json({ error: "bot_desligado" }, 409);
  if (!esStore.config()[parsed.data.tipo].canalId) return c.json({ error: "sem_canal" }, 422);

  const srv = infoServidor();
  const ok = await registrarEvento(
    parsed.data.tipo,
    {
      id: session.user.id,
      username: session.user.username,
      globalName: session.user.globalName,
      avatar: session.user.avatar,
      bot: false,
      contaCriadaEm: Number(BigInt(session.user.id) >> 22n) + 1_420_070_400_000, // data embutida no ID do Discord
      entrouEm: null,
      totalMembros: srv?.total ?? 0,
      servidor: srv?.nome ?? "PMERJ",
    },
    true,
  );
  if (!ok) return c.json({ error: "falha_enviar" }, 502);
  return c.json({ ok: true });
});
