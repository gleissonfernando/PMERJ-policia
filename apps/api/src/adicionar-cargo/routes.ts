import { Hono } from "hono";
import { z } from "zod";
import { isAdmin, requireAdmin, requirePainel, type PainelEnv } from "../auth/guards.js";
import type { Session } from "../auth/sessions.js";
import { botAtivo, idDoComando, listRoles, listTextChannels, memberRoles } from "../discord/bot.js";
import { gatewayStatus } from "../discord/gateway.js";
import { registrarVisibilidade } from "../discord/visibilidade.js";
import { rateLimit } from "../security/rate-limit.js";
import { COMANDO_ADICIONAR_CARGO } from "./discord.js";
import { podeUsar } from "./service.js";
import { adicionarCargoStore } from "./store.js";

const snowflake = z.string().regex(/^\d{17,20}$/);
const cargos = z.array(snowflake).max(25, "muitos_cargos").transform((l) => [...new Set(l)]);

const configBody = z.object({
  cargosUsar: cargos,
  cargosPermitidos: cargos,
  canalLogId: snowflake.nullable(),
});

const mesmos = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

// "Aplicar no Discord": quem tem os cargos de uso passa a VER o /adicionar-cargo.
registrarVisibilidade("adicionar-cargo", {
  comando: COMANDO_ADICIONAR_CARGO.name,
  cargos: () => adicionarCargoStore.config().cargosUsar,
  async aoAplicar(lista, por) {
    const cfg = adicionarCargoStore.config();
    await adicionarCargoStore.saveConfig({ ...cfg, visibilidade: { cargos: [...lista], em: Date.now(), por } });
  },
  volta: "/painel/adicionar-cargo?aba=config",
});

async function estado(session: Session) {
  const admin = isAdmin(session);
  const roles = (await memberRoles(session.user.id)) ?? session.roles;
  const cfg = adicionarCargoStore.config();
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const ver = admin || podeUsar(roles);
  const [listaCargos, canais] = admin || ver ? await Promise.all([listRoles(), admin ? listTextChannels() : Promise.resolve([])]) : [[], []];
  return {
    config: cfg,
    admin,
    podeUsar: podeUsar(roles),
    botAtivo,
    gateway: gatewayStatus(),
    comandoRegistrado: Boolean(idDoComando(COMANDO_ADICIONAR_CARGO.name)),
    /** A visibilidade aplicada no Discord bate com os cargos de uso salvos? */
    visibilidadeEmDia: Boolean(cfg.visibilidade && mesmos(cfg.visibilidade.cargos, cfg.cargosUsar)),
    hoje: adicionarCargoStore.contar(hoje.getTime()),
    semana: adicionarCargoStore.contar(Date.now() - 7 * 86_400_000),
    recentes: ver ? adicionarCargoStore.recentes(60) : [],
    cargos: listaCargos,
    canais,
  };
}

export const adicionarCargoRoutes = new Hono<PainelEnv>();
const writeLimiter = rateLimit({ name: "adicionar-cargo", limit: 20, windowMs: 60_000 });

adicionarCargoRoutes.use("*", requirePainel);

adicionarCargoRoutes.get("/", async (c) => c.json(await estado(c.get("session"))));

adicionarCargoRoutes.put("/config", writeLimiter, requireAdmin, async (c) => {
  const session = c.get("session");
  const parsed = configBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "";
    return c.json({ error: /^[a-z_]+$/.test(msg) ? msg : "dados_invalidos" }, 422);
  }
  const atual = adicionarCargoStore.config();
  await adicionarCargoStore.saveConfig({ ...atual, ...parsed.data, atualizadoEm: Date.now(), atualizadoPor: session.user.id });
  console.info(`[adicionar-cargo] configuração alterada por discord:${session.user.id}`);
  return c.json(await estado(session));
});
