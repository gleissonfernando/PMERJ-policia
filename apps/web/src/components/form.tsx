import { ChevronDown, Loader2 } from 'lucide-react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { useId } from 'react'
import { cn } from '@/lib/cn'

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-[18px] border border-line bg-surface/90 shadow-[0_18px_50px_rgba(0,0,0,.35)]', className)}>
      {children}
    </section>
  )
}

export function CardHeader({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode
  title: string
  hint?: ReactNode
  action?: ReactNode
}) {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
      <div className="flex items-start gap-3">
        {icon && (
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-[10px] border border-primary/25 bg-primary/10 text-primary">
            {icon}
          </span>
        )}
        <div>
          <h2 className="display text-base">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
        </div>
      </div>
      {action}
    </header>
  )
}

type Variant = 'primary' | 'ghost' | 'danger' | 'success'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-primary text-on-primary shadow-[0_10px_28px_color-mix(in_srgb,var(--color-primary)_35%,transparent)] hover:bg-primary-2',
  success:
    'bg-success text-[#03140a] shadow-[0_10px_28px_color-mix(in_srgb,var(--color-success)_30%,transparent)] hover:brightness-110',
  danger: 'border border-danger/45 bg-danger/10 text-[#ffd5d2] hover:bg-danger/20',
  ghost: 'border border-line text-muted hover:border-line-strong hover:text-ink',
}

export function Button({
  variant = 'primary',
  loading,
  size = 'md',
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-[11px] font-bold transition duration-150',
        'disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' && 'h-8 px-3 text-xs',
        size === 'md' && 'h-10 px-4 text-sm',
        size === 'lg' && 'h-12 px-5 text-sm',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  )
}

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string
  hint?: ReactNode
  error?: string | null
  children: ReactNode
  htmlFor: string
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={htmlFor} className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : (
        hint && <p className="text-xs text-muted/80">{hint}</p>
      )}
    </div>
  )
}

const control =
  'h-11 w-full rounded-[11px] border border-line bg-surface-2 px-3.5 text-sm text-ink placeholder:text-muted/50 ' +
  'outline-none transition focus:border-primary/60 focus:ring-4 focus:ring-primary/10 disabled:opacity-60 ' +
  'aria-[invalid=true]:border-danger/60'

export function Input({ className, leading, ...rest }: InputHTMLAttributes<HTMLInputElement> & { leading?: ReactNode }) {
  if (!leading) return <input className={cn(control, className)} {...rest} />
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3.5 grid place-items-center font-display text-sm font-semibold text-primary">
        {leading}
      </span>
      <input className={cn(control, 'pl-8', className)} {...rest} />
    </div>
  )
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn(control, 'cursor-pointer appearance-none pr-10', className)} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
    </div>
  )
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  locked,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: ReactNode
  disabled?: boolean
  /** Sempre ligado, sem poder mudar (ex.: Patente). */
  locked?: ReactNode
}) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-6 py-4">
      <div className="min-w-0">
        <div id={`${id}-l`} className="text-sm font-bold text-ink">
          {label}
        </div>
        {description && <div className="mt-0.5 text-xs text-muted">{description}</div>}
      </div>
      {locked ?? (
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-labelledby={`${id}-l`}
          disabled={disabled}
          onClick={() => onChange(!checked)}
          className={cn(
            'relative h-6 w-11 shrink-0 rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50',
            checked ? 'border-primary bg-primary' : 'border-line-strong bg-surface-2',
          )}
        >
          <span
            className={cn(
              'absolute top-1/2 size-4.5 -translate-y-1/2 rounded-full shadow transition-all',
              checked ? 'left-[21px] bg-white' : 'left-[3px] bg-muted',
            )}
          />
        </button>
      )}
    </div>
  )
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'min-h-28 w-full resize-y rounded-[11px] border border-line bg-surface-2 px-3.5 py-3 text-sm leading-relaxed text-ink',
        'placeholder:text-muted/50 outline-none transition focus:border-primary/60 focus:ring-4 focus:ring-primary/10',
        className,
      )}
      {...rest}
    />
  )
}

/** Selo de status (cores vêm de quem chama). */
export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-widest',
        className,
      )}
    >
      {children}
    </span>
  )
}
