import type { LucideIcon } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { cn } from '@/lib/cn'

export interface Aba<T extends string> {
  id: T
  label: string
  icon: LucideIcon
  count?: number
}

/** Aba atual guardada na URL (?aba=...), para dar F5 ou compartilhar sem perder a posição. */
export function useAba<T extends string>(abas: Aba<T>[]): [T, (id: T) => void] {
  const [params, setParams] = useSearchParams()
  const pedida = params.get('aba')
  const atual = abas.find((a) => a.id === pedida)?.id ?? abas[0]!.id
  const ir = (id: T) => setParams(id === abas[0]!.id ? {} : { aba: id }, { replace: true })
  return [atual, ir]
}

export function Tabs<T extends string>({ abas, atual, onChange }: { abas: Aba<T>[]; atual: T; onChange: (id: T) => void }) {
  return (
    <div role="tablist" aria-label="Seções" className="mt-8 flex gap-1 overflow-x-auto border-b border-line">
      {abas.map(({ id, label, icon: Icon, count }) => (
        <button
          key={id}
          role="tab"
          type="button"
          aria-selected={atual === id}
          onClick={() => onChange(id)}
          className={cn(
            'relative -mb-px inline-flex h-12 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-bold transition',
            atual === id ? 'border-primary text-ink' : 'border-transparent text-muted hover:text-ink',
          )}
        >
          <Icon className={cn('size-4', atual === id && 'text-primary')} />
          {label}
          {count !== undefined && (
            <span className={cn('grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[10px] font-black tabular-nums', count > 0 ? 'bg-primary/15 text-primary-2' : 'bg-surface-2 text-muted')}>
              {count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
