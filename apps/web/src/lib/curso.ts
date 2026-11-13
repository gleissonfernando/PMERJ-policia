import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from './api'
import type { CanalTexto, Cargo } from './discord'
import type { Patente } from './set'

/* ---------- Tipos (espelham a API) ---------- */

export interface CursoConfig {
  id: string
  nome: string
  sigla: string
  descricao: string
  ativo: boolean
  patenteMinimaId: string | null
  /** Cargo entregue a quem conclui. */
  cargoId: string | null
  /** Instrutores só deste curso (somados aos gerais). */
  cargosInstrutores: string[]
}

export interface CursosConfigInput {
  cursos: CursoConfig[]
  /** Instrutores de todos os cursos. */
  cargosInstrutores: string[]
  /** Quem pode usar /remover curso. */
  cargosRemover: string[]
  logCanalId: string | null
  canalTurmasId: string | null
  /** Canal onde sai o certificado de quem conclui. */
  canalCertificadosId: string | null
  /** Marca @everyone quando uma turma nova é postada. */
  mencionarTodos: boolean
}

/** O que o instrutor informa ao agendar (mostrado na mensagem da turma). */
export interface DetalhesTurma {
  agendadoPara: number
  vagas: number | null
  duracao: string | null
  local: string | null
  observacoes: string | null
}

export type StatusTurma ='inscricoes' | 'andamento' | 'encerrada' | 'cancelada'
export type StatusParticipante = 'participando' | 'saiu' | 'concluido' | 'removido' | 'cancelado'

export interface TurmaResumo {
  id: string
  numero: number
  status: StatusTurma
  vagas: number | null
  /** Horário marcado (ms). */
  agendadoPara: number | null
  /** Evento do servidor que acompanha a turma. */
  evento: { status: 'agendado' | 'andamento' | 'encerrado' | 'cancelado'; url: string | null } | null
  participantes: number
  criadaEm: number
  inicioEm: number | null
  encerradaEm: number | null
}

export interface Pessoa {
  id: string
  userId: string
  nome: string
  username: string
  avatar: string | null
  status: StatusParticipante
  entrouEm: number
  concluidoEm: number | null
  cargoEntregue: boolean | null
  certificado: Certificado | null
}

/** Certificado de conclusão (sai no Discord quando a turma é finalizada). */
export interface Certificado {
  numero: number
  /** SIGLA-TURMA-NÚMERO, para conferência. */
  codigo: string
  emitidoEm: number
  instrutor: { id: string; nome: string }
  nome: string
  /** Avatar do servidor da pessoa na emissão. */
  foto: string
  /** Mensagem no Discord (null = não publicado). */
  url: string | null
  revogadoEm: number | null
}

export interface CursoEstado {
  config: { id: string; nome: string; sigla: string; descricao: string; ativo: boolean; temCargo: boolean; patenteMinimaId: string | null }
  patentes: Patente[]
  papel: { admin: boolean; instrutor: boolean }
  bot: { ativo: boolean; canalTurmas: boolean; canalCertificados: boolean }
  turmaAtual: TurmaResumo | null
  participantes: Pessoa[]
  eu: { participando: boolean; concluido: Pessoa | null }
  turmas: TurmaResumo[]
  concluidos: Array<Pessoa & { turma: number | null }>
}

export interface CursoResumo {
  id: string
  nome: string
  sigla: string
  descricao: string
  ativo: boolean
  temCargo: boolean
  instrutor: boolean
  turmaAtual: TurmaResumo | null
  concluidos: number
  meu: 'concluido' | 'participando' | null
}

export interface CursosVisao {
  cursos: CursoResumo[]
  papel: { admin: boolean; podeRemover: boolean }
  bot: { ativo: boolean }
  patentes: Patente[]
  config: (CursosConfigInput & { atualizadoEm: number }) | null
  cargos: Cargo[]
  canais: CanalTexto[]
}

/* ---------- Erros ---------- */

const ERROS: Record<string, string> = {
  curso_inativo: 'Este curso está desativado.',
  curso_nao_encontrado: 'Curso não encontrado.',
  turma_em_aberto: 'Este curso já tem uma turma aberta ou em andamento.',
  transicao_invalida: 'Essa ação não é possível na situação atual da turma.',
  sem_participantes: 'Ninguém entrou na turma ainda.',
  curso_iniciado: 'O curso já começou: não dá mais para entrar nem sair.',
  turma_encerrada: 'Esta turma já foi encerrada.',
  ja_concluido: 'Você já concluiu este curso.',
  ja_participa: 'Você já está participando desta turma.',
  nao_participa: 'Você não está participando desta turma.',
  sem_vagas: 'A turma está lotada.',
  sem_set: 'Este curso exige patente mínima: peça seu set antes de entrar.',
  patente_insuficiente: 'Sua patente está abaixo da mínima exigida para este curso.',
  nao_tem_curso: 'Essa pessoa não tem esse curso.',
  nao_encontrado: 'Registro não encontrado.',
  nao_instrutor: 'Só os instrutores deste curso podem fazer isso.',
  sem_permissao_remover: 'Seu cargo não pode remover cursos.',
  horario_passado: 'Esse horário já passou. Escolha um horário no futuro.',
  horario_distante: 'Escolha um horário dentro dos próximos 12 meses.',
  sem_instrutores: 'Defina instrutores gerais ou cargos de instrutor em cada curso ativo.',
  muitos_cargos: 'No máximo 25 cargos em cada lista.',
  muitos_cursos: 'No máximo 30 cursos.',
  cursos_repetidos: 'Há cursos duplicados.',
  sigla_repetida: 'Dois cursos não podem ter a mesma sigla.',
  curso_com_historico: 'Esse curso já tem turmas e não pode ser apagado. Desative-o.',
  texto_curto: 'Preencha a sigla e o nome de todos os cursos.',
  texto_longo: 'Texto muito longo.',
  texto_invalido: 'A sigla ou o nome têm caracteres não permitidos.',
  patente_invalida: 'Patente mínima inválida.',
  nao_concluido: 'Essa pessoa não concluiu o curso.',
  sem_canal_certificados: 'Escolha o canal dos certificados em Cadastro de cursos.',
  certificado_nao_publicado: 'O Discord recusou publicar o certificado. Confira as permissões do bot no canal.',
  proibido: 'Você não tem permissão para isso.',
  muitas_requisicoes: 'Muitas tentativas. Aguarde um minuto.',
}

