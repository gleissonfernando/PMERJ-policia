import { Activity, Loader2, Settings2, UserMinus, UserPlus, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import { Atividade } from '@/components/entrada-saida/Atividade'
import { Configuracoes } from '@/components/entrada-saida/Configuracoes'
import { Tabs, useAba, type Aba } from '@/components/Tabs'
import { Alert } from '@/components/ui'
import { cn } from '@/lib/cn'
import { useEntradaSaida } from '@/lib/entradaSaida'
import { usePainelMe } from '@/lib/usePainelMe'

type Id = 'atividade' | 'config'

export function EntradaSaida() {
  const me = usePainelMe()
  const es = useEntradaSaida()
  const { data } = es

  const abas: Aba<Id>[] = [
    { id: 'atividade', label: 'Atividade', icon: Activity },
    ...(data?.admin ? [{ id: 'config' as const, label: 'Anúncios', icon: Settings2 }] : []),
  ]
  const [aba, irPara] = useAba(abas)

  if (!data) {
    return es.loadError ? (
      <div className="mx-auto max-w-md">
        <Alert>{es.loadError}</Alert>
      </div>
    ) : (
      <div className="grid min-h-[50vh] place-items-center" aria-busy="true">
        <Loader2 className="size-7 animate-spin text-primary" aria-label="Carregando" />
      </div>
    )
  }

  const online = data.gateway.estado === 'online'
  const ativos = [data.config.entrada.ativo && 'entrada', data.config.saida.ativo && 'saída'].filter(Boolean)

  return (
    <div className="animate-rise">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="kicker">Servidor</span>
          <h1 className="display mt-2 text-[clamp(2rem,4vw,2.6rem)]">Entrada e Saída</h1>
          <p className="mt-1.5 max-w-xl text-muted">
            O bot anuncia no Discord quando alguém <span className="font-semibold text-ink">entra</span> ou <span className="font-semibold text-ink">sai</span> do servidor.
          </p>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[11px] font-black uppercase tracking-widest',
            online && ativos.length ? 'border-success/35 bg-success/10 text-success' : 'border-line bg-surface text-muted',
          )}
        >
          <span className={cn('size-2 rounded-full', online && ativos.length ? 'animate-siren bg-success' : 'bg-muted/60')} />
          {!online ? 'Bot desconectado' : ativos.length ? `Anunciando ${ativos.join(' e ')}` : 'Anúncios desligados'}
        </span>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<Users className="size-4" />} label="Membros" value={data.servidor ? data.servidor.total.toLocaleString('pt-BR') : '—'} />
        <Stat icon={<UserPlus className="size-4" />} label="Entraram hoje" value={data.hoje.entradas} tone="success" />
        <Stat icon={<UserMinus className="size-4" />} label="Saíram hoje" value={data.hoje.saidas} tone="danger" />
        <Stat
          icon={<Activity className="size-4" />}
          label="Saldo 7 dias"
          value={`${data.semana.entradas - data.semana.saidas >= 0 ? '+' : ''}${data.semana.entradas - data.semana.saidas}`}
          sub={`${data.semana.entradas} entradas · ${data.semana.saidas} saídas`}
        />
      </div>

      <Tabs abas={abas} atual={aba} onChange={irPara} />

      <div role="tabpanel" className="mt-6">
        {aba === 'atividade' && <Atividade data={data} />}
        {aba === 'config' && <Configuracoes me={me} data={data} es={es} />}
      </div>
    </div>
  )
}

function Stat({ icon, label, value, sub, tone }: { icon: ReactNode; label: string; value: ReactNode; sub?: string; tone?: 'success' | 'danger' }) {
  return (
    <div className="rounded-2xl border border-line bg-surface/90 p-4">
      <div className={cn('flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.12em]', tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-primary-2' : 'text-muted')}>
        {icon} {label}
      </div>
      <div className="display mt-2 text-3xl tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted">{sub}</div>}
    </div>
  )
}
