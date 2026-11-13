import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from './api'
import type { CanalTexto, Cargo, GatewayStatus } from './discord'

export interface Quem {
  id: string
  nome: string
}

export interface AdicionarCargoConfig {
  /** Só quem tem um destes cargos usa o /adicionar-cargo. */
  cargosUsar: string[]
  /** Cargos que podem ser dados. Vazio = qualquer um (com as travas de segurança). */
  cargosPermitidos: string[]
  canalLogId: string | null
  /** Cargos que VEEM o comando no Discord, na última vez em que foi aplicado. */
  visibilidade: { cargos: string[]; em: number; por: Quem } | null
  atualizadoEm: number
  atualizadoPor: string | null
}

export interface RegistroCargo {
  id: string
  userId: string
  username: string
  nome: string
  avatar: string | null
  cargos: Array<{ id: string; nome: string; cor: number; ok: boolean }>
  por: Quem
  em: number
  mensagem: { canalId: string; mensagemId: string } | null
}

export interface AdicionarCargoEstado {
  config: AdicionarCargoConfig
  admin: boolean
  podeUsar: boolean
  botAtivo: boolean
  gateway: GatewayStatus
  comandoRegistrado: boolean
  visibilidadeEmDia: boolean
  hoje: number
  semana: number
  recentes: RegistroCargo[]
  cargos: Cargo[]
  canais: CanalTexto[]
}

export interface AdicionarCargoInput {
  cargosUsar: string[]
  cargosPermitidos: string[]
  canalLogId: string | null
}

const ERROS: Record<string, string> = {
  muitos_cargos: 'No máximo 25 cargos em cada lista.',
  proibido: 'Você não tem permissão para isso.',
  muitas_requisicoes: 'Muitas tentativas. Aguarde um minuto.',
}

export function erroAdicionarCargo(err: unknown): string {
  if (err instanceof ApiError) return ERROS[err.message] ?? 'Não foi possível concluir. Verifique os dados e tente novamente.'
  return 'Falha de conexão com o servidor.'
}

/** Resultado do "Aplicar no Discord" (volta do Discord com ?visibilidade=…). */
export const RESULTADO_VISIBILIDADE: Record<string, { ok: boolean; texto: string }> = {
  ok: { ok: true, texto: 'Pronto! Agora só os cargos liberados (e os administradores) veem o /adicionar-cargo.' },
  cancelado: { ok: false, texto: 'Autorização cancelada no Discord. Nada foi alterado.' },
  proibido: { ok: false, texto: 'Só administradores do painel podem aplicar a visibilidade.' },
  conta_diferente: { ok: false, texto: 'A conta autorizada no Discord não é a mesma conectada ao painel.' },
  sem_permissao_servidor: { ok: false, texto: 'Sua conta precisa de "Gerenciar servidor" e "Gerenciar cargos" no Discord para fazer isso.' },
  comando_nao_registrado: { ok: false, texto: 'O comando ainda não foi registrado. Confira se o bot está ligado e tente de novo.' },
  falha_discord: { ok: false, texto: 'O Discord não respondeu. Tente de novo em instantes.' },
}

/** Estado do /adicionar-cargo. Atualiza a cada 30s (os cargos são dados pelo Discord). */
export function useAdicionarCargo() {
  const [data, setData] = useState<AdicionarCargoEstado | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const busy = useRef(false)

  const reload = useCallback(async () => {
    if (busy.current) return
    try {
      setData(await api.get<AdicionarCargoEstado>('/adicionar-cargo'))
      setLoadError(null)
    } catch (err) {
      setLoadError(erroAdicionarCargo(err))
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
    salvarConfig: async (cfg: AdicionarCargoInput) => {
      busy.current = true
      try {
        setData(await api.put<AdicionarCargoEstado>('/adicionar-cargo/config', cfg))
      } finally {
        busy.current = false
      }
    },
  }
}

export type AdicionarCargoApi = ReturnType<typeof useAdicionarCargo>

/** Navegação completa (OAuth no Discord), não fetch. */
export const urlAplicarVisibilidade = '/api/auth/discord/visibilidade?comando=adicionar-cargo'
