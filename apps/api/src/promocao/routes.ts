import { Hono } from "hono";
import { z } from "zod";
import { isAdmin, requireAdmin, requirePainel, type PainelEnv } from "../auth/guards.js";
import type { Session } from "../auth/sessions.js";
import { botAtivo, listRoles, listTextChannels, memberRoles } from "../discord/bot.js";
import { gatewayStatus } from "../discord/gateway.js";
import { rateLimit } from "../security/rate-limit.js";
import { setStore } from "../set/store.js";
import { podePromover, podeRebaixar } from "./service.js";
import { promocaoStore } from "./store.js";

const snowflake = z.string().regex(/^\d{17,20}$/);

const configBody = z.object({
  cargosPromover: z.array(snowflake).max(25, "muitos_cargos").transform((l) => [...new Set(l)]),
  canalAnuncioId: snowflake.nullable(),
  cargosRebaixar: z.array(snowflake).max(25, "muitos_cargos").transform((l) => [...new Set(l)]),
  canalRebaixamentoId: snowflake.nullable(),
  rodape: z
    .string()
    .transform((s) => s.normalize("NFC").replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1, "rodape_vazio").max(100, "rodape_longo").refine((s) => !/@(everyone|here)|<@&?\d+>/i.test(s), "mencao_proibida")),
});

function issueCode(err: z.ZodError): string {
  const msg = err.issues[0]?.message ?? "";
  return /^[a-z_]+$/.test(msg) ? msg : "dados_invalidos";
}

async function estado(session: Session) {
  const admin = isAdmin(session);
  const roles = (await memberRoles(session.user.id)) ?? session.roles;
  const pode = podePromover(roles);
  const rebaixa = podeRebaixar(roles);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const [cargos, canais] = admin ? await Promise.all([listRoles(), listTextChannels()]) : [[], []];
  return {
    config: promocaoStore.config(),
    patentes: setStore.config().patentes.map((p) => ({ id: p.id, nome: p.nome, prefixo: p.prefixo, cargoId: p.cargoId ?? null })),
    formato: setStore.config().formato,
    admin,
    podePromover: pode,
    podeRebaixar: rebaixa,
    botAtivo,
    gateway: gatewayStatus(),
    hoje: promocaoStore.contar(hoje.getTime()),
    semana: promocaoStore.contar(Date.now() - 7 * 86_400_000),
    recentes: promocaoStore.recentes(60),
    cargos,
    canais,
  };
}

export const promocaoRoutes = new Hono<PainelEnv>();
const writeLimiter = rateLimit({ name: "promocao", limit: 20, windowMs: 60_000 });

promocaoRoutes.use("*", requirePainel);

promocaoRoutes.get("/", async (c) => c.json(await estado(c.get("session"))));

promocaoRoutes.put("/config", writeLimiter, requireAdmin, async (c) => {
  const session = c.get("session");
  const parsed = configBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: issueCode(parsed.error) }, 422);
  // Patentes e cargos vêm do Pedir Set (fonte única): aqui só as regras do /promoção e /rebaixamento.
  const cfg = parsed.data;
  await promocaoStore.saveConfig({ ...cfg, atualizadoEm: Date.now(), atualizadoPor: session.user.id });
  console.info(`[promocao] configuração alterada por discord:${session.user.id}`);
  return c.json(await estado(session));
});
