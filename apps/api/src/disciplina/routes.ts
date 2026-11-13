import { Hono } from "hono";
import { z } from "zod";
import { isAdmin, requireAdmin, requirePainel, type PainelEnv } from "../auth/guards.js";
import type { Session } from "../auth/sessions.js";
import { botAtivo, listCategories, listRoles, listTextChannels, memberRoles } from "../discord/bot.js";
import { gatewayStatus } from "../discord/gateway.js";
import { rateLimit } from "../security/rate-limit.js";
import { atualizarPainelPublicado, publicarPainel } from "./discord.js";
import { podeGerir } from "./service.js";
import { disciplinaStore } from "./store.js";

const snowflake = z.string().regex(/^\d{17,20}$/);
const configBody = z
  .object({
    cargosGestao: z.array(snowflake).max(25, "muitos_cargos").transform((l) => [...new Set(l)]),
    categoriaId: snowflake.nullable(),
    niveis: z
      .array(
        z.object({
          id: z.string().regex(/^[a-z0-9-]{1,40}$/),
          nome: z
            .string()
            .transform((s) => s.normalize("NFC").replace(/\s+/g, " ").trim())
            .pipe(z.string().min(2, "texto_curto").max(40, "texto_longo")),
          cargoId: snowflake.nullable(),
        }),
      )
      .min(1, "sem_niveis")
      .max(10, "muitos_niveis"),
    canalAdvertenciaId: snowflake.nullable(),
    canalExoneracaoId: snowflake.nullable(),
  })
  .superRefine((c, ctx) => {
    const cargos = c.niveis.map((n) => n.cargoId).filter(Boolean);
    if (new Set(cargos).size !== cargos.length) ctx.addIssue({ code: "custom", path: ["niveis"], message: "cargo_repetido" });
    const ids = c.niveis.map((n) => n.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["niveis"], message: "niveis_repetidos" });
  });

function issueCode(err: z.ZodError): string {
  const msg = err.issues[0]?.message ?? "";
  return /^[a-z_]+$/.test(msg) ? msg : "dados_invalidos";
}

async function estado(session: Session) {
  const admin = isAdmin(session);
  const gestao = podeGerir((await memberRoles(session.user.id)) ?? session.roles);
  const [cargos, canais, categorias] = admin ? await Promise.all([listRoles(), listTextChannels(), listCategories()]) : [[], [], []];
  const ver = admin || gestao;
  return {
    config: disciplinaStore.config(),
    admin,
    gestao,
    botAtivo,
    gateway: gatewayStatus(),
    registros: ver ? [...disciplinaStore.registros()].reverse().slice(0, 100) : [],
    reunioes: ver
      ? [...disciplinaStore.reunioes()]
          .reverse()
          .slice(0, 50)
          .map(({ webhook: _w, ...r }) => r) // o token do webhook nunca sai do servidor
      : [],
    cargos,
    canais,
    categorias,
  };
}

export const disciplinaRoutes = new Hono<PainelEnv>();
const writeLimiter = rateLimit({ name: "disciplina", limit: 20, windowMs: 60_000 });

disciplinaRoutes.use("*", requirePainel);

disciplinaRoutes.get("/", async (c) => c.json(await estado(c.get("session"))));

disciplinaRoutes.put("/config", writeLimiter, requireAdmin, async (c) => {
  const session = c.get("session");
  const parsed = configBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: issueCode(parsed.error) }, 422);
  await disciplinaStore.saveConfig({ ...parsed.data, painel: disciplinaStore.config().painel, atualizadoEm: Date.now(), atualizadoPor: session.user.id });
  void atualizarPainelPublicado();
  console.info(`[disciplina] configuração alterada por discord:${session.user.id}`);
  return c.json(await estado(session));
});

disciplinaRoutes.post("/painel", writeLimiter, requireAdmin, async (c) => {
  const session = c.get("session");
  const parsed = z.object({ canalId: snowflake }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "canal_invalido" }, 422);
  if (!botAtivo) return c.json({ error: "bot_desligado" }, 409);
  const painel = await publicarPainel(parsed.data.canalId);
  if (!painel) return c.json({ error: "falha_publicar" }, 502);
  await disciplinaStore.saveConfig({ ...disciplinaStore.config(), painel });
  return c.json(await estado(session));
});
