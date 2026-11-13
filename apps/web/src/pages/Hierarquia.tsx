import { Layers, Loader2, Network, Settings2, UserX, Users } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Configuracoes } from '@/components/hierarquia/Configuracoes'
import { Card, CardHeader, Input } from '@/components/form'
import { EmptyState } from '@/components/EmptyState'
import { Tabs, useAba, type Aba } from '@/components/Tabs'
import { Alert } from '@/components/ui'
import { avatarUrl } from '@/lib/api'
import { cn } from '@/lib/cn'
import { fmtRelativo } from '@/lib/format'
import { useHierarquia, type HierarquiaEstado } from '@/lib/hierarquia'

type Id = 'arvore' | 'config'

const hex = (n: number) => (n ? `#${n.toString(16).padStart(6, '0')}` : 'var(--color-line-strong)')

/** Painel → Hierarquia: quem está em cada cargo, montado pela administração. */
export function Hierarquia() {
  const hierarquia = useHierarquia()
  const { data } = hierarquia

  const abas: Aba<Id>[] = [
    { id: 'arvore', label: 'Hierarquia', icon: Network },
    ...(data?.admin ? [{ id: 'config' as const, label: 'Configurações', icon: Settings2 }] : []),
  ]
  const [aba, irPara] = useAba(abas)

  if (!data) {
    return hierarquia.loadError ? (
      <div className="mx-auto max-w-md">
        <Alert>{hierarquia.loadError}</Alert>
      </div>
    ) : (
      <div className="grid min-h-[50vh] place-items-center" aria-busy="true">
        <Loader2 className="size-7 animate-spin text-primary" aria-label="Carregando" />
      </div>
    )
  }

  const c = data.config
  const online = data.gateway.estado === 'online'
  const publicado = c.mensagemIds.length > 0
  const total = data.arvore?.reduce((s, n) => s + n.membros.length, 0) ?? 0
  const vagos = data.arvore?.filter((n) => n.membros.length === 0).length ?? 0

  return (
    <div className="animate-rise">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="kicker">Efetivo</span>
          <h1 className="display mt-2 text-[clamp(2rem,4vw,2.6rem)]">Hierarquia</h1>
          <p className="mt-1.5 max-w-xl text-muted">
            Monte a hierarquia com os cargos do Discord. Quem tem o cargo aparece no painel; perdeu o cargo, sai; trocou, muda de lugar. Com vários cargos, vale sempre o mais alto.
          </p>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[11px] font-black uppercase tracking-widest',
            online && publicado ? 'border-success/35 bg-success/10 text-success' : 'border-line bg-surface text-muted',
          )}
        >
          <span className={cn('size-2 rounded-full', online && publicado ? 'animate-siren bg-success' : 'bg-muted/60')} />
          {!online ? 'Bot desconectado' : !c.niveis.length ? 'Sem níveis' : !publicado ? 'Painel não publicado' : 'Sincronizando'}
        </span>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<Layers className="size-4" />} label="Níveis" value={c.niveis.length} />
        <Stat icon={<Users className="size-4" />} label="Membros" value={data.arvore ? total : '—'} />
        <Stat icon={<UserX className="size-4" />} label="Níveis vagos" value={data.arvore ? vagos : '—'} tone={vagos ? 'aviso' : undefined} />
        <Stat icon={<Network className="size-4" />} label="Painel no Discord" value={publicado ? (c.publicadoEm ? `Atualizado ${fmtRelativo(c.publicadoEm)}` : 'Publicado') : 'Não publicado'} small tone={publicado ? 'ok' : 'aviso'} />
      </div>

      <Tabs abas={abas} atual={aba} onChange={irPara} />
      <div role="tabpanel" className="mt-6">
        {aba === 'arvore' && <Arvore data={data} />}
        {aba === 'config' && data.admin && <Configuracoes data={data} hierarquia={hierarquia} />}
      </div>
    </div>
  )
}

function Arvore({ data }: { data: HierarquiaEstado }) {
  const [busca, setBusca] = useState('')
  const cores = useMemo(() => new Map(data.cargos.map((c) => [c.id, c.cor])), [data.cargos])
  const q = busca.trim().toLowerCase()

  if (!data.config.niveis.length) {
    return (
      <Card>
        <EmptyState icon={Layers}>{data.admin ? 'Nenhum nível ainda. Monte a hierarquia em Configurações.' : 'A administração ainda não montou a hierarquia.'}</EmptyState>
      </Card>
    )
  }
  if (!data.arvore) {
    return (
      <Card>
        <EmptyState icon={Loader2}>Carregando os membros do servidor… (o bot precisa estar online)</EmptyState>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader
        icon={<Network className="size-4.5" />}
        title="Hierarquia atual"
        hint="Do cargo mais alto para o mais baixo, como sai no painel do Discord. Atualiza a cada 30 segundos."
        action={<Input aria-label="Buscar membro" placeholder="Buscar membro…" value={busca} onChange={(e) => setBusca(e.target.value)} className="h-9 w-48" />}
      />
      <ol className="divide-y divide-line">
        {data.arvore.map((n, i) => {
          const membros = q ? n.membros.filter((m) => m.nome.toLowerCase().includes(q)) : n.membros
          if (q && !membros.length) return null
          return (
            <li key={n.nivelId} className="relative px-4 py-4 sm:px-6">
              <span aria-hidden="true" className="absolute inset-y-3 left-0 w-[3px] rounded-r-full" style={{ background: hex(cores.get(n.cargoId) ?? 0) }} />
              <div className="flex items-center gap-2.5">
                <span className="w-6 shrink-0 text-center font-display text-sm text-muted tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                {n.emoji && <span aria-hidden="true">{n.emoji}</span>}
                <span className="font-bold">{n.titulo}</span>
                <span className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px] font-bold tabular-nums text-muted">{n.membros.length}</span>
              </div>
              {membros.length ? (
                <ul className="mt-3 flex flex-wrap gap-2 sm:pl-8">
                  {membros.map((m) => (
                    <li key={m.id} className="flex items-center gap-2 rounded-full border border-line bg-surface-2/60 py-1 pl-1 pr-3 text-sm">
                      <img src={avatarUrl({ id: m.id, avatar: m.avatar }, 32)} alt="" referrerPolicy="no-referrer" className="size-6 rounded-full" />
                      <span className="max-w-[16rem] truncate">{m.nome}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-muted sm:pl-8">Vago</p>
              )}
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

function Stat({ icon, label, value, small, tone }: { icon: ReactNode; label: string; value: ReactNode; small?: boolean; tone?: 'ok' | 'aviso' }) {
  return (
    <div className="rounded-2xl border border-line bg-surface/90 p-4">
      <div className={cn('flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.12em]', tone === 'ok' ? 'text-success' : tone === 'aviso' ? 'text-[#f59e0b]' : 'text-muted')}>
        {icon} {label}
      </div>
      <div className={cn('display mt-2 truncate tabular-nums', small ? 'text-xl leading-9' : 'text-3xl')}>{value}</div>
    </div>
  )
}
