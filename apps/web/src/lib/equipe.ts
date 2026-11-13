import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from './api'
import type { Cargo } from './discord'

export type Acesso = 'admin' | 'total' | 'personalizado'

export interface MembroEquipe {
  userId: string
  nome: string
  username: string
  avatar: string | null
  funcao: string
  acesso: Acesso
  modulos: string[]
  cargoDiscordId: string | null
  cargoEntregue: boolean | null
  adicionadoPor: { id: string; nome: string }
  em: number
  atualizadoPor: { id: string; nome: string }
  atualizadoEm: number
}

export interface Modulo {
  id: string
  nome: string
  grupo: string
}

export interface EquipeEstado {
  eu: string
  souDono: boolean
  modulos: Modulo[]
  membros: MembroEquipe[]
  historico: Array<{ em: number; por: { id: string; nome: string }; alvo: { id: string; nome: string }; acao: 'adicionou' | 'alterou' | 'removeu'; resumo: string }>
  donos: number
  botAtivo: boolean
  cargos: Cargo[]
  cargoFalhou?: boolean
}

export interface MembroInput {
  userId: string
  funcao: string
  acesso: Acesso
  modulos: string[]
  cargoDiscordId: string | null
}

export interface PessoaBusca {
  id: string
  nome: string
  username: string
  avatar: string | null
}

const ERROS: Record<string, string> = {
  id_invalido: 'ID do Discord inválido (são 17 a 20 números).',
  funcao_vazia: 'Informe a função da pessoa na equipe.',
  funcao_longa: 'A função pode ter no máximo 40 caracteres.',
  mencao_proibida: 'Não use menções na função.',
  proprio_acesso: 'Você não pode alterar o seu próprio acesso.',
  sem_modulos: 'No acesso personalizado, marque pelo menos um módulo.',
  membro_nao_encontrado: 'Essa pessoa não está no servidor do Discord.',
  alvo_bot: 'Bots não podem entrar na equipe.',
  cargo_invalido: 'Esse cargo do Discord não pode ser usado (cargo de bot/integração ou inexistente).',
  cargo_administrador: 'Só o dono do sistema pode dar um cargo do Discord com permissão de administrador.',
  nao_encontrado: 'Essa pessoa não está mais na equipe.',
  proibido: 'Só administradores da equipe podem fazer isso.',
  muitas_requisicoes: 'Muitas tentativas. Aguarde um minuto.',
}

export function erroEquipe(err: unknown): string {
  if (err instanceof ApiError) return ERROS[err.message] ?? 'Não foi possível concluir. Tente novamente.'
  return 'Falha de conexão com o servidor.'
}

export const buscarPessoas = (q: string) => api.get<{ carregando: boolean; membros: PessoaBusca[] }>(`/equipe/buscar?q=${encodeURIComponent(q)}`)

export function useEquipe() {
  const [data, setData] = useState<EquipeEstado | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setData(await api.get<EquipeEstado>('/equipe'))
      setLoadError(null)
    } catch (err) {
      setLoadError(erroEquipe(err))
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return {
    data,
    loadError,
    salvar: async (m: MembroInput) => {
      const r = await api.put<EquipeEstado>('/equipe/membros', m)
      setData(r)
      return r
    },
    remover: async (userId: string) => setData(await api.del<EquipeEstado>(`/equipe/membros/${encodeURIComponent(userId)}`)),
  }
}

export type EquipeApi = ReturnType<typeof useEquipe>

export const ACESSOS: Record<Acesso, { titulo: string; texto: string; cls: string }> = {
  admin: { titulo: 'Administrador', texto: 'Vê e faz tudo, inclusive gerenciar a equipe.', cls: 'border-primary/45 bg-primary/12 text-primary-2' },
  total: { titulo: 'Acesso total', texto: 'Vê e configura todos os módulos da dashboard.', cls: 'border-[#f1c40f]/40 bg-[#f1c40f]/10 text-[#f1c40f]' },
  personalizado: { titulo: 'Personalizado', texto: 'Vê e configura só os módulos que você marcar.', cls: 'border-sky-400/35 bg-sky-400/10 text-sky-300' },
}
