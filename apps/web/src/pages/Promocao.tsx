import { ArrowRight, CalendarDays, CheckCircle2, History, Loader2, Lock, Medal, MousePointerClick, Settings2, TriangleAlert, UserSearch, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Configuracoes } from '@/components/promocao/Configuracoes'
import { Card, CardHeader, Pill } from '@/components/form'
import { EmptyState } from '@/components/EmptyState'
import { Tabs, useAba, type Aba } from '@/components/Tabs'
import { Alert } from '@/components/ui'
import { avatarUrl } from '@/lib/api'
import { cn } from '@/lib/cn'
import { fmtDataHora, fmtRelativo } from '@/lib/format'
import { usePromocao, type PromocaoEstado } from '@/lib/promocao'
import { usePainelMe } from '@/lib/usePainelMe'

type Id = 'historico' | 'config'

const PASSOS: Array<{ icon: LucideIcon; title: string; text: string }> = [
  { icon: MousePointerClick, title: '/promoção', text: 'Só para os cargos configurados.' },
  { icon: UserSearch, title: 'Policial e patente', text: 'Selecione os dois. O ✖️ desmarca se errar.' },
  { icon: CheckCircle2, title: 'Confirmar', text: 'Cargo trocado e sigla do apelido atualizada.' },
  { icon: Medal, title: 'Anúncio', text: 'Publicado no canal configurado.' },
]

/** Painel → Promoções: histórico e configuração do /promoção. */
export function Promocao() {
  const me = usePainelMe()
  const promocao = usePromocao()
  const { data } = promocao

  const ver = Boolean(data && (data.admin || data.podePromover || data.podeRebaixar))
  const abas: Aba<Id>[] = [
    ...(ver ? [{ id: 'historico' as const, label: 'Histórico', icon: History }] : []),
    ...(data?.admin ? [{ id: 'config' as const, label: 'Configurações', icon: Settings2 }] : []),
  ]
  const [aba, irPara] = useAba(abas.length ? abas : [{ id: 'historico', label: '', icon: History }])

  if (!data) {
    return promocao.loadError ? (
      <div className="mx-auto max-w-md">
        <Alert>{promocao.loadError}</Alert>
      </div>
    ) : (
      <div className="grid min-h-[50vh] place-items-center" aria-busy="true">
        <Loader2 className="size-7 animate-spin text-primary" aria-label="Carregando" />
      </div>
    )
  }

  const online = data.gateway.estado === 'online'
  const comCargo = data.patentes.filter((p) => p.cargoId).length
  const pronto = online && data.config.cargosPromover.length > 0 && Boolean(data.config.canalAnuncioId)

  return (
    <div className="animate-rise">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="kicker">Efetivo</span>
          <h1 className="display mt-2 text-[clamp(2rem,4vw,2.6rem)]">Promoções</h1>
          <p className="mt-1.5 max-w-xl text-muted">
            Pelo <span className="font-semibold text-ink">/promoção</span> no Discord: o bot troca o cargo da patente, atualiza a sigla no apelido (nome e ID ficam) e anuncia.
          </p>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[11px] font-black uppercase tracking-widest',
            pronto ? 'border-success/35 bg-success/10 text-success' : 'border-line bg-surface text-muted',
          )}
        >
          <span className={cn('size-2 rounded-full', pronto ? 'animate-siren bg-success' : 'bg-muted/60')} />
          {!online ? 'Bot desconectado' : data.config.cargosPromover.length === 0 ? 'Sem cargos para promover' : !data.config.canalAnuncioId ? 'Sem canal de anúncio' : 'Pronto'}
        </span>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<Medal className="size-4" />} label="Hoje" value={data.hoje} />
        <Stat icon={<CalendarDays className="size-4" />} label="Últimos 7 dias" value={data.semana} />
        <Stat icon={<Settings2 className="size-4" />} label="Patentes com cargo" value={`${comCargo}/${data.patentes.length}`} tone={comCargo < data.patentes.length ? 'aviso' : undefined} />
        <Stat icon={<CheckCircle2 className="size-4" />} label="Você" value={data.podePromover ? 'Pode promover' : 'Sem acesso'} small tone={data.podePromover ? 'ok' : undefined} />
      </div>

      <ol className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Como funciona">
        {PASSOS.map(({ icon: Icon, title, text }, i) => (
          <li key={title} className="flex items-start gap-3 rounded-[14px] border border-line bg-surface/60 p-3.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-[9px] border border-primary/25 bg-primary/10 text-primary">
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 leading-tight">
              <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted">Passo {i + 1}</div>
              <div className="mt-0.5 text-sm font-bold text-ink">{title}</div>
              <div className="mt-0.5 text-xs text-muted">{text}</div>
            </div>
          </li>
        ))}
      </ol>

      {abas.length === 0 ? (
        <Card className="mt-8">
          <EmptyState icon={Lock}>Seu cargo não está autorizado a promover. A administração escolhe quem pode em Promoções → Configurações.</EmptyState>
        </Card>
      ) : (
        <>
          <Tabs abas={abas} atual={aba} onChange={irPara} />
          <div role="tabpanel" className="mt-6">
            {aba === 'historico' && ver && <Historico data={data} />}
            {aba === 'config' && data.admin && <Configuracoes me={me} data={data} promocao={promocao} />}
          </div>
        </>
      )}
    </div>
  )
}

