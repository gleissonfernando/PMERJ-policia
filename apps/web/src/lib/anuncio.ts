import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from './api'
import type { CanalTexto, Cargo, GatewayStatus } from './discord'

export interface AnuncioConfig {
  cargosPermitidos: string[]
  rodape: string
  mostrarAutor: boolean
  cor: number
  logCanalId: string | null
  painel: { canalId: string; mensagemId: string } | null
  atualizadoEm: number
  atualizadoPor: string | null
}

export interface AnuncioRegistro {
  id: string
  autor: { id: string; username: string; avatar: string | null }
  canalId: string
  canalNome: string
  mensagemId: string
  titulo: string
  trecho: string
  caracteres: number
  comImagem: boolean
  em: number
}

export interface AnuncioEstado {
  config: AnuncioConfig
  admin: boolean
  podeAnunciar: boolean
  guildId: string | null
  botAtivo: boolean
  gateway: GatewayStatus
  limites: { total: number; titulo: number; imagemBytes: number }
  hoje: number
  semana: number
  recentes: AnuncioRegistro[]
  canais: CanalTexto[]
  cargos: Cargo[]
}

export type AnuncioConfigInput = Omit<AnuncioConfig, 'painel' | 'atualizadoEm' | 'atualizadoPor'>

/* ---------- Limite de caracteres (mesma conta da API: apps/api/src/anuncio/mensagem.ts) ---------- */

/** Emoji da logo no começo do rodapé: `<:pmerj_logo_xxxxxxxxxx:ID> ` (≈45 caracteres). */
const EMOJI_LOGO = 45
/** Descrição da logo no canto superior (também conta no limite). */
const DESCRICAO_LOGO = 'Logo da PMERJ'.length

/** Caracteres gastos por título e rodapé (com o emoji da logo) — o resto do limite de 4.000 é do texto. */
export function caracteresFixos(cfg: Pick<AnuncioConfig, 'rodape' | 'mostrarAutor'>, titulo: string, autorId: string): number {
  const rodape = `-# ${cfg.rodape}` + (cfg.mostrarAutor ? `-# Anunciado por <@${autorId}> · <t:${Math.floor(Date.now() / 1000)}:f>` : '')
  return `## ${titulo}`.length + rodape.length + EMOJI_LOGO + DESCRICAO_LOGO
}

/* ---------- Erros ---------- */

const ERROS: Record<string, string> = {
  muitos_cargos: 'No máximo 25 cargos autorizados.',
  rodape_vazio: 'O rodapé não pode ficar vazio.',
  rodape_longo: 'O rodapé pode ter no máximo 120 caracteres.',
  mencao_proibida: 'Não use @everyone, @here ou menções no rodapé.',
  canal_invalido: 'Escolha um canal.',
  bot_desligado: 'O bot não está configurado no servidor (DISCORD_BOT_TOKEN).',
  falha_publicar: 'O Discord recusou a mensagem. Confira se o bot pode ver, enviar mensagens e anexar arquivos nesse canal.',
  proibido: 'Você não tem permissão para isso.',
  muitas_requisicoes: 'Muitas tentativas. Aguarde um minuto.',
}

export function erroAnuncio(err: unknown): string {
  if (err instanceof ApiError) return ERROS[err.message] ?? 'Não foi possível concluir. Verifique os dados e tente novamente.'
  return 'Falha de conexão com o servidor.'
}

/** Estado de Anúncio. Atualiza a cada 30s (novos anúncios feitos no Discord) e ao voltar para a aba. */
export function useAnuncio() {
  const [data, setData] = useState<AnuncioEstado | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const busy = useRef(false)

  const reload = useCallback(async () => {
    if (busy.current) return
    try {
      setData(await api.get<AnuncioEstado>('/anuncio'))
      setLoadError(null)
    } catch (err) {
      setLoadError(erroAnuncio(err))
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

  const run = useCallback(async (fn: () => Promise<AnuncioEstado>) => {
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
    salvarConfig: (cfg: AnuncioConfigInput) => run(() => api.put<AnuncioEstado>('/anuncio/config', cfg)),
    publicarPainel: (canalId: string) => run(() => api.post<AnuncioEstado>('/anuncio/painel', { canalId })),
  }
}

export type AnuncioApi = ReturnType<typeof useAnuncio>
