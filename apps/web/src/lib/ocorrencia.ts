import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from './api'
import type { CanalTexto, Cargo, GatewayStatus } from './discord'

export interface TipoOcorrencia {
  id: string
  nome: string
  emoji: string
  descricao: string
}

export interface OcorrenciaConfig {
  painelCanalId: string | null
  painelMensagemId: string | null
  destinoCanalId: string | null
  categoriaId: string | null
  cargosRegistrar: string[]
  cargosGestores: string[]
  tipos: TipoOcorrencia[]
  /** Canal de logs do resumo semanal de apreensões (toda segunda). */
  canalResumoId: string | null
  ultimoResumo: string | null
  painelErro: string | null
  atualizadoEm: number
  atualizadoPor: string | null
}

export interface Midia {
  id: string
  kind: 'image' | 'video'
  name: string
  contentType: string
  size: number
}

export interface Preso {
  id: string
  nome: string
  /** RG = ID na cidade. */
  rg: string
  discordId: string | null
}

export interface Ocorrencia {
  id: string
  numero: number
  ano: number
  tipo: Pick<TipoOcorrencia, 'id' | 'nome' | 'emoji'>
  autor: { id: string; nome: string; avatar: string | null }
  participantes: string[]
  local: string
  quando: string
  relato: string
  apreensoes: string | null
  desfecho: string | null
  houvePreso: boolean
  presos: Preso[]
  midias: Midia[]
  canalId: string
  mensagemIds: string[]
  em: number
}

export interface OcorrenciaEstado {
  acesso: { podeConfigurar: boolean; podeVer: boolean; podeRegistrar: boolean }
  config: OcorrenciaConfig
  botAtivo: boolean
  gateway: GatewayStatus
  guildId: string | null
  hoje: number
  semana: number
  abertos: number
  /** Últimos 7 dias e quando sai o próximo resumo automático. */
  resumo: { apreensoes: number; presos: number; ocorrencias: number; proximo: number }
  registros: Ocorrencia[]
  limites: { tipos: number; tipoNome: number; tipoDescricao: number }
  cargos: Cargo[]
  canais: CanalTexto[]
  categorias: Array<{ id: string; nome: string }>
  aviso?: string | null
}

export type OcorrenciaInput = Pick<OcorrenciaConfig, 'painelCanalId' | 'destinoCanalId' | 'categoriaId' | 'cargosRegistrar' | 'cargosGestores' | 'canalResumoId' | 'tipos'>

export const numeroOcorrencia = (o: Pick<Ocorrencia, 'numero' | 'ano'>) => `Nº ${String(o.numero).padStart(3, '0')}/${o.ano}`

const ERROS: Record<string, string> = {
  muitos_cargos: 'No máximo 25 cargos em cada lista.',
  muitos_tipos: 'No máximo 25 tipos de ocorrência (limite do select do Discord).',
  tipo_sem_nome: 'Todo tipo de ocorrência precisa de um nome.',
  tipo_repetido: 'Há tipos de ocorrência repetidos.',
  texto_longo: 'Um dos textos passou do limite de caracteres.',
  proibido: 'Você não tem permissão para isso.',
  muitas_requisicoes: 'Muitas tentativas. Aguarde um minuto.',
}

export function erroOcorrencia(err: unknown): string {
  if (err instanceof ApiError) return ERROS[err.message] ?? (/\s/.test(err.message) ? err.message : 'Não foi possível concluir. Verifique os dados e tente novamente.')
  return 'Falha de conexão com o servidor.'
}

/** Estado das ocorrências. Atualiza a cada 30 s (os registros chegam pelo Discord). */
export function useOcorrencia() {
  const [data, setData] = useState<OcorrenciaEstado | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const busy = useRef(false)

  const reload = useCallback(async () => {
    if (busy.current) return
    try {
      setData(await api.get<OcorrenciaEstado>('/ocorrencia'))
      setLoadError(null)
    } catch (err) {
      setLoadError(erroOcorrencia(err))
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

  const comBusy = async <T,>(fn: () => Promise<T>) => {
    busy.current = true
    try {
      return await fn()
    } finally {
      busy.current = false
    }
  }

  return {
    data,
    loadError,
    salvarConfig: (cfg: OcorrenciaInput) =>
      comBusy(async () => {
        const r = await api.put<OcorrenciaEstado>('/ocorrencia/config', cfg)
        setData(r)
        return r.aviso ?? null
      }),
    enviarResumo: () => comBusy(async () => setData(await api.post<OcorrenciaEstado>('/ocorrencia/resumo'))),
    publicar: (recriar: boolean) => comBusy(async () => setData(await api.post<OcorrenciaEstado>('/ocorrencia/painel', { recreate: recriar }))),
  }
}

export type OcorrenciaApi = ReturnType<typeof useOcorrencia>