function Historico({ data }: { data: PromocaoEstado }) {
  return (
    <Card>
      <CardHeader icon={<History className="size-4.5" />} title="Últimas promoções" hint="Feitas pelo /promoção. Atualiza a cada 30 segundos." />
      {data.recentes.length === 0 ? (
        <EmptyState icon={Medal}>Nenhuma promoção ainda. Use o /promoção no Discord.</EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {data.recentes.map((r) => {
            const falhou = r.statusCargos === 'falhou' || r.statusApelido === 'falhou'
            return (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3 sm:px-6">
                <img src={avatarUrl({ id: r.userId, avatar: r.avatar }, 64)} alt="" referrerPolicy="no-referrer" className="size-9 rounded-full" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="truncate font-semibold">{r.apelidoNovo ?? `@${r.username}`}</span>
                    <span className="inline-flex items-center gap-1 font-display text-xs tracking-wide text-muted">
                      {r.de?.prefixo ?? '—'} <ArrowRight className="size-3" /> <span className={r.subiu ? 'text-[#f1c40f]' : 'text-ink'}>{r.para.prefixo}</span>
                    </span>
                    {r.modo === 'rebaixamento' ? <Pill className="border-[#b45309]/50 bg-[#b45309]/15 text-[#f59e0b]">Rebaixamento</Pill> : !r.subiu && <Pill className="border-line-strong bg-surface-2 text-muted">Ajuste</Pill>}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted">
                    @{r.username} · por {r.por.nome}
                    {falhou && (
                      <span className="ml-1.5 inline-flex items-center gap-1 font-semibold text-[#f59e0b]">
                        <TriangleAlert className="size-3" /> {r.statusCargos === 'falhou' ? 'cargo não trocado' : 'apelido não trocado'}
                      </span>
                    )}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-muted tabular-nums" title={fmtDataHora(r.em)}>
                  {fmtRelativo(r.em)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

function Stat({ icon, label, value, small, tone }: { icon: ReactNode; label: string; value: ReactNode; small?: boolean; tone?: 'ok' | 'aviso' }) {
  return (
    <div className="rounded-2xl border border-line bg-surface/90 p-4">
      <div className={cn('flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.12em]', tone === 'ok' ? 'text-success' : tone === 'aviso' ? 'text-[#f59e0b]' : 'text-muted')}>
        {icon} {label}
      </div>
      <div className={cn('display mt-2 tabular-nums', small ? 'text-xl leading-9' : 'text-3xl')}>{value}</div>
    </div>
  )
}
