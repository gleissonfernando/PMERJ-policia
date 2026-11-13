import { ArrowRight, BellRing, CheckCircle2, ExternalLink, GraduationCap, Hourglass, ListChecks, Loader2, Settings2, Trophy, Users, XCircle, type LucideIcon } from 'lucide-react'
import { Configuracoes } from '@/components/horas/Configuracoes'
import { EmptyState } from '@/components/EmptyState'
import { Card, CardHeader } from '@/components/form'
import { Tabs, useAba, type Aba } from '@/components/Tabs'
import { Alert } from '@/components/ui'
import { avatarUrl } from '@/lib/api'
import { cn } from '@/lib/cn'
import { fmtDataHora, fmtRelativo } from '@/lib/format'
import { fmtHoras, useHoras, type Alerta, type HorasEstado, type Progresso } from '@/lib/horas'

type Id = 'meu' | 'aptos' | 'efetivo' | 'config'
const OURO = '#f1c40f'

/** Painel → Sistema de Horas: requisitos de cada promoção, progresso e alertas de "apto". */
export function Horas() {
  const api = useHoras()
  const { data } = api
  const abas: Aba<Id>[] = [
    { id: 'meu', label: 'Minha progressão', icon: Hourglass },
    ...(data?.equipe ? [{ id: 'aptos' as const, label: 'Aptos', icon: BellRing, count: data.aptos.length }] : []),
    ...(data?.equipe ? [{ id: 'efetivo' as const, label: 'Efetivo', icon: Users }] : []),
    ...(data?.admin ? [{ id: 'config' as const, label: 'Configurações', icon: Settings2 }] : []),
  ]
  const [aba, irPara] = useAba(abas)

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

  const c = data.config
  const status = !c.ativo ? 'Alertas desligados' : data.gateway.estado !== 'online' ? 'Bot desconectado' : !c.canalAlertaId ? 'Sem canal de alertas' : c.regras.length === 0 ? 'Sem requisitos' : 'Pronto'
  const pronto = status === 'Pronto'

  return (
    <div className="animate-rise">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="kicker">Efetivo · Carreira</span>
          <h1 className="display mt-2 text-[clamp(2rem,4vw,2.6rem)]">Sistema de Horas</h1>
          <p className="mt-1.5 max-w-xl text-muted">
            Horas comprovadas no Bate-ponto rumo à próxima patente. Quem cumpre as horas gera um <span className="font-semibold text-ink">alerta</span> no Discord para o Comando.
          </p>
        </div>
        <span className={cn('inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[11px] font-black uppercase tracking-widest', pronto ? 'border-success/35 bg-success/10 text-success' : 'border-line bg-surface text-muted')}>
          <span className={cn('size-2 rounded-full', pronto ? 'animate-siren bg-success' : 'bg-muted/60')} />
          {status}
        </span>
      </div>

      <Escada data={data} />

      <Tabs abas={abas} atual={aba} onChange={irPara} />
      <div role="tabpanel" className="mt-6">
        {aba === 'meu' && <MinhaProgressao eu={data.eu} />}
        {aba === 'aptos' && data.equipe && <Aptos alertas={data.aptos} historico={data.historico} />}
        {aba === 'efetivo' && data.equipe && <Efetivo data={data} />}
        {aba === 'config' && data.admin && <Configuracoes data={data} api={api} />}
      </div>
    </div>
  )
}

/* ---------- Escada de promoções (todos veem os requisitos) ---------- */

