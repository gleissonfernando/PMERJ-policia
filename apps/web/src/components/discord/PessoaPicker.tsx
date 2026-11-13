import { Loader2, Search, UserPlus, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { avatarUrl } from '@/lib/api'
import { cn } from '@/lib/cn'

export interface PessoaOpcao {
  id: string
  nome: string | null
  username: string | null
  avatar: string | null
}

/**
 * Escolha de membros pelo nome: busca no servidor enquanto digita e mostra os escolhidos em chips.
 * `conhecidos` dá nome e foto aos já escolhidos (quem saiu do servidor aparece só pelo ID).
 */
export function PessoaPicker({
  id,
  selecionados,
  conhecidos,
  onChange,
  buscar,
  max = 25,
}: {
  id: string
  selecionados: string[]
  conhecidos: PessoaOpcao[]
  onChange: (ids: string[]) => void
  buscar: (q: string) => Promise<{ carregando: boolean; membros: PessoaOpcao[] }>
  max?: number
}) {
  const [q, setQ] = useState('')
  const [aberto, setAberto] = useState(false)
  const [resultados, setResultados] = useState<PessoaOpcao[]>([])
  const [estado, setEstado] = useState<'ok' | 'buscando' | 'carregando' | 'erro'>('ok')
  const [info, setInfo] = useState(() => new Map(conhecidos.map((p) => [p.id, p])))
  const listaId = useId()
  const caixa = useRef<HTMLDivElement>(null)
  const cheio = selecionados.length >= max

  // Busca com espera curta para não chamar a API a cada tecla.
  useEffect(() => {
    if (!aberto) return
    let vivo = true
    const t = window.setTimeout(() => {
      setEstado('buscando')
      buscar(q)
        .then((r) => {
          if (!vivo) return
          setResultados(r.membros)
          setEstado(r.carregando ? 'carregando' : 'ok')
        })
        .catch(() => vivo && setEstado('erro'))
    }, 250)
    return () => {
      vivo = false
      window.clearTimeout(t)
    }
  }, [q, aberto, buscar])

  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => caixa.current && !caixa.current.contains(e.target as Node) && setAberto(false)
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])

  const escolher = (p: PessoaOpcao) => {
    if (selecionados.includes(p.id) || cheio) return
    setInfo((m) => new Map(m).set(p.id, p))
    onChange([...selecionados, p.id])
    setQ('')
  }
  const nomeDe = (pid: string) => info.get(pid)?.nome ?? info.get(pid)?.username ?? `ID ${pid}`
  const disponiveis = resultados.filter((r) => !selecionados.includes(r.id))

  return (
    <div className="grid gap-3" ref={caixa}>
      {selecionados.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Pessoas escolhidas">
          {selecionados.map((pid) => {
            const p = info.get(pid)
            return (
              <li key={pid} className="flex items-center gap-2 rounded-full border border-line bg-surface-2/70 py-1 pl-1 pr-1.5 text-sm">
                <img src={avatarUrl({ id: pid, avatar: p?.avatar ?? null }, 32)} alt="" referrerPolicy="no-referrer" className="size-6 rounded-full" />
                <span className={cn('max-w-[12rem] truncate', !p?.nome && !p?.username && 'text-muted')}>{nomeDe(pid)}</span>
                <button
                  type="button"
                  onClick={() => onChange(selecionados.filter((x) => x !== pid))}
                  aria-label={`Remover ${nomeDe(pid)}`}
                  className="grid size-6 place-items-center rounded-full text-muted transition hover:bg-danger/15 hover:text-danger"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input
          id={id}
          role="combobox"
          aria-expanded={aberto}
          aria-controls={listaId}
          aria-autocomplete="list"
          disabled={cheio}
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setAberto(true)
          }}
          onFocus={() => setAberto(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setAberto(false)
            if (e.key === 'Enter' && disponiveis[0]) {
              e.preventDefault()
              escolher(disponiveis[0])
            }
          }}
          placeholder={cheio ? `Limite de ${max} pessoas` : 'Buscar membro pelo nome…'}
          className="h-11 w-full rounded-[11px] border border-line bg-surface-2/60 pl-10 pr-10 text-sm outline-none transition placeholder:text-muted/70 focus:border-primary/60 disabled:opacity-50"
        />
        {estado === 'buscando' && <Loader2 className="absolute right-3.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted" />}

        {aberto && !cheio && (
          <ul id={listaId} role="listbox" className="absolute inset-x-0 top-full z-20 mt-1.5 max-h-72 overflow-y-auto overscroll-contain rounded-[12px] border border-line bg-surface p-1 shadow-xl">
            {estado === 'carregando' ? (
              <li className="px-3 py-3 text-xs text-muted">A lista de membros ainda está carregando (o bot precisa estar online).</li>
            ) : estado === 'erro' ? (
              <li className="px-3 py-3 text-xs text-danger">Não foi possível buscar agora.</li>
            ) : disponiveis.length === 0 ? (
              <li className="px-3 py-3 text-xs text-muted">{estado === 'buscando' ? 'Buscando…' : 'Ninguém encontrado.'}</li>
            ) : (
              disponiveis.map((p) => (
                <li key={p.id} role="option" aria-selected={false}>
                  <button type="button" onClick={() => escolher(p)} className="flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-sm transition hover:bg-white/5">
                    <img src={avatarUrl({ id: p.id, avatar: p.avatar }, 32)} alt="" referrerPolicy="no-referrer" className="size-7 rounded-full" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{p.nome ?? p.username}</span>
                      {p.username && <span className="block truncate text-xs text-muted">@{p.username}</span>}
                    </span>
                    <UserPlus className="size-4 shrink-0 text-muted" />
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  )
}
