import { CalendarDays, ClipboardList, History, Loader2, Lock, MousePointerClick, Send, Settings2, Siren, UserCheck, Users, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Configuracoes } from '@/components/assuncao/Configuracoes'
import { Registros } from '@/components/assuncao/Registros'
import { Card } from '@/components/form'
import { Tabs, useAba, type Aba } from '@/components/Tabs'
import { Alert } from '@/components/ui'
import { useAssuncao } from '@/lib/assuncao'
import { cn } from '@/lib/cn'
import { usePainelMe } from '@/lib/usePainelMe'

type Id = 'registros' | 'config'

const PASSOS: Array<{ icon: LucideIcon; title: string; text: string }> = [
  { icon: MousePointerClick, title: 'Assumir serviço', text: 'O policial clica no botão do painel no Discord.' },
  { icon: ClipboardList, title: 'Preenche', text: 'Setor, viatura/prefixo e os policiais da guarnição.' },
  { icon: Users, title: 'Conferência', text: 'O bot confere cargos, repetidos e o comandante.' },
  { icon: Send, title: 'Resultado', text: 'Sai no canal configurado, com a logo da PMERJ.' },
]

export function Assuncao() {
  const me = usePainelMe()
  const assuncao = useAssuncao()
  const { data } = assuncao

  const ver = Boolean(data && (data.admin || data.minhas.length > 0))
  const abas: Aba<Id>[] = [
    ...(ver ? [{ id: 'registros' as const, label: 'Registros', icon: History, count: data?.recentes.length }] : []),
    ...(data?.admin ? [{ id: 'config' as const, label: 'Configurações', icon: Settings2 }] : []),
  ]
  const [aba, irPara] = useAba(abas.length ? abas : [{ id: 'registros', label: '', icon: History }])

  if (!data) {
    return assuncao.loadError ? (
      <div className="mx-auto max-w-md">
        <Alert>{assuncao.loadError}</Alert>
      </div>
    ) : (
      <div className="grid min-h-[50vh] place-items-center" aria-busy="true">
        <Loader2 className="size-7 animate-spin text-primary" aria-label="Carregando" />
      </div>
    )
  }

  const online = data.gateway.estado === 'online'
  const ativas = data.assuncoes.filter((a) => a.ativa)
  const prontas = ativas.filter((a) => a.painel && a.cargosPermitidos.length && a.canalResultadoId)
  const link = (canalId: string, mensagemId: string) => `https://discord.com/channels/${data.guildId ?? '@me'}/${canalId}/${mensagemId}`
  const status = !online
    ? 'Bot desconectado'
    : prontas.length === 0
      ? 'Nenhuma assunção pronta'
      : prontas.length === ativas.length
        ? 'Pronto para registrar'
        : `${prontas.length} de ${ativas.length} prontas`

  return (
    <div className="animate-rise">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="kicker">Efetivo</span>
          <h1 className="display mt-2 text-[clamp(2rem,4vw,2.6rem)]">Assunção de Serviço</h1>
          <p className="mt-1.5 max-w-xl text-muted">
            O policial registra a guarnição pelo painel no Discord e o bot publica o resultado no canal da escala. Cada assunção tem o próprio painel, canal e cargos.
          </p>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[11px] font-black uppercase tracking-widest',
            online && prontas.length ? 'border-success/35 bg-success/10 text-success' : 'border-line bg-surface text-muted',
          )}
        >
          <span className={cn('size-2 rounded-full', online && prontas.length ? 'animate-siren bg-success' : 'bg-muted/60')} />
          {status}
        </span>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<Siren className="size-4" />} label="Hoje" value={data.hoje} />
        <Stat icon={<CalendarDays className="size-4" />} label="Últimos 7 dias" value={data.semana} />
        <Stat icon={<ClipboardList className="size-4" />} label="Assunções ativas" value={`${ativas.length}/${data.assuncoes.length}`} />
        <Stat
          icon={<UserCheck className="size-4" />}
          label="Você"
          value={data.minhas.length ? `Autorizado em ${data.minhas.length}` : 'Sem acesso'}
          tone={data.minhas.length ? 'success' : undefined}
          small
        />
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
          <div className="grid place-items-center gap-3 px-6 py-14 text-center">
            <span className="grid size-12 place-items-center rounded-full border border-line bg-surface-2 text-muted">
              <Lock className="size-5" />
            </span>
            <div className="max-w-sm text-sm text-muted">
              Seu cargo não está autorizado em nenhuma assunção de serviço. A administração escolhe quem pode em <span className="font-semibold text-ink">Assunção de Serviço → Configurações</span>.
            </div>
          </div>
        </Card>
      ) : (
        <>
          <Tabs abas={abas} atual={aba} onChange={irPara} />
          <div role="tabpanel" className="mt-6">
            {aba === 'registros' && ver && <Registros data={data} link={link} />}
            {aba === 'config' && data.admin && <Configuracoes me={me} data={data} assuncao={assuncao} />}
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ icon, label, value, tone, small }: { icon: ReactNode; label: string; value: ReactNode; tone?: 'success'; small?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-surface/90 p-4">
      <div className={cn('flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.12em]', tone === 'success' ? 'text-success' : 'text-muted')}>
        {icon} {label}
      </div>
      <div className={cn('display mt-2 tabular-nums', small ? 'text-xl leading-9' : 'text-3xl')}>{value}</div>
    </div>
  )
}
