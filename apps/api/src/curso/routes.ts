import { Hono, type MiddlewareHandler } from "hono";
import { z } from "zod";
import { isAdmin, requireAdmin, requirePainel, type PainelEnv } from "../auth/guards.js";
import type { Session } from "../auth/sessions.js";
import { botAtivo, listRoles, listTextChannels, memberRoles } from "../discord/bot.js";
import { setStore } from "../set/store.js";
import { rateLimit } from "../security/rate-limit.js";
import {
  abrirTurma,
  cancelarTurma,
  ehInstrutor,
  entrar,
  finalizarTurma,
  iniciarTurma,
  linkEvento,
  podeRemover,
  removerCurso,
  sair,
  tirarDaTurma,
  type Quem,
} from "./service.js";
import { emitirCertificado, linkCertificado } from "./certificado.js";
import { cursoStore } from "./store.js";
import type { CursoConfig, Participante, Turma } from "./types.js";

/* ---------- Sessão → pessoa ---------- */

const nomeSessao = (s: Session) => s.user.globalName ?? s.user.username;
const quemDa = (s: Session): Quem => ({ id: s.user.id, nome: nomeSessao(s) });

/** Cargos ATUAIS no Discord (não os do login): quem perde o cargo perde o acesso na hora. */
async function cargosAtuais(s: Session): Promise<string[]> {
  return (await memberRoles(s.user.id)) ?? s.roles;
}

/* ---------- Validação ---------- */

const clean = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim();
const textoLivre = (max: number) =>
  z
    .string()
    .transform((s) => s.normalize("NFC").replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "").trim())
    .pipe(z.string().max(max, "texto_longo"));
