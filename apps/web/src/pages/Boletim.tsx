import { ClipboardList, CalendarDays, ExternalLink, Hash, Loader2, Lock, MessageSquareText, ScrollText, Settings2, ShieldAlert, Trash2, Users, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Configuracoes } from '@/components/boletim/Configuracoes'
import { Card, CardHeader } from '@/components/form'
import { EmptyState } from '@/components/EmptyState'
import { Tabs, useAba, type Aba } from '@/components/Tabs'
import { Alert } from '@/components/ui'
import { avatarUrl } from '@/lib/api'
import { numeroBoletim, useBoletim, type BoletimEstado } from '@/lib/boletim'
import { cn } from '@/lib/cn'
import { fmtDataHora, fmtRelativo } from '@/lib/format'

type Id = 'boletins' | 'config'

const PASSOS: Array<{ icon: LucideIcon; title: string; text: string }> = [
  { icon: MessageSquareText, title: 'Mensagem no canal', text: '1ª linha: equipe. Abaixo: o relatório.' },
  { icon: Trash2, title: 'O bot apaga', text: 'A mensagem original some do canal.' },
  { icon: ScrollText, title: 'Painel publicado', text: 'Boletim numerado, com equipe e relatório.' },
  { icon: ShieldAlert, title: 'Mandou errado?', text: 'Apaga e explica só para quem enviou.' },
]

/** Painel → Boletim Interno: boletins recebidos e configuração do canal. */
export function Boletim() {
  const boletim = useBoletim()
  const { data } = boletim

  const abas: Aba<Id>[] = [
    { id: 'boletins', label: 'Boletins', icon: ClipboardList, count: data?.recentes.length },
    ...(data?.admin ? [{ id: 'config' as const, label: 'Configurações', icon: Settings2 }] : []),
  ]
  const [aba, irPara] = useAba(abas)

  if (!data) {
    return boletim.loadError ? (
      <div className="mx-auto max-w-md">
        <Alert>{boletim.loadError}</Alert>
      </div>
    ) : (
      <div className="grid min-h-[50vh] place-items-center" aria-busy="true">
        <Loader2 className="size-7 animate-spin text-primary" aria-label="Carregando" />
      </div>
    )
  }

  const online = data.gateway.estado === 'online'
  const pronto = online && Boolean(data.config.canalId)
  const canal = data.canais.find((c) => c.id === data.config.canalId)

  return (
    <div className="animate-rise">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="kicker">Efetivo</span>
          <h1 className="display mt-2 text-[clamp(2rem,4vw,2.6rem)]">Boletim Interno</h1>
          <p className="mt-1.5 max-w-xl text-muted">
            As equipes escrevem no canal do boletim e o bot republica cada relatório num painel padronizado. Mensagens fora do formato são apagadas com uma explicação privada.
          </p>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[11px] font-black uppercase tracking-widest',
            pronto ? 'border-success/35 bg-success/10 text-success' : 'border-line bg-surface text-muted',
          )}
        >
          <span className={cn('size-2 rounded-full', pronto ? 'animate-siren bg-success' : 'bg-muted/60')} />
          {!online ? 'Bot desconectado' : !data.config.canalId ? 'Sem canal' : 'Recebendo'}
        </span>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<ClipboardList className="size-4" />} label="Hoje" value={data.hoje} />
        <Stat icon={<CalendarDays className="size-4" />} label="Últimos 7 dias" value={data.semana} />
        <Stat icon={<Hash className="size-4" />} label="Canal" value={data.config.canalId ? (canal ? `#${canal.nome}` : 'Configurado') : 'Nenhum'} small tone={data.config.canalId ? 'ok' : 'aviso'} />
        <Stat
          icon={<Users className="size-4" />}
          label="Quem envia"
          value={data.config.cargosPermitidos.length ? `${data.config.cargosPermitidos.length} cargo(s)` : 'Todos do canal'}
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

      <Tabs abas={abas} atual={aba} onChange={irPara} />
      <div role="tabpanel" className="mt-6">
        {aba === 'boletins' && <Lista data={data} />}
        {aba === 'config' && data.admin && <Configuracoes data={data} boletim={boletim} />}
        {aba === 'config' && !data.admin && (
          <Card>
            <EmptyState icon={Lock}>Só a administração altera as configurações do boletim.</EmptyState>
          </Card>
        )}
      </div>
    </div>
  )
}

function Lista({ data }: { data: BoletimEstado }) {
  return (
    <Card>
      <CardHeader icon={<ClipboardList className="size-4.5" />} title="Últimos boletins" hint="Os 100 mais recentes. Clique para ler o relatório completo. Atualiza a cada 30 segundos." />
      {data.recentes.length === 0 ? (
        <EmptyState icon={ScrollText}>{data.config.canalId ? 'Nenhum boletim ainda. Mande o primeiro no canal configurado.' : 'Escolha o canal do boletim em Configurações para começar.'}</EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {data.recentes.map((b) => {
            const link = data.guildId && b.mensagemId ? `https://discord.com/channels/${data.guildId}/${b.canalId}/${b.mensagemId}` : null
            return (
              <li key={b.id}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 transition hover:bg-white/3 sm:px-6 [&::-webkit-details-marker]:hidden">
                    <img src={avatarUrl({ id: b.autor.id, avatar: b.autor.avatar }, 64)} alt="" referrerPolicy="no-referrer" className="size-9 shrink-0 rounded-full" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 text-sm">
                        <span className="font-display text-xs tracking-wide text-primary-2 tabular-nums">{numeroBoletim(b)}</span>
                        <span className="truncate font-semibold">{b.equipe}</span>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted group-open:hidden">{b.relatorio.replace(/\s+/g, ' ')}</div>
                      <div className="mt-0.5 hidden truncate text-xs text-muted group-open:block">por {b.autor.nome}</div>
                    </div>
                    <span className="shrink-0 text-xs text-muted tabular-nums" title={fmtDataHora(b.em)}>
                      {fmtRelativo(b.em)}
                    </span>
                  </summary>
                  <div className="px-4 pb-4 sm:px-6 sm:pl-[4.5rem]">
                    <p className="whitespace-pre-wrap break-words rounded-xl border border-line bg-surface-2/50 px-4 py-3 text-sm leading-relaxed text-ink">{b.relatorio}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
                      <span>
                        Enviado por <span className="font-semibold text-ink">{b.autor.nome}</span> em {fmtDataHora(b.em)}
                      </span>
                      {link && (
                        <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary-2 hover:underline">
                          Abrir no Discord <ExternalLink className="size-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </details>
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
      <div className={cn('display mt-2 truncate tabular-nums', small ? 'text-xl leading-9' : 'text-3xl')}>{value}</div>
    </div>
  )
}
