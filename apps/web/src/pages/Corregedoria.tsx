import { ArrowDown, ArrowUp, ExternalLink, FileText, FolderOpen, Info, KeyRound, ListChecks, Loader2, Lock, MessageSquareShare, Plus, Send, Settings2, ShieldCheck, Trash2, UserX } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
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
import { erroCorregedoria, useCorregedoria, type CorregedoriaApi, type CorregedoriaEstado, type CorregedoriaInput, type TipoTicket } from '@/lib/corregedoria'
import { fmtDataHora, fmtRelativo } from '@/lib/format'

type Id = 'tickets' | 'config'
const nn = (n: number) => String(n).padStart(4, '0')

/** Painel → Corregedoria: tickets e configuração. */
export function Corregedoria() {
  const correg = useCorregedoria()
  const { data } = correg
  const ver = Boolean(data && (data.admin || data.equipe))
  const abas: Aba<Id>[] = [
    ...(ver ? [{ id: 'tickets' as const, label: 'Tickets', icon: FolderOpen, count: data?.abertos }] : []),
    ...(data?.admin ? [{ id: 'config' as const, label: 'Configurações', icon: Settings2 }] : []),
  ]
  const [aba, irPara] = useAba(abas.length ? abas : [{ id: 'tickets', label: '', icon: FolderOpen }])

  if (!data) {
    return correg.loadError ? (
      <div className="mx-auto max-w-md">
        <Alert>{correg.loadError}</Alert>
      </div>
    ) : (
      <div className="grid min-h-[50vh] place-items-center" aria-busy="true">
        <Loader2 className="size-7 animate-spin text-primary" aria-label="Carregando" />
      </div>
    )
  }

  const pronto = data.gateway.estado === 'online' && data.config.cargosCorregedoria.length > 0 && Boolean(data.config.painel)

  return (
    <div className="animate-rise">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="kicker">Efetivo</span>
          <h1 className="display mt-2 text-[clamp(2rem,4vw,2.6rem)]">Corregedoria</h1>
          <p className="mt-1.5 max-w-xl text-muted">
            Denúncias por ticket em canal privado. A equipe responde como <span className="font-semibold text-ink">{data.config.nomeExibicao}</span>, sem nunca revelar quem atendeu.
          </p>
        </div>
        <span className={cn('inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[11px] font-black uppercase tracking-widest', pronto ? 'border-success/35 bg-success/10 text-success' : 'border-line bg-surface text-muted')}>
          <span className={cn('size-2 rounded-full', pronto ? 'animate-siren bg-success' : 'bg-muted/60')} />
          {data.gateway.estado !== 'online' ? 'Bot desconectado' : data.config.cargosCorregedoria.length === 0 ? 'Sem equipe configurada' : !data.config.painel ? 'Painel não publicado' : `${data.abertos} ${data.abertos === 1 ? 'ticket aberto' : 'tickets abertos'}`}
        </span>
      </div>

      {abas.length === 0 ? (
        <Card className="mt-8">
          <EmptyState icon={Lock}>Somente a equipe da corregedoria e a administração acessam esta área.</EmptyState>
        </Card>
      ) : (
        <>
          <Tabs abas={abas} atual={aba} onChange={irPara} />
          <div role="tabpanel" className="mt-6">
            {aba === 'tickets' && ver && <Tickets data={data} />}
            {aba === 'config' && data.admin && <Config data={data} correg={correg} />}
          </div>
        </>
      )}
    </div>
  )
}

/* ---------- Tickets ---------- */