const linha = (max: number) =>
  z
    .string()
    .transform(clean)
    .pipe(z.string().min(1, "texto_curto").max(max, "texto_longo").regex(/^[\p{L}\p{M}\p{N}º°ª .,'()\/—–:-]+$/u, "texto_invalido"));
const itemId = z.string().regex(/^[a-z0-9-]{1,40}$/);
const snowflake = z.string().regex(/^\d{17,20}$/, "discord_id_invalido");
/** Texto opcional: vazio vira null. */
const opcional = (max: number) =>
  textoLivre(max)
    .nullish()
    .transform((v) => (v ? v : null));
const cargos = (max: number) => z.array(snowflake).max(max, "muitos_cargos").transform((l) => [...new Set(l)]);

const cursoBody = z
  .object({
    id: itemId,
    nome: linha(60),
    sigla: linha(12),
    descricao: textoLivre(600),
    ativo: z.boolean(),
    patenteMinimaId: itemId.nullable(),
    cargoId: snowflake.nullable(),
    cargosInstrutores: cargos(25),
  })
  .superRefine((c, ctx) => {
    if (c.patenteMinimaId && !setStore.config().patentes.some((p) => p.id === c.patenteMinimaId)) {
      ctx.addIssue({ code: "custom", path: ["patenteMinimaId"], message: "patente_invalida" });
    }
  });

const configBody = z
  .object({
    cursos: z.array(cursoBody).max(30, "muitos_cursos"),
    cargosInstrutores: cargos(25),
    cargosRemover: cargos(25),
    logCanalId: snowflake.nullable(),
    canalTurmasId: snowflake.nullable(),
    canalCertificadosId: snowflake.nullable().default(null),
    mencionarTodos: z.boolean(),
  })
  .superRefine((c, ctx) => {
    const ids = c.cursos.map((x) => x.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["cursos"], message: "cursos_repetidos" });
    const siglas = c.cursos.map((x) => x.sigla.toLowerCase());
    if (new Set(siglas).size !== siglas.length) ctx.addIssue({ code: "custom", path: ["cursos"], message: "sigla_repetida" });
    // Curso ativo precisa de alguém para dar: instrutor geral ou do próprio curso.
    if (c.cargosInstrutores.length === 0 && c.cursos.some((x) => x.ativo && x.cargosInstrutores.length === 0)) {
      ctx.addIssue({ code: "custom", path: ["cargosInstrutores"], message: "sem_instrutores" });
    }
  });

function issueCode(err: z.ZodError): string {
  const msg = err.issues[0]?.message ?? "";
  return /^[a-z_]+$/.test(msg) ? msg : "dados_invalidos";
}

/* ---------- Estado devolvido ao front ---------- */

const resumoTurma = (t: Turma) => ({
  id: t.id,
  numero: t.numero,
  status: t.status,
  vagas: t.vagas,
  agendadoPara: t.agendadoPara,
  evento: t.evento ? { status: t.evento.status, url: linkEvento(t) } : null,
  participantes: cursoStore.participantesDa(t.id).filter((p) => p.status === "participando" || p.status === "concluido").length,
  criadaEm: t.criadaEm,
  inicioEm: t.inicioEm,
  encerradaEm: t.encerradaEm,
});

const pessoa = (p: Participante) => ({
  id: p.id,
  userId: p.userId,
  nome: p.nome,
  username: p.username,
  avatar: p.avatar,
  status: p.status,
  entrouEm: p.entrouEm,
  concluidoEm: p.concluidoEm,
  cargoEntregue: p.cargoEntregue,
  certificado: p.certificado
    ? {
        numero: p.certificado.numero,
        codigo: p.certificado.codigo,
        emitidoEm: p.certificado.emitidoEm,
        instrutor: p.certificado.instrutor,
        nome: p.certificado.nome,
        foto: p.certificado.foto,
        url: linkCertificado(p.certificado),
        revogadoEm: p.certificado.revogadoEm,
      }
    : null,
});

/** Visão geral: todos os cursos com a situação de quem pediu. */
async function visaoGeral(session: Session) {
  const d = cursoStore.dados();
  const admin = isAdmin(session);
  const roles = await cargosAtuais(session);
  const meus = cursoStore.doPolicial(session.user.id);

  const cursos = d.cursos
    .map((c) => {
      const turma = cursoStore.turmaAtual(c.id);
      const meusDoCurso = meus.filter((p) => p.cursoId === c.id);
      return {
        id: c.id,
        nome: c.nome,
        sigla: c.sigla,
        descricao: c.descricao,
        ativo: c.ativo,
        temCargo: Boolean(c.cargoId),
        instrutor: ehInstrutor(c, roles),
        turmaAtual: turma ? resumoTurma(turma) : null,
        concluidos: d.participantes.filter((p) => p.cursoId === c.id && p.status === "concluido").length,
        meu: meusDoCurso.some((p) => p.status === "concluido")
          ? ("concluido" as const)
          : turma && meusDoCurso.some((p) => p.turmaId === turma.id && p.status === "participando")
            ? ("participando" as const)
            : null,
      };
    })
    .filter((c) => c.ativo || c.meu || c.instrutor || admin);

  const [listaCargos, canais] = admin ? await Promise.all([listRoles(), listTextChannels()]) : [[], []];
  const { atualizadoPor: _p, ...geral } = d.geral;
  return {
    cursos,
    papel: { admin, podeRemover: podeRemover(roles) },
    bot: { ativo: botAtivo },
    patentes: setStore.config().patentes,
    config: admin ? { cursos: d.cursos, ...geral } : null,
    cargos: listaCargos,
    canais,
  };
}

/** Estado de UM curso: turma atual, participantes, histórico. */
async function estado(curso: CursoConfig, session: Session) {
  const d = cursoStore.dados();
  const instrutor = ehInstrutor(curso, await cargosAtuais(session));
  const atual = cursoStore.turmaAtual(curso.id);
  const turmas = d.turmas.filter((t) => t.cursoId === curso.id).sort((a, b) => b.numero - a.numero);
  const meus = cursoStore.doPolicial(session.user.id).filter((p) => p.cursoId === curso.id);
  const concluido = meus.find((p) => p.status === "concluido");
  return {
    config: {
      id: curso.id,
      nome: curso.nome,
      sigla: curso.sigla,
      descricao: curso.descricao,
      ativo: curso.ativo,
      temCargo: Boolean(curso.cargoId),
      patenteMinimaId: curso.patenteMinimaId,
    },
    patentes: setStore.config().patentes,
    papel: { admin: isAdmin(session), instrutor },
    bot: { ativo: botAtivo, canalTurmas: Boolean(d.geral.canalTurmasId), canalCertificados: Boolean(d.geral.canalCertificadosId) },
    turmaAtual: atual ? resumoTurma(atual) : null,
    participantes: atual ? cursoStore.participantesDa(atual.id).filter((p) => p.status === "participando").map(pessoa) : [],
    eu: {
      participando: Boolean(atual && meus.some((p) => p.turmaId === atual.id && p.status === "participando")),
      concluido: concluido ? pessoa(concluido) : null,
    },
    turmas: turmas.slice(0, 30).map(resumoTurma),
    concluidos: d.participantes
      .filter((p) => p.cursoId === curso.id && p.status === "concluido")
      .sort((a, b) => (b.concluidoEm ?? 0) - (a.concluidoEm ?? 0))
      .slice(0, 300)
      .map((p) => ({ ...pessoa(p), turma: d.turmas.find((t) => t.id === p.turmaId)?.numero ?? null })),
  };
}

/* ---------- Rotas ---------- */

type Env = PainelEnv & { Variables: { curso: CursoConfig } };
export const cursoRoutes = new Hono<Env>();
const writeLimiter = rateLimit({ name: "curso", limit: 40, windowMs: 60_000 });

cursoRoutes.use("*", requirePainel);

cursoRoutes.get("/", async (c) => c.json(await visaoGeral(c.get("session"))));

/* ----- Admin: cadastro ----- */

const ouvintesConfig: Array<() => void> = [];
/** O módulo do Discord publica as turmas abertas quando o canal muda. */
export const onConfigSalva = (fn: () => void) => void ouvintesConfig.push(fn);

cursoRoutes.put("/config", writeLimiter, requireAdmin, async (c) => {
  const session = c.get("session");
  const parsed = configBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: issueCode(parsed.error) }, 422);

  const d = cursoStore.dados();
  // Curso com turmas não some: o histórico e quem concluiu precisam continuar existindo.
  const novos = new Set(parsed.data.cursos.map((x) => x.id));
  if (d.cursos.some((x) => !novos.has(x.id) && d.turmas.some((t) => t.cursoId === x.id))) return c.json({ error: "curso_com_historico" }, 409);

  const { cursos, ...geral } = parsed.data;
  d.cursos = cursos;
  d.geral = { ...geral, atualizadoEm: Date.now(), atualizadoPor: session.user.id };
  await cursoStore.salvar();
  ouvintesConfig.forEach((fn) => setTimeout(fn, 0));
  console.info(`[curso] cadastro alterado por discord:${session.user.id} (${cursos.length} cursos)`);
  return c.json(await visaoGeral(session));
});

