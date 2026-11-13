import { ArrowDown, ArrowUp, CalendarClock, Gavel, Info, KeyRound, Loader2, Lock, Megaphone, MessageSquareShare, Plus, ScrollText, Send, Settings2, Trash2, TriangleAlert } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { BotStatus } from '@/components/discord/BotStatus'
import { CanalSelect } from '@/components/discord/CanalSelect'
import { CargoPicker } from '@/components/discord/CargoPicker'
import { EmptyState } from '@/components/EmptyState'
import { Button, Card, CardHeader, Field, Input, Pill, Select } from '@/components/form'
import { SaveBar } from '@/components/SaveBar'
import { Tabs, useAba, type Aba } from '@/components/Tabs'
import { Alert } from '@/components/ui'
import { avatarUrl } from '@/lib/api'
import { cn } from '@/lib/cn'
import { erroDisciplina, useDisciplina, type DisciplinaApi, type DisciplinaEstado, type DisciplinaInput, type NivelAdvertencia } from '@/lib/disciplina'
import { fmtDataHora, fmtRelativo } from '@/lib/format'

type Id = 'registros' | 'reunioes' | 'config'
const nn = (n: number) => String(n).padStart(4, '0')

const TIPO = {
  advertencia: { label: 'Advertência', cls: 'border-[#f59e0b]/40 bg-[#f59e0b]/10 text-[#f59e0b]' },
  advertencia_removida: { label: 'Advertência removida', cls: 'border-success/35 bg-success/10 text-success' },
  exoneracao: { label: 'Exoneração', cls: 'border-danger/40 bg-danger/10 text-danger' },
} as const

const STATUS_REUNIAO = {
  aguardando: { label: 'Aguardando', cls: 'border-[#f59e0b]/40 bg-[#f59e0b]/10 text-[#f59e0b]' },
  iniciada: { label: 'Iniciada', cls: 'border-success/35 bg-success/10 text-success' },
  encerrada: { label: 'Encerrada', cls: 'border-line-strong bg-surface-2 text-muted' },
} as const

/** Painel → Disciplina: gestão disciplinar da corregedoria (reuniões, advertências, exonerações). */
export function Disciplina() {
  const disc = useDisciplina()
  const { data } = disc
  const ver = Boolean(data && (data.admin || data.gestao))
  const abas: Aba<Id>[] = [
    ...(ver ? [{ id: 'registros' as const, label: 'Medidas', icon: Gavel }, { id: 'reunioes' as const, label: 'Reuniões', icon: CalendarClock }] : []),
    ...(data?.admin ? [{ id: 'config' as const, label: 'Configurações', icon: Settings2 }] : []),
  ]
  const [aba, irPara] = useAba(abas.length ? abas : [{ id: 'registros', label: '', icon: Gavel }])

  if (!data) {
    return disc.loadError ? (
      <div className="mx-auto max-w-md">
        <Alert>{disc.loadError}</Alert>
      </div>
    ) : (
      <div className="grid min-h-[50vh] place-items-center" aria-busy="true">
        <Loader2 className="size-7 animate-spin text-primary" aria-label="Carregando" />
      </div>
    )
  }

  const pronto = data.gateway.estado === 'online' && data.config.cargosGestao.length > 0 && Boolean(data.config.painel)

  return (
    <div className="animate-rise">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="kicker">Efetivo · Corregedoria</span>
          <h1 className="display mt-2 text-[clamp(2rem,4vw,2.6rem)]">Disciplina</h1>
          <p className="mt-1.5 max-w-xl text-muted">
            Reuniões, advertências, rebaixamentos e exonerações — tudo por <span className="font-semibold text-ink">cargo</span>, registrado no /perfil e anunciado nos canais configurados.
          </p>
        </div>
        <span className={cn('inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[11px] font-black uppercase tracking-widest', pronto ? 'border-success/35 bg-success/10 text-success' : 'border-line bg-surface text-muted')}>
          <span className={cn('size-2 rounded-full', pronto ? 'animate-siren bg-success' : 'bg-muted/60')} />
          {data.gateway.estado !== 'online' ? 'Bot desconectado' : data.config.cargosGestao.length === 0 ? 'Sem cargos de gestão' : !data.config.painel ? 'Painel não publicado' : 'Pronto'}
        </span>
      </div>

      {abas.length === 0 ? (
        <Card className="mt-8">
          <EmptyState icon={Lock}>Somente a gestão da corregedoria e a administração acessam esta área.</EmptyState>
        </Card>
      ) : (
        <>
          <Tabs abas={abas} atual={aba} onChange={irPara} />
          <div role="tabpanel" className="mt-6">
            {aba === 'registros' && ver && <Registros data={data} />}
            {aba === 'reunioes' && ver && <Reunioes data={data} />}
            {aba === 'config' && data.admin && <Config data={data} disc={disc} />}
          </div>
        </>
      )}
    </div>
  )
}

