import { Archive, Hourglass, UsersRound, Lock, UserPlus, BookMarked, ClipboardList, Network, Radio, Volume2, Timer, FileText, DoorOpen, Gavel, GraduationCap, IdCard, LayoutDashboard, Medal, Megaphone, Palette, ShieldCheck, Siren, UserSearch, Loader2, LogOut, Menu, X, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Navigate, NavLink, Outlet, useLocation } from 'react-router'
import { Crest } from '@/components/Brand'
import { Alert, Footer } from '@/components/ui'
import { avatarUrl, type Me } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useScrollLock } from '@/lib/useScrollLock'
import { useSession } from '@/lib/useSession'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  /** Só aparece para quem administra o módulo. */
  admin?: boolean
  /** Módulo da API (o mesmo id da Equipe): define quem vê no acesso personalizado. */
  modulo?: string
  /** Só para quem gerencia a Equipe. */
  equipe?: boolean
}

const NAV: Array<{ section: string; items: NavItem[] }> = [
  { section: 'Geral', items: [{ to: '/painel', label: 'Início', icon: LayoutDashboard, end: true }] },
  {
    section: 'Efetivo',
    items: [
      { to: '/painel/set', label: 'Pedir Set', icon: IdCard, modulo: 'set' },
      { to: '/painel/ponto', label: 'Bate-ponto', icon: Timer, modulo: 'ponto' },
      { to: '/painel/horas', label: 'Sistema de Horas', icon: Hourglass, modulo: 'horas' },
      { to: '/painel/hierarquia', label: 'Hierarquia', icon: Network, modulo: 'hierarquia' },
      { to: '/painel/assuncao', label: 'Assunção de Serviço', icon: Siren, modulo: 'assuncao' },
      { to: '/painel/inteligencia', label: 'Assunção Inteligência', icon: UserSearch, modulo: 'inteligencia' },
      { to: '/painel/promocoes', label: 'Promoções', icon: Medal, modulo: 'promocao' },
      { to: '/painel/adicionar-cargo', label: 'Adicionar Cargo', icon: UserPlus, modulo: 'adicionar-cargo' },
      { to: '/painel/corregedoria', label: 'Corregedoria', icon: ShieldCheck, modulo: 'corregedoria' },
      { to: '/painel/disciplina', label: 'Disciplina', icon: Gavel, modulo: 'disciplina' },
      { to: '/painel/doesp', label: 'DOESP', icon: FileText, modulo: 'doesp' },
      { to: '/painel/boletim', label: 'Boletim Interno', icon: ClipboardList, modulo: 'boletim' },
      { to: '/painel/ocorrencia', label: 'Ocorrência', icon: Radio, modulo: 'ocorrencia' },
      { to: '/painel/comunicados', label: 'Comunicados de Operação', icon: Volume2, modulo: 'comunicado' },
      { to: '/painel/bau', label: 'Retirada de Baú', icon: Archive, modulo: 'arsenal' },
    ],
  },
  {
    section: 'Formação',
    items: [
      { to: '/painel/cursos', label: 'Cursos', icon: GraduationCap, end: true, modulo: 'curso' },
      { to: '/painel/cursos/cadastro', label: 'Cadastro de cursos', icon: BookMarked, admin: true, modulo: 'curso' },
    ],
  },
  {
    section: 'Servidor',
    items: [
      { to: '/painel/anuncio', label: 'Anúncio', icon: Megaphone, modulo: 'anuncio' },
      { to: '/painel/entrada-saida', label: 'Entrada e Saída', icon: DoorOpen, modulo: 'entrada-saida' },
    ],
  },
  {
    section: 'Sistema',
    items: [
      { to: '/painel/equipe', label: 'Equipe', icon: UsersRound, equipe: true },
      { to: '/painel/aparencia', label: 'Aparência', icon: Palette, admin: true, modulo: 'branding' },
    ],
  },
]


/** Mostra o item do menu? (cargo de admin do módulo, Equipe e acesso personalizado) */
function podeVer(me: Me, it: NavItem): boolean {
  const p = me.permissoes
  const adminDo = (m?: string) => p.total || (m !== undefined && p.modulos !== 'todos' && p.modulos.includes(m))
  if (it.equipe) return p.gerenciaEquipe
  if (it.admin) return adminDo(it.modulo)
  // Personalizado: só os módulos liberados (e o Início).
  if (p.restrito) return !it.modulo || adminDo(it.modulo)
  return true
}

/**
 * Layout do painel militar: menu lateral fixo no desktop, gaveta no celular.
 * A guarda de rota aqui é só conforto visual — a API confere a sessão em cada requisição.
 */
