import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from './api'
import type { CanalTexto, Cargo, GatewayStatus } from './discord'

export type StatusRequerimento = 'AGUARDANDO' | 'DEFERIDO' | 'EM_EXECUCAO' | 'CONCLUIDO' | 'INDEFERIDO'
export interface Pessoa {
  id: string
  name: string
}

export interface DoespConfig {
  panelChannelId: string | null
  panelMessageId: string | null
  requestsChannelId: string | null
  resultsChannelId: string | null
  draftCategoryId: string | null
  requesterRoleIds: string[]
  commanderRoleIds: string[]
  companyRoleIds: string[]
  managerRoleIds: string[]
  panelError: string | null
  updatedAt: number
}

export type DoespInput = Pick<DoespConfig, 'panelChannelId' | 'requestsChannelId' | 'resultsChannelId' | 'draftCategoryId' | 'requesterRoleIds' | 'commanderRoleIds' | 'companyRoleIds' | 'managerRoleIds'>

export interface Requerimento {
  id: string
  number: number
  year: number
  status: StatusRequerimento
  requester: Pessoa
  fact: string
  subject: string
  information: string
  area: string
  period: string
  channelId: string | null
  messageId: string | null
  dispatchedBy: Pessoa | null
  dispatchedAt: number | null
  refusedReason: string | null
  doesp: string | null
  team: string | null
  assignedPeriod: string | null
  assignedBy: Pessoa | null
  assignedAt: number | null
  result: string | null
  resultBy: Pessoa | null
  resultAt: number | null
  media: Array<{ id: string; kind: 'image' | 'video'; name: string }>
  requestLinks: string[]
  mediaStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'RETRYING' | null
  mediaError: string | null
  /** Resultados salvos mas não publicados no canal. */
  mediaTravada: boolean
  createdAt: number
}

export interface DoespEstado {
  acesso: { canConfigure: boolean; canManage: boolean; canRequest: boolean; canDispatch: boolean; canExecute: boolean }
  guildId: string | null
  config: DoespConfig
  botAtivo: boolean
  gateway: GatewayStatus
  requests: Requerimento[]
  cargos: Cargo[]
  canais: CanalTexto[]
  categorias: Array<{ id: string; nome: string }>
  aviso?: string | null
}

/** A API já devolve a mensagem pronta (em português). */
export function erroDoesp(err: unknown): string {
  if (err instanceof ApiError) return err.message && err.message !== 'erro' && !/^[a-z_]+$/.test(err.message) ? err.message : 'Não foi possível concluir. Tente novamente.'
  return 'Falha de conexão com o servidor.'
}

export const numero = (r: Pick<Requerimento, 'number' | 'year'>) => `Nº ${String(r.number).padStart(3, '0')}/${r.year}`

export function useDoesp() {
  const [data, setData] = useState<DoespEstado | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const busy = useRef(false)

  const reload = useCallback(async () => {
    if (busy.current) return
    try {
      setData(await api.get<DoespEstado>('/doesp'))
      setLoadError(null)
    } catch (err) {
      setLoadError(erroDoesp(err))
    }
  }, [])

  useEffect(() => {
    void reload()
    // Novos requerimentos e cada etapa feita no Discord aparecem aqui.
    const id = window.setInterval(() => document.visibilityState === 'visible' && void reload(), 15_000)
    return () => window.clearInterval(id)
  }, [reload])

  const run = useCallback(async (fn: () => Promise<DoespEstado>) => {
    busy.current = true
    try {
      const novo = await fn()
      setData(novo)
      return novo
    } finally {
      busy.current = false
    }
  }, [])

  return {
    data,
    loadError,
    salvar: (cfg: DoespInput) => run(() => api.put<DoespEstado>('/doesp/config', cfg)),
    publicar: (recreate: boolean) => run(() => api.post<DoespEstado>('/doesp/painel', { recreate })),
    republicarMidias: (id: string) => run(() => api.post<DoespEstado>(`/doesp/${id}/midias`)),
  }
}

export type DoespApi = ReturnType<typeof useDoesp>
