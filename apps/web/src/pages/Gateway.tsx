import { ArrowRight, BadgeCheck, ChevronDown, Clock, IdCard, UserPlus, Users } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { Wordmark } from '@/components/Brand'
import { DiscordLoginButton } from '@/components/Discord'
import { Alert, Badge, IconTile } from '@/components/ui'
import { loginErrorMessage } from '@/lib/loginErrors'

const card =
  'group relative block overflow-hidden rounded-[18px] border border-line bg-surface/90 p-7 backdrop-blur-sm transition duration-200 hover:border-primary/55'

export function Gateway() {
  const [params] = useSearchParams()
  const error = loginErrorMessage(params.get('erro'))

  return (
    <main className="mx-auto flex w-full max-w-[920px] flex-1 flex-col justify-center px-5 py-10 sm:px-8 sm:py-14">
      <div className="animate-rise flex justify-center pb-8">
        <Wordmark />
      </div>

      <header className="animate-rise pb-8 text-center [animation-delay:80ms]">
        <span className="kicker">Rio de Janeiro · Bem-vindo à PMERJ</span>
        <h1 className="display mt-3 text-[clamp(34px,4.4vw,54px)] leading-none">Selecione seu acesso</h1>
        <p className="mx-auto mt-3 max-w-[60ch] text-muted">
          Escolha abaixo o tipo de atendimento para acessar os serviços da corporação.
        </p>
      </header>

      {error && (
        <div className="mb-5">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        {/* ---------- Civil ---------- */}
        <details className={`${card} animate-rise [animation-delay:160ms] open:border-primary/40`}>
          <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <IconTile className="mb-6">
              <Users className="size-6" />
            </IconTile>
            <h2 className="display text-[23px]">Sou civil</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Quero participar do recrutamento ou acessar os serviços ao cidadão.
            </p>
            <span className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-ink">
              Escolher serviço
              <ChevronDown className="size-4 text-primary transition group-open:rotate-180" />
            </span>
          </summary>

          <div className="mt-5 grid gap-3 border-t border-line pt-5">
            <button
              type="button"
              disabled
              aria-disabled="true"
              className="flex min-h-12 cursor-not-allowed items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-4 text-sm font-bold text-ink/60"
            >
              <span className="inline-flex items-center gap-2.5">
                <UserPlus className="size-4 text-primary/70" />
                Fazer recrutamento
              </span>
              <Badge>
                <Clock className="size-3" /> Em breve
              </Badge>
            </button>

            <DiscordLoginButton context="civil" hint="Identifique-se com sua conta do Discord" />
          </div>
        </details>

        {/* ---------- Militar ---------- */}
        <Link to="/entrar" className={`${card} animate-rise [animation-delay:240ms]`}>
          <span className="hazard absolute inset-x-0 top-0 h-1 opacity-0 transition group-hover:opacity-60" />
          <IconTile className="mb-6">
            <IdCard className="size-6" />
          </IconTile>
          <h2 className="display text-[23px]">Sou da PMERJ</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Já faço parte da corporação e quero acessar meu painel militar.
          </p>
          <span className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-ink">
            Entrar no painel
            <ArrowRight className="size-4 text-primary transition group-hover:translate-x-1" />
          </span>
        </Link>
      </div>

      <p className="mt-8 flex items-center justify-center gap-2 text-center text-xs text-muted">
        <BadgeCheck className="size-4 text-success" />
        Login exclusivo pelo Discord. A PMERJ nunca pede sua senha.
      </p>
    </main>
  )
}
