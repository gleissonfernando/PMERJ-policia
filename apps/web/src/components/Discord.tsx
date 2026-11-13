import { ArrowRight } from 'lucide-react'
import { discordLoginUrl, type LoginContext } from '@/lib/api'
import { cn } from '@/lib/cn'

export function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.1.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03ZM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418Z" />
    </svg>
  )
}

/** Botão grande de login: ícone · título/subtítulo · seta. */
export function DiscordLoginButton({
  context,
  title = 'Entrar com Discord',
  hint = 'Autenticação oficial OAuth2 do Discord',
  className,
}: {
  context: LoginContext
  title?: string
  hint?: string
  className?: string
}) {
  return (
    <a
      href={discordLoginUrl(context)}
      className={cn(
        'group grid min-h-16 grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border px-3.5 py-2.5',
        'border-discord/50 bg-[color-mix(in_srgb,var(--color-discord)_10%,var(--color-surface))]',
        'transition duration-200 hover:-translate-y-px hover:border-[#7681ff] hover:bg-[color-mix(in_srgb,var(--color-discord)_17%,var(--color-surface))]',
        className,
      )}
    >
      <span className="grid size-11 place-items-center rounded-[11px] bg-discord text-white shadow-[0_8px_22px_color-mix(in_srgb,var(--color-discord)_40%,transparent)]">
        <DiscordIcon className="size-[22px]" />
      </span>
      <span className="min-w-0 text-left">
        <span className="block text-sm font-bold text-ink">{title}</span>
        <span className="block truncate text-xs text-muted">{hint}</span>
      </span>
      <ArrowRight className="size-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-ink" />
    </a>
  )
}
