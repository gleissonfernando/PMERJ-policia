import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from './api'
import type { CanalTexto, Cargo, GatewayStatus } from './discord'

export interface PatenteResumo {
  id: string
  nome: string
  prefixo: string
}

export interface RegraHoras {
  id: string
  dePatenteId: string
  paraPatenteId: string
  horas: number
  cursos: string[]
  requisitos: string[]
}

export interface HorasConfig {
  ativo: boolean
  canalAlertaId: string | null
  cargosMencionar: string[]
  /** total = horas aprovadas desde o último /zerar horas · promocao = só depois da última promoção. */
  contagem: 'total' | 'promocao'
  regras: RegraHoras[]
  atualizadoEm: number
  atualizadoPor: string | null
}

export type HorasInput = Omit<HorasConfig, 'atualizadoEm' | 'atualizadoPor'>

export interface CursoReq {
  id: string
  sigla: string
  nome: string
  ok: boolean
}

export interface Progresso {
  patente: PatenteResumo | null
  para: PatenteResumo | null
  horasMs: number
  exigidoMs: number
  cursos: CursoReq[]
  requisitos: string[]
  apto: boolean
}

export interface Alerta {
  id: string
  numero: number
  userId: string
  username: string
  avatar: string | null
  nome: string
  de: PatenteResumo
  para: PatenteResumo
  horasMs: number
  horasExigidas: number
  cursos: CursoReq[]
  requisitos: string[]
  em: number
  status: 'apto' | 'promovido' | 'encerrado'
  atualizadoEm: number
  mensagem: { canalId: string; mensagemId: string } | null
  /** Link da mensagem do alerta no Discord. */
  url: string | null
}

export interface HorasEstado {
  admin: boolean
  equipe: boolean
  botAtivo: boolean
  gateway: GatewayStatus
  config: HorasConfig
  patentes: PatenteResumo[]
  cursos: Array<{ id: string; sigla: string; nome: string }>
  eu: Progresso
  aptos: Alerta[]
  historico: Alerta[]
  efetivo: Array<Progresso & { id: string; nome: string; username: string; avatar: string | null }>
  cargos: Cargo[]
  canais: CanalTexto[]
}

const ERROS: Record<string, string> = {
  horas_invalidas: 'As horas precisam ficar entre 0 e 10.000.',
  requisito_longo: 'Cada requisito pode ter até 120 caracteres.',
  muitos_requisitos: 'No máximo 10 requisitos por promoção.',
  muitas_mencoes: 'No máximo 5 cargos para notificar.',
  muitas_regras: 'No máximo 40 promoções.',
  regras_repetidas: 'Há promoções duplicadas.',
  patente_repetida: 'Cada patente só pode ter uma próxima promoção.',
  patente_invalida: 'Escolha patentes válidas em todas as promoções.',
  mesma_patente: 'A patente de origem e a de destino não podem ser a mesma.',
  curso_invalido: 'Um dos cursos exigidos não existe mais.',
  proibido: 'Você não tem permissão para isso.',
  muitas_requisicoes: 'Muitas tentativas. Aguarde um minuto.',
}

export function erroHoras(err: unknown): string {
  if (err instanceof ApiError) return ERROS[err.message] ?? 'Não foi possível concluir. Verifique os dados e tente novamente.'
  return 'Falha de conexão com o servidor.'
}

export function fmtHoras(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60_000))
  const h = Math.floor(min / 60)
  const m = min % 60
  return h ? (m ? `${h}h ${String(m).padStart(2, '0')}min` : `${h}h`) : `${m}min`
}

export function useHoras() {
  const [data, setData] = useState<HorasEstado | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const busy = useRef(false)

  const reload = useCallback(async () => {
    if (busy.current) return
    try {
      setData(await api.get<HorasEstado>('/horas'))
      setLoadError(null)
    } catch (err) {
      setLoadError(erroHoras(err))
    }
  }, [])

  useEffect(() => {
    void reload()
    const id = window.setInterval(() => document.visibilityState === 'visible' && void reload(), 60_000)
    const onFocus = () => void reload()
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [reload])

  return {
    data,
    loadError,
    salvarConfig: async (cfg: HorasInput) => {
      busy.current = true
      try {
        setData(await api.put<HorasEstado>('/horas/config', cfg))
      } finally {
        busy.current = false
      }
    },
  }
}

export type HorasApi = ReturnType<typeof useHoras>
