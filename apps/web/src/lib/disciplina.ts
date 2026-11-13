import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from './api'
import type { CanalTexto, Cargo, GatewayStatus } from './discord'

export interface NivelAdvertencia {
  id: string
  nome: string
  cargoId: string | null
}

export interface DisciplinaConfig {
  cargosGestao: string[]
  categoriaId: string | null
  niveis: NivelAdvertencia[]
  canalAdvertenciaId: string | null
  canalExoneracaoId: string | null
  painel: { canalId: string; mensagemId: string } | null
  atualizadoEm: number
  atualizadoPor: string | null
}

export type DisciplinaInput = Pick<DisciplinaConfig, 'cargosGestao' | 'categoriaId' | 'niveis' | 'canalAdvertenciaId' | 'canalExoneracaoId'>

export interface RegistroDisciplinar {
  id: string
  tipo: 'advertencia' | 'advertencia_removida' | 'exoneracao'
  userId: string
  username: string
  avatar: string | null
  nome: string
  nivel: { id: string; nome: string } | null
  motivo: string | null
  por: { id: string; nome: string }
  em: number
  ok: boolean
}

export interface Reuniao {
  id: string
  numero: number
  userId: string
  username: string
  avatar: string | null
  nome: string
  motivo: string | null
  canalId: string | null
  status: 'aguardando' | 'iniciada' | 'encerrada'
  abertaPor: { id: string; nome: string }
  criadaEm: number
  iniciadaEm: number | null
  encerradaEm: number | null
}

export interface DisciplinaEstado {
  config: DisciplinaConfig
  admin: boolean
  gestao: boolean
  botAtivo: boolean
  gateway: GatewayStatus
  registros: RegistroDisciplinar[]
  reunioes: Reuniao[]
  cargos: Cargo[]
  canais: CanalTexto[]
  categorias: Array<{ id: string; nome: string }>
}

const ERROS: Record<string, string> = {
  muitos_cargos: 'No máximo 25 cargos.',
  texto_curto: 'O nome do nível precisa ter pelo menos 2 letras.',
  texto_longo: 'Nome do nível muito longo (máx. 40).',
  sem_niveis: 'Cadastre pelo menos um nível de advertência.',
  muitos_niveis: 'No máximo 10 níveis de advertência.',
  cargo_repetido: 'Dois níveis não podem usar o mesmo cargo.',
  niveis_repetidos: 'Há níveis repetidos.',
  canal_invalido: 'Escolha um canal.',
  bot_desligado: 'O bot não está configurado no servidor.',
  falha_publicar: 'O Discord recusou a mensagem. Confira as permissões do bot no canal.',
  proibido: 'Você não tem permissão para isso.',
  muitas_requisicoes: 'Muitas tentativas. Aguarde um minuto.',
}

export function erroDisciplina(err: unknown): string {
  if (err instanceof ApiError) return ERROS[err.message] ?? 'Não foi possível concluir. Tente novamente.'
  return 'Falha de conexão com o servidor.'
}

export function useDisciplina() {
  const [data, setData] = useState<DisciplinaEstado | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const busy = useRef(false)

  const reload = useCallback(async () => {
    if (busy.current) return
    try {
      setData(await api.get<DisciplinaEstado>('/disciplina'))
      setLoadError(null)
    } catch (err) {
      setLoadError(erroDisciplina(err))
    }
  }, [])

  useEffect(() => {
    void reload()
    const id = window.setInterval(() => document.visibilityState === 'visible' && void reload(), 30_000)
    return () => window.clearInterval(id)
  }, [reload])

  const run = useCallback(async (fn: () => Promise<DisciplinaEstado>) => {
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
    salvarConfig: (cfg: DisciplinaInput) => run(() => api.put<DisciplinaEstado>('/disciplina/config', cfg)),
    publicarPainel: (canalId: string) => run(() => api.post<DisciplinaEstado>('/disciplina/painel', { canalId })),
  }
}

export type DisciplinaApi = ReturnType<typeof useDisciplina>
