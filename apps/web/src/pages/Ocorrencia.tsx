import { CalendarDays, Camera, ExternalLink, FolderOpen, Link2, ListChecks, Loader2, Lock, MousePointerClick, Send, Settings2, Siren, Users, type LucideIcon } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Configuracoes } from '@/components/ocorrencia/Configuracoes'
import { Card, CardHeader, Input, Pill } from '@/components/form'
import { EmptyState } from '@/components/EmptyState'
import { Tabs, useAba, type Aba } from '@/components/Tabs'
import { Alert } from '@/components/ui'
import { avatarUrl } from '@/lib/api'
import { cn } from '@/lib/cn'
import { fmtDataHora, fmtRelativo } from '@/lib/format'
import { numeroOcorrencia, useOcorrencia, type Ocorrencia as Registro, type OcorrenciaEstado } from '@/lib/ocorrencia'

type Id = 'registros' | 'config'

const PASSOS: Array<{ icon: LucideIcon; title: string; text: string }> = [
  { icon: MousePointerClick, title: 'Escolhe o tipo', text: 'Botão do painel → modal com a ocorrência.' },
  { icon: FolderOpen, title: 'Canal temporário', text: 'Relato no formulário e participantes no select.' },
  { icon: Link2, title: 'Presos', text: 'Sim ou não; nome e RG de cada preso.' },
  { icon: Camera, title: 'Evidências', text: 'Fotos mandadas no canal; o bot coleta.' },
  { icon: Send, title: 'Enviar', text: 'Painel completo no canal das ocorrências.' },
]

/** Painel → Ocorrência: registros enviados e configuração do painel. */
export function Ocorrencia() {
  const ocorrencia = useOcorrencia()
  const { data } = ocorrencia

  const abas: Aba<Id>[] = [
    ...(data?.acesso.podeVer ? [{ id: 'registros' as const, label: 'Ocorrências', icon: ListChecks, count: data.registros.length }] : []),
    ...(data?.acesso.podeConfigurar ? [{ id: 'config' as const, label: 'Configurações', icon: Settings2 }] : []),
  ]
  const [aba, irPara] = useAba(abas.length ? abas : [{ id: 'registros', label: '', icon: ListChecks }])

  if (!data) {
    return ocorrencia.loadError ? (
      <div className="mx-auto max-w-md">
        <Alert>{ocorrencia.loadError}</Alert>
      </div>
    ) : (
      <div className="grid min-h-[50vh] place-items-center" aria-busy="true">
        <Loader2 className="size-7 animate-spin text-primary" aria-label="Carregando" />
      </div>
    )
  }

  const c = data.config
  const online = data.gateway.estado === 'online'
  const pronto = online && Boolean(c.painelMensagemId && c.destinoCanalId) && c.tipos.length > 0

  return (
    <div className="animate-rise">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="kicker">Efetivo</span>
          <h1 className="display mt-2 text-[clamp(2rem,4vw,2.6rem)]">Ocorrência</h1>
          <p className="mt-1.5 max-w-xl text-muted">
            O policial escolhe o tipo no painel do Discord, preenche o relato num canal temporário, marca os participantes e manda as fotos. Ao enviar, tudo sai num painel só.
          </p>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[11px] font-black uppercase tracking-widest',
            pronto ? 'border-success/35 bg-success/10 text-success' : 'border-line bg-surface text-muted',
          )}
        >
          <span className={cn('size-2 rounded-full', pronto ? 'animate-siren bg-success' : 'bg-muted/60')} />
          {!online ? 'Bot desconectado' : !c.destinoCanalId ? 'Sem canal de destino' : !c.tipos.length ? 'Sem tipos' : !c.painelMensagemId ? 'Painel não publicado' : 'Pronto'}
        </span>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<Siren className="size-4" />} label="Hoje" value={data.hoje} />
        <Stat icon={<CalendarDays className="size-4" />} label="Últimos 7 dias" value={data.semana} />
        <Stat icon={<FolderOpen className="size-4" />} label="Em preenchimento" value={data.abertos} />
        <Stat icon={<ListChecks className="size-4" />} label="Tipos" value={c.tipos.length} tone={c.tipos.length ? undefined : 'aviso'} />
      </div>

      <ol className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-5" aria-label="Como funciona">
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
          <EmptyState icon={Lock}>Seu cargo não tem acesso aos registros de ocorrência. A administração escolhe os gestores em Ocorrência → Configurações.</EmptyState>
        </Card>
      ) : (
        <>
          <Tabs abas={abas} atual={aba} onChange={irPara} />
          <div role="tabpanel" className="mt-6">
            {aba === 'registros' && data.acesso.podeVer && <Lista data={data} />}
            {aba === 'config' && data.acesso.podeConfigurar && <Configuracoes data={data} ocorrencia={ocorrencia} />}
          </div>
        </>
      )}
    </div>
  )
}

