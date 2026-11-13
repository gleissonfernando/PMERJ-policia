import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { Button, Input } from '@/components/form'

/** Lista curta de textos (setores, comunidades…): digite + Enter para adicionar, × para tirar. */
export function ChipsInput({
  id,
  label,
  itens,
  onChange,
  max = 25,
  maxLength = 60,
  placeholder,
  vazio,
}: {
  id: string
  label: string
  itens: string[]
  onChange: (itens: string[]) => void
  max?: number
  maxLength?: number
  placeholder?: string
  /** Texto quando a lista está vazia. */
  vazio: string
}) {
  const [novo, setNovo] = useState('')
  const add = () => {
    const s = novo.replace(/\s+/g, ' ').trim().slice(0, maxLength)
    if (s && !itens.includes(s) && itens.length < max) onChange([...itens, s])
    setNovo('')
  }
  return (
    <div className="grid content-start gap-1.5">
      <label htmlFor={id} className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted">
        {label} · {itens.length}/{max}
      </label>
      <div className="flex gap-2">
        <Input
          id={id}
          value={novo}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(e) => setNovo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
        />
        <Button variant="ghost" onClick={add} disabled={!novo.trim() || itens.length >= max} className="h-11 shrink-0" aria-label={`Adicionar em ${label}`}>
          <Plus className="size-4" />
        </Button>
      </div>
      {itens.length > 0 ? (
        <ul className="mt-1 flex flex-wrap gap-1.5">
          {itens.map((s) => (
            <li key={s} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 py-1 pl-3 pr-1 text-xs font-semibold text-ink">
              {s}
              <button type="button" aria-label={`Remover ${s}`} onClick={() => onChange(itens.filter((x) => x !== s))} className="grid size-5 place-items-center rounded-full text-muted hover:bg-danger/15 hover:text-danger">
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted/80">{vazio}</p>
      )}
    </div>
  )
}
