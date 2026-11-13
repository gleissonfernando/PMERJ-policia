import { BadgeCheck, UserX, CheckCircle2, Clock, Crown, FolderTree, History, Info, KeyRound, Loader2, MessageSquareShare, Mic, ScrollText, Send, Settings2, ShieldCheck, Timer, Trophy, UserRound, Users, XCircle, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { BotStatus } from '@/components/discord/BotStatus'
import { CanalSelect } from '@/components/discord/CanalSelect'
import { CargoPicker } from '@/components/discord/CargoPicker'
import { PessoaPicker } from '@/components/discord/PessoaPicker'
import { EmptyState } from '@/components/EmptyState'
import { Button, Card, CardHeader, Field, Input, Pill, Select } from '@/components/form'
import { SaveBar } from '@/components/SaveBar'
import { Tabs, useAba, type Aba } from '@/components/Tabs'
import { Alert } from '@/components/ui'
import { CasosInatividade, ConfigInatividade, ConfigLembrete } from '@/components/ponto/Inatividade'
import { avatarUrl } from '@/lib/api'
import { cn } from '@/lib/cn'
import type { CanalTexto } from '@/lib/discord'
import { fmtDataHora, fmtHora, fmtRelativo } from '@/lib/format'
import { buscarMembros, erroPonto, fmtDur, usePonto, type Ponto as PontoT, type PontoApi, type PontoEstado, type PontoInput, type StatusPonto, type TipoPainel } from '@/lib/ponto'

type Id = 'servico' | 'ranking' | 'aprovacoes' | 'inatividade' | 'config'
const nn = (n: number) => String(n).padStart(4, '0')
const OURO = '#f1c40f'

const STATUS: Record<StatusPonto, { label: string; cls: string }> = {
  aberto: { label: 'Em serviço', cls: 'border-success/35 bg-success/10 text-success' },
  pendente: { label: 'Aguardando', cls: 'border-[#f59e0b]/40 bg-[#f59e0b]/10 text-[#f59e0b]' },
  aprovado: { label: 'Aprovado', cls: 'border-success/35 bg-success/10 text-success' },
  reprovado: { label: 'Reprovado', cls: 'border-danger/40 bg-danger/10 text-danger' },
  descartado: { label: 'Descartado', cls: 'border-line-strong bg-surface-2 text-muted' },
}
const ORIGEM = { botao: 'Painel', voz: 'Canal de voz', ajuste: 'Ajuste' } as const

/** Relógio que anda sozinho (para os tempos em serviço). */
function useAgora(ms = 15_000) {
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setAgora(Date.now()), ms)
    return () => window.clearInterval(id)
  }, [ms])
  return agora
}

/** Painel → Ponto: bate-ponto, efetivo em serviço, aprovação de horas e ranking. */
export function Ponto() {
  const ponto = usePonto()
  const { data } = ponto
  const ver = Boolean(data && (data.admin || data.aprovador || data.gestao))
  const abas: Aba<Id>[] = [
    { id: 'servico', label: 'Em serviço', icon: Timer, count: data?.emServico.length },
    { id: 'ranking', label: 'Ranking', icon: Trophy },
    ...(ver ? [{ id: 'aprovacoes' as const, label: 'Aprovações', icon: BadgeCheck, count: data?.pendentes.length }] : []),
    ...(data?.inatividade ? [{ id: 'inatividade' as const, label: 'Inatividade', icon: UserX, count: data.inatividade.abertos.length }] : []),
    ...(data?.admin ? [{ id: 'config' as const, label: 'Configurações', icon: Settings2 }] : []),
  ]
  const [aba, irPara] = useAba(abas)

  if (!data) {
    return ponto.loadError ? (
      <div className="mx-auto max-w-md">
        <Alert>{ponto.loadError}</Alert>
      </div>
    ) : (
      <div className="grid min-h-[50vh] place-items-center" aria-busy="true">
        <Loader2 className="size-7 animate-spin text-primary" aria-label="Carregando" />
      </div>
    )
  }

  const c = data.config
  const status =
    data.gateway.estado !== 'online'
      ? 'Bot desconectado'
      : !c.painel
        ? 'Painel não publicado'
        : c.cargosAprovadores.length === 0 && c.usuariosAprovadores.length === 0
          ? 'Sem aprovadores'
          : 'Pronto'
  const pronto = status === 'Pronto'

  return (
    <div className="animate-rise">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="kicker">Efetivo · Serviço</span>
          <h1 className="display mt-2 text-[clamp(2rem,4vw,2.6rem)]">Bate-ponto</h1>
          <p className="mt-1.5 max-w-xl text-muted">
            Entrada e saída pelo painel do Discord ou pelos canais de voz. As horas só contam depois de <span className="font-semibold text-ink">aprovadas</span> — e sobem sozinhas para o ranking.
          </p>
        </div>
        <span className={cn('inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[11px] font-black uppercase tracking-widest', pronto ? 'border-success/35 bg-success/10 text-success' : 'border-line bg-surface text-muted')}>
          <span className={cn('size-2 rounded-full', pronto ? 'animate-siren bg-success' : 'bg-muted/60')} />
          {status}
        </span>
      </div>

      <Tabs abas={abas} atual={aba} onChange={irPara} />
      <div role="tabpanel" className="mt-6">
        {aba === 'servico' && <EmServico data={data} />}
        {aba === 'ranking' && <Ranking data={data} />}
        {aba === 'aprovacoes' && ver && <Aprovacoes data={data} ponto={ponto} />}
        {aba === 'inatividade' && data.inatividade && <CasosInatividade data={data} />}
        {aba === 'config' && data.admin && <Config data={data} ponto={ponto} />}
      </div>
    </div>
  )
}

