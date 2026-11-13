import { Activity, BellOff, UserMinus, UserPlus } from 'lucide-react'
import { Card, CardHeader } from '@/components/form'
import { EmptyState } from '@/components/EmptyState'
import { avatarUrl } from '@/lib/api'
import { cn } from '@/lib/cn'
import type { EntradaSaidaEstado } from '@/lib/entradaSaida'
import { fmtDataHora, fmtRelativo } from '@/lib/format'

/** Últimas entradas e saídas do servidor, registradas pelo bot. */
export function Atividade({ data }: { data: EntradaSaidaEstado }) {
  return (
    <Card>
      <CardHeader icon={<Activity className="size-4.5" />} title="Atividade do servidor" hint="Últimas 50 entradas e saídas. Atualiza a cada 30 segundos." />
      {data.eventos.length === 0 ? (
        <EmptyState icon={Activity}>
          {data.gateway.estado === 'online'
            ? 'Nenhuma entrada ou saída desde que o bot conectou. Elas aparecem aqui assim que acontecerem.'
            : 'Quando o bot estiver conectado, cada entrada e saída do servidor aparece aqui.'}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {data.eventos.map((e) => {
            const entrou = e.tipo === 'entrada'
            const Icon = entrou ? UserPlus : UserMinus
            const contaNova = entrou && Date.now() - e.contaCriadaEm < 7 * 86_400_000
            return (
              <li key={e.id} className="flex items-center gap-3 px-4 py-3 sm:px-6">
                <span className="relative shrink-0">
                  <img src={avatarUrl({ id: e.userId, avatar: e.avatar }, 64)} alt="" referrerPolicy="no-referrer" className="size-9 rounded-full" />
                  <span
                    className={cn(
                      'absolute -bottom-1 -right-1 grid size-4.5 place-items-center rounded-full border-2 border-surface',
                      entrou ? 'bg-success text-[#03140a]' : 'bg-primary text-white',
                    )}
                  >
                    <Icon className="size-2.5" strokeWidth={3} />
                  </span>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">
                    {e.globalName ?? e.username}
                    {e.bot && <span className="ml-2 rounded bg-discord px-1 text-[9px] font-bold text-white">BOT</span>}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted">
                    @{e.username} · {entrou ? 'entrou' : 'saiu'} · {e.totalMembros.toLocaleString('pt-BR')} membros
                    {contaNova && <span className="ml-1.5 font-semibold text-[#f59e0b]">· conta criada {fmtRelativo(e.contaCriadaEm)}</span>}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xs text-muted tabular-nums" title={fmtDataHora(e.em)}>
                    {fmtRelativo(e.em)}
                  </div>
                  {!e.anunciado && (
                    <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-muted/70" title="Anúncio desligado ou canal não configurado">
                      <BellOff className="size-3" /> sem anúncio
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
