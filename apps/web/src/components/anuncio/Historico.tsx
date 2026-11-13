import { ExternalLink, Hash, ImageIcon, Megaphone } from 'lucide-react'
import { Card, CardHeader } from '@/components/form'
import { EmptyState } from '@/components/EmptyState'
import { avatarUrl } from '@/lib/api'
import type { AnuncioEstado } from '@/lib/anuncio'
import { fmtDataHora, fmtRelativo } from '@/lib/format'

/** Últimos anúncios publicados pelo bot, com link para a mensagem no Discord. */
export function Historico({ data, guildLink }: { data: AnuncioEstado; guildLink: (canalId: string, mensagemId: string) => string }) {
  return (
    <Card>
      <CardHeader icon={<Megaphone className="size-4.5" />} title="Anúncios publicados" hint="Últimos 50. Atualiza a cada 30 segundos." />
      {data.recentes.length === 0 ? (
        <EmptyState icon={Megaphone}>
          Nenhum anúncio ainda. Eles são feitos pelo botão <span className="font-semibold text-ink">Realizar anúncio</span> do painel no Discord e aparecem aqui.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {data.recentes.map((r) => (
            <li key={r.id} className="flex items-start gap-3 px-4 py-4 sm:px-6">
              <img src={avatarUrl({ id: r.autor.id, avatar: r.autor.avatar }, 64)} alt="" referrerPolicy="no-referrer" className="mt-0.5 size-9 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="truncate text-sm font-bold text-ink">{r.titulo}</span>
                  {r.comImagem && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
                      <ImageIcon className="size-3" /> imagem
                    </span>
                  )}
                </div>
                <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-xs text-muted">{r.trecho}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted/90">
                  <span>@{r.autor.username}</span>
                  <span className="inline-flex items-center gap-0.5">
                    <Hash className="size-3" />
                    {r.canalNome}
                  </span>
                  <span className="tabular-nums">{r.caracteres.toLocaleString('pt-BR')} caracteres</span>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <span className="text-xs text-muted tabular-nums" title={fmtDataHora(r.em)}>
                  {fmtRelativo(r.em)}
                </span>
                <a
                  href={guildLink(r.canalId, r.mensagemId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-primary-2 hover:underline"
                >
                  Abrir <ExternalLink className="size-3" />
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
