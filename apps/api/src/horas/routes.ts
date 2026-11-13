import { Hono } from "hono";
import { z } from "zod";
import { isAdmin, requireAdmin, requirePainel, type PainelEnv } from "../auth/guards.js";
import type { Session } from "../auth/sessions.js";
import { cursoStore } from "../curso/store.js";
import { botAtivo, getMember, listRoles, listTextChannels } from "../discord/bot.js";
import { gatewayStatus, membrosDoServidor } from "../discord/gateway.js";
import { env } from "../env.js";
import { podeAprovar, podeGerir } from "../ponto/service.js";
import { rateLimit } from "../security/rate-limit.js";
import { setStore } from "../set/store.js";
import { progresso, verificarTodos } from "./service.js";
import { horasStore } from "./store.js";

const snowflake = z.string().regex(/^\d{17,20}$/);
const itemId = z.string().regex(/^[a-z0-9-]{1,40}$/);
const texto = z
  .string()
  .transform((s) => s.normalize("NFC").replace(/[\u0000-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim())
  .pipe(z.string().min(1).max(120, "requisito_longo"));

const regraBody = z.object({
  id: itemId,
  dePatenteId: itemId,
  paraPatenteId: itemId,
  horas: z.number().min(0, "horas_invalidas").max(10_000, "horas_invalidas"),
  cursos: z.array(itemId).max(10).transform((l) => [...new Set(l)]),
  requisitos: z.array(texto).max(10, "muitos_requisitos"),
});

const configBody = z
  .object({
    ativo: z.boolean(),
    canalAlertaId: snowflake.nullable(),
    cargosMencionar: z.array(snowflake).max(5, "muitas_mencoes").transform((l) => [...new Set(l)]),
    contagem: z.enum(["total", "promocao"]),
    regras: z.array(regraBody).max(40, "muitas_regras"),
  })
  .superRefine((c, ctx) => {
    const patentes = new Set(setStore.config().patentes.map((p) => p.id));
    const cursos = new Set(cursoStore.dados().cursos.map((x) => x.id));
    const de = c.regras.map((r) => r.dePatenteId);
    if (new Set(c.regras.map((r) => r.id)).size !== c.regras.length) ctx.addIssue({ code: "custom", message: "regras_repetidas" });
    // Uma regra por patente de origem: a "próxima promoção" de cada patente é uma só.
    if (new Set(de).size !== de.length) ctx.addIssue({ code: "custom", message: "patente_repetida" });
    for (const r of c.regras) {
      if (!patentes.has(r.dePatenteId) || !patentes.has(r.paraPatenteId)) ctx.addIssue({ code: "custom", message: "patente_invalida" });
      if (r.dePatenteId === r.paraPatenteId) ctx.addIssue({ code: "custom", message: "mesma_patente" });
      if (r.cursos.some((id) => !cursos.has(id))) ctx.addIssue({ code: "custom", message: "curso_invalido" });
    }
  });

async function estado(session: Session) {
  const admin = isAdmin(session);
  const m = await getMember(session.user.id);
  const roles = m?.roles ?? session.roles;
  const equipe = admin || podeGerir(roles) || podeAprovar(session.user.id, roles);
  const eu = progresso(session.user.id, roles, m?.nick ?? m?.user.global_name ?? session.user.globalName ?? session.user.username);

  // Equipe: progresso de todo o efetivo que tem próxima promoção definida (mais perto primeiro).
  const efetivo = equipe
    ? (membrosDoServidor() ?? [])
        .filter((x) => !x.bot)
        .map((x) => ({ id: x.id, nome: x.nome, username: x.username, avatar: x.avatar, ...progresso(x.id, x.roles, x.nome) }))
        .filter((x) => x.regra && x.para)
        .sort((a, b) => b.horasMs / Math.max(1, b.exigidoMs) - a.horasMs / Math.max(1, a.exigidoMs))
        .slice(0, 300)
        .map(({ regra: _r, ...x }) => x)
    : [];
  const alertas = [...horasStore.alertas()].reverse().map((a) => ({ ...a, url: a.mensagem ? `https://discord.com/channels/${env.DISCORD_GUILD_ID}/${a.mensagem.canalId}/${a.mensagem.mensagemId}` : null }));
  const [cargos, canais] = admin ? await Promise.all([listRoles(), listTextChannels()]) : [[], []];
  const { regra: _regra, ...meu } = eu;
  return {
    admin,
    equipe,
    botAtivo,
    gateway: gatewayStatus(),
    config: horasStore.config(),
    patentes: setStore.config().patentes.map((p) => ({ id: p.id, nome: p.nome, prefixo: p.prefixo })),
    cursos: cursoStore.dados().cursos.map((c) => ({ id: c.id, sigla: c.sigla, nome: c.nome })),
    eu: meu,
    aptos: equipe ? alertas.filter((a) => a.status === "apto") : [],
    historico: equipe ? alertas.filter((a) => a.status !== "apto").slice(0, 50) : [],
    efetivo,
    cargos,
    canais,
  };
}

export const horasRoutes = new Hono<PainelEnv>();
const writeLimiter = rateLimit({ name: "horas", limit: 20, windowMs: 60_000 });

horasRoutes.use("*", requirePainel);

horasRoutes.get("/", async (c) => c.json(await estado(c.get("session"))));

horasRoutes.put("/config", writeLimiter, requireAdmin, async (c) => {
  const session = c.get("session");
  const parsed = configBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "";
    return c.json({ error: /^[a-z_]+$/.test(msg) ? msg : "dados_invalidos" }, 422);
  }
  await horasStore.saveConfig({ ...parsed.data, atualizadoEm: Date.now(), atualizadoPor: session.user.id });
  void verificarTodos(); // regras novas: quem já bateu as horas recebe o alerta agora
  console.info(`[horas] configuração alterada por discord:${session.user.id} (${parsed.data.regras.length} regras)`);
  return c.json(await estado(session));
});