/* ---------- Em serviço ---------- */

function Stat({ icon: Icon, label, valor, sub, destaque }: { icon: LucideIcon; label: string; valor: ReactNode; sub?: ReactNode; destaque?: string }) {
  return (
    <div className="rounded-[14px] border border-line bg-surface-2/60 p-4">
      <div className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted">
        <Icon className="size-3.5" style={destaque ? { color: destaque } : undefined} /> {label}
      </div>
      <div className="mt-2 font-display text-2xl tabular-nums tracking-wide">{valor}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  )
}

function EmServico({ data }: { data: PontoEstado }) {
  const agora = useAgora()
  const eu = data.eu
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
      <Card className="overflow-hidden">
        <div className={cn('relative border-b border-line px-6 py-6', eu.aberto ? 'bg-success/[0.06]' : 'bg-surface-2/30')}>
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest">
            <span className={cn('size-2.5 rounded-full', eu.aberto ? 'animate-siren bg-success' : 'bg-muted/50')} />
            <span className={eu.aberto ? 'text-success' : 'text-muted'}>{eu.aberto ? 'Você está em serviço' : 'Fora de serviço'}</span>
          </div>
          <div className="mt-3 font-display text-[clamp(2.4rem,5vw,3.2rem)] leading-none tabular-nums tracking-wide">{eu.aberto ? fmtDur(agora - eu.aberto.entrada) : '—'}</div>
          <p className="mt-2 text-sm text-muted">
            {eu.aberto ? (
              <>
                Ponto <span className="font-semibold text-ink">#{nn(eu.aberto.numero)}</span> batido às {fmtHora(eu.aberto.entrada)} · {ORIGEM[eu.aberto.origem]}
              </>
            ) : (
              'Use o painel “Bate-ponto” no Discord ou entre num canal de serviço.'
            )}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 p-5">
          <Stat icon={Clock} label="Total aprovado" valor={fmtDur(eu.totalMs)} />
          <Stat icon={Trophy} label="No ranking" valor={fmtDur(eu.rankingMs)} sub={eu.posicao ? `${eu.posicao}º lugar` : 'fora do top 20'} destaque={OURO} />
        </div>
        {eu.recentes.length > 0 && (
          <div className="border-t border-line">
            <div className="px-6 pt-4 text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted">Meus últimos pontos{eu.pendentes ? ` · ${eu.pendentes} aguardando` : ''}</div>
            <ul className="divide-y divide-line">
              {eu.recentes.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-6 py-2.5 text-sm">
                  <span className="font-display text-muted tabular-nums">#{nn(p.numero)}</span>
                  <span className="min-w-0 flex-1 truncate text-muted">{fmtDataHora(p.entrada)}</span>
                  <span className="tabular-nums">{fmtDur((p.saida ?? agora) - p.entrada)}</span>
                  <Pill className={STATUS[p.status].cls}>{STATUS[p.status].label}</Pill>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          icon={<Users className="size-4.5" />}
          title={`Efetivo em serviço · ${data.emServico.length}`}
          hint="Quem está com o ponto batido agora. É o mesmo que aparece no painel “Efetivo em serviço” do Discord."
        />
        {data.emServico.length === 0 ? (
          <EmptyState icon={Timer}>Ninguém em serviço neste momento.</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {data.emServico.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3 sm:px-6">
                <span className="relative">
                  <img src={avatarUrl({ id: p.userId, avatar: p.avatar }, 64)} alt="" referrerPolicy="no-referrer" className="size-9 rounded-full" />
                  <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-surface bg-success" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{p.nome}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted">
                    {p.origem === 'voz' ? <Mic className="size-3" /> : <Clock className="size-3" />} desde {fmtHora(p.entrada)} · {ORIGEM[p.origem]}
                  </div>
                </div>
                <span className="shrink-0 font-display text-lg tabular-nums tracking-wide text-success">{fmtDur(agora - p.entrada)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

/* ---------- Ranking ---------- */

function Ranking({ data }: { data: PontoEstado }) {
  const [top3, resto] = [data.ranking.slice(0, 3), data.ranking.slice(3)]
  const podio = [top3[1], top3[0], top3[2]] // 2º · 1º · 3º
  const altura = ['h-24', 'h-32', 'h-20']
  const lugar = [2, 1, 3]
  return (
    <Card>
      <CardHeader
        icon={<Trophy className="size-4.5" />}
        title="Ranking de horas"
        hint={`Top 20 em horas aprovadas desde ${fmtDataHora(data.rankingDesde)}. Zera com /zerar ranking.`}
      />
      {data.ranking.length === 0 ? (
        <EmptyState icon={Trophy}>Nenhuma hora aprovada neste período ainda.</EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-3 items-end gap-3 px-4 pt-8 sm:px-10">
            {podio.map((h, i) =>
              h ? (
                <div key={h.userId} className="flex min-w-0 flex-col items-center text-center">
                  {lugar[i] === 1 && <Crown className="mb-1 size-5" style={{ color: OURO }} />}
                  <img
                    src={avatarUrl({ id: h.userId, avatar: h.avatar }, 128)}
                    alt=""
                    referrerPolicy="no-referrer"
                    className={cn('rounded-full ring-2', lugar[i] === 1 ? 'size-16 ring-[#f1c40f]' : 'size-12 ring-line-strong')}
                  />
                  <div className="mt-2 w-full truncate text-sm font-semibold">{h.nome}</div>
                  <div className="font-display text-lg tabular-nums" style={lugar[i] === 1 ? { color: OURO } : undefined}>
                    {fmtDur(h.rankingMs)}
                  </div>
                  <div
                    className={cn('mt-2 grid w-full place-items-center rounded-t-[12px] border border-b-0 font-display text-3xl', altura[i])}
                    style={{
                      borderColor: lugar[i] === 1 ? `${OURO}66` : 'var(--color-line)',
                      background: lugar[i] === 1 ? `linear-gradient(${OURO}26, transparent)` : 'linear-gradient(rgb(245 245 245 / .05), transparent)',
                      color: lugar[i] === 1 ? OURO : 'var(--color-muted)',
                    }}
                  >
                    {lugar[i]}º
                  </div>
                </div>
              ) : (
                <div key={i} />
              ),
            )}
          </div>
          {resto.length > 0 && (
            <ol className="divide-y divide-line border-t border-line">
              {resto.map((h, i) => (
                <li key={h.userId} className="flex items-center gap-3 px-4 py-3 sm:px-6">
                  <span className="w-8 font-display text-lg text-muted tabular-nums">{String(i + 4).padStart(2, '0')}</span>
                  <img src={avatarUrl({ id: h.userId, avatar: h.avatar }, 64)} alt="" referrerPolicy="no-referrer" className="size-8 rounded-full" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{h.nome}</span>
                  <span className="text-xs text-muted tabular-nums">{h.pontos} pontos</span>
                  <span className="w-24 text-right font-display tabular-nums">{fmtDur(h.rankingMs)}</span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </Card>
  )
}

/* ---------- Aprovações ---------- */

function Aprovacoes({ data, ponto }: { data: PontoEstado; ponto: PontoApi }) {
  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader
          icon={<BadgeCheck className="size-4.5" />}
          title={`Aguardando aprovação · ${data.pendentes.length}`}
          hint="Cada ponto também tem um canal temporário no Discord, só para os aprovadores. Decidir aqui ou lá dá no mesmo."
        />
        {!data.aprovador && data.pendentes.length > 0 && (
          <p className="flex items-center gap-2 border-b border-line px-6 py-3 text-xs text-muted">
            <Info className="size-3.5" /> Você só visualiza: aprovar e reprovar é dos aprovadores (cargos ou pessoas escolhidas em Configurações).
          </p>
        )}
        {data.pendentes.length === 0 ? (
          <EmptyState icon={CheckCircle2}>Nada aguardando aprovação.</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {data.pendentes.map((p) => (
              <Pendente key={p.id} p={p} podeDecidir={data.aprovador} proprio={p.userId === data.meuId} ponto={ponto} />
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader icon={<History className="size-4.5" />} title="Histórico" hint="Últimos 100 pontos decididos ou descartados." />
        {data.historico.length === 0 ? (
          <EmptyState icon={History}>Nenhum ponto encerrado ainda.</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {data.historico.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3 sm:px-6">
                <img src={avatarUrl({ id: p.userId, avatar: p.avatar }, 64)} alt="" referrerPolicy="no-referrer" className="size-8 rounded-full" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-display tracking-wide text-muted">#{nn(p.numero)}</span>
                    <span className="truncate font-semibold">{p.nome}</span>
                    <Pill className={STATUS[p.status].cls}>{STATUS[p.status].label}</Pill>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted">
                    {fmtDataHora(p.entrada)} → {p.saida ? fmtHora(p.saida) : '—'} · {ORIGEM[p.origem]}
                    {p.decisao && ` · por ${p.decisao.por.nome}`}
                    {p.decisao?.motivo && ` · ${p.decisao.motivo}`}
                    {!p.decisao && p.observacao && ` · ${p.observacao}`}
                  </div>
                </div>
                <span className="shrink-0 font-display tabular-nums">{p.saida ? fmtDur(p.saida - p.entrada) : '—'}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function Pendente({ p, podeDecidir, proprio, ponto }: { p: PontoT; podeDecidir: boolean; proprio: boolean; ponto: PontoApi }) {
  const [reprovando, setReprovando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState<'ok' | 'no' | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const dur = p.saida ? p.saida - p.entrada : 0

  async function decidir(aprovar: boolean) {
    setEnviando(aprovar ? 'ok' : 'no')
    setErro(null)
    try {
      await ponto.decidir(p.id, aprovar, aprovar ? null : motivo.trim() || null)
    } catch (err) {
      setErro(erroPonto(err))
      setEnviando(null)
    }
  }

  return (
    <li className="px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <img src={avatarUrl({ id: p.userId, avatar: p.avatar }, 64)} alt="" referrerPolicy="no-referrer" className="size-10 rounded-full" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-display tracking-wide text-muted">#{nn(p.numero)}</span>
            <span className="truncate font-semibold">{p.nome}</span>
            {p.ajuste && <Pill className="border-primary/35 bg-primary/10 text-primary-2">Ajustado</Pill>}
          </div>
          <div className="mt-0.5 text-xs text-muted">
            {fmtDataHora(p.entrada)} → {p.saida ? fmtHora(p.saida) : '—'} · {ORIGEM[p.origem]} · encerrado {p.saida ? fmtRelativo(p.saida) : ''}
          </div>
        </div>
        <span className="font-display text-2xl tabular-nums tracking-wide text-[#f59e0b]">{fmtDur(dur)}</span>
        {podeDecidir && proprio && (
          <span className="rounded-full border border-line bg-surface-2 px-3 py-1.5 text-xs text-muted" title="Ninguém aprova ou reprova o próprio ponto">
            Seu ponto · outro aprovador decide
          </span>
        )}
        {podeDecidir && !proprio && !reprovando && (
          <div className="flex gap-2">
            <Button size="sm" variant="success" loading={enviando === 'ok'} disabled={enviando !== null} onClick={() => decidir(true)}>
              {enviando !== 'ok' && <CheckCircle2 className="size-3.5" />} Aprovar
            </Button>
            <Button size="sm" variant="danger" disabled={enviando !== null} onClick={() => setReprovando(true)}>
              <XCircle className="size-3.5" /> Reprovar
            </Button>
          </div>
        )}
      </div>
      {reprovando && (
        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:pl-13">
          <Input aria-label="Motivo da reprovação" placeholder="Motivo (opcional) — vai por DM para o policial" maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
          <Button size="sm" variant="danger" loading={enviando === 'no'} disabled={enviando !== null} onClick={() => decidir(false)}>
            Confirmar reprovação
          </Button>
          <Button size="sm" variant="ghost" disabled={enviando !== null} onClick={() => setReprovando(false)}>
            Voltar
          </Button>
        </div>
      )}
      {erro && <p className="mt-2 text-xs text-danger sm:pl-13">{erro}</p>}
    </li>
  )
}

/* ---------- Configurações ---------- */

function toInput(d: PontoEstado): PontoInput {
  const { cargosBater, cargosAprovadores, usuariosAprovadores, cargosGestao, canaisVoz, minimoMinutos, categoriaId, canalLogId, lembreteAssuncao } = d.config
  const { ativadoEm: _ativadoEm, ...inatividade } = d.config.inatividade
  return structuredClone({ cargosBater, cargosAprovadores, usuariosAprovadores, cargosGestao, canaisVoz, minimoMinutos, categoriaId, canalLogId, lembreteAssuncao, inatividade })
}

function Config({ data, ponto }: { data: PontoEstado; ponto: PontoApi }) {
  const original = useMemo(() => toInput(data), [data])
  const [draft, setDraft] = useState(original)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = JSON.stringify(draft) !== JSON.stringify(original)
  const patch = (p: Partial<PontoInput>) => {
    setDraft((d) => ({ ...d, ...p }))
    setSaved(false)
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await ponto.salvarConfig(draft)
      setSaved(true)
    } catch (err) {
      setError(erroPonto(err))
    } finally {
      setSaving(false)
    }
  }

  const voz = data.canais.filter((c) => c.tipo === 'voz' || c.tipo === 'palco')
  const texto = data.canais.filter((c) => c.tipo === 'texto' || c.tipo === 'anuncios')

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader icon={<MessageSquareShare className="size-4.5" />} title="Painéis no Discord" hint="Publique cada mensagem no canal certo. Elas se atualizam sozinhas depois." />
        <div className="grid gap-4 p-6">
          <BotStatus botAtivo={data.botAtivo} gateway={data.gateway} />
          <div className="grid gap-3 lg:grid-cols-3">
            <Publicar tipo="painel" icon={Clock} titulo="Bate-ponto" desc="Botões Entrar em serviço · Sair de serviço · Minhas horas." data={data} ponto={ponto} canais={texto} salvo={!dirty} />
            <Publicar tipo="painelServico" icon={Users} titulo="Efetivo em serviço" desc="Lista ao vivo de quem está com o ponto batido." data={data} ponto={ponto} canais={texto} salvo={!dirty} />
            <Publicar tipo="ranking" icon={Trophy} titulo="Ranking de horas" desc="Top 20 em horas aprovadas, atualizado a cada aprovação." data={data} ponto={ponto} canais={texto} salvo={!dirty} />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          icon={<UserRound className="size-4.5" />}
          title="Quem bate ponto"
          hint={draft.cargosBater.length ? "Só quem tem um destes cargos entra em serviço, pelo botão ou pelo canal de voz." : "Nenhum cargo escolhido: vale quem tem o set aprovado no Pedir Set."}
          action={<span className="text-[11px] font-extrabold uppercase tracking-widest text-muted">{draft.cargosBater.length} de 25</span>}
        />
        <div className="p-5">
          <CargoPicker id="pt-bater" cargos={data.cargos} selecionados={draft.cargosBater} onChange={(cargosBater) => patch({ cargosBater })} max={25} />
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            icon={<ShieldCheck className="size-4.5" />}
            title="Aprovadores de horas"
            hint="Por cargo, por pessoa ou os dois. Veem os canais de aprovação e decidem, no Discord ou aqui. Ninguém aprova o próprio ponto."
            action={<span className="text-[11px] font-extrabold uppercase tracking-widest text-muted">{draft.cargosAprovadores.length + draft.usuariosAprovadores.length}</span>}
          />
          <div className="grid gap-5 p-5">
            <div className="grid gap-2">
              <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted">Cargos · {draft.cargosAprovadores.length} de 25</span>
              <CargoPicker id="pt-aprov" cargos={data.cargos} selecionados={draft.cargosAprovadores} onChange={(cargosAprovadores) => patch({ cargosAprovadores })} max={25} />
            </div>
            <div className="grid gap-2 border-t border-line pt-5">
              <label htmlFor="pt-aprov-pessoas" className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted">
                Pessoas · {draft.usuariosAprovadores.length} de 25
              </label>
              <PessoaPicker id="pt-aprov-pessoas" selecionados={draft.usuariosAprovadores} conhecidos={data.aprovadoresInfo} onChange={(usuariosAprovadores) => patch({ usuariosAprovadores })} buscar={buscarMembros} />
              <p className="text-xs text-muted">Aprovam mesmo sem ter um dos cargos acima.</p>
            </div>
          </div>
        </Card>
        <CargosCard
          id="pt-gestao"
          icon={<KeyRound className="size-4.5" />}
          titulo="Gestão do ponto"
          hint="Usam /zerar ranking, /zerar horas e /ajuste ponto."
          data={data}
          valor={draft.cargosGestao}
          onChange={(cargosGestao) => patch({ cargosGestao })}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            icon={<Mic className="size-4.5" />}
            title="Ponto automático por voz"
            hint="Entrar num destes canais bate o ponto; sair de todos fecha e envia para aprovação."
            action={<span className="text-[11px] font-extrabold uppercase tracking-widest text-muted">{draft.canaisVoz.length} de 25</span>}
          />
          <div className="p-6">
            <CanaisVozPicker canais={voz} selecionados={draft.canaisVoz} onChange={(canaisVoz) => patch({ canaisVoz })} />
          </div>
        </Card>

        <Card>
          <CardHeader icon={<ScrollText className="size-4.5" />} title="Regras e canais" hint="Mínimo para ir à aprovação, onde abrem os canais temporários e o registro." />
          <div className="grid gap-5 p-6">
            <Field label="Tempo mínimo de serviço" htmlFor="pt-min" hint={draft.minimoMinutos > 0 ? `Pontos com menos de ${fmtDur(draft.minimoMinutos * 60_000)} são descartados (não vão para aprovação).` : 'Sem mínimo: todo ponto vai para aprovação.'}>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <Input id="pt-min" type="number" min={0} max={720} step={5} value={draft.minimoMinutos} onChange={(e) => patch({ minimoMinutos: Math.max(0, Math.min(720, Math.round(Number(e.target.value) || 0))) })} />
                <span className="text-sm text-muted">minutos</span>
              </div>
            </Field>
            <Field label="Categoria dos canais temporários" htmlFor="pt-cat" hint="Canais de aprovação (só aprovadores) e de ajuste (gestão + policial).">
              <Select id="pt-cat" value={draft.categoriaId ?? ''} onChange={(e) => patch({ categoriaId: e.target.value || null })} disabled={data.categorias.length === 0}>
                <option value="">Sem categoria (topo da lista)</option>
                {data.categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Canal de registro" htmlFor="pt-log" hint="Aprovações, reprovações, ajustes e zeramentos.">
              <CanalSelect id="pt-log" canais={texto} value={draft.canalLogId} onChange={(canalLogId) => patch({ canalLogId })} vazio="Sem registro" />
            </Field>
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] xl:items-start">
        <ConfigLembrete data={data} draft={draft} patch={patch} />
        <ConfigInatividade data={data} draft={draft} patch={patch} canaisTexto={texto} />
      </div>

      <p className="flex items-start gap-2 rounded-xl border border-line bg-surface-2/50 px-4 py-3 text-xs text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <span>
          <span className="font-semibold text-ink">/zerar</span> e <span className="font-semibold text-ink">/ajuste</span> nascem escondidos: libere os cargos da gestão em Configurações do servidor → Integrações → PMERJ. O bot confere o cargo de novo a cada uso. O ponto por voz exige o bot com permissão de <span className="font-semibold text-ink">ver</span> esses canais.
        </span>
      </p>

      <SaveBar dirty={dirty} saved={saved} saving={saving} error={error} onSave={save} onDiscard={() => { setDraft(original); setError(null) }} />
    </div>
  )
}

function CargosCard({ id, icon, titulo, hint, data, valor, onChange }: { id: string; icon: ReactNode; titulo: string; hint: string; data: PontoEstado; valor: string[]; onChange: (v: string[]) => void }) {
  return (
    <Card>
      <CardHeader icon={icon} title={titulo} hint={hint} action={<span className="text-[11px] font-extrabold uppercase tracking-widest text-muted">{valor.length}</span>} />
      <div className="p-5">
        <CargoPicker id={id} cargos={data.cargos} selecionados={valor} onChange={onChange} max={25} />
      </div>
    </Card>
  )
}

function CanaisVozPicker({ canais, selecionados, onChange }: { canais: CanalTexto[]; selecionados: string[]; onChange: (ids: string[]) => void }) {
  if (canais.length === 0) return <p className="rounded-xl border border-line px-4 py-6 text-center text-xs text-muted">Nenhum canal de voz encontrado. Confira se o bot está conectado.</p>
  const grupos = new Map<string, CanalTexto[]>()
  for (const c of canais) grupos.set(c.categoria ?? 'Sem categoria', [...(grupos.get(c.categoria ?? 'Sem categoria') ?? []), c])
  const cheio = selecionados.length >= 25
  const toggle = (id: string) => onChange(selecionados.includes(id) ? selecionados.filter((x) => x !== id) : [...selecionados, id])
  return (
    <div className="grid max-h-80 gap-3 overflow-y-auto overscroll-contain rounded-xl border border-line p-2">
      {[...grupos].map(([cat, lista]) => (
        <div key={cat}>
          <div className="flex items-center gap-1.5 px-2 pb-1 pt-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted">
            <FolderTree className="size-3" /> {cat}
          </div>
          <ul className="grid gap-1 sm:grid-cols-2">
            {lista.map((c) => {
              const on = selecionados.includes(c.id)
              return (
                <li key={c.id}>
                  <label className={cn('flex items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-sm transition', on ? 'bg-primary/10' : 'hover:bg-white/4', !on && cheio ? 'cursor-not-allowed opacity-40' : 'cursor-pointer')}>
                    <input type="checkbox" checked={on} disabled={!on && cheio} onChange={() => toggle(c.id)} className="size-4 accent-primary" />
                    <Mic className={cn('size-3.5 shrink-0', on ? 'text-primary' : 'text-muted')} />
                    <span className={cn('truncate', on ? 'font-semibold text-ink' : 'text-ink/85')}>{c.nome}</span>
                  </label>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}

function Publicar({ tipo, icon: Icon, titulo, desc, data, ponto, canais, salvo }: { tipo: TipoPainel; icon: LucideIcon; titulo: string; desc: string; data: PontoEstado; ponto: PontoApi; canais: CanalTexto[]; salvo: boolean }) {
  const atual = data.config[tipo]
  const [canalId, setCanalId] = useState<string | null>(atual?.canalId ?? null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const mesmo = atual?.canalId === canalId

  async function publicar() {
    if (!canalId) return
    setSending(true)
    setError(null)
    setOk(false)
    try {
      await ponto.publicar(tipo, canalId)
      setOk(true)
    } catch (err) {
      setError(erroPonto(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="grid content-between gap-4 rounded-[14px] border border-line bg-surface-2/40 p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-primary/25 bg-primary/10 text-primary">
          <Icon className="size-4.5" />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-bold">{titulo}</h3>
            {atual && <Pill className="border-success/35 bg-success/10 text-success">Publicado</Pill>}
          </div>
          <p className="mt-0.5 text-xs text-muted">{desc}</p>
        </div>
      </div>
      <div className="grid gap-2">
        <CanalSelect id={`pt-pub-${tipo}`} canais={canais} value={canalId} onChange={setCanalId} vazio="Escolha o canal…" disabled={!data.botAtivo} />
        <Button onClick={publicar} loading={sending} disabled={!canalId || !data.botAtivo || !salvo}>
          {!sending && <Send className="size-4" />} {mesmo ? 'Atualizar mensagem' : 'Publicar no canal'}
        </Button>
        {error ? <p className="text-xs text-danger">{error}</p> : <p className={cn('text-xs', ok ? 'font-semibold text-success' : 'text-muted')}>{ok ? 'Pronto! Confira no canal.' : !salvo ? 'Salve as alterações antes.' : ' '}</p>}
      </div>
    </div>
  )
}
