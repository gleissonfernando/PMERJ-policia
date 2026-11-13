import { History, MessageSquare, Globe } from 'lucide-react'
import { Card, CardHeader, Pill } from '@/components/form'
import { EmptyState } from '@/components/EmptyState'
import { avatarUrl } from '@/lib/api'
import { fmtDataHora } from '@/lib/format'
import type { SetEstado, SetRegistro } from '@/lib/set'

const PILL = {
  pendente: { label: 'Aguardando', cls: 'border-[#f59e0b]/40 bg-[#f59e0b]/10 text-[#f59e0b]' },
  aplicado: { label: 'Aplicado', cls: 'border-success/35 bg-success/10 text-success' },
  falhou: { label: 'Apelido recusado', cls: 'border-danger/40 bg-danger/10 text-danger' },
  desligado: { label: 'Aprovado', cls: 'border-success/35 bg-success/10 text-success' },
  reprovado: { label: 'Reprovado', cls: 'border-danger/40 bg-danger/10 text-danger' },
  cancelado: { label: 'Cancelado', cls: 'border-line bg-surface-2 text-muted' },
} as const

const pill = (r: SetRegistro) => PILL[r.status === 'aprovado' ? r.statusApelido : r.status]

/** Últimos sets aplicados (site e Discord). */
export function Recentes({ data, myId }: { data: SetEstado; myId: string }) {
  return (
    <Card>
      <CardHeader icon={<History className="size-4.5" />} title="Sets recentes" hint="Os últimos 60 pedidos, pelo site ou pelo Discord, com quem decidiu." />
      {data.recentes.length === 0 ? (
        <EmptyState icon={History}>Nenhum set pedido ainda.</EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {data.recentes.map((r) => {
            const st = pill(r)
            const Origem = r.origem === 'discord' ? MessageSquare : Globe
            return (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3 sm:px-6">
                <img src={avatarUrl({ id: r.userId, avatar: r.avatar }, 64)} alt="" referrerPolicy="no-referrer" className="size-9 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">
                    {r.apelido}
                    {r.userId === myId && <span className="ml-2 text-[10px] font-extrabold uppercase tracking-widest text-primary-2">Você</span>}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted">
                    <Origem className="size-3 shrink-0" aria-label={r.origem === 'discord' ? 'Pelo Discord' : 'Pelo site'} />
                    @{r.username} · {r.patente.nome}
                    {r.orgao && ` · ${r.orgao.sigla}`}
                    {r.decididoPor && ` · ${r.status === 'reprovado' ? 'reprovado' : 'aprovado'} por @${r.decididoPor.username}`}
                    {r.statusExpulsao === 'feito' && ' · expulso'}
                  </div>
                </div>
                <div className="hidden shrink-0 text-right sm:block">
                  <Pill className={st.cls}>{st.label}</Pill>
                  <div className="mt-1 text-[11px] text-muted tabular-nums">{fmtDataHora(r.em)}</div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
