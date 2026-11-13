import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from './api'
import type { CanalTexto, Cargo, GatewayStatus } from './discord'

export interface Nivel {
  id: string
  cargoId: string
  titulo: string
  emoji: string
}

export interface HierarquiaConfig {
  canalId: string | null
  mensagemIds: string[]
  titulo: string
  cor: number
  rodape: string
  mostrarVagos: boolean
  /** patentes = níveis puxados do Pedir Set (+ extras acima) · manual = só a lista montada aqui. */
  origem: 'patentes' | 'manual'
  /** Emoji de cada patente no painel (patenteId → emoji). */
  emojisPatentes: Record<string, string>
  niveis: Nivel[]
  erro: string | null
  publicadoEm: number | null
  atualizadoEm: number
  atualizadoPor: string | null
}

export interface NivelMontado {
  nivelId: string
  cargoId: string
  titulo: string
  emoji: string
  membros: Array<{ id: string; nome: string; avatar: string | null }>
}

export interface HierarquiaEstado {
  admin: boolean
  config: HierarquiaConfig
  botAtivo: boolean
  gateway: GatewayStatus
  arvore: NivelMontado[] | null
  limites: { niveis: number; titulo: number; tituloNivel: number; rodape: number }
  /** Patentes do Pedir Set (da mais baixa para a mais alta). */
  patentes: Array<{ id: string; nome: string; prefixo: string; cargoId: string | null }>
  niveisEfetivos: Array<Nivel & { patenteId?: string }>
  cargos: Cargo[]
  canais: CanalTexto[]
  aviso?: string | null
}

export type HierarquiaInput = Pick<HierarquiaConfig, 'canalId' | 'titulo' | 'cor' | 'rodape' | 'mostrarVagos' | 'origem' | 'emojisPatentes' | 'niveis'>

const ERROS: Record<string, string> = {
  muitos_niveis: 'No máximo 50 níveis.',
  cargo_repetido: 'O mesmo cargo está em dois níveis.',
  titulo_vazio: 'O título do painel não pode ficar vazio.',
  rodape_vazio: 'O rodapé não pode ficar vazio.',
  texto_longo: 'Um dos textos passou do limite de caracteres.',
  mencao_proibida: 'Não use @everyone, @here ou menções nos textos.',
  proibido: 'Você não tem permissão para isso.',
  muitas_requisicoes: 'Muitas tentativas. Aguarde um minuto.',
}

export function erroHierarquia(err: unknown): string {
  if (err instanceof ApiError) return ERROS[err.message] ?? (/\s/.test(err.message) ? err.message : 'Não foi possível concluir. Verifique os dados e tente novamente.')
  return 'Falha de conexão com o servidor.'
}

/** Estado da hierarquia. Atualiza a cada 30 s (os cargos mudam no Discord). */
export function useHierarquia() {
  const [data, setData] = useState<HierarquiaEstado | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const busy = useRef(false)

  const reload = useCallback(async () => {
    if (busy.current) return
    try {
      setData(await api.get<HierarquiaEstado>('/hierarquia'))
      setLoadError(null)
    } catch (err) {
      setLoadError(erroHierarquia(err))
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
    salvarConfig: (cfg: HierarquiaInput) =>
      comBusy(async () => {
        const r = await api.put<HierarquiaEstado>('/hierarquia/config', cfg)
        setData(r)
        return r.aviso ?? null
      }),
    publicar: (recriar: boolean) => comBusy(async () => setData(await api.post<HierarquiaEstado>('/hierarquia/publicar', { recreate: recriar }))),
  }
}

export type HierarquiaApi = ReturnType<typeof useHierarquia>
