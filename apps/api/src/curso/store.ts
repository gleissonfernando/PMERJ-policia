import { env } from "../env.js";
import { jsonFile } from "../lib/jsonFile.js";
import type { CursoConfig, CursoData, CursosGeral, Participante, StatusParticipante, Turma } from "./types.js";

/**
 * apps/api/data/curso.json — trocar por Postgres quando o banco entrar no projeto.
 * v3: turma com Entrar/Sair → Iniciar (trava) → Finalizar (entrega o curso a todos).
 * Versões antigas (curso com inscrição/etapas) são migradas sozinhas.
 */

const GERAL_PADRAO = (): CursosGeral => ({
  cargosInstrutores: [],
  cargosRemover: [],
  logCanalId: env.CURSO_LOG_CHANNEL_ID ?? null,
  canalTurmasId: null,
  canalCertificadosId: null,
  mencionarTodos: true,
  atualizadoEm: 0,
  atualizadoPor: null,
});

/** Mensagem do painel antigo (v2) para apagar depois da migração. */
export let painelAntigo: { canalId: string; mensagemId: string } | null = null;

type Antigo = Record<string, unknown> & {
  versao?: number;
  geral?: Partial<CursosGeral> & { painel?: { canalId: string; mensagemId: string } | null };
  cursos?: Array<Partial<CursoConfig>>;
  turmas?: Array<Partial<Turma>>;
  alunos?: Array<Record<string, unknown>>;
  participantes?: Participante[];
};

const STATUS_ANTIGO: Record<string, StatusParticipante> = {
  aprovado: "concluido",
  inscrito: "participando",
  cursando: "participando",
};

function migrar(raw: Antigo): CursoData {
  if (raw.versao === 3) {
    return {
      versao: 3,
      geral: { ...GERAL_PADRAO(), ...raw.geral },
      cursos: (raw.cursos ?? []) as CursoConfig[],
      turmas: ((raw.turmas ?? []) as Turma[]).map((t) => ({ ...t, agendadoPara: t.agendadoPara ?? null, evento: t.evento ?? null, duracao: t.duracao ?? null, local: t.local ?? null, observacoes: t.observacoes ?? null })),
      participantes: (raw.participantes ?? []).map((p) => ({ ...p, certificado: p.certificado ?? null })),
    };
  }

  // v1/v2 → v3
  if (raw.geral?.painel) painelAntigo = raw.geral.painel;
  const cursos: CursoConfig[] = (raw.cursos ?? []).map((c) => ({
    id: String(c.id),
    nome: String(c.nome ?? ""),
    sigla: String(c.sigla ?? ""),
    descricao: String(c.descricao ?? ""),
    ativo: c.ativo ?? true,
    patenteMinimaId: c.patenteMinimaId ?? null,
    cargoId: c.cargoId ?? null,
    cargosInstrutores: c.cargosInstrutores ?? [],
  }));
  const sistema = { id: "sistema", nome: "Sistema" };
  const turmas: Turma[] = (raw.turmas ?? []).map((t) => ({
    id: String(t.id),
    cursoId: String(t.cursoId ?? cursos[0]?.id ?? ""),
    numero: Number(t.numero ?? 1),
    status: (t.status as Turma["status"]) ?? "encerrada",
    vagas: t.vagas ?? null,
    criadaEm: Number(t.criadaEm ?? 0),
    inicioEm: t.inicioEm ?? null,
    encerradaEm: t.encerradaEm ?? null,
    abertaPor: sistema,
    iniciadaPor: null,
    encerradaPor: null,
    mensagem: null,
    agendadoPara: null,
    evento: null,
    duracao: null,
    local: null,
    observacoes: null,
  }));
  const participantes: Participante[] = (raw.alunos ?? []).map((a) => {
    const status = STATUS_ANTIGO[String(a.status)] ?? "saiu";
    return {
      id: String(a.id),
      cursoId: String(a.cursoId ?? cursos[0]?.id ?? ""),
      turmaId: String(a.turmaId),
      userId: String(a.userId),
      username: String(a.username ?? ""),
      nome: String(a.nome ?? a.username ?? ""),
      avatar: (a.avatar as string | null) ?? null,
      status,
      entrouEm: Number(a.inscritoEm ?? 0),
      atualizadoEm: Number(a.atualizadoEm ?? 0),
      cargoEntregue: (a.cargoEntregue as boolean | null) ?? null,
      concluidoEm: status === "concluido" ? Number(a.atualizadoEm ?? 0) : null,
      removido: null,
      certificado: null,
    };
  });
  return {
    versao: 3,
    geral: {
      ...GERAL_PADRAO(),
      logCanalId: raw.geral?.logCanalId ?? GERAL_PADRAO().logCanalId,
      canalTurmasId: raw.geral?.painel?.canalId ?? null,
    },
    cursos,
    turmas,
    participantes,
  };
}

const vazio = (): CursoData => ({ versao: 3, geral: GERAL_PADRAO(), cursos: [], turmas: [], participantes: [] });

export const cursoDb = jsonFile<CursoData>("curso", vazio, migrar as (raw: Partial<CursoData>) => CursoData);

const ouvintes: Array<() => void> = [];

export const cursoStore = {
  dados: () => cursoDb.get(),
  /** Salva e avisa quem acompanha. */
  async salvar() {
    await cursoDb.save();
    for (const fn of ouvintes) setTimeout(fn, 0);
  },
  onSalvo: (fn: () => void) => void ouvintes.push(fn),
  curso: (id: string) => cursoDb.get().cursos.find((c) => c.id === id),
  turma: (id: string) => cursoDb.get().turmas.find((t) => t.id === id),
  /** Turma aberta ou em andamento do curso (só uma por vez). */
  turmaAtual: (cursoId: string) =>
    cursoDb.get().turmas.find((t) => t.cursoId === cursoId && (t.status === "inscricoes" || t.status === "andamento")),
  participantesDa: (turmaId: string) => cursoDb.get().participantes.filter((p) => p.turmaId === turmaId && p.status !== "saiu"),
  /** Tudo de um policial (para o /perfil e o /remover curso). */
  doPolicial: (userId: string) => cursoDb.get().participantes.filter((p) => p.userId === userId),
};
