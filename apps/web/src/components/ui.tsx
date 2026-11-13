import { AlertTriangle } from 'lucide-react'
import type { ReactNode } from 'react'
import { useLogoUrl } from '@/lib/branding'
import { cn } from '@/lib/cn'

export function IconTile({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'grid size-[52px] shrink-0 place-items-center rounded-[13px] border border-primary/30 text-primary',
        'bg-[color-mix(in_srgb,var(--color-primary)_9%,var(--color-surface))]',
        className,
      )}
    >
      {children}
    </span>
  )
}

export function Alert({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-[#ffd5d2]"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />
      <span>{children}</span>
    </div>
  )
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1',
        'text-[10px] font-extrabold uppercase tracking-[0.12em] text-primary-2',
        className,
      )}
    >
      {children}
    </span>
  )
}

const YEAR = new Date().getFullYear()

export function Footer() {
  const logo = useLogoUrl()
  return (
    <footer className="relative z-10 px-6 pb-6 pt-12">
      <div className="mx-auto flex max-w-[1180px] flex-col items-center gap-3 text-center">
        <img src={logo} alt="" aria-hidden="true" draggable={false} className="h-11 w-auto object-contain opacity-90 drop-shadow-[0_6px_14px_rgba(0,0,0,.5)]" />
        <div className="display text-[11px] tracking-[0.14em] text-ink/80">Polícia Militar do Estado do Rio de Janeiro</div>
        <div className="text-[11px] text-muted/70">© {YEAR} PMERJ · Ambiente restrito e monitorado</div>
      </div>
    </footer>
  )
}