/** Remover curso também pelo site (mesma regra e mesmos cargos do /remover curso). */
cursoRoutes.post("/remover", writeLimiter, async (c) => {
  const session = c.get("session");
  if (!podeRemover(await cargosAtuais(session))) return c.json({ error: "sem_permissao_remover" }, 403);
  const body = z.object({ userId: snowflake, cursoId: itemId }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "dados_invalidos" }, 422);
  const r = await removerCurso(body.data.userId, body.data.cursoId, quemDa(session));
  if (!r.ok) return c.json({ error: r.erro }, 409);
  return c.json({ ok: true, cargoRetirado: r.valor.cargoRetirado });
});

/* ----- Um curso ----- */

const carregarCurso: MiddlewareHandler<Env> = async (c, next) => {
  const id = c.req.param("cursoId");
  const curso = id && /^[a-z0-9-]{1,40}$/.test(id) ? cursoStore.curso(id) : undefined;
  if (!curso) return c.json({ error: "curso_nao_encontrado" }, 404);
  c.set("curso", curso);
  await next();
};

const requireInstrutor: MiddlewareHandler<Env> = async (c, next) => {
  if (!ehInstrutor(c.get("curso"), await cargosAtuais(c.get("session")))) return c.json({ error: "nao_instrutor" }, 403);
  await next();
};