function Escada({ data }: { data: HorasEstado }) {
  const ordem = (id: string) => data.patentes.findIndex((p) => p.id === id)
  const regras = [...data.config.regras].sort((a, b) => ordem(a.dePatenteId) - ordem(b.dePatenteId))
  const pat = (id: string) => data.patentes.find((p) => p.id === id)
  const curso = (id: string) => data.cursos.find((c) => c.id === id)
  if (regras.length === 0) return null
  return (
    <ol className="mt-8 grid gap-2 sm:grid-cols-2 xl:grid-cols-5" aria-label="Requisitos por promoção">
      {regras.map((r, i) => {
        const minha = data.eu.patente?.id === r.dePatenteId
        return (
          <li key={r.id} className={cn('relative flex flex-col rounded-[14px] border bg-surface/60 p-4', minha ? 'border-[#f1c40f]/50 bg-[#f1c40f]/5' : 'border-line')}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted">Degrau {i + 1}</span>
              {minha && <span className="rounded-full bg-[#f1c40f]/15 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-widest text-[#f1c40f]">Você</span>}
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 font-display text-base font-semibold tracking-wide">
              {pat(r.dePatenteId)?.prefixo ?? '?'} <ArrowRight className="size-3.5 text-muted" /> <span style={{ color: OURO }}>{pat(r.paraPatenteId)?.prefixo ?? '?'}</span>
            </div>
            <div className="mt-2 display text-2xl tabular-nums">
              {r.horas}h <span className="text-xs font-normal normal-case tracking-normal text-muted">comprovadas</span>
            </div>
            {(r.cursos.length > 0 || r.requisitos.length > 0) && (
              <ul className="mt-2 grid gap-1 text-xs text-muted">
                {r.cursos.map((id) => (
                  <li key={id} className="flex items-center gap-1.5">
                    <GraduationCap className="size-3 shrink-0" /> {curso(id)?.sigla ?? 'Curso'}
                  </li>
                ))}
                {r.requisitos.map((t) => (
                  <li key={t} className="flex items-start gap-1.5">
                    <ListChecks className="mt-0.5 size-3 shrink-0" /> <span>{t}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/* ---------- Minha progressão ---------- */

function Barra({ atual, total, apto }: { atual: number; total: number; apto: boolean }) {
  const pct = total > 0 ? Math.min(100, (atual / total) * 100) : 100
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
      <div className={cn('h-full rounded-full transition-[width] duration-700', apto ? 'bg-[#f1c40f]' : 'bg-primary')} style={{ width: `${pct}%` }} />
    </div>
  )
}

function MinhaProgressao({ eu }: { eu: Progresso }) {
  if (!eu.patente) return <Card><EmptyState icon={Hourglass}>Não identificamos sua patente (cargo de patente, set ou sigla no apelido).</EmptyState></Card>
  if (!eu.para) return <Card><EmptyState icon={Trophy}>Sua patente ({eu.patente.prefixo}) não tem próxima promoção configurada no Sistema de Horas.</EmptyState></Card>
  const falta = Math.max(0, eu.exigidoMs - eu.horasMs)
  return (
    <Card className="overflow-hidden">
      <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div>
          <div className="flex items-center gap-2 font-display text-xl font-semibold tracking-wide">
            {eu.patente.prefixo} <ArrowRight className="size-4 text-muted" /> <span style={{ color: OURO }}>{eu.para.prefixo}</span>
          </div>
          <p className="mt-0.5 text-sm text-muted">
            {eu.patente.nome} → {eu.para.nome}
          </p>
          <div className="mt-6 flex items-end justify-between gap-3">
            <span className="display text-4xl tabular-nums">{fmtHoras(eu.horasMs)}</span>
            <span className="pb-1 text-sm text-muted">de {fmtHoras(eu.exigidoMs)}</span>
          </div>
          <div className="mt-3">
            <Barra atual={eu.horasMs} total={eu.exigidoMs} apto={eu.apto} />
          </div>
          <p className={cn('mt-3 text-sm font-semibold', eu.apto ? 'text-[#f1c40f]' : 'text-muted')}>
            {eu.apto ? '🎖️ Horas cumpridas! O Comando já foi alertado.' : `Faltam ${fmtHoras(falta)} de serviço aprovado.`}
          </p>
        </div>
        <div className="grid content-start gap-2 rounded-[14px] border border-line bg-surface-2/40 p-4">
          <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted">Requisitos</span>
          <Req ok={eu.apto} texto={`${fmtHoras(eu.exigidoMs)} comprovadas`} />
          {eu.cursos.map((c) => (
            <Req key={c.id} ok={c.ok} texto={`Curso ${c.sigla}`} sub={c.nome} />
          ))}
          {eu.requisitos.map((t) => (
            <Req key={t} texto={t} sub="Conferido pelo Comando" />
          ))}
        </div>
      </div>
    </Card>
  )
}

function Req({ ok, texto, sub }: { ok?: boolean; texto: string; sub?: string }) {
  const Icon: LucideIcon = ok === undefined ? ListChecks : ok ? CheckCircle2 : XCircle
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <Icon className={cn('mt-0.5 size-4 shrink-0', ok === undefined ? 'text-muted' : ok ? 'text-success' : 'text-danger')} />
      <div className="min-w-0">
        <div className="font-semibold text-ink">{texto}</div>
        {sub && <div className="text-xs text-muted">{sub}</div>}
      </div>
    </div>
  )
}

/* ---------- Aptos (alertas) ---------- */

function Aptos({ alertas, historico }: { alertas: Alerta[]; historico: Alerta[] }) {
  return (
    <div className="grid gap-5">
      {alertas.length === 0 ? (
        <Card><EmptyState icon={BellRing}>Ninguém apto no momento. Quando alguém bater as horas da próxima patente, aparece aqui e no canal de alertas.</EmptyState></Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {alertas.map((a) => (
            <AlertaCard key={a.id} a={a} />
          ))}
        </ul>
      )}
      {historico.length > 0 && (
        <Card>
          <CardHeader icon={<Trophy className="size-4.5" />} title="Já decididos" hint="Alertas de quem já foi promovido (ou mudou de patente)." />
          <ul className="divide-y divide-line">
            {historico.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-4 py-3 sm:px-6">
                <img src={avatarUrl({ id: a.userId, avatar: a.avatar }, 64)} alt="" referrerPolicy="no-referrer" className="size-8 rounded-full" />
                <div className="min-w-0 flex-1 text-sm">
                  <span className="font-semibold">{a.nome}</span>{' '}
                  <span className="font-display text-xs text-muted">
                    {a.de.prefixo} → {a.para.prefixo}
                  </span>
                </div>
                <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-widest', a.status === 'promovido' ? 'border-success/35 bg-success/10 text-success' : 'border-line text-muted')}>
                  {a.status === 'promovido' ? 'Promovido' : 'Encerrado'}
                </span>
                <span className="w-20 shrink-0 text-right text-xs text-muted tabular-nums" title={fmtDataHora(a.atualizadoEm)}>
                  {fmtRelativo(a.atualizadoEm)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

function AlertaCard({ a }: { a: Alerta }) {
  return (
    <li className="relative overflow-hidden rounded-[18px] border border-[#f1c40f]/30 bg-[linear-gradient(160deg,#17140a_0%,#0d0d0d_60%)] p-5">
      <div className="flex items-center gap-3">
        <img src={avatarUrl({ id: a.userId, avatar: a.avatar }, 80)} alt="" referrerPolicy="no-referrer" className="size-11 rounded-full border-2 border-[#f1c40f]/50" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{a.nome}</div>
          <div className="flex items-center gap-1.5 font-display text-sm tracking-wide text-muted">
            {a.de.prefixo} <ArrowRight className="size-3" /> <span style={{ color: OURO }}>{a.para.prefixo}</span>
          </div>
        </div>
        <span className="text-xs text-muted" title={fmtDataHora(a.em)}>
          {fmtRelativo(a.em)}
        </span>
      </div>
      <p className="mt-4 text-sm">
        ⏱️ <span className="font-semibold">{fmtHoras(a.horasMs)}</span> <span className="text-muted">de {a.horasExigidas}h</span>
      </p>
      {(a.cursos.length > 0 || a.requisitos.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {a.cursos.map((c) => (
            <span key={c.id} className={cn('rounded-full border px-2 py-0.5 text-[11px] font-semibold', c.ok ? 'border-success/35 bg-success/10 text-success' : 'border-danger/40 bg-danger/10 text-[#ffb4ae]')}>
              {c.ok ? '✓' : '✗'} {c.sigla}
            </span>
          ))}
          {a.requisitos.map((t) => (
            <span key={t} className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">
              ▫ {t}
            </span>
          ))}
        </div>
      )}
      {a.url && (
        <a
          href={a.url}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-[9px] border border-[#f1c40f]/35 px-3 text-xs font-bold text-[#f1c40f] transition hover:bg-[#f1c40f]/10"
        >
          Ver alerta no Discord <ExternalLink className="size-3.5" />
        </a>
      )}
    </li>
  )
}

/* ---------- Efetivo ---------- */

function Efetivo({ data }: { data: HorasEstado }) {
  if (data.efetivo.length === 0) return <Card><EmptyState icon={Users}>Ninguém com próxima promoção configurada (ou a lista de membros ainda está carregando).</EmptyState></Card>
  return (
    <Card>
      <CardHeader icon={<Users className="size-4.5" />} title="Progresso do efetivo" hint="Quem está mais perto da próxima patente aparece primeiro." />
      <ul className="divide-y divide-line">
        {data.efetivo.map((p) => (
          <li key={p.id} className="grid items-center gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_7rem] sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <img src={avatarUrl({ id: p.id, avatar: p.avatar }, 64)} alt="" referrerPolicy="no-referrer" className="size-8 rounded-full" />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{p.nome}</div>
                <div className="font-display text-xs tracking-wide text-muted">
                  {p.patente?.prefixo} → {p.para?.prefixo}
                </div>
              </div>
            </div>
            <Barra atual={p.horasMs} total={p.exigidoMs} apto={p.apto} />
            <div className={cn('text-right text-xs tabular-nums', p.apto ? 'font-bold text-[#f1c40f]' : 'text-muted')}>
              {p.apto ? '🎖️ Apto' : `${fmtHoras(p.horasMs)} / ${fmtHoras(p.exigidoMs)}`}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}