export function erroCurso(err: unknown): string {
  if (err instanceof ApiError) return ERROS[err.message] ?? 'Não foi possível concluir. Verifique os dados e tente novamente.'
  return 'Falha de conexão com o servidor.'
}

/* ---------- Visão geral ---------- */

export function useCursos() {
  const [data, setData] = useState<CursosVisao | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const busy = useRef(false)

  const reload = useCallback(async () => {
    if (busy.current) return
    try {
      setData(await api.get<CursosVisao>('/curso'))
      setLoadError(null)
    } catch (err) {
      setLoadError(erroCurso(err))
    }
  }, [])

  useEffect(() => {
    void reload()
    const onFocus = () => void reload()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [reload])

  return {
    data,
    loadError,
    reload,
    salvarConfig: async (cfg: CursosConfigInput) => {
      busy.current = true
      try {
        setData(await api.put<CursosVisao>('/curso/config', cfg))
      } finally {
        busy.current = false
      }
    },
  }
}

export type CursosApi = ReturnType<typeof useCursos>

/* ---------- Um curso ---------- */

export function useCurso(cursoId: string, onMudou?: () => void) {
  const [data, setData] = useState<CursoEstado | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const busy = useRef(false)
  const base = `/curso/${encodeURIComponent(cursoId)}`

  const reload = useCallback(async () => {
    if (busy.current) return
    try {
      setData(await api.get<CursoEstado>(base))
      setLoadError(null)
    } catch (err) {
      setLoadError(erroCurso(err))
    }
  }, [base])

  useEffect(() => {
    void reload()
    // Entradas e saídas também acontecem pelo Discord: atualiza sozinho.
    const id = window.setInterval(() => document.visibilityState === 'visible' && void reload(), 15_000)
    return () => window.clearInterval(id)
  }, [reload])

  const run = useCallback(
    async (fn: () => Promise<CursoEstado>) => {
      busy.current = true
      try {
        setData(await fn())
        onMudou?.()
      } finally {
        busy.current = false
      }
    },
    [onMudou],
  )

  const turma = (id: string, acao: string) => run(() => api.post<CursoEstado>(`${base}/turmas/${encodeURIComponent(id)}/${acao}`))
  return {
    data,
    loadError,
    entrar: () => run(() => api.post<CursoEstado>(`${base}/entrar`)),
    sair: () => run(() => api.post<CursoEstado>(`${base}/sair`)),
    abrirTurma: (det: DetalhesTurma) => run(() => api.post<CursoEstado>(`${base}/turmas`, det)),
    iniciar: (id: string) => turma(id, 'iniciar'),
    finalizar: (id: string) => turma(id, 'finalizar'),
    cancelar: (id: string) => turma(id, 'cancelar'),
    publicarCertificado: (participanteId: string) => run(() => api.post<CursoEstado>(`${base}/certificados/${encodeURIComponent(participanteId)}/publicar`)),
    tirar: (turmaId: string, participanteId: string) =>
      run(() => api.post<CursoEstado>(`${base}/turmas/${encodeURIComponent(turmaId)}/participantes/${encodeURIComponent(participanteId)}/remover`)),
  }
}

export type CursoApi = ReturnType<typeof useCurso>

/** Remover curso de alguém (mesma regra do /remover curso). */
export const removerCurso = (userId: string, cursoId: string) => api.post<{ ok: true; cargoRetirado: boolean | null }>('/curso/remover', { userId, cursoId })

export const STATUS_TURMA: Record<StatusTurma, { label: string; cls: string }> = {
  inscricoes: { label: 'Inscrições abertas', cls: 'border-success/35 bg-success/10 text-success' },
  andamento: { label: 'Em andamento', cls: 'border-sky-400/35 bg-sky-400/10 text-sky-300' },
  encerrada: { label: 'Finalizada', cls: 'border-line-strong bg-surface-2 text-ink/80' },
  cancelada: { label: 'Cancelada', cls: 'border-line-strong bg-surface-2 text-muted' },
}
