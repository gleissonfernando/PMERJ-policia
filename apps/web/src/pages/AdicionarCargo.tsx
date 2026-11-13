import { CalendarDays, CheckCircle2, Eye, History, Loader2, Lock, MousePointerClick, Settings2, TriangleAlert, UserPlus, UserSearch, X, type LucideIcon } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { Configuracoes } from '@/components/adicionar-cargo/Configuracoes'
import { EmptyState } from '@/components/EmptyState'
import { Card, CardHeader } from '@/components/form'
import { Tabs, useAba, type Aba } from '@/components/Tabs'
import { Alert } from '@/components/ui'
import { RESULTADO_VISIBILIDADE, useAdicionarCargo, type AdicionarCargoEstado } from '@/lib/adicionarCargo'
import { avatarUrl } from '@/lib/api'
import { cn } from '@/lib/cn'
import { fmtDataHora, fmtRelativo } from '@/lib/format'

type Id = 'historico' | 'config'

const corCargo = (n: number) => (n ? `#${n.toString(16).padStart(6, '0')}` : '#99aab5')

const PASSOS: Array<{ icon: LucideIcon; title: string; text: string }> = [
  { icon: MousePointerClick, title: '/adicionar-cargo', text: 'Só aparece para os cargos liberados.' },
  { icon: UserSearch, title: 'Membro e cargo', text: 'Selecione os dois. O ✖️ do menu desmarca.' },
  { icon: CheckCircle2, title: 'Confirmar', text: 'O bot confere as travas e dá o cargo.' },
  { icon: History, title: 'Registro', text: 'Fica aqui e no canal de registro.' },
]

