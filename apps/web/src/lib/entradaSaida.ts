import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from './api'
import type { CanalTexto, GatewayStatus } from './discord'

export type TipoAnuncio = 'entrada' | 'saida'

export interface AnuncioConfig {
  ativo: boolean
  canalId: string | null
  titulo: string
  mensagem: string
  cor: number
  detalhes: boolean
  mencionar: boolean
}

export interface EntradaSaidaConfig {
  entrada: AnuncioConfig
  saida: AnuncioConfig
  ignorarBots: boolean
  atualizadoEm: number
  atualizadoPor: string | null
}

export interface EventoMembro {
  id: string
  tipo: TipoAnuncio
  userId: string
  username: string
  globalName: string | null
  avatar: string | null
  bot: boolean
  em: number
  totalMembros: number
  contaCriadaEm: number
  entrouEm: number | null
  anunciado: boolean
}

export interface EntradaSaidaEstado {
  config: EntradaSaidaConfig
  admin: boolean
  botAtivo: boolean
  gateway: GatewayStatus
  servidor: { nome: string; total: number } | null
  hoje: { entradas: number; saidas: number }
  semana: { entradas: number; saidas: number }
  eventos: EventoMembro[]
  canais: CanalTexto[]
}

export type EntradaSaidaInput = Omit<EntradaSaidaConfig, 'atualizadoEm' | 'atualizadoPor'>

const ERROS: Record<string, string> = {
  titulo_vazio: 'O título não pode ficar vazio.',
  titulo_longo: 'O título pode ter no máximo 80 caracteres.',
  mensagem_vazia: 'A mensagem não pode ficar vazia.',
  mensagem_longa: 'A mensagem pode ter no máximo 600 caracteres.',
  mencao_proibida: 'Não use @everyone, @here ou menção a cargos nos anúncios.',
  sem_canal: 'Escolha o canal do anúncio antes de ativá-lo.',
  bot_desligado: 'O bot não está configurado no servidor (DISCORD_BOT_TOKEN).',
  falha_enviar: 'O Discord recusou a mensagem. Confira se o bot pode ver e enviar mensagens nesse canal.',
  proibido: 'Você não tem permissão para isso.',
  muitas_requisicoes: 'Muitas tentativas. Aguarde um minuto.',
}

export function erroEntradaSaida(err: unknown): string {
  if (err instanceof ApiError) return ERROS[err.message] ?? 'Não foi possível concluir. Verifique os dados e tente novamente.'
  return 'Falha de conexão com o servidor.'
}

/** Estado de Entrada e Saída. Atualiza a cada 30s (atividade em tempo real) e ao voltar para a aba. */
export function useEntradaSaida() {
  const [data, setData] = useState<EntradaSaidaEstado | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const busy = useRef(false)

  const reload = useCallback(async () => {
    if (busy.current) return
    try {
      setData(await api.get<EntradaSaidaEstado>('/entrada-saida'))
      setLoadError(null)
    } catch (err) {
      setLoadError(erroEntradaSaida(err))
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

  const salvarConfig = useCallback(async (cfg: EntradaSaidaInput) => {
    busy.current = true
    try {
      setData(await api.put<EntradaSaidaEstado>('/entrada-saida/config', cfg))
    } finally {
      busy.current = false
    }
  }, [])

  return {
    data,
    loadError,
    reload,
    salvarConfig,
    testar: (tipo: TipoAnuncio) => api.post<{ ok: true }>('/entrada-saida/teste', { tipo }),
  }
}

export type EntradaSaidaApi = ReturnType<typeof useEntradaSaida>
