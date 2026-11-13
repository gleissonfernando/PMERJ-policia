import { CalendarDays, FileText, Hash, History, KeyRound, Loader2, Lock, Megaphone, MousePointerClick, Send, Settings2, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Configuracoes } from '@/components/anuncio/Configuracoes'
import { Historico } from '@/components/anuncio/Historico'
import { Card } from '@/components/form'
import { Tabs, useAba, type Aba } from '@/components/Tabs'
import { Alert } from '@/components/ui'
import { useAnuncio } from '@/lib/anuncio'
import { cn } from '@/lib/cn'
import { usePainelMe } from '@/lib/usePainelMe'

type Id = 'publicados' | 'config'

const PASSOS: Array<{ icon: LucideIcon; title: string; text: string }> = [
  { icon: MousePointerClick, title: 'Realizar anúncio', text: 'Clique no botão do painel no Discord.' },
  { icon: Hash, title: 'Escolha o canal', text: 'Selecione no menu. O ✖️ desmarca para trocar.' },
  { icon: FileText, title: 'Preencha', text: 'Título, texto e uma imagem (opcional).' },
  { icon: Send, title: 'Enviar', text: 'Sai no canal com título, imagem e rodapé com a logo.' },
]

export function Anuncio() {
  const me = usePainelMe()
  const anuncio = useAnuncio()
  const { data } = anuncio

  const ver = Boolean(data && (data.admin || data.podeAnunciar))
  const abas: Aba<Id>[] = [
    ...(ver ? [{ id: 'publicados' as const, label: 'Publicados', icon: History }] : []),
    ...(data?.admin ? [{ id: 'config' as const, label: 'Configurações', icon: Settings2 }] : []),
  ]
  const [aba, irPara] = useAba(abas.length ? abas : [{ id: 'publicados', label: '', icon: History }])

  if (!data) {
    return anuncio.loadError ? (
      <div className="mx-auto max-w-md">
        <Alert>{anuncio.loadError}</Alert>
      </div>
    ) : (
      <div className="grid min-h-[50vh] place-items-center" aria-busy="true">
        <Loader2 className="size-7 animate-spin text-primary" aria-label="Carregando" />
      </div>
    )
  }

  const online = data.gateway.estado === 'online'
  const pronto = online && data.config.painel && data.config.cargosPermitidos.length > 0
  const link = (canalId: string, mensagemId: string) => `https://discord.com/channels/${data.guildId ?? '@me'}/${canalId}/${mensagemId}`

  return (
    <div className="animate-rise">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="kicker">Servidor</span>
          <h1 className="display mt-2 text-[clamp(2rem,4vw,2.6rem)]">Anúncio</h1>
          <p className="mt-1.5 max-w-xl text-muted">
            Comunicados oficiais publicados pelo bot em qualquer canal, num painel <span className="font-semibold text-ink">Components V2</span> com título, imagem e o rodapé da PMERJ.
          </p>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[11px] font-black uppercase tracking-widest',
            pronto ? 'border-success/35 bg-success/10 text-success' : 'border-line bg-surface text-muted',
          )}
        >
          <span className={cn('size-2 rounded-full', pronto ? 'animate-siren bg-success' : 'bg-muted/60')} />
          {!online ? 'Bot desconectado' : !data.config.painel ? 'Painel não publicado' : data.config.cargosPermitidos.length === 0 ? 'Sem cargos autorizados' : 'Pronto para anunciar'}
        </span>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<Megaphone className="size-4" />} label="Hoje" value={data.hoje} />
        <Stat icon={<CalendarDays className="size-4" />} label="Últimos 7 dias" value={data.semana} />
        <Stat icon={<KeyRound className="size-4" />} label="Cargos autorizados" value={data.config.cargosPermitidos.length} />
        <Stat
          icon={<Send className="size-4" />}
          label="Você"
          value={data.podeAnunciar ? 'Autorizado' : 'Sem acesso'}
          tone={data.podeAnunciar ? 'success' : undefined}
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
              Seu cargo não está autorizado a fazer anúncios. A administração escolhe quem pode em <span className="font-semibold text-ink">Anúncio → Configurações</span>.
            </div>
          </div>
        </Card>
      ) : (
        <>
          <Tabs abas={abas} atual={aba} onChange={irPara} />
          <div role="tabpanel" className="mt-6">
            {aba === 'publicados' && ver && <Historico data={data} guildLink={link} />}
            {aba === 'config' && data.admin && <Configuracoes me={me} data={data} anuncio={anuncio} />}
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
