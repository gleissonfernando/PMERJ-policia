import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from './api'
import type { CanalTexto, Cargo, GatewayStatus } from './discord'

export interface TipoTicket {
  id: string
  nome: string
  descricao: string
  emoji: string
}

export interface CorregedoriaConfig {
  tipos: TipoTicket[]
  cargosCorregedoria: string[]
  categoriaId: string | null
  logCanalId: string | null
  nomeExibicao: string
  painel: { canalId: string; mensagemId: string } | null
  atualizadoEm: number
  atualizadoPor: string | null
}

export type CorregedoriaInput = Pick<CorregedoriaConfig, 'tipos' | 'cargosCorregedoria' | 'categoriaId' | 'logCanalId' | 'nomeExibicao'>

export interface TicketResumo {
  id: string
  numero: number
  userId: string
  username: string
  avatar: string | null
  nome: string
  insignia: string | null
  tipo: TipoTicket
  assunto: string
  status: 'aberto' | 'fechado'
  assumido: boolean
  agente: string | null
  provas: number
  abertoEm: number
  fechadoEm: number | null
  canalId: string | null
}

export interface CorregedoriaEstado {
  config: CorregedoriaConfig
  admin: boolean
  equipe: boolean
  botAtivo: boolean
  gateway: GatewayStatus
  tickets: TicketResumo[]
  abertos: number
  cargos: Cargo[]
  canais: CanalTexto[]
  categorias: Array<{ id: string; nome: string }>
}

/* ---------- Transcript ---------- */

export interface Anexo {
  arquivo: string
  nome: string
  tipo: string
  bytes: number
}

export interface EventoTranscript {
  id: string
  tipo: 'abertura' | 'mensagem' | 'sistema'
  papel: 'denunciante' | 'corregedoria' | 'sistema'
  conteudo: string
  anexos: Anexo[]
  em: number
  autor: { nome: string; avatar: string | null; id: string | null; agente?: string; agenteId?: string }
}

export interface Transcript {
  id: string
  numero: number
  tipo: TipoTicket
  motivo: string
  assunto: string
  descricao: string
  provas: Anexo[]
  status: 'aberto' | 'fechado'
  abertoEm: number
  fechadoEm: number | null
  denunciante: { id: string; username: string; avatar: string | null; nome: string; insignia: string | null }
  nomeExibicao: string
  assumido: boolean
  interno?: { assumidoPor: { id: string; nome: string } | null; fechadoPor: { id: string; nome: string } | null }
  eventos: EventoTranscript[]
}

export const urlArquivo = (ticketId: string, a: Anexo, chave?: string | null) =>
  `/api/corregedoria/arquivos/${encodeURIComponent(ticketId)}/${encodeURIComponent(a.arquivo)}${chave ? `?chave=${encodeURIComponent(chave)}` : ""}`

/* ---------- Erros ---------- */

const ERROS: Record<string, string> = {
  texto_curto: 'Preencha os nomes (mínimo 2 letras).',
  texto_longo: 'Texto muito longo.',
  mencao_proibida: 'Não use @everyone, @here ou menções.',
  emoji_invalido: 'Emoji inválido (use um emoji só, sem espaços).',
  sem_tipos: 'Cadastre pelo menos um assunto.',
  muitos_tipos: 'No máximo 25 assuntos (limite do menu do Discord).',
  tipos_repetidos: 'Há assuntos repetidos.',
  muitos_cargos: 'No máximo 25 cargos.',
  canal_invalido: 'Escolha um canal.',
  bot_desligado: 'O bot não está configurado no servidor.',
  falha_publicar: 'O Discord recusou a mensagem. Confira as permissões do bot no canal.',
  nao_autenticado: 'Entre com o Discord para ver o transcript.',
  proibido: 'Você não tem acesso a este transcript.',
  muitas_requisicoes: 'Muitas tentativas. Aguarde um minuto.',
}

export function erroCorregedoria(err: unknown): string {
  if (err instanceof ApiError) return ERROS[err.message] ?? 'Não foi possível concluir. Tente novamente.'
  return 'Falha de conexão com o servidor.'
}

/* ---------- Hooks ---------- */

export function useCorregedoria() {
  const [data, setData] = useState<CorregedoriaEstado | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const busy = useRef(false)

  const reload = useCallback(async () => {
    if (busy.current) return
    try {
      setData(await api.get<CorregedoriaEstado>('/corregedoria'))
      setLoadError(null)
    } catch (err) {
      setLoadError(erroCorregedoria(err))
    }
  }, [])

  useEffect(() => {
    void reload()
    const id = window.setInterval(() => document.visibilityState === 'visible' && void reload(), 30_000)
    return () => window.clearInterval(id)
  }, [reload])

  const run = useCallback(async (fn: () => Promise<CorregedoriaEstado>) => {
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
    salvarConfig: (cfg: CorregedoriaInput) => run(() => api.put<CorregedoriaEstado>('/corregedoria/config', cfg)),
    publicarPainel: (canalId: string) => run(() => api.post<CorregedoriaEstado>('/corregedoria/painel', { canalId })),
  }
}

export type CorregedoriaApi = ReturnType<typeof useCorregedoria>

/** Com a chave do link, abre sem login; sem ela, usa a sessão (dono do ticket, corregedoria ou admin). */
export function useTranscript(userId: string, ticket: string | null, chave: string | null) {
  const [data, setData] = useState<{ tickets: Transcript[]; equipe: boolean } | null>(null)
  const [erro, setErro] = useState<{ codigo: string; texto: string } | null>(null)

  useEffect(() => {
    let vivo = true
    api
      .get<{ tickets: Transcript[]; equipe: boolean }>(
        `/corregedoria/transcript/${encodeURIComponent(userId)}${ticket && chave ? `?${new URLSearchParams({ ticket, chave }).toString()}` : ""}`,
      )
      .then((d) => vivo && setData(d))
      .catch((err: unknown) => vivo && setErro({ codigo: err instanceof ApiError ? err.message : 'rede', texto: erroCorregedoria(err) }))
    return () => {
      vivo = false
    }
  }, [userId, ticket, chave])

  return { data, erro }
}
