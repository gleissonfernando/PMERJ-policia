import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from './api'
import type { CanalTexto, Cargo, GatewayStatus } from './discord'

export type CampoIntel = 'quantidade' | 'policiais' | 'objeto' | 'fotos' | 'link'

export interface RotuloCampo {
  label: string
  descricao: string
}

export interface InteligenciaConfig {
  nome: string
  emoji: string
  descricao: string
  cor: number
  ativa: boolean
  cargosPermitidos: string[]
  canalResultadoId: string | null
  objetos: string[]
  maxPoliciais: number
  exigirFoto: boolean
  mencionar: boolean
  campos: Record<CampoIntel, RotuloCampo>
  painel: { canalId: string; mensagemId: string } | null
  atualizadoEm: number
  atualizadoPor: string | null
}

export interface PolicialRegistro {
  id: string
  nome: string
}

export interface InteligenciaRegistro {
  id: string
  autor: { id: string; username: string; avatar: string | null }
  objeto: string
  policiais: PolicialRegistro[]
  fotosEnviadas: number
  links: string[]
  canalId: string
  mensagemId: string
  em: number
}

export interface InteligenciaEstado {
  config: InteligenciaConfig
  admin: boolean
  podeUsar: boolean
  guildId: string | null
  botAtivo: boolean
  gateway: GatewayStatus
  limites: { policiais: number; fotos: number; links: number }
  hoje: number
  semana: number
  recentes: InteligenciaRegistro[]
  canais: CanalTexto[]
  cargos: Cargo[]
}

export type InteligenciaInput = Omit<InteligenciaConfig, 'painel' | 'atualizadoEm' | 'atualizadoPor'>

export const CAMPOS_INTEL: Array<{ id: CampoIntel; tipo: string; obrigatorio: boolean }> = [
  { id: 'quantidade', tipo: 'Número de policiais', obrigatorio: true },
  { id: 'policiais', tipo: 'Policiais (1 a N)', obrigatorio: true },
  { id: 'objeto', tipo: 'Texto ou lista', obrigatorio: true },
  { id: 'fotos', tipo: 'Upload de imagens (até 5)', obrigatorio: false },
  { id: 'link', tipo: 'Links (um por linha)', obrigatorio: false },
]

/* ---------- Erros ---------- */

const ERROS: Record<string, string> = {
  muitos_cargos: 'No máximo 25 cargos autorizados.',
  nome_vazio: 'Dê um nome à assunção.',
  nome_longo: 'O nome pode ter no máximo 40 caracteres.',
  emoji_invalido: 'Use um único emoji (ex.: 🕵️) ou deixe vazio.',
  descricao_vazia: 'O texto do painel não pode ficar vazio.',
  descricao_longa: 'O texto do painel pode ter no máximo 600 caracteres.',
  campo_vazio: 'Todo campo do formulário precisa de um título.',
  campo_longo: 'O título de um campo pode ter no máximo 45 caracteres (limite do Discord).',
  descricao_campo_longa: 'A ajuda de um campo pode ter no máximo 100 caracteres (limite do Discord).',
  objeto_vazio: 'Há uma comunidade/organização sem nome na lista.',
  objeto_longo: 'Cada comunidade/organização pode ter no máximo 100 caracteres.',
  muitos_objetos: 'No máximo 25 itens (limite do menu do Discord).',
  mencao_proibida: 'Não use @everyone, @here ou menções nos textos.',
  canal_invalido: 'Escolha um canal.',
  bot_desligado: 'O bot não está configurado no servidor (DISCORD_BOT_TOKEN).',
  falha_publicar: 'O Discord recusou a mensagem. Confira se o bot pode ver, enviar mensagens e anexar arquivos nesse canal.',
  proibido: 'Você não tem permissão para isso.',
  muitas_requisicoes: 'Muitas tentativas. Aguarde um minuto.',
}

export function erroInteligencia(err: unknown): string {
  if (err instanceof ApiError) return ERROS[err.message] ?? 'Não foi possível concluir. Verifique os dados e tente novamente.'
  return 'Falha de conexão com o servidor.'
}

/** Estado da Assunção Inteligência. Atualiza a cada 30s e ao voltar para a aba. */
export function useInteligencia() {
  const [data, setData] = useState<InteligenciaEstado | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const busy = useRef(false)

  const reload = useCallback(async () => {
    if (busy.current) return
    try {
      setData(await api.get<InteligenciaEstado>('/inteligencia'))
      setLoadError(null)
    } catch (err) {
      setLoadError(erroInteligencia(err))
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

  const run = useCallback(async (fn: () => Promise<InteligenciaEstado>) => {
    busy.current = true
    try {
      setData(await fn())
    } finally {
      busy.current = false
    }
  }, [])

  return {
    data,
    loadError,
    reload,
    salvar: (cfg: InteligenciaInput) => run(() => api.put<InteligenciaEstado>('/inteligencia/config', cfg)),
    publicarPainel: (canalId: string) => run(() => api.post<InteligenciaEstado>('/inteligencia/painel', { canalId })),
  }
}

export type InteligenciaApi = ReturnType<typeof useInteligencia>
