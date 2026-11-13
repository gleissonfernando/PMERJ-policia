import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from './api'
import type { CanalTexto, Cargo, GatewayStatus } from './discord'

export interface BoletimConfig {
  canalId: string | null
  cargosPermitidos: string[]
  cor: number
  rodape: string
  relatorio: RelatorioConfig
  atualizadoEm: number
  atualizadoPor: string | null
}

export interface RelatorioConfig {
  ativo: boolean
  canalId: string | null
  intervaloHoras: 1 | 2 | 3 | 4 | 6 | 8 | 12 | 24
  pularVazio: boolean
  ultimoFim: number | null
  /** Cabeçalho do boletim: "41º BATALHÃO DE POLÍCIA MILITAR". */
  unidade: string
  /** "41º BPM". */
  sigla: string
  resumoTexto: string
  /** Ordens e avisos repetidos em todo boletim até serem trocados. */
  determinacoes: string
  assinatura: string
  numero: number
  ano: number
}

export interface Boletim {
  id: string
  numero: number
  ano: number
  equipe: string
  relatorio: string
  autor: { id: string; nome: string; avatar: string | null }
  canalId: string
  mensagemId: string | null
  em: number
}

export interface BoletimEstado {
  config: BoletimConfig
  admin: boolean
  botAtivo: boolean
  gateway: GatewayStatus
  guildId: string | null
  hoje: number
  semana: number
  recentes: Boletim[]
  /** Próximo relatório automático (null = desligado). */
  proximoRelatorio: number | null
  limites: { equipe: number; relatorio: number; rodape: number }
  cargos: Cargo[]
  canais: CanalTexto[]
}

export type BoletimInput = Pick<BoletimConfig, 'canalId' | 'cargosPermitidos' | 'cor' | 'rodape'> & {
  relatorio: Omit<RelatorioConfig, 'ultimoFim' | 'numero' | 'ano'>
}

/** "Nº 007/2026" */
export const numeroBoletim = (b: Pick<Boletim, 'numero' | 'ano'>) => `Nº ${String(b.numero).padStart(3, '0')}/${b.ano}`

const ERROS: Record<string, string> = {
  muitos_cargos: 'No máximo 25 cargos.',
  rodape_vazio: 'O rodapé não pode ficar vazio.',
  rodape_longo: 'O rodapé pode ter no máximo 100 caracteres.',
  mencao_proibida: 'Não use @everyone, @here ou menções no rodapé.',
  unidade_vazia: 'Informe o nome da unidade (ex.: 41º BATALHÃO DE POLÍCIA MILITAR).',
  sigla_vazia: 'Informe a sigla da unidade (ex.: 41º BPM).',
  assinatura_vazia: 'Informe a assinatura do boletim (ex.: Comando do Batalhão).',
  texto_vazio: 'O texto do resumo do batalhão não pode ficar vazio.',
  texto_longo: 'Um dos textos passou do limite de caracteres.',
  bot_desligado: 'O bot não está configurado no servidor.',
  sem_canal_relatorio: 'Escolha e salve o canal do relatório primeiro.',
  falha_relatorio: 'O bot não conseguiu enviar no canal do relatório (confira as permissões).',
  proibido: 'Você não tem permissão para isso.',
  muitas_requisicoes: 'Muitas tentativas. Aguarde um minuto.',
}

export function erroBoletim(err: unknown): string {
  if (err instanceof ApiError) return ERROS[err.message] ?? 'Não foi possível concluir. Verifique os dados e tente novamente.'
  return 'Falha de conexão com o servidor.'
}

/** Estado do Boletim Interno. Atualiza a cada 30 s (os boletins chegam pelo Discord). */
export function useBoletim() {
  const [data, setData] = useState<BoletimEstado | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const busy = useRef(false)

  const reload = useCallback(async () => {
    if (busy.current) return
    try {
      setData(await api.get<BoletimEstado>('/boletim'))
      setLoadError(null)
    } catch (err) {
      setLoadError(erroBoletim(err))
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
    enviarRelatorio: async () => {
      busy.current = true
      try {
        setData(await api.post<BoletimEstado>('/boletim/relatorio'))
      } finally {
        busy.current = false
      }
    },
    salvarConfig: async (cfg: BoletimInput) => {
      busy.current = true
      try {
        setData(await api.put<BoletimEstado>('/boletim/config', cfg))
      } finally {
        busy.current = false
      }
    },
  }
}

export type BoletimApi = ReturnType<typeof useBoletim>