/** Painel → Adicionar Cargo: histórico e configuração do /adicionar-cargo. */
export function AdicionarCargo() {
  const api = useAdicionarCargo()
  const { data } = api
  const [params, setParams] = useSearchParams()
  // Volta do "Aplicar no Discord" (?visibilidade=ok|erro): mostra o aviso e limpa o endereço.
  const [resultado, setResultado] = useState<string | null>(() => params.get('visibilidade'))
  useEffect(() => {
    if (!params.has('visibilidade')) return
    params.delete('visibilidade')
    setParams(params, { replace: true })
  }, [params, setParams])

  const ver = Boolean(data && (data.admin || data.podeUsar))
  const abas: Aba<Id>[] = [
    ...(ver ? [{ id: 'historico' as const, label: 'Histórico', icon: History }] : []),
    ...(data?.admin ? [{ id: 'config' as const, label: 'Configurações', icon: Settings2 }] : []),
  ]
  const [aba, irPara] = useAba(abas.length ? abas : [{ id: 'historico', label: '', icon: History }])

  if (!data) {
    return api.loadError ? (
      <div className="mx-auto max-w-md">
        <Alert>{api.loadError}</Alert>
      </div>
    ) : (
      <div className="grid min-h-[50vh] place-items-center" aria-busy="true">
        <Loader2 className="size-7 animate-spin text-primary" aria-label="Carregando" />
      </div>
    )
  }

  const online = data.gateway.estado === 'online'
  const semCargos = data.config.cargosUsar.length === 0
  const pronto = online && !semCargos && data.visibilidadeEmDia
  const aviso = resultado ? (RESULTADO_VISIBILIDADE[resultado] ?? RESULTADO_VISIBILIDADE.falha_discord!) : null

  return (
    <div className="animate-rise">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="kicker">Efetivo</span>
          <h1 className="display mt-2 text-[clamp(2rem,4vw,2.6rem)]">Adicionar Cargo</h1>
          <p className="mt-1.5 max-w-xl text-muted">
            Pelo <span className="font-semibold text-ink">/adicionar-cargo</span> no Discord: quem tem permissão escolhe o membro e o cargo, confirma, e o bot entrega.
          </p>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[11px] font-black uppercase tracking-widest',
            pronto ? 'border-success/35 bg-success/10 text-success' : 'border-line bg-surface text-muted',
          )}
        >
          <span className={cn('size-2 rounded-full', pronto ? 'animate-siren bg-success' : 'bg-muted/60')} />
          {!online ? 'Bot desconectado' : semCargos ? 'Sem cargos liberados' : !data.visibilidadeEmDia ? 'Visibilidade pendente' : 'Pronto'}
        </span>
      </div>

      {aviso && (
        <div
          role="status"
          className={cn(
            'mt-6 flex items-start gap-3 rounded-[14px] border px-4 py-3 text-sm',
            aviso.ok ? 'border-success/35 bg-success/10 text-success' : 'border-[#f59e0b]/35 bg-[#f59e0b]/10 text-[#fbbf24]',
          )}
        >
          {aviso.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <TriangleAlert className="mt-0.5 size-4 shrink-0" />}
          <span className="flex-1">{aviso.texto}</span>
          <button type="button" onClick={() => setResultado(null)} aria-label="Fechar aviso" className="grid size-6 place-items-center rounded-md opacity-70 transition hover:opacity-100">
            <X className="size-4" />
          </button>
        </div>
      )}

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<UserPlus className="size-4" />} label="Hoje" value={data.hoje} />
        <Stat icon={<CalendarDays className="size-4" />} label="Últimos 7 dias" value={data.semana} />
        <Stat
          icon={<Eye className="size-4" />}
          label="Visibilidade"
          value={data.visibilidadeEmDia ? 'Em dia' : data.config.visibilidade ? 'Desatualizada' : 'Não aplicada'}
          small
          tone={data.visibilidadeEmDia ? 'ok' : 'aviso'}
        />
        <Stat icon={<CheckCircle2 className="size-4" />} label="Você" value={data.podeUsar ? 'Pode usar' : 'Sem acesso'} small tone={data.podeUsar ? 'ok' : undefined} />
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
          <EmptyState icon={Lock}>Seu cargo não está autorizado a adicionar cargos. A administração escolhe quem pode em Adicionar Cargo → Configurações.</EmptyState>
        </Card>
      ) : (
        <>
          <Tabs abas={abas} atual={aba} onChange={irPara} />
          <div role="tabpanel" className="mt-6">
            {aba === 'historico' && ver && <Historico data={data} />}
            {aba === 'config' && data.admin && <Configuracoes data={data} api={api} />}
          </div>
        </>
      )}
    </div>
  )
}

function Historico({ data }: { data: AdicionarCargoEstado }) {
  return (
    <Card>
      <CardHeader icon={<History className="size-4.5" />} title="Últimos cargos dados" hint="Feitos pelo /adicionar-cargo. Atualiza a cada 30 segundos." />
      {data.recentes.length === 0 ? (
        <EmptyState icon={UserPlus}>Nenhum cargo dado ainda. Use o /adicionar-cargo no Discord.</EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {data.recentes.map((r) => {
            const falhos = r.cargos.filter((c) => !c.ok)
            return (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3 sm:px-6">
                <img src={avatarUrl({ id: r.userId, avatar: r.avatar }, 64)} alt="" referrerPolicy="no-referrer" className="size-9 rounded-full" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <span className="truncate font-semibold">{r.nome}</span>
                    {r.cargos.map((c) => (
                      <span
                        key={c.id}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                          c.ok ? 'border-line bg-surface-2/60' : 'border-danger/40 bg-danger/10 text-[#ffb4ae] line-through',
                        )}
                        title={c.ok ? undefined : 'O Discord recusou este cargo'}
                      >
                        <span className="size-1.5 rounded-full" style={{ background: corCargo(c.cor) }} />
                        {c.nome}
                      </span>
                    ))}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted">
                    @{r.username} · por {r.por.nome}
                    {falhos.length > 0 && (
                      <span className="ml-1.5 inline-flex items-center gap-1 font-semibold text-[#f59e0b]">
                        <TriangleAlert className="size-3" /> {falhos.length === 1 ? '1 cargo recusado' : `${falhos.length} cargos recusados`}
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