function Registros({ data }: { data: DisciplinaEstado }) {
  return (
    <Card>
      <CardHeader icon={<Gavel className="size-4.5" />} title="Medidas aplicadas" hint="Últimas 100. Rebaixamentos aparecem em Promoções." />
      {data.registros.length === 0 ? (
        <EmptyState icon={Gavel}>Nenhuma medida aplicada ainda.</EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {data.registros.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3 sm:px-6">
              <img src={avatarUrl({ id: r.userId, avatar: r.avatar }, 64)} alt="" referrerPolicy="no-referrer" className="size-9 rounded-full" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="truncate font-semibold">{r.nome}</span>
                  <Pill className={TIPO[r.tipo].cls}>{TIPO[r.tipo].label}{r.nivel ? ` · ${r.nivel.nome}` : ''}</Pill>
                  {!r.ok && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#f59e0b]">
                      <TriangleAlert className="size-3" /> {r.tipo === 'exoneracao' ? 'expulsão recusada' : 'cargo não trocado'}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 truncate text-xs text-muted">
                  @{r.username} · por {r.por.nome}
                  {r.motivo && ` · ${r.motivo}`}
                </div>
              </div>
              <span className="shrink-0 text-xs text-muted tabular-nums" title={fmtDataHora(r.em)}>
                {fmtRelativo(r.em)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Reunioes({ data }: { data: DisciplinaEstado }) {
  return (
    <Card>
      <CardHeader icon={<CalendarClock className="size-4.5" />} title="Reuniões" hint="Canais temporários com o convocado. Sem transcript: ao fechar, o canal é apagado." />
      {data.reunioes.length === 0 ? (
        <EmptyState icon={CalendarClock}>Nenhuma reunião ainda.</EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {data.reunioes.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3 sm:px-6">
              <img src={avatarUrl({ id: r.userId, avatar: r.avatar }, 64)} alt="" referrerPolicy="no-referrer" className="size-9 rounded-full" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-display tracking-wide text-muted">#{nn(r.numero)}</span>
                  <span className="truncate font-semibold">{r.nome}</span>
                  <Pill className={STATUS_REUNIAO[r.status].cls}>{STATUS_REUNIAO[r.status].label}</Pill>
                </div>
                <div className="mt-0.5 truncate text-xs text-muted">
                  Convocado por {r.abertaPor.nome}
                  {r.motivo && ` · ${r.motivo}`}
                </div>
              </div>
              <span className="shrink-0 text-xs text-muted tabular-nums" title={fmtDataHora(r.criadaEm)}>
                {fmtRelativo(r.criadaEm)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/* ---------- Configurações ---------- */

function toInput(d: DisciplinaEstado): DisciplinaInput {
  const { cargosGestao, categoriaId, niveis, canalAdvertenciaId, canalExoneracaoId } = d.config
  return structuredClone({ cargosGestao, categoriaId, niveis, canalAdvertenciaId, canalExoneracaoId })
}

function Config({ data, disc }: { data: DisciplinaEstado; disc: DisciplinaApi }) {
  const original = useMemo(() => toInput(data), [data])
  const [draft, setDraft] = useState(original)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = JSON.stringify(draft) !== JSON.stringify(original)
  const patch = (p: Partial<DisciplinaInput>) => {
    setDraft((d) => ({ ...d, ...p }))
    setSaved(false)
  }
  const setNivel = (i: number, p: Partial<NivelAdvertencia>) => patch({ niveis: draft.niveis.map((n, j) => (j === i ? { ...n, ...p } : n)) })
  const mover = (i: number, d: -1 | 1) => {
    const l = [...draft.niveis]
    const [x] = l.splice(i, 1)
    if (x) l.splice(i + d, 0, x)
    patch({ niveis: l })
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await disc.salvarConfig(draft)
      setSaved(true)
    } catch (err) {
      setError(erroDisciplina(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-5">
      <PainelDiscord data={data} disc={disc} salvo={!dirty} />

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            icon={<KeyRound className="size-4.5" />}
            title="Gestão da corregedoria"
            hint="Usam o painel, convocam reuniões, aplicam medidas e falam como a corregedoria nos canais de reunião."
            action={<span className="text-[11px] font-extrabold uppercase tracking-widest text-muted">{draft.cargosGestao.length} de 25</span>}
          />
          <div className="p-6">
            <CargoPicker id="dc-gestao" cargos={data.cargos} selecionados={draft.cargosGestao} onChange={(cargosGestao) => patch({ cargosGestao })} max={25} />
          </div>
        </Card>

        <Card>
          <CardHeader icon={<Megaphone className="size-4.5" />} title="Canais" hint="Onde as reuniões abrem e onde cada medida é anunciada." />
          <div className="grid gap-5 p-6">
            <Field label="Categoria das reuniões" htmlFor="dc-cat">
              <Select id="dc-cat" value={draft.categoriaId ?? ''} onChange={(e) => patch({ categoriaId: e.target.value || null })} disabled={data.categorias.length === 0}>
                <option value="">Sem categoria (topo da lista)</option>
                {data.categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Anúncio de advertências" htmlFor="dc-adv">
              <CanalSelect id="dc-adv" canais={data.canais} value={draft.canalAdvertenciaId} onChange={(canalAdvertenciaId) => patch({ canalAdvertenciaId })} vazio="Sem anúncio" />
            </Field>
            <Field label="Anúncio de exonerações" htmlFor="dc-exo">
              <CanalSelect id="dc-exo" canais={data.canais} value={draft.canalExoneracaoId} onChange={(canalExoneracaoId) => patch({ canalExoneracaoId })} vazio="Sem anúncio" />
            </Field>
            <p className="text-xs text-muted">
              Rebaixamentos usam o canal e as regras de{' '}
              <Link to="/painel/promocoes?aba=config" className="font-semibold text-primary-2 hover:underline">
                Promoções → Rebaixamento
              </Link>
              .
            </p>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          icon={<ScrollText className="size-4.5" />}
          title={`Níveis de advertência · ${draft.niveis.length}`}
          hint="Cada nível é um cargo. Aplicar um nível dá o cargo dele e tira os dos outros níveis; remover tira todos."
          action={
            <Button size="sm" variant="ghost" disabled={draft.niveis.length >= 10} onClick={() => patch({ niveis: [...draft.niveis, { id: `adv-${crypto.randomUUID().slice(0, 6)}`, nome: `Advertência ${draft.niveis.length + 1}`, cargoId: null }] })}>
              <Plus className="size-3.5" /> Adicionar
            </Button>
          }
        />
        <ol className="divide-y divide-line">
          {draft.niveis.map((n, i) => (
            <li key={n.id} className="grid items-center gap-3 px-6 py-3 sm:grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1.2fr)_auto]">
              <span className="font-display text-lg text-[#f59e0b] tabular-nums">{String(i + 1).padStart(2, '0')}</span>
              <Input aria-label={`Nome do nível ${i + 1}`} value={n.nome} maxLength={40} aria-invalid={n.nome.trim().length < 2} onChange={(e) => setNivel(i, { nome: e.target.value })} />
              <Select aria-label={`Cargo do nível ${n.nome}`} value={n.cargoId ?? ''} onChange={(e) => setNivel(i, { cargoId: e.target.value || null })}>
                <option value="">Nenhum cargo</option>
                {data.cargos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Select>
              <div className="flex">
                <IconBtn label="Subir" disabled={i === 0} onClick={() => mover(i, -1)}>
                  <ArrowUp className="size-4" />
                </IconBtn>
                <IconBtn label="Descer" disabled={i === draft.niveis.length - 1} onClick={() => mover(i, 1)}>
                  <ArrowDown className="size-4" />
                </IconBtn>
                <IconBtn label="Remover" danger disabled={draft.niveis.length <= 1} onClick={() => patch({ niveis: draft.niveis.filter((_, j) => j !== i) })}>
                  <Trash2 className="size-4" />
                </IconBtn>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <p className="flex items-start gap-2 rounded-xl border border-line bg-surface-2/50 px-4 py-3 text-xs text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <span>
          O cargo do bot precisa ficar <span className="font-semibold text-ink">acima</span> dos cargos de advertência, das patentes e de quem pode ser exonerado. Nas reuniões, a gestão fala como <span className="font-semibold text-ink">a corregedoria</span> (mesmo nome de exibição dos tickets).
        </span>
      </p>

      <SaveBar dirty={dirty} saved={saved} saving={saving} error={error} onSave={save} onDiscard={() => { setDraft(original); setError(null) }} />
    </div>
  )
}

function PainelDiscord({ data, disc, salvo }: { data: DisciplinaEstado; disc: DisciplinaApi; salvo: boolean }) {
  const [canalId, setCanalId] = useState<string | null>(data.config.painel?.canalId ?? null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const mesmo = data.config.painel?.canalId === canalId

  async function publicar() {
    if (!canalId) return
    setSending(true)
    setError(null)
    setOk(false)
    try {
      await disc.publicarPainel(canalId)
      setOk(true)
    } catch (err) {
      setError(erroDisciplina(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <Card>
      <CardHeader icon={<MessageSquareShare className="size-4.5" />} title="Painel no Discord" hint="Botões Chamar para reunião · Advertência · Exoneração. Publique num canal da corregedoria." />
      <div className="grid gap-4 p-6">
        <BotStatus botAtivo={data.botAtivo} gateway={data.gateway} />
        {error && <Alert>{error}</Alert>}
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <Field label="Canal do painel" htmlFor="dc-painel">
            <CanalSelect id="dc-painel" canais={data.canais} value={canalId} onChange={setCanalId} vazio="Escolha o canal…" disabled={!data.botAtivo} />
          </Field>
          <Button onClick={publicar} loading={sending} disabled={!canalId || !data.botAtivo || !salvo} className="h-11">
            {!sending && <Send className="size-4" />} {mesmo ? 'Atualizar mensagem' : 'Publicar no canal'}
          </Button>
        </div>
        <p className={cn('text-xs', ok ? 'font-semibold text-success' : 'text-muted')}>
          {ok ? 'Pronto! Confira a mensagem no canal.' : !salvo ? 'Salve as alterações antes de publicar.' : 'Só os cargos de gestão conseguem usar os botões, mesmo que outras pessoas vejam o painel.'}
        </p>
      </div>
    </Card>
  )
}

function IconBtn({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn('grid size-9 place-items-center rounded-[9px] text-muted transition disabled:pointer-events-none disabled:opacity-25', danger ? 'hover:bg-danger/10 hover:text-danger' : 'hover:bg-white/5 hover:text-ink')}
    >
      {children}
    </button>
  )
}