cursoRoutes.use("/:cursoId/*", carregarCurso);
cursoRoutes.use("/:cursoId", carregarCurso);

cursoRoutes.get("/:cursoId", async (c) => c.json(await estado(c.get("curso"), c.get("session"))));

/* ----- Policial ----- */

cursoRoutes.post("/:cursoId/entrar", writeLimiter, async (c) => {
  const s = c.get("session");
  const curso = c.get("curso");
  const turma = cursoStore.turmaAtual(curso.id);
  if (!turma) return c.json({ error: "turma_encerrada" }, 409);
  const r = await entrar(turma, { id: s.user.id, username: s.user.username, nome: nomeSessao(s), avatar: s.user.avatar });
  return r.ok ? c.json(await estado(curso, s)) : c.json({ error: r.erro }, 409);
});

cursoRoutes.post("/:cursoId/sair", writeLimiter, async (c) => {
  const s = c.get("session");
  const curso = c.get("curso");
  const turma = cursoStore.turmaAtual(curso.id);
  if (!turma) return c.json({ error: "turma_encerrada" }, 409);
  const r = await sair(turma, s.user.id);
  return r.ok ? c.json(await estado(curso, s)) : c.json({ error: r.erro }, 409);
});

/* ----- Instrutores (por cargo) ----- */

cursoRoutes.post("/:cursoId/turmas", writeLimiter, requireInstrutor, async (c) => {
  const s = c.get("session");
  const curso = c.get("curso");
  const body = z
    .object({
      vagas: z.number().int().min(1).max(200).nullable(),
      agendadoPara: z.number().int().positive(),
      duracao: opcional(40),
      local: opcional(80),
      observacoes: opcional(500),
    })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "dados_invalidos" }, 422);
  const r = await abrirTurma(curso, quemDa(s), body.data);
  return r.ok ? c.json(await estado(curso, s), 201) : c.json({ error: r.erro }, 409);
});

cursoRoutes.post("/:cursoId/turmas/:id/:acao{iniciar|finalizar|cancelar}", writeLimiter, requireInstrutor, async (c) => {
  const s = c.get("session");
  const curso = c.get("curso");
  const turma = cursoStore.turma(c.req.param("id"));
  if (!turma || turma.cursoId !== curso.id) return c.json({ error: "nao_encontrado" }, 404);
  const quem = quemDa(s);
  const acao = c.req.param("acao");
  const r = acao === "iniciar" ? await iniciarTurma(turma, quem) : acao === "finalizar" ? await finalizarTurma(turma, quem) : await cancelarTurma(turma, quem);
  return r.ok ? c.json(await estado(curso, s)) : c.json({ error: r.erro }, 409);
});

/** Certificado: emite (quem concluiu antes dos certificados) ou publica de novo o que falhou. */
cursoRoutes.post("/:cursoId/certificados/:pid/publicar", writeLimiter, requireInstrutor, async (c) => {
  const s = c.get("session");
  const curso = c.get("curso");
  const p = cursoStore.dados().participantes.find((x) => x.id === c.req.param("pid") && x.cursoId === curso.id);
  if (!p) return c.json({ error: "nao_encontrado" }, 404);
  const r = await emitirCertificado(p, quemDa(s));
  return r.ok ? c.json(await estado(curso, s)) : c.json({ error: r.erro }, 409);
});

cursoRoutes.post("/:cursoId/turmas/:id/participantes/:pid/remover", writeLimiter, requireInstrutor, async (c) => {
  const s = c.get("session");
  const curso = c.get("curso");
  const turma = cursoStore.turma(c.req.param("id"));
  if (!turma || turma.cursoId !== curso.id) return c.json({ error: "nao_encontrado" }, 404);
  const r = await tirarDaTurma(turma, c.req.param("pid"), quemDa(s));
  return r.ok ? c.json(await estado(curso, s)) : c.json({ error: r.erro }, 409);
});