function Lista({ data }: { data: OcorrenciaEstado }) {
  const [busca, setBusca] = useState('')
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return data.registros
    return data.registros.filter((o) => [numeroOcorrencia(o), o.tipo.nome, o.autor.nome, o.local, o.relato].some((t) => t.toLowerCase().includes(q)))
  }, [busca, data.registros])

  return (
    <Card>
      <CardHeader
        icon={<ListChecks className="size-4.5" />}
        title="Ocorrências enviadas"
        hint="As 200 mais recentes. Clique para ver o relato completo e as evidências."
        action={<Input aria-label="Buscar ocorrência" placeholder="Buscar…" value={busca} onChange={(e) => setBusca(e.target.value)} className="h-9 w-44" />}
      />
      {filtrados.length === 0 ? (
        <EmptyState icon={Siren}>{busca ? 'Nenhuma ocorrência encontrada para essa busca.' : 'Nenhuma ocorrência enviada ainda.'}</EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {filtrados.map((o) => (
            <Item key={o.id} o={o} guildId={data.guildId} />
          ))}
        </ul>
      )}
    </Card>
  )
}

function Item({ o, guildId }: { o: Registro; guildId: string | null }) {
  const link = guildId && o.mensagemIds[0] ? `https://discord.com/channels/${guildId}/${o.canalId}/${o.mensagemIds[0]}` : null
  return (
    <li>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 transition hover:bg-white/3 sm:px-6 [&::-webkit-details-marker]:hidden">
          <span className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-line bg-surface-2 text-lg" aria-hidden="true">
            {o.tipo.emoji || '🚨'}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className="font-display text-xs tracking-wide text-primary-2 tabular-nums">{numeroOcorrencia(o)}</span>
              <span className="truncate font-semibold">{o.tipo.nome}</span>
              {o.midias.length > 0 && (
                <Pill className="border-line bg-surface-2 text-muted">
                  <Camera className="size-3" /> {o.midias.length}
                </Pill>
              )}
              {o.participantes.length > 0 && (
                <Pill className="border-line bg-surface-2 text-muted">
                  <Users className="size-3" /> {o.participantes.length + 1}
                </Pill>
              )}
            </div>
            <div className="mt-0.5 truncate text-xs text-muted">
              {o.autor.nome} · {o.local}
            </div>
          </div>
          <span className="shrink-0 text-xs text-muted tabular-nums" title={fmtDataHora(o.em)}>
            {fmtRelativo(o.em)}
          </span>
        </summary>

        <div className="grid gap-4 px-4 pb-5 sm:px-6 sm:pl-[4.5rem]">
          <dl className="grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-[9rem_minmax(0,1fr)]">
            <Dado t="Responsável">
              <span className="inline-flex items-center gap-2">
                <img src={avatarUrl({ id: o.autor.id, avatar: o.autor.avatar }, 32)} alt="" referrerPolicy="no-referrer" className="size-5 rounded-full" />
                {o.autor.nome}
              </span>
            </Dado>
            <Dado t="Participantes">{o.participantes.length ? `${o.participantes.length} policial(is) marcados no Discord` : 'Nenhum além do responsável'}</Dado>
            <Dado t="Local">{o.local}</Dado>
            <Dado t="Data e horário">{o.quando}</Dado>
            <Dado t="O que houve">
              <p className="whitespace-pre-wrap leading-relaxed">{o.relato}</p>
            </Dado>
            {o.apreensoes && (
              <Dado t="Apreensões">
                <p className="whitespace-pre-wrap">{o.apreensoes}</p>
              </Dado>
            )}
            {o.desfecho && <Dado t="Desfecho">{o.desfecho}</Dado>}
            <Dado t="Presos">
              {o.houvePreso && o.presos.length ? (
                <ul className="grid gap-1">
                  {o.presos.map((x) => (
                    <li key={x.id}>
                      <span className="font-semibold">{x.nome}</span> <span className="text-muted">· RG</span> <span className="font-mono">{x.rg}</span>
                      {x.discordId && <span className="text-muted"> · Discord {x.discordId}</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-muted">Não houve</span>
              )}
            </Dado>
          </dl>

          {o.midias.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {o.midias.map((m) => {
                const src = `/api/ocorrencia/${o.id}/midia/${m.id}`
                return m.kind === 'video' ? (
                  <video key={m.id} src={src} controls preload="metadata" className="aspect-video w-full rounded-[10px] border border-line bg-black object-contain" />
                ) : (
                  <a key={m.id} href={src} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-[10px] border border-line">
                    <img src={src} alt={`Evidência ${m.name}`} loading="lazy" className="aspect-video w-full object-cover transition hover:scale-[1.03]" />
                  </a>
                )
              })}
            </div>
          )}

          {link && (
            <a href={link} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1.5 text-xs font-bold text-primary-2 hover:underline">
              <ExternalLink className="size-3.5" /> Abrir no Discord
            </a>
          )}
        </div>
      </details>
    </li>
  )
}

function Dado({ t, children }: { t: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted sm:pt-0.5">{t}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  )
}

function Stat({ icon, label, value, tone }: { icon: ReactNode; label: string; value: ReactNode; tone?: 'aviso' }) {
  return (
    <div className="rounded-2xl border border-line bg-surface/90 p-4">
      <div className={cn('flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.12em]', tone === 'aviso' ? 'text-[#f59e0b]' : 'text-muted')}>
        {icon} {label}
      </div>
      <div className="display mt-2 text-3xl tabular-nums">{value}</div>
    </div>
  )
}
