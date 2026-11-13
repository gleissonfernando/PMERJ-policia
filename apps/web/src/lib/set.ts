import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from './api'
import type { Cargo, CanalTexto, GatewayStatus } from './discord'

export interface Patente {
  id: string
  nome: string
  prefixo: string
  /** Cargo do Discord entregue com esta patente. */
  cargoId?: string | null
}
export interface Orgao {
  id: string
  nome: string
  sigla: string
}

export type ModoSet = 'automatico' | 'aprovacao'

export type { Cargo } from './discord'

export interface SetConfig {
  campos: { orgao: boolean }
  formato: string
  alterarApelido: boolean
  patentes: Patente[]
  orgaos: Orgao[]
  modo: ModoSet
  /** Só quem tem um destes cargos aprova/reprova e vê o canal temporário do pedido. */
  cargosAprovadores: string[]
  aprovacaoCategoriaId: string | null
  cargosAoAprovar: string[]
  expulsarAoReprovar: boolean
  logCanalId: string | null
  painel: { canalId: string; mensagemId: string } | null
  atualizadoEm: number
  atualizadoPor: string | null
}

export type StatusApelido = 'aplicado' | 'falhou' | 'desligado'
export type StatusPedido = 'pendente' | 'aprovado' | 'reprovado' | 'cancelado'
export type StatusAcao = 'feito' | 'falhou' | 'nao_se_aplica'

export interface Categoria {
  id: string
  nome: string
}

export interface SetRegistro {
  id: string
  userId: string
  username: string
  avatar: string | null
  nome: string
  gameId: string
  patente: Patente
  orgao: Orgao | null
  apelido: string
  status: StatusPedido
  statusApelido: StatusApelido
  statusCargos?: StatusAcao
  statusExpulsao?: StatusAcao
  origem: 'painel' | 'discord'
  em: number
  decididoPor: { id: string; username: string } | null
  decididoEm: number | null
  motivo: string | null
}

export interface SetEstado {
  config: SetConfig
  admin: boolean
  podeAprovar: boolean
  botAtivo: boolean
  gateway: GatewayStatus
  limiteApelido: number
  /** Set valendo. */
  meu: SetRegistro | null
  /** Último pedido (pendente, reprovado…). */
  meuPedido: SetRegistro | null
  pendentes: SetRegistro[]
  recentes: SetRegistro[]
  canais: CanalTexto[]
  cargos: Cargo[]
  categorias: Categoria[]
}

export interface PedidoInput {
  nome: string
  gameId: string
  patenteId: string
  orgaoId: string | null
}

export type SetConfigInput = Omit<SetConfig, 'atualizadoEm' | 'atualizadoPor' | 'painel'>

/** Limite de opções de um menu de seleção do Discord. */
export const LIMITE_LISTA = 25

const ERROS: Record<string, string> = {
  nome_curto: 'O nome precisa ter pelo menos 2 letras.',
  nome_longo: 'O nome pode ter no máximo 24 caracteres.',
  nome_invalido: 'Use apenas letras, espaços, ponto, hífen ou apóstrofo no nome.',
  id_invalido: 'O ID deve ter apenas números (até 7 dígitos).',
  patente_invalida: 'Selecione uma patente válida.',
  orgao_invalido: 'Selecione o órgão.',
  apelido_longo: 'O apelido final passa de 32 caracteres, limite do Discord. Encurte o nome.',
  formato_invalido: 'O formato tem caracteres não permitidos (` @ # : \\ < > * _ ~).',
  formato_sem_nome: 'O formato precisa conter {nome}.',
  sem_patentes: 'Cadastre pelo menos uma patente.',
  muitas_patentes: `No máximo ${LIMITE_LISTA} patentes (limite do menu do Discord).`,
  muitos_orgaos: `No máximo ${LIMITE_LISTA} órgãos (limite do menu do Discord).`,
  sem_orgaos: 'Cadastre pelo menos um órgão ou desative o campo.',
  ids_repetidos: 'Há itens duplicados na lista.',
  cargo_repetido: 'Duas patentes não podem usar o mesmo cargo do Discord.',
  canal_invalido: 'Escolha um canal.',
  sem_aprovadores: 'No modo com aprovação, marque pelo menos um cargo aprovador.',
  muitos_cargos: 'Cargos demais selecionados (máx. 25 aprovadores e 10 entregues na aprovação).',
  sem_pendente: 'Você não tem pedido aguardando aprovação.',
  nao_encontrado: 'Pedido não encontrado.',
  ja_decidido: 'Este pedido já foi analisado por outra pessoa.',
  nao_aprovador: 'Só os cargos aprovadores configurados podem aprovar ou reprovar sets.',
  proprio_pedido: 'Você não pode aprovar ou reprovar o seu próprio pedido.',
  bot_desligado: 'O bot não está configurado no servidor (DISCORD_BOT_TOKEN).',
  falha_publicar: 'O Discord recusou a mensagem. Confira se o bot pode ver e enviar mensagens nesse canal.',
  proibido: 'Você não tem permissão para isso.',
  muitas_requisicoes: 'Muitas tentativas. Aguarde um minuto.',
}

export function erroSet(err: unknown): string {
  if (err instanceof ApiError) return ERROS[err.message] ?? 'Não foi possível concluir. Verifique os dados e tente novamente.'
  return 'Falha de conexão com o servidor.'
}

/** Estado do Pedir Set + ações. Atualiza ao voltar para a aba. */
export function useSet() {
  const [data, setData] = useState<SetEstado | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const busy = useRef(false)

  const reload = useCallback(async () => {
    if (busy.current) return
    try {
      setData(await api.get<SetEstado>('/set'))
      setLoadError(null)
    } catch (err) {
      setLoadError(erroSet(err))
    }
  }, [])

  useEffect(() => {
    void reload()
    const onFocus = () => void reload()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [reload])

  const run = useCallback(async (fn: () => Promise<SetEstado>) => {
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
    aplicar: (input: PedidoInput) => run(() => api.post<SetEstado>('/set', input)),
    salvarConfig: (cfg: SetConfigInput) => run(() => api.put<SetEstado>('/set/config', cfg)),
    publicarPainel: (canalId: string) => run(() => api.post<SetEstado>('/set/painel', { canalId })),
    cancelar: () => run(() => api.post<SetEstado>('/set/cancelar')),
    aprovar: (id: string) => run(() => api.post<SetEstado>(`/set/${encodeURIComponent(id)}/aprovar`, {})),
    reprovar: (id: string, motivo: string) => run(() => api.post<SetEstado>(`/set/${encodeURIComponent(id)}/reprovar`, { motivo: motivo || null })),
  }
}

export type SetApi = ReturnType<typeof useSet>
