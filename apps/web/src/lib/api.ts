/**
 * Cliente da API. Mesma origem: o cookie de sessão (httpOnly) vai sozinho,
 * o front nunca toca em token nenhum.
 */
export class ApiError extends Error {
  readonly status: number
  constructor(status: number, code: string) {
    super(code)
    this.status = status
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: { Accept: 'application/json', ...init.headers },
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new ApiError(res.status, body.error ?? 'erro')
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }),
  /** Envia um arquivo cru (o corpo é o próprio arquivo). */
  upload: <T>(path: string, file: Blob) =>
    request<T>(path, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

export type LoginContext = 'painel' | 'civil'

/** Inicia o OAuth2 no servidor (navegação completa, não fetch). */
export function discordLoginUrl(context: LoginContext): string {
  return `/api/auth/discord?context=${context}`
}

export interface SessionUser {
  id: string
  username: string
  globalName: string | null
  avatar: string | null
}

export interface Me {
  user: SessionUser
  context: LoginContext
  guildMember: boolean
  expiresAt: number
  /** Pode mexer nas configurações do painel. */
  admin: boolean
  /** Equipe do painel: o que a pessoa administra e vê. */
  permissoes: {
    total: boolean
    modulos: 'todos' | string[]
    gerenciaEquipe: boolean
    /** Acesso personalizado: o menu mostra só os módulos liberados. */
    restrito: boolean
    funcao: string | null
  }
}

export function avatarUrl(user: Pick<SessionUser, 'id' | 'avatar'>, size = 128): string {
  if (!user.avatar) {
    const index = Number(BigInt(user.id) >> 22n) % 6
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`
  }
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=${size}`
}

/** Administra este módulo? (acesso total ou personalizado com o módulo liberado na Equipe) */
export const adminDe = (me: Me, modulo: string) => me.permissoes.total || (me.permissoes.modulos !== 'todos' && me.permissoes.modulos.includes(modulo))
