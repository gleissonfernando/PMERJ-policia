import { Hono } from "hono";
import { z } from "zod";
import { isAdmin, requireAdmin, requirePainel, type PainelEnv } from "../auth/guards.js";
import type { Session } from "../auth/sessions.js";
import { botAtivo, listCategories, listRoles, listTextChannels, memberRoles } from "../discord/bot.js";
import { gatewayStatus, membrosDoServidor } from "../discord/gateway.js";
import { rateLimit } from "../security/rate-limit.js";
import { atualizarTodos, conferirVoz, decidir, MENSAGEM_ERRO, podeAprovar, podeGerir, publicar, rankingAtual, resumoPolicial, type TipoPainel } from "./service.js";
import { podeDecidirInatividade, resumoInatividade, verificarInatividade } from "./inatividade.js";
import { destinosAssuncao } from "./lembrete.js";
import { pontoStore } from "./store.js";

const snowflake = z.string().regex(/^\d{17,20}$/);
const cargos = z.array(snowflake).max(25, "muitos_cargos").transform((l) => [...new Set(l)]);
const configBody = z.object({
  cargosBater: cargos,
  cargosAprovadores: cargos,
  usuariosAprovadores: z.array(snowflake).max(25, "muitas_pessoas").transform((l) => [...new Set(l)]),
  cargosGestao: cargos,
  canaisVoz: z.array(snowflake).max(25, "muitos_canais").transform((l) => [...new Set(l)]),
  minimoMinutos: z.number().int().min(0, "minimo_invalido").max(720, "minimo_invalido"),
  categoriaId: snowflake.nullable(),
  canalLogId: snowflake.nullable(),
  lembreteAssuncao: z.boolean(),
  inatividade: z.object({
    ativo: z.boolean(),
    dias: z.number().int().min(1, "dias_invalidos").max(60, "dias_invalidos"),
    modo: z.enum(["revisao", "automatico"]),
    cargosAusencia: cargos,
    cargosDecisao: cargos,
    canalLogId: snowflake.nullable(),
  }),
});

function issueCode(err: z.ZodError): string {
  const msg = err.issues[0]?.message ?? "";
  return /^[a-z_]+$/.test(msg) ? msg : "dados_invalidos";
}

/** Ponto sem campos internos (ids das mensagens do canal temporário). */
const publico = ({ aprovacao, ...p }: ReturnType<typeof pontoStore.pontos>[number]) => ({ ...p, canalAprovacaoId: aprovacao?.canalId ?? null });

async function estado(session: Session) {
  const admin = isAdmin(session);
  const roles = (await memberRoles(session.user.id)) ?? session.roles;
  const aprovador = podeAprovar(session.user.id, roles);
  const gestao = podeGerir(roles);
  const ver = admin || aprovador || gestao;
  const [listaCargos, canais, categorias] = admin ? await Promise.all([listRoles(), listTextChannels(), listCategories()]) : [[], [], []];
  const meu = resumoPolicial(session.user.id);
  // Nome e foto das pessoas aprovadoras (para a tela de configuração).
  const membros = admin ? membrosDoServidor() : null;
  const porId = new Map((membros ?? []).map((m) => [m.id, m]));
  return {
    meuId: session.user.id,
    aprovadoresInfo: admin
      ? pontoStore.config().usuariosAprovadores.map((id) => {
          const m = porId.get(id);
          return { id, nome: m?.nome ?? null, username: m?.username ?? null, avatar: m?.avatar ?? null };
        })
      : [],
    config: pontoStore.config(),
    admin,
    aprovador,
    gestao,
    botAtivo,
    gateway: gatewayStatus(),
    eu: { ...meu, aberto: meu.aberto ? publico(meu.aberto) : null, recentes: meu.recentes.map(publico) },
    emServico: [...pontoStore.abertos()].sort((a, b) => a.entrada - b.entrada).map(publico),
    ranking: rankingAtual(),
    rankingDesde: pontoStore.rankingDesde(),
    horasDesde: pontoStore.horasDesde(),
    pendentes: ver ? pontoStore.pendentes().map(publico) : [],
    historico: ver ? [...pontoStore.pontos()].reverse().filter((p) => p.status !== "aberto" && p.status !== "pendente").slice(0, 100).map(publico) : [],
    cargos: listaCargos,
    canais,
    categorias,
    /** Painéis de assunção publicados (para onde o lembrete leva). */
    destinosAssuncao: admin ? destinosAssuncao().map(({ id, nome, canalId }) => ({ id, nome, canalId })) : [],
    inatividade: admin || gestao || podeDecidirInatividade(roles) ? resumoInatividade() : null,
  };
}

