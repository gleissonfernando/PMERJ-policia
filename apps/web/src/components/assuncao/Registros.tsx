import { ExternalLink, Siren } from 'lucide-react'
import { useState } from 'react'
import { EmptyState } from '@/components/EmptyState'
import { Card } from '@/components/form'
import { avatarUrl } from '@/lib/api'
import type { AssuncaoEstado, PolicialRegistro } from '@/lib/assuncao'
import { cn } from '@/lib/cn'

const quando = (ms: number) => {
  const d = new Date(ms)
  const hoje = new Date()
  const mesmoDia = d.toDateString() === hoje.toDateString()
  return mesmoDia
    ? `Hoje, ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
    : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function Policial({ n, p, papel }: { n: number; p: PolicialRegistro; papel?: string }) {
  return (
    <li className="flex min-w-0 items-center gap-2 rounded-[10px] border border-line bg-surface-2/50 px-2.5 py-1.5">
      <span className="font-display text-xs font-bold text-primary-2 tabular-nums">{String(n).padStart(2, '0')}</span>
      <span className="min-w-0 truncate text-[13px] font-semibold text-ink">{p.nome}</span>
      {papel && <span className="ml-auto shrink-0 text-[10px] font-extrabold uppercase tracking-widest text-muted">{papel}</span>}
    </li>
  )
}

export function Registros({ data, link }: { data: AssuncaoEstado; link: (canalId: string, mensagemId: string) => string }) {
  const [filtro, setFiltro] = useState<string | null>(null)
  const nomes = new Map(data.assuncoes.map((a) => [a.id, a]))
  const lista = filtro ? data.recentes.filter((r) => r.assuncaoId === filtro) : data.recentes
  const usadas = [...new Set(data.recentes.map((r) => r.assuncaoId))]

  if (data.recentes.length === 0) {
    return (
      <Card>
        <EmptyState icon={Siren}>Nenhuma assunção de serviço registrada ainda. Os registros feitos pelo painel no Discord aparecem aqui.</EmptyState>
      </Card>
    )
  }

  return (
    <div className="grid gap-4">
      {usadas.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por assunção">
          {[null, ...usadas].map((id) => {
            const a = id ? nomes.get(id) : null
            const rotulo = id ? `${a?.emoji ?? ''} ${a?.nome ?? data.recentes.find((r) => r.assuncaoId === id)?.assuncaoNome ?? id}`.trim() : 'Todas'
            return (
              <button
                key={id ?? 'todas'}
                type="button"
                aria-pressed={filtro === id}
                onClick={() => setFiltro(id)}
                className={cn(
                  'h-8 rounded-full border px-3.5 text-xs font-bold transition',
                  filtro === id ? 'border-primary/50 bg-primary/12 text-ink' : 'border-line text-muted hover:border-line-strong hover:text-ink',
                )}
              >
                {rotulo}
              </button>
            )
          })}
        </div>
      )}

      <ul className="grid gap-3">
        {lista.map((r) => {
          const a = nomes.get(r.assuncaoId)
          return (
            <li key={r.id}>
              <Card className="p-0">
                <div className="flex flex-wrap items-start gap-4 p-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-base font-extrabold text-ink">
                        {a?.emoji ?? '🚓'} {a?.nome ?? r.assuncaoNome}
                      </span>
                      <span className="text-xs text-muted">{quando(r.em)}</span>
                    </div>
                    <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                      <div className="flex gap-1.5">
                        <dt className="text-muted">Setor</dt>
                        <dd className="font-semibold text-ink">{r.setor}</dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt className="text-muted">Viatura</dt>
                        <dd className="font-display font-semibold tracking-wide text-primary-2">{r.viatura}</dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt className="text-muted">Efetivo</dt>
                        <dd className="font-semibold text-ink tabular-nums">{2 + r.demais.length}</dd>
                      </div>
                    </dl>
                  </div>
                  <a
                    href={link(r.canalId, r.mensagemId)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[10px] border border-line px-3 text-xs font-bold text-muted transition hover:border-line-strong hover:text-ink"
                  >
                    <ExternalLink className="size-3.5" /> Ver no Discord
                  </a>
                </div>
                <ul className="grid gap-2 border-t border-line px-5 py-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Policial n={1} p={r.comandante} papel="Cmt" />
                  <Policial n={2} p={r.motopol} papel="Motopol" />
                  {r.demais.map((p, i) => (
                    <Policial key={p.id} n={i + 3} p={p} />
                  ))}
                </ul>
                <div className="flex items-center gap-2 border-t border-line px-5 py-2.5 text-xs text-muted">
                  <img src={avatarUrl(r.autor, 32)} alt="" className="size-5 rounded-full" />
                  Registrado por <span className="font-semibold text-ink">{r.autor.username}</span>
                </div>
              </Card>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
