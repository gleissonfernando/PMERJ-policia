import { useState } from 'react'
import { cn } from '@/lib/cn'
import type { Cargo } from '@/lib/discord'

const corCargo = (n: number) => (n ? `#${n.toString(16).padStart(6, '0')}` : '#99aab5')

/** Lista de cargos do servidor com busca e marcação (os marcados vêm primeiro). */
export function CargoPicker({
  id,
  cargos,
  selecionados,
  onChange,
  max,
}: {
  id: string
  cargos: Cargo[]
  selecionados: string[]
  onChange: (ids: string[]) => void
  max: number
}) {
  const [busca, setBusca] = useState('')
  const termo = busca.trim().toLowerCase()
  const lista = cargos.filter((c) => !termo || c.nome.toLowerCase().includes(termo))
  const ordenada = [...lista.filter((c) => selecionados.includes(c.id)), ...lista.filter((c) => !selecionados.includes(c.id))]
  const cheio = selecionados.length >= max
  const toggle = (c: string) => onChange(selecionados.includes(c) ? selecionados.filter((x) => x !== c) : [...selecionados, c])

  if (cargos.length === 0) {
    return <p className="rounded-xl border border-line px-4 py-6 text-center text-xs text-muted">Nenhum cargo encontrado. Confira se o bot está conectado.</p>
  }
  return (
    <div className="grid gap-2">
      <input
        id={id}
        type="search"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder={`Buscar entre ${cargos.length} cargos…`}
        className="h-10 rounded-[10px] border border-line bg-surface-2 px-3 text-sm outline-none focus:border-primary/60"
      />
      <ul className="grid max-h-64 gap-1 overflow-y-auto overscroll-contain rounded-xl border border-line p-1.5 sm:grid-cols-2">
        {ordenada.map((c) => {
          const on = selecionados.includes(c.id)
          return (
            <li key={c.id}>
              <label className={cn('flex items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-sm transition', on ? 'bg-primary/10' : 'hover:bg-white/4', !on && cheio ? 'cursor-not-allowed opacity-40' : 'cursor-pointer')}>
                <input type="checkbox" checked={on} disabled={!on && cheio} onChange={() => toggle(c.id)} className="size-4 accent-primary" />
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: corCargo(c.cor) }} />
                <span className={cn('truncate', on ? 'font-semibold text-ink' : 'text-ink/85')}>{c.nome}</span>
              </label>
            </li>
          )
        })}
        {ordenada.length === 0 && <li className="col-span-full px-3 py-4 text-center text-xs text-muted">Nenhum cargo com “{busca}”.</li>}
      </ul>
    </div>
  )
}
