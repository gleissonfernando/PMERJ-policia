import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from './api'
import type { CanalTexto, Cargo, GatewayStatus } from './discord'

export type CampoId = 'setor' | 'viatura' | 'comandante' | 'motopol' | 'demais'

export interface RotuloCampo {
  label: string
  descricao: string
}

export interface Assuncao {
  id: string
  nome: string
  emoji: string
  descricao: string
  cor: number
  ativa: boolean
  cargosPermitidos: string[]
  cargosComandante: string[]
  canalResultadoId: string | null
  setores: string[]
  maxDemais: number
  mencionar: boolean
  campos: Record<CampoId, RotuloCampo>
  painel: { canalId: string; mensagemId: string } | null
}

export interface PolicialRegistro {
  id: string
  nome: string
}

export interface AssuncaoRegistro {
  id: string
  assuncaoId: string
  assuncaoNome: string
  autor: { id: string; username: string; avatar: string | null }
  setor: string
  viatura: string
  comandante: PolicialRegistro
  motopol: PolicialRegistro
  demais: PolicialRegistro[]
  canalId: string
  mensagemId: string
  em: number
}

export interface AssuncaoEstado {
  assuncoes: Assuncao[]
  atualizadoEm: number
  atualizadoPor: string | null
  admin: boolean
  minhas: string[]
  guildId: string | null
  botAtivo: boolean
  gateway: GatewayStatus
  limites: { assuncoes: number; demais: number }
  hoje: number
  semana: number
  recentes: AssuncaoRegistro[]
  canais: CanalTexto[]
  cargos: Cargo[]
}

export type AssuncaoInput = Omit<Assuncao, 'painel'>

export const CAMPOS: Array<{ id: CampoId; tipo: string }> = [
  { id: 'setor', tipo: 'Texto ou lista' },
  { id: 'viatura', tipo: 'Texto' },
  { id: 'comandante', tipo: 'Policial (1)' },
  { id: 'motopol', tipo: 'Policial (1)' },
  { id: 'demais', tipo: 'Policiais (0 a N)' },
]

const CAMPOS_PADRAO: Record<CampoId, RotuloCampo> = {
  setor: { label: 'SETOR', descricao: 'Setor de patrulhamento da guarnição.' },
  viatura: { label: 'VIATURA / PREFIXO', descricao: 'Prefixo da viatura. Ex.: 54-1234.' },
  comandante: { label: 'COMANDANTE (Sargento ou Oficial)', descricao: 'Quem comanda a guarnição.' },
  motopol: { label: 'MOTOPOL (motorista da viatura)', descricao: 'Policial que dirige a viatura.' },
  demais: { label: 'DEMAIS INTEGRANTES (03, 04, 05...)', descricao: 'Os outros policiais da viatura. Deixe vazio se a guarnição for só de 2.' },
}

export function novaAssuncao(nome: string): AssuncaoInput {
  return {
    id: `a${crypto.randomUUID().replace(/-/g, '').slice(0, 9)}`,
    nome,
    emoji: '🚓',
    descricao: 'Ao assumir o serviço, registre a guarnição: setor, viatura, comandante, motopol e demais integrantes.',
    cor: 0xe10600,
    ativa: true,
    cargosPermitidos: [],
    cargosComandante: [],
    canalResultadoId: null,
    setores: [],
    maxDemais: 4,
    mencionar: false,
    campos: structuredClone(CAMPOS_PADRAO),
  }
}

/** "COMANDANTE (Sargento ou Oficial)" → "Comandante" (como sai no resultado). */
export function rotuloCurto(s: string): string {
  const t = s.replace(/\s*\(.*\)\s*$/, '').trim().toLowerCase()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/* ---------- Erros ---------- */

const ERROS: Record<string, string> = {
  muitos_cargos: 'No máximo 25 cargos por lista.',
  nenhuma_assuncao: 'Mantenha pelo menos uma assunção de serviço.',
  muitas_assuncoes: 'Limite de assunções atingido.',
  id_repetido: 'Duas assunções com o mesmo identificador. Recarregue a página.',
  id_invalido: 'Identificador inválido. Recarregue a página.',
  nome_vazio: 'Dê um nome a cada assunção.',
  nome_longo: 'O nome pode ter no máximo 40 caracteres.',
  emoji_invalido: 'Use um único emoji (ex.: 🚓) ou deixe vazio.',
  descricao_vazia: 'A descrição do painel não pode ficar vazia.',
  descricao_longa: 'A descrição do painel pode ter no máximo 600 caracteres.',
  campo_vazio: 'Todo campo do formulário precisa de um título.',
  campo_longo: 'O título de um campo pode ter no máximo 45 caracteres (limite do Discord).',
  descricao_campo_longa: 'A ajuda de um campo pode ter no máximo 100 caracteres (limite do Discord).',
  setor_vazio: 'Há um setor sem nome na lista.',
  setor_longo: 'Cada setor pode ter no máximo 60 caracteres.',
  muitos_setores: 'No máximo 25 setores (limite do menu do Discord).',
  mencao_proibida: 'Não use @everyone, @here ou menções nos textos.',
  canal_invalido: 'Escolha um canal.',
  salve_antes: 'Salve as alterações antes de publicar o painel desta assunção.',
  bot_desligado: 'O bot não está configurado no servidor (DISCORD_BOT_TOKEN).',
  falha_publicar: 'O Discord recusou a mensagem. Confira se o bot pode ver, enviar mensagens e anexar arquivos nesse canal.',
  proibido: 'Você não tem permissão para isso.',
  muitas_requisicoes: 'Muitas tentativas. Aguarde um minuto.',
}

export function erroAssuncao(err: unknown): string {
  if (err instanceof ApiError) return ERROS[err.message] ?? 'Não foi possível concluir. Verifique os dados e tente novamente.'
  return 'Falha de conexão com o servidor.'
}

/** Estado da Assunção de Serviço. Atualiza a cada 30s (registros feitos no Discord) e ao voltar para a aba. */
export function useAssuncao() {
  const [data, setData] = useState<AssuncaoEstado | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const busy = useRef(false)

  const reload = useCallback(async () => {
    if (busy.current) return
    try {
      setData(await api.get<AssuncaoEstado>('/assuncao'))
      setLoadError(null)
    } catch (err) {
      setLoadError(erroAssuncao(err))
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

  const run = useCallback(async (fn: () => Promise<AssuncaoEstado>) => {
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
    salvar: (assuncoes: AssuncaoInput[]) => run(() => api.put<AssuncaoEstado>('/assuncao/config', { assuncoes })),
    publicarPainel: (assuncaoId: string, canalId: string) => run(() => api.post<AssuncaoEstado>('/assuncao/painel', { assuncaoId, canalId })),
  }
}

export type AssuncaoApi = ReturnType<typeof useAssuncao>
