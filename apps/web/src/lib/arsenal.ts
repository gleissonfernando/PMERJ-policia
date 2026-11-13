import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from './api'
import type { CanalTexto, Cargo, GatewayStatus } from './discord'

export interface Arma {
  id: string
  nome: string
  emoji: string
}

export interface ArsenalConfig {
  painelCanalId: string | null
  painelMensagemId: string | null
  canalRetiradasId: string | null
  canalPerdasId: string | null
  armas: Arma[]
  cargosUsar: string[]
  cargosGestao: string[]
  painelErro: string | null
  atualizadoEm: number
  atualizadoPor: string | null
}

export interface Pessoa {
  id: string
  nome: string
}

export interface Item {
  chave: string
  armaId: string
  armaNome: string
  serie: string
  status: 'retirada' | 'perdida' | 'livre'
  pessoa: Pessoa | null
  desde: number
}

export type TipoMovimento = 'retirada' | 'devolucao' | 'perda' | 'recuperacao'

export interface Movimento {
  id: string
  tipo: TipoMovimento
  chave: string
  armaNome: string
  serie: string
  pessoa: Pessoa
  relacionado: Pessoa | null
  motivo: string | null
  web: boolean
  canalId: string | null
  mensagemId: string | null
  em: number
}

export interface ArsenalEstado {
  acesso: { podeConfigurar: boolean; gestao: boolean; podeUsar: boolean }
  config: ArsenalConfig
  botAtivo: boolean
  gateway: GatewayStatus
  guildId: string | null
  emUso: Item[]
  perdidas: Item[]
  movimentos: Movimento[]
  limites: { armas: number; armaNome: number; serie: number; motivo: number; porPessoa: number }
  cargos: Cargo[]
  canais: CanalTexto[]
  aviso?: string | null
}

export type ArsenalInput = Pick<ArsenalConfig, 'painelCanalId' | 'canalRetiradasId' | 'canalPerdasId' | 'armas' | 'cargosUsar' | 'cargosGestao'>

const ERROS: Record<string, string> = {
  muitos_cargos: 'No máximo 25 cargos em cada lista.',
  muitas_armas: 'No máximo 25 armas (limite do menu do Discord).',
  arma_sem_nome: 'Toda arma precisa de um nome.',
  arma_repetida: 'Há armas repetidas na lista.',
  texto_longo: 'Um dos nomes passou do limite de caracteres.',
  proibido: 'Você não tem permissão para isso.',
  muitas_requisicoes: 'Muitas tentativas. Aguarde um minuto.',
}

export function erroArsenal(err: unknown): string {
  if (err instanceof ApiError) return ERROS[err.message] ?? (/\s/.test(err.message) ? err.message : 'Não foi possível concluir. Verifique os dados e tente novamente.')
  return 'Falha de conexão com o servidor.'
}

/** Estado do baú. Atualiza a cada 20 s (as retiradas acontecem no Discord). */
export function useArsenal() {
  const [data, setData] = useState<ArsenalEstado | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const busy = useRef(false)

  const reload = useCallback(async () => {
    if (busy.current) return
    try {
      setData(await api.get<ArsenalEstado>('/arsenal'))
      setLoadError(null)
    } catch (err) {
      setLoadError(erroArsenal(err))
    }
  }, [])

  useEffect(() => {
    void reload()
    const id = window.setInterval(() => document.visibilityState === 'visible' && void reload(), 20_000)
    const onFocus = () => void reload()
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [reload])

  const run = async (fn: () => Promise<ArsenalEstado>) => {
    busy.current = true
    try {
      const r = await fn()
      setData(r)
      return r.aviso ?? null
    } finally {
      busy.current = false
    }
  }

  return {
    data,
    loadError,
    salvarConfig: (cfg: ArsenalInput) => run(() => api.put<ArsenalEstado>('/arsenal/config', cfg)),
    publicar: (recriar: boolean) => run(() => api.post<ArsenalEstado>('/arsenal/painel', { recreate: recriar })),
    acao: (chave: string, acao: 'devolver' | 'recuperar', motivo?: string) => run(() => api.post<ArsenalEstado>('/arsenal/acao', { chave, acao, motivo })),
  }
}

export type ArsenalApi = ReturnType<typeof useArsenal>