export const pontoRoutes = new Hono<PainelEnv>();
const writeLimiter = rateLimit({ name: "ponto", limit: 30, windowMs: 60_000 });

pontoRoutes.use("*", requirePainel);

pontoRoutes.get("/", async (c) => c.json(await estado(c.get("session"))));

pontoRoutes.put("/config", writeLimiter, requireAdmin, async (c) => {
  const session = c.get("session");
  const parsed = configBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: issueCode(parsed.error) }, 422);
  const atual = pontoStore.config();
  const mudouVoz = JSON.stringify(atual.canaisVoz) !== JSON.stringify(parsed.data.canaisVoz) || JSON.stringify(atual.cargosBater) !== JSON.stringify(parsed.data.cargosBater);
  // Ligou agora: a contagem começa hoje (ninguém é cobrado por dias anteriores).
  const ativadoEm = parsed.data.inatividade.ativo ? (atual.inatividade.ativo ? atual.inatividade.ativadoEm : Date.now()) : 0;
  await pontoStore.saveConfig({ ...atual, ...parsed.data, inatividade: { ...parsed.data.inatividade, ativadoEm }, atualizadoEm: Date.now(), atualizadoPor: session.user.id });
  if (parsed.data.inatividade.ativo) void verificarInatividade();
  atualizarTodos();
  if (mudouVoz) void conferirVoz(); // quem já está nos canais novos bate o ponto; quem ficou fora fecha
  console.info(`[ponto] configuração alterada por discord:${session.user.id}`);
  return c.json(await estado(session));
});

/** Busca de membros para escolher aprovadores (só admin; até 20 resultados, sem bots). */
pontoRoutes.get("/membros", requireAdmin, (c) => {
  const sem = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const q = sem(c.req.query("q") ?? "").trim().slice(0, 50);
  const membros = membrosDoServidor();
  if (!membros) return c.json({ carregando: true, membros: [] });
  const achados = membros
    .filter((m) => !m.bot && (!q || sem(m.nome).includes(q) || sem(m.username).includes(q) || m.id === q))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
    .slice(0, 20)
    .map(({ id, nome, username, avatar }) => ({ id, nome, username, avatar }));
  return c.json({ carregando: false, membros: achados });
});

pontoRoutes.post("/publicar", writeLimiter, requireAdmin, async (c) => {
  const session = c.get("session");
  const parsed = z.object({ tipo: z.enum(["painel", "painelServico", "ranking"]), canalId: snowflake }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "canal_invalido" }, 422);
  if (!botAtivo) return c.json({ error: "bot_desligado" }, 409);
  const ok = await publicar(parsed.data.tipo as TipoPainel, parsed.data.canalId);
  if (!ok) return c.json({ error: "falha_publicar" }, 502);
  return c.json(await estado(session));
});

/** Aprovar/reprovar pelo site: mesmas regras do Discord (só aprovadores por cargo ou pessoa, nunca o próprio ponto). */
pontoRoutes.post("/:id/decidir", writeLimiter, async (c) => {
  const session = c.get("session");
  const roles = (await memberRoles(session.user.id)) ?? session.roles;
  if (!podeAprovar(session.user.id, roles)) return c.json({ error: "sem_permissao_aprovar" }, 403);
  const parsed = z
    .object({ aprovar: z.boolean(), motivo: z.string().max(300).transform((s) => s.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "").trim() || null).nullable().optional() })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "dados_invalidos" }, 422);
  const p = pontoStore.ponto(c.req.param("id"));
  if (!p) return c.json({ error: "ja_decidido" }, 404);
  const res = await decidir(p, parsed.data.aprovar, { id: session.user.id, nome: session.user.globalName ?? session.user.username }, parsed.data.motivo ?? null);
  if (!res.ok) return c.json({ error: res.erro, mensagem: MENSAGEM_ERRO[res.erro] }, 409);
  return c.json(await estado(session));
});