export function PainelLayout() {
  const session = useSession()
  // Telas com muito conteúdo lado a lado (cursos) usam a largura da tela; as demais ficam mais estreitas.
  const { pathname } = useLocation()
  const largo = pathname.startsWith('/painel/cursos')
  const [open, setOpen] = useState(false)
  useScrollLock(open) // gaveta aberta no celular: a página por trás não rola

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

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
  if (session.status === 'anonymous' || session.me.context !== 'painel') {
    return <Navigate to="/entrar" replace />
  }

  const { me } = session
  const name = me.user.globalName ?? me.user.username
  // Acesso personalizado: páginas de módulos não liberados ficam bloqueadas (o servidor também confere).
  const itemAtual = NAV.flatMap((s) => s.items)
    .filter((it) => it.to !== '/painel' && (pathname === it.to || pathname.startsWith(`${it.to}/`)))
    .sort((a, b) => b.to.length - a.to.length)[0]
  const bloqueada = Boolean(itemAtual && !podeVer(me, itemAtual))

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-[72px] items-center gap-3 border-b border-line px-5">
        <Crest className="size-10 rounded-[11px]" />
        <div className="leading-tight">
          <div className="display text-[15px]">PMERJ</div>
          <div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-primary">Painel militar</div>
        </div>
      </div>

      <nav aria-label="Menu do painel" className="flex-1 overflow-y-auto overscroll-contain px-3 py-5">
        {NAV.map(({ section, items: todos }) => ({ section, items: todos.filter((it) => podeVer(me, it)) }))
          .filter(({ items }) => items.length > 0)
          .map(({ section, items }) => (
          <div key={section} className="mb-6">
            <div className="px-3 pb-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-muted/60">
              {section}
            </div>
            <ul className="grid gap-1">
              {items.map(({ to, label, icon: Icon, end }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'group relative flex h-11 items-center gap-3 rounded-[11px] px-3 text-sm font-semibold transition',
                        isActive
                          ? 'bg-[color-mix(in_srgb,var(--color-primary)_13%,transparent)] text-ink'
                          : 'text-muted hover:bg-white/4 hover:text-ink',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span
                          aria-hidden="true"
                          className={cn(
                            'absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary transition',
                            isActive ? 'opacity-100 shadow-[0_0_12px_var(--color-primary)]' : 'opacity-0',
                          )}
                        />
                        <Icon className={cn('size-4.5', isActive ? 'text-primary' : 'text-muted group-hover:text-ink')} />
                        {label}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-line p-3">
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2/70 p-2.5">
          <img
            src={avatarUrl(me.user, 64)}
            alt=""
            referrerPolicy="no-referrer"
            className="size-9 rounded-full border border-line-strong"
          />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm font-bold">{name}</div>
            <div className="truncate text-[11px] text-muted">{me.permissoes.funcao ? `${me.permissoes.funcao} · ` : ''}@{me.user.username}</div>
          </div>
          <button
            type="button"
            onClick={session.logout}
            title="Sair"
            aria-label="Sair"
            className="grid size-9 place-items-center rounded-[10px] text-muted transition hover:bg-danger/10 hover:text-danger"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex flex-1">
      {/* Desktop */}
      <aside className="sticky top-0 hidden h-dvh w-[264px] shrink-0 border-r border-line bg-sidebar/90 backdrop-blur-md lg:block">
        {sidebar}
      </aside>

      {/* Celular: gaveta */}
      <div
        className={cn('fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition lg:hidden', open ? 'opacity-100' : 'pointer-events-none opacity-0')}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-[280px] border-r border-line bg-sidebar transition-transform duration-300 lg:hidden',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-hidden={!open}
        inert={!open}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Fechar menu"
          className="absolute right-3 top-5 grid size-9 place-items-center rounded-[10px] text-muted hover:text-ink"
        >
          <X className="size-5" />
        </button>
        {sidebar}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-sidebar/85 px-4 backdrop-blur-md lg:hidden">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Abrir menu"
            aria-expanded={open}
            className="grid size-10 place-items-center rounded-[10px] border border-line text-ink"
          >
            <Menu className="size-5" />
          </button>
          <Crest className="size-8 rounded-[9px]" />
          <span className="display text-sm">PMERJ</span>
        </header>

        <main className={cn('mx-auto w-full flex-1 px-5 py-8 sm:px-8 lg:py-10', largo ? 'max-w-[1680px]' : 'max-w-[1180px]')}>
          {bloqueada ? (
            <div className="mx-auto grid max-w-md place-items-center gap-3 py-24 text-center">
              <span className="grid size-14 place-items-center rounded-full border border-line bg-surface-2 text-muted">
                <Lock className="size-6" />
              </span>
              <h1 className="display text-xl">Sem acesso a esta área</h1>
              <p className="text-sm text-muted">Seu acesso na Equipe libera só alguns módulos. Use o menu ao lado ou peça a um administrador.</p>
            </div>
          ) : (
            <Outlet context={me} />
          )}
        </main>
        <Footer />
      </div>
    </div>
  )
}