function Tickets({ data }: { data: CorregedoriaEstado }) {
  return (
    <Card>
      <CardHeader icon={<FolderOpen className="size-4.5" />} title="Tickets" hint="Últimos 100. Abertos primeiro na lista do Discord; aqui você vê todos e o transcript dos fechados." />
      {data.tickets.length === 0 ? (
        <EmptyState icon={ShieldCheck}>Nenhum ticket ainda. Eles são abertos pelo painel da corregedoria no Discord.</EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {data.tickets.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-4 py-3 sm:px-6">
              <img src={avatarUrl({ id: t.userId, avatar: t.avatar }, 64)} alt="" referrerPolicy="no-referrer" className="size-9 rounded-full" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-display tracking-wide text-muted">#{nn(t.numero)}</span>
                  <span className="truncate font-semibold">{t.assunto}</span>
                  <Pill className={t.status === 'aberto' ? 'border-success/35 bg-success/10 text-success' : 'border-line-strong bg-surface-2 text-muted'}>{t.status === 'aberto' ? (t.assumido ? 'Em atendimento' : 'Aguardando') : 'Fechado'}</Pill>
                </div>
                <div className="mt-0.5 truncate text-xs text-muted">
                  {t.tipo.emoji} {t.tipo.nome} · {t.insignia ? `${t.insignia} ` : ''}
                  {t.nome} · {t.provas} {t.provas === 1 ? 'prova' : 'provas'}
                  {t.agente && <span className="text-ink/70"> · agente: {t.agente}</span>}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-xs text-muted tabular-nums" title={fmtDataHora(t.abertoEm)}>
                  {fmtRelativo(t.abertoEm)}
                </span>
                <a href={`/transcript/${t.userId}?ticket=${t.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] font-bold text-primary-2 hover:underline">
                  <FileText className="size-3" /> Transcript <ExternalLink className="size-3" />
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/* ---------- Configurações ---------- */

const novoTipo = (): TipoTicket => ({ id: `tipo-${crypto.randomUUID().slice(0, 6)}`, nome: '', descricao: '', emoji: '📁' })

function toInput(d: CorregedoriaEstado): CorregedoriaInput {
  const { tipos, cargosCorregedoria, categoriaId, logCanalId, nomeExibicao } = d.config
  return structuredClone({ tipos, cargosCorregedoria, categoriaId, logCanalId, nomeExibicao })
}

function Config({ data, correg }: { data: CorregedoriaEstado; correg: CorregedoriaApi }) {
  const original = useMemo(() => toInput(data), [data])
  const [draft, setDraft] = useState(original)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = JSON.stringify(draft) !== JSON.stringify(original)
  const patch = (p: Partial<CorregedoriaInput>) => {
    setDraft((d) => ({ ...d, ...p }))
    setSaved(false)
  }
  const setTipo = (i: number, p: Partial<TipoTicket>) => patch({ tipos: draft.tipos.map((t, j) => (j === i ? { ...t, ...p } : t)) })
  const moverTipo = (i: number, d: -1 | 1) => {
    const l = [...draft.tipos]
    const [x] = l.splice(i, 1)
    if (x) l.splice(i + d, 0, x)
    patch({ tipos: l })
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await correg.salvarConfig(draft)
      setSaved(true)
    } catch (err) {
      setError(erroCorregedoria(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-5">
      <PainelDiscord data={data} correg={correg} salvo={!dirty} />

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            icon={<KeyRound className="size-4.5" />}
            title="Equipe da corregedoria"
            hint="Veem todos os tickets, assumem, respondem (anonimamente) e fecham."
            action={<span className="text-[11px] font-extrabold uppercase tracking-widest text-muted">{draft.cargosCorregedoria.length} de 25</span>}
          />
          <div className="p-6">
            <CargoPicker id="cg-cargos" cargos={data.cargos} selecionados={draft.cargosCorregedoria} onChange={(cargosCorregedoria) => patch({ cargosCorregedoria })} max={25} />
          </div>
        </Card>

        <Card>
          <CardHeader icon={<UserX className="size-4.5" />} title="Atendimento anônimo" hint="Como as respostas da equipe aparecem no ticket e no transcript." />
          <div className="grid gap-5 p-6">
            <Field label="Nome de exibição" htmlFor="cg-nome" hint="Toda mensagem da equipe sai com este nome e a logo da PMERJ. Vale para os próximos tickets.">
              <Input id="cg-nome" value={draft.nomeExibicao} maxLength={80} onChange={(e) => patch({ nomeExibicao: e.target.value })} />
            </Field>
            <Field label="Categoria dos canais temporários" htmlFor="cg-cat" hint="Onde cada ticket abre o seu canal privado.">
              <Select id="cg-cat" value={draft.categoriaId ?? ''} onChange={(e) => patch({ categoriaId: e.target.value || null })} disabled={data.categorias.length === 0}>
                <option value="">Sem categoria (topo da lista)</option>
                {data.categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Canal de logs" htmlFor="cg-log" hint="Recebe o transcript de cada ticket fechado (com quem atendeu — uso interno).">
              <CanalSelect id="cg-log" canais={data.canais} value={draft.logCanalId} onChange={(logCanalId) => patch({ logCanalId })} vazio="Sem log" />
            </Field>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          icon={<ListChecks className="size-4.5" />}
          title={`Assuntos do menu · ${draft.tipos.length}`}
          hint="Opções do select no painel do Discord (órgão do ticket)."
          action={
            <Button size="sm" variant="ghost" disabled={draft.tipos.length >= 25} onClick={() => patch({ tipos: [...draft.tipos, novoTipo()] })}>
              <Plus className="size-3.5" /> Adicionar
            </Button>
          }
        />
        <ol className="divide-y divide-line">
          {draft.tipos.map((t, i) => (
            <li key={t.id} className="grid items-center gap-3 px-6 py-3 sm:grid-cols-[3.5rem_minmax(0,1fr)_minmax(0,1.4fr)_auto]">
              <Input aria-label={`Emoji do assunto ${i + 1}`} value={t.emoji} maxLength={16} onChange={(e) => setTipo(i, { emoji: e.target.value.trim() })} className="text-center text-lg" />
              <Input aria-label={`Nome do assunto ${i + 1}`} value={t.nome} maxLength={60} placeholder="Nome" aria-invalid={t.nome.trim().length < 2} onChange={(e) => setTipo(i, { nome: e.target.value })} />
              <Input aria-label={`Descrição do assunto ${i + 1}`} value={t.descricao} maxLength={100} placeholder="Descrição curta (opcional)" onChange={(e) => setTipo(i, { descricao: e.target.value })} />
              <div className="flex">
                <IconBtn label="Subir" disabled={i === 0} onClick={() => moverTipo(i, -1)}>
                  <ArrowUp className="size-4" />
                </IconBtn>
                <IconBtn label="Descer" disabled={i === draft.tipos.length - 1} onClick={() => moverTipo(i, 1)}>
                  <ArrowDown className="size-4" />
                </IconBtn>
                <IconBtn label="Remover" danger disabled={draft.tipos.length <= 1} onClick={() => patch({ tipos: draft.tipos.filter((_, j) => j !== i) })}>
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
          Para máximo sigilo, a equipe pode responder pelo botão <span className="font-semibold text-ink">💬 Responder</span> do painel do ticket: assim nem o aviso “fulano está digitando…” do Discord aparece. Escrevendo direto no canal, a mensagem é apagada e reenviada como a corregedoria na hora.
        </span>
      </p>

      <SaveBar dirty={dirty} saved={saved} saving={saving} error={error} onSave={save} onDiscard={() => { setDraft(original); setError(null) }} />
    </div>
  )
}

function PainelDiscord({ data, correg, salvo }: { data: CorregedoriaEstado; correg: CorregedoriaApi; salvo: boolean }) {
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
      await correg.publicarPainel(canalId)
      setOk(true)
    } catch (err) {
      setError(erroCorregedoria(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <Card>
      <CardHeader icon={<MessageSquareShare className="size-4.5" />} title="Painel no Discord" hint="Mensagem com o menu de assuntos. Quem escolhe preenche o formulário e ganha um canal privado." />
      <div className="grid gap-4 p-6">
        <BotStatus botAtivo={data.botAtivo} gateway={data.gateway} />
        {error && <Alert>{error}</Alert>}
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <Field label="Canal do painel" htmlFor="cg-painel">
            <CanalSelect id="cg-painel" canais={data.canais} value={canalId} onChange={setCanalId} vazio="Escolha o canal…" disabled={!data.botAtivo} />
          </Field>
          <Button onClick={publicar} loading={sending} disabled={!canalId || !data.botAtivo || !salvo} className="h-11">
            {!sending && <Send className="size-4" />} {mesmo ? 'Atualizar mensagem' : 'Publicar no canal'}
          </Button>
        </div>
        <p className={cn('text-xs', ok ? 'font-semibold text-success' : 'text-muted')}>
          {ok ? 'Pronto! Confira a mensagem no canal.' : !salvo ? 'Salve as alterações antes de publicar.' : data.config.painel ? 'Mudanças nos assuntos atualizam a mensagem sozinhas ao salvar.' : 'O bot precisa ver o canal, enviar mensagens e anexar arquivos.'}
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
