import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button, Card, CardHeader } from '@/components/form'
import { cn } from '@/lib/cn'

/* ---------- Editor de lista genérico (patentes, órgãos…) ---------- */

export interface Column<T> {
  key: keyof T & string
  label: string
  max: number
  width?: string
  mono?: boolean
}

export function ListEditor<T extends { id: string }>({
  icon,
  title,
  hint,
  items,
  onChange,
  create,
  columns,
  min = 0,
  max = 40,
  ordered,
}: {
  icon: ReactNode
  title: string
  hint: string
  items: T[]
  onChange: (items: T[]) => void
  create: () => T
  columns: Column<T>[]
  min?: number
  max?: number
  ordered?: boolean
}) {
  const update = (i: number, key: keyof T, value: string) => onChange(items.map((it, j) => (j === i ? { ...it, [key]: value } : it)))
  const move = (i: number, dir: -1 | 1) => {
    const next = [...items]
    const [it] = next.splice(i, 1)
    if (it) next.splice(i + dir, 0, it)
    onChange(next)
  }

  return (
    <Card>
      <CardHeader
        icon={icon}
        title={`${title} · ${items.length}/${max}`}
        hint={hint}
        action={
          <Button size="sm" variant="ghost" onClick={() => onChange([...items, create()])} disabled={items.length >= max}>
            <Plus className="size-3.5" /> Adicionar
          </Button>
        }
      />
      {items.length === 0 ? (
        <p className="px-6 py-8 text-center text-sm text-muted">Nenhum item. Clique em Adicionar.</p>
      ) : (
        <ol className="divide-y divide-line">
          {items.map((it, i) => (
            <li key={it.id} className="flex items-center gap-2 px-4 py-2.5 sm:px-6">
              {ordered && <span className="w-6 shrink-0 text-center font-display text-sm text-muted tabular-nums">{i + 1}</span>}
              {columns.map((col) => (
                <input
                  key={col.key}
                  aria-label={`${col.label} ${i + 1}`}
                  placeholder={col.label}
                  value={String(it[col.key] ?? '')}
                  maxLength={col.max}
                  onChange={(e) => update(i, col.key, e.target.value)}
                  aria-invalid={String(it[col.key] ?? '').trim() === ''}
                  className={cn(
                    'h-10 min-w-0 rounded-[10px] border border-transparent bg-transparent px-3 text-sm outline-none transition',
                    'hover:border-line focus:border-primary/60 focus:bg-surface-2 aria-[invalid=true]:border-danger/50',
                    col.width ?? 'flex-1',
                    col.mono && 'shrink-0 font-display font-semibold tracking-wide text-primary-2',
                  )}
                />
              ))}
              <div className="flex shrink-0 items-center">
                {ordered && (
                  <>
                    <IconBtn label="Subir" onClick={() => move(i, -1)} disabled={i === 0}>
                      <ArrowUp className="size-4" />
                    </IconBtn>
                    <IconBtn label="Descer" onClick={() => move(i, 1)} disabled={i === items.length - 1}>
                      <ArrowDown className="size-4" />
                    </IconBtn>
                  </>
                )}
                <IconBtn label="Remover" danger onClick={() => onChange(items.filter((_, j) => j !== i))} disabled={items.length <= min}>
                  <Trash2 className="size-4" />
                </IconBtn>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}

function IconBtn({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'grid size-9 place-items-center rounded-[9px] text-muted transition disabled:pointer-events-none disabled:opacity-25',
        danger ? 'hover:bg-danger/10 hover:text-danger' : 'hover:bg-white/5 hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}
