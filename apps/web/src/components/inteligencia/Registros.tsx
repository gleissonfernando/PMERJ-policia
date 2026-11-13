import { ExternalLink, ImageIcon, Link2, UserSearch } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { Card } from '@/components/form'
import { avatarUrl } from '@/lib/api'
import type { InteligenciaEstado } from '@/lib/inteligencia'

const quando = (ms: number) => {
  const d = new Date(ms)
  return d.toDateString() === new Date().toDateString()
    ? `Hoje, ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
    : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function Registros({ data, link }: { data: InteligenciaEstado; link: (canalId: string, mensagemId: string) => string }) {
  if (data.recentes.length === 0) {
    return (
      <Card>
        <EmptyState icon={UserSearch}>Nenhum registro ainda. As assunções feitas pelo painel no Discord aparecem aqui.</EmptyState>
      </Card>
    )
  }
  return (
    <ul className="grid gap-3">
      {data.recentes.map((r) => (
        <li key={r.id}>
          <Card>
            <div className="flex flex-wrap items-start gap-4 p-5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-base font-extrabold text-ink">{r.objeto}</span>
                  <span className="text-xs text-muted">{quando(r.em)}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
                  <span>
                    <span className="font-semibold text-ink tabular-nums">{r.policiais.length}</span> {r.policiais.length === 1 ? 'policial' : 'policiais'}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <ImageIcon className="size-3.5" /> {r.fotosEnviadas} {r.fotosEnviadas === 1 ? 'foto enviada' : 'fotos enviadas'}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Link2 className="size-3.5" /> {r.links.length} {r.links.length === 1 ? 'link' : 'links'}
                  </span>
                </div>
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
              {r.policiais.map((p, i) => (
                <li key={p.id} className="flex min-w-0 items-center gap-2 rounded-[10px] border border-line bg-surface-2/50 px-2.5 py-1.5">
                  <span className="font-display text-xs font-bold text-primary-2 tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                  <span className="min-w-0 truncate text-[13px] font-semibold text-ink">{p.nome}</span>
                </li>
              ))}
            </ul>
            {r.links.length > 0 && (
              <ul className="grid gap-1 border-t border-line px-5 py-3">
                {r.links.map((l) => (
                  <li key={l} className="min-w-0 truncate text-xs">
                    <a href={l} target="_blank" rel="noreferrer noopener" className="text-primary-2 hover:underline">
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center gap-2 border-t border-line px-5 py-2.5 text-xs text-muted">
              <img src={avatarUrl(r.autor, 32)} alt="" className="size-5 rounded-full" />
              Registrado por <span className="font-semibold text-ink">{r.autor.username}</span>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  )
}
