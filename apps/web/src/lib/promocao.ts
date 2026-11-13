import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from './api'
import type { CanalTexto, Cargo, GatewayStatus } from './discord'

export interface PromocaoConfig {
  cargosPromover: string[]
  canalAnuncioId: string | null
  cargosRebaixar: string[]
  canalRebaixamentoId: string | null
  rodape: string
  atualizadoEm: number
  atualizadoPor: string | null
}

export interface PatenteFoto {
  id: string
  nome: string
  prefixo: string
  cargoId: string | null
}

export type StatusAcao = 'feito' | 'falhou' | 'nao_se_aplica'

export interface Promocao {
  id: string
  userId: string
  username: string
  avatar: string | null
  de: PatenteFoto | null
  para: PatenteFoto
  modo: 'promocao' | 'rebaixamento'
  motivo: string | null
  subiu: boolean
  apelidoAntes: string | null
  apelidoNovo: string | null
  statusApelido: StatusAcao
  statusCargos: StatusAcao
  por: { id: string; nome: string }
  em: number
  anuncio: { canalId: string; mensagemId: string } | null
}

export interface PromocaoEstado {
  config: PromocaoConfig
  patentes: PatenteFoto[]
  formato: string
  admin: boolean
  podePromover: boolean
  podeRebaixar: boolean
  botAtivo: boolean
  gateway: GatewayStatus
  hoje: number
  semana: number
  recentes: Promocao[]
  cargos: Cargo[]
  canais: CanalTexto[]
}

export interface PromocaoInput {
  cargosPromover: string[]
  canalAnuncioId: string | null
  cargosRebaixar: string[]
  canalRebaixamentoId: string | null
  rodape: string
}

const ERROS: Record<string, string> = {
  muitos_cargos: 'No máximo 25 cargos.',
  rodape_vazio: 'O rodapé não pode ficar vazio.',
  rodape_longo: 'O rodapé pode ter no máximo 100 caracteres.',
  mencao_proibida: 'Não use @everyone, @here ou menções no rodapé.',
  proibido: 'Você não tem permissão para isso.',
  muitas_requisicoes: 'Muitas tentativas. Aguarde um minuto.',
}

export function erroPromocao(err: unknown): string {
  if (err instanceof ApiError) return ERROS[err.message] ?? 'Não foi possível concluir. Verifique os dados e tente novamente.'
  return 'Falha de conexão com o servidor.'
}

/** Estado das promoções. Atualiza a cada 30s (promoções são feitas pelo /promoção no Discord). */
export function usePromocao() {
  const [data, setData] = useState<PromocaoEstado | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const busy = useRef(false)

  const reload = useCallback(async () => {
    if (busy.current) return
    try {
      setData(await api.get<PromocaoEstado>('/promocao'))
      setLoadError(null)
    } catch (err) {
      setLoadError(erroPromocao(err))
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

  return {
    data,
    loadError,
    salvarConfig: async (cfg: PromocaoInput) => {
      busy.current = true
      try {
        setData(await api.put<PromocaoEstado>('/promocao/config', cfg))
      } finally {
        busy.current = false
      }
    },
  }
}

export type PromocaoApi = ReturnType<typeof usePromocao>
