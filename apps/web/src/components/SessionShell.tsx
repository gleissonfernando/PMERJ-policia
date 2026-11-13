import { Loader2, LogOut } from 'lucide-react'
import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { Crest } from '@/components/Brand'
import { Alert } from '@/components/ui'
import { avatarUrl, type LoginContext, type Me } from '@/lib/api'
import { useSession } from '@/lib/useSession'

/**
 * Guarda de rota no front. É só conforto visual: quem realmente protege
 * os dados é a API, que confere a sessão em cada requisição.
 */
export function SessionShell({
  require,
  loginPath,
  title,
  children,
}: {
  require: LoginContext
  loginPath: string
  title: string
  children: (me: Me) => ReactNode
}) {
  const session = useSession()

  if (session.status === 'loading') {
    return (
      <div className="grid flex-1 place-items-center" aria-busy="true">
        <Loader2 className="size-7 animate-spin text-primary" aria-label="Carregando" />
      </div>
    )
  }
  if (session.status === 'error') {
    return (
      <div className="mx-auto grid w-full max-w-md flex-1 place-items-center px-5">
        <Alert>Não foi possível falar com o servidor. Atualize a página.</Alert>
      </div>
    )
  }
  if (session.status === 'anonymous' || session.me.context !== require) {
    return <Navigate to={loginPath} replace />
  }

  const { me } = session
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-sidebar/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
          <div className="flex items-center gap-3">
            <Crest className="size-9 rounded-[10px]" />
            <div className="leading-tight">
              <div className="display text-sm">PMERJ</div>
              <div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-primary">{title}</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <img
              src={avatarUrl(me.user, 64)}
              alt=""
              referrerPolicy="no-referrer"
              className="size-9 rounded-full border border-line-strong"
            />
            <span className="hidden text-sm font-semibold sm:block">{me.user.globalName ?? me.user.username}</span>
            <button
              type="button"
              onClick={session.logout}
              className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-line px-3 text-xs font-bold text-muted transition hover:border-primary/50 hover:text-ink"
            >
              <LogOut className="size-4" /> Sair
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10">{children(me)}</main>
    </div>
  )
}
