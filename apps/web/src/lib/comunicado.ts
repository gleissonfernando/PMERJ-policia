import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from './api'
import type { CanalTexto, Cargo, GatewayStatus } from './discord'

export interface ComunicadoConfig {
  painelCanalId: string | null
  painelMensagemId: string | null
  categoriaId: string | null
  cargosPublicar: string[]
  cargosGestores: string[]
  painelErro: string | null
  atualizadoEm: number
  atualizadoPor: string | null
}

export interface Campos {
  operacao: string
  data: string
  horaApresentacao: string
  horaInicio: string
  localApresentacao: string
  localOperacao: string
  efetivo: string
  objetivos: string
  emprego: string
}

export interface Midia {
  id: string
  kind: 'image' | 'video'
  name: string
  contentType: string
  size: number
}

export interface Comunicado {
  id: string
  numero: number
  ano: number
  campos: Campos
  autor: { id: string; nome: string; avatar: string | null }
  destinoCanalId: string
  cargosMencao: string[]
  midias: Midia[]
  mensagemIds: string[]
  em: number
}

export interface ComunicadoEstado {
  acesso: { podeConfigurar: boolean; podeVer: boolean; podePublicar: boolean }
  config: ComunicadoConfig
  botAtivo: boolean
  gateway: GatewayStatus
  guildId: string | null
  hoje: number
  mes: number
  abertos: number
  registros: Comunicado[]
  cargos: Cargo[]
  canais: CanalTexto[]
  categorias: Array<{ id: string; nome: string }>
}

export type ComunicadoInput = Pick<ComunicadoConfig, 'painelCanalId' | 'categoriaId' | 'cargosPublicar' | 'cargosGestores'>

export const numeroComunicado = (c: Pick<Comunicado, 'numero' | 'ano'>) => `Nº ${String(c.numero).padStart(2, '0')}/${c.ano}`

const ERROS: Record<string, string> = {
  muitos_cargos: 'No máximo 25 cargos em cada lista.',
  proibido: 'Você não tem permissão para isso.',
  muitas_requisicoes: 'Muitas tentativas. Aguarde um minuto.',
}

export function erroComunicado(err: unknown): string {
  if (err instanceof ApiError) return ERROS[err.message] ?? (/\s/.test(err.message) ? err.message : 'Não foi possível concluir. Verifique os dados e tente novamente.')
  return 'Falha de conexão com o servidor.'
}

/** Estado dos comunicados. Atualiza a cada 30 s (são publicados pelo Discord). */
export function useComunicado() {
  const [data, setData] = useState<ComunicadoEstado | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const busy = useRef(false)

  const reload = useCallback(async () => {
    if (busy.current) return
    try {
      setData(await api.get<ComunicadoEstado>('/comunicado'))
      setLoadError(null)
    } catch (err) {
      setLoadError(erroComunicado(err))
    }
  }, [])

  useEffect(() => {
    void reload()
    const id = window.setInterval(() => document.visibilityState === 'visible' && void reload(), 30_000)
    const onFocus = () => void reload()
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [reload])

  const comBusy = async (fn: () => Promise<ComunicadoEstado>) => {
    busy.current = true
    try {
      setData(await fn())
    } finally {
      busy.current = false
    }
  }

  return {
    data,
    loadError,
    salvarConfig: (cfg: ComunicadoInput) => comBusy(() => api.put<ComunicadoEstado>('/comunicado/config', cfg)),
    publicar: (recriar: boolean) => comBusy(() => api.post<ComunicadoEstado>('/comunicado/painel', { recreate: recriar })),
  }
}

export type ComunicadoApi = ReturnType<typeof useComunicado>
