import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from './api'
import type { CanalTexto, Cargo, GatewayStatus } from './discord'

export interface MensagemFixa {
  canalId: string
  mensagemId: string
}

export interface PontoConfig {
  cargosBater: string[]
  cargosAprovadores: string[]
  usuariosAprovadores: string[]
  cargosGestao: string[]
  canaisVoz: string[]
  minimoMinutos: number
  categoriaId: string | null
  canalLogId: string | null
  painel: MensagemFixa | null
  painelServico: MensagemFixa | null
  ranking: MensagemFixa | null
  /** DM ao fechar o ponto lembrando da assunção de serviço. */
  lembreteAssuncao: boolean
  inatividade: InatividadeConfig
  atualizadoEm: number
  atualizadoPor: string | null
}

export interface InatividadeConfig {
  ativo: boolean
  dias: number
  /** revisao = canal com relatório e botões · automatico = exonera direto. */
  modo: 'revisao' | 'automatico'
  cargosAusencia: string[]
  /** Vazio = gestão do ponto. */
  cargosDecisao: string[]
  canalLogId: string | null
  ativadoEm: number
}

export type InatividadeInput = Omit<InatividadeConfig, 'ativadoEm'>

export interface CasoInatividade {
  id: string
  numero: number
  userId: string
  username: string
  avatar: string | null
  nome: string
  abertoEm: number
  semPontoDesde: number
  status: 'aberto' | 'exonerado' | 'cancelado' | 'resolvido'
  decisao: { por: { id: string; nome: string }; em: number; motivo: string } | null
  canalUrl: string | null
}

export type PontoInput = Pick<PontoConfig, 'cargosBater' | 'cargosAprovadores' | 'usuariosAprovadores' | 'cargosGestao' | 'canaisVoz' | 'minimoMinutos' | 'categoriaId' | 'canalLogId' | 'lembreteAssuncao'> & {
  inatividade: InatividadeInput
}
export type TipoPainel = 'painel' | 'painelServico' | 'ranking'
export type StatusPonto = 'aberto' | 'pendente' | 'aprovado' | 'reprovado' | 'descartado'

export interface Ponto {
  id: string
  numero: number
  userId: string
  username: string
  avatar: string | null
  nome: string
  origem: 'botao' | 'voz' | 'ajuste'
  entrada: number
  saida: number | null
  status: StatusPonto
  canalAprovacaoId: string | null
  decisao: { por: { id: string; nome: string }; em: number; motivo: string | null } | null
  ajuste: { por: { id: string; nome: string }; em: number } | null
  observacao: string | null
}

export interface Horas {
  userId: string
  username: string
  avatar: string | null
  nome: string
  totalMs: number
  rankingMs: number
  pontos: number
}

export interface MembroBusca {
  id: string
  nome: string | null
  username: string | null
  avatar: string | null
}

export interface PontoEstado {
  meuId: string
  aprovadoresInfo: MembroBusca[]
  config: PontoConfig
  admin: boolean
  aprovador: boolean
  gestao: boolean
  botAtivo: boolean
  gateway: GatewayStatus
  eu: { aberto: Ponto | null; totalMs: number; rankingMs: number; posicao: number | null; pendentes: number; recentes: Ponto[] }
  emServico: Ponto[]
  ranking: Horas[]
  rankingDesde: number
  horasDesde: number
  pendentes: Ponto[]
  historico: Ponto[]
  cargos: Cargo[]
  canais: CanalTexto[]
  categorias: Array<{ id: string; nome: string }>
  /** Painéis de assunção publicados (para onde o lembrete leva). */
  destinosAssuncao: Array<{ id: string; nome: string; canalId: string }>
  /** Casos de inatividade (null = sem acesso). */
  inatividade: { abertos: CasoInatividade[]; recentes: CasoInatividade[] } | null
}

const ERROS: Record<string, string> = {
  muitos_cargos: 'No máximo 25 cargos em cada lista.',
  muitos_canais: 'No máximo 25 canais de voz.',
  minimo_invalido: 'O mínimo precisa ficar entre 0 e 720 minutos.',
  dias_invalidos: 'Os dias de inatividade precisam ficar entre 1 e 60.',
  canal_invalido: 'Escolha um canal.',
  bot_desligado: 'O bot não está configurado no servidor.',
  falha_publicar: 'O Discord recusou a mensagem. Confira as permissões do bot no canal.',
  sem_permissao_aprovar: 'Somente os aprovadores (cargos ou pessoas escolhidas) podem decidir as horas.',
  muitas_pessoas: 'No máximo 25 pessoas aprovadoras.',
  ja_decidido: 'Este ponto já foi decidido.',
  proprio_ponto: 'Você não pode decidir o próprio ponto.',
  proibido: 'Você não tem permissão para isso.',
  muitas_requisicoes: 'Muitas tentativas. Aguarde um minuto.',
}

export function erroPonto(err: unknown): string {
  if (err instanceof ApiError) return ERROS[err.message] ?? 'Não foi possível concluir. Tente novamente.'
  return 'Falha de conexão com o servidor.'
}

/** "4h 05min", "45min". */
export function fmtDur(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60_000))
  const h = Math.floor(min / 60)
  const m = min % 60
  return h ? (m ? `${h}h ${String(m).padStart(2, '0')}min` : `${h}h`) : `${m}min`
}

/** Membros do servidor pelo nome (para escolher aprovadores). */
export const buscarMembros = (q: string) => api.get<{ carregando: boolean; membros: MembroBusca[] }>(`/ponto/membros?q=${encodeURIComponent(q)}`)

export function usePonto() {
  const [data, setData] = useState<PontoEstado | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const busy = useRef(false)

  const reload = useCallback(async () => {
    if (busy.current) return
    try {
      setData(await api.get<PontoEstado>('/ponto'))
      setLoadError(null)
    } catch (err) {
      setLoadError(erroPonto(err))
    }
  }, [])

  useEffect(() => {
    void reload()
    // Em serviço muda o tempo todo: atualiza a cada 20 s com a aba visível.
    const id = window.setInterval(() => document.visibilityState === 'visible' && void reload(), 20_000)
    return () => window.clearInterval(id)
  }, [reload])

  const run = useCallback(async (fn: () => Promise<PontoEstado>) => {
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
    salvarConfig: (cfg: PontoInput) => run(() => api.put<PontoEstado>('/ponto/config', cfg)),
    publicar: (tipo: TipoPainel, canalId: string) => run(() => api.post<PontoEstado>('/ponto/publicar', { tipo, canalId })),
    decidir: (id: string, aprovar: boolean, motivo: string | null) => run(() => api.post<PontoEstado>(`/ponto/${id}/decidir`, { aprovar, motivo })),
  }
}

export type PontoApi = ReturnType<typeof usePonto>
