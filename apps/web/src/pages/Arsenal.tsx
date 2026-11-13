import { AlertTriangle, ArrowDownToLine, CheckCircle2, ExternalLink, History, KeyRound, ListChecks, Loader2, Lock, MessageSquareShare, Package, RefreshCw, RotateCcw, Send, Settings2, ShieldCheck, Undo2, type LucideIcon } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { BotStatus } from '@/components/discord/BotStatus'
import { CanalSelect } from '@/components/discord/CanalSelect'
import { CargoPicker } from '@/components/discord/CargoPicker'
import { EmptyState } from '@/components/EmptyState'
import { Button, Card, CardHeader, Field, Input, Pill } from '@/components/form'
import { ListEditor } from '@/components/ListEditor'
import { SaveBar } from '@/components/SaveBar'
import { Tabs, useAba, type Aba } from '@/components/Tabs'
import { Alert } from '@/components/ui'
import { erroArsenal, useArsenal, type Arma, type ArsenalApi, type ArsenalEstado, type ArsenalInput, type Item, type TipoMovimento } from '@/lib/arsenal'
import { cn } from '@/lib/cn'
import { fmtDataHora, fmtRelativo } from '@/lib/format'

type Id = 'uso' | 'perdidas' | 'historico' | 'config'

const TIPO: Record<TipoMovimento, { label: string; icon: LucideIcon; cls: string }> = {
  retirada: { label: 'Retirada', icon: Package, cls: 'border-primary/35 bg-primary/10 text-primary-2' },
  devolucao: { label: 'Devolvida', icon: Undo2, cls: 'border-success/35 bg-success/10 text-success' },
  perda: { label: 'Perda', icon: AlertTriangle, cls: 'border-danger/40 bg-danger/10 text-danger' },
  recuperacao: { label: 'Recuperada', icon: CheckCircle2, cls: 'border-[#f59e0b]/40 bg-[#f59e0b]/10 text-[#f59e0b]' },
}

/** Painel → Retirada de Baú: armas em uso, perdidas, histórico e configuração. */
export function Arsenal() {
  const arsenal = useArsenal()
  const { data } = arsenal

  const abas: Aba<Id>[] = [
    ...(data?.acesso.gestao
      ? [
          { id: 'uso' as const, label: 'Em uso', icon: Package, count: data.emUso.length },
          { id: 'perdidas' as const, label: 'Perdidas', icon: AlertTriangle, count: data.perdidas.length },
          { id: 'historico' as const, label: 'Histórico', icon: History },
        ]
      : []),
    ...(data?.acesso.podeConfigurar ? [{ id: 'config' as const, label: 'Configurações', icon: Settings2 }] : []),
  ]
  const [aba, irPara] = useAba(abas.length ? abas : [{ id: 'uso', label: '', icon: Package }])

  if (!data) {
    return arsenal.loadError ? (
      <div className="mx-auto max-w-md">
        <Alert>{arsenal.loadError}</Alert>
      </div>
    ) : (
      <div className="grid min-h-[50vh] place-items-center" aria-busy="true">
        <Loader2 className="size-7 animate-spin text-primary" aria-label="Carregando" />
      </div>
    )
  }

  const c = data.config
  const online = data.gateway.estado === 'online'
  const pronto = online && Boolean(c.painelMensagemId && c.canalRetiradasId && c.canalPerdasId)

  return (
    <div className="animate-rise">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="kicker">Efetivo · Material bélico</span>
          <h1 className="display mt-2 text-[clamp(2rem,4vw,2.6rem)]">Retirada de Baú</h1>
          <p className="mt-1.5 max-w-xl text-muted">
            No painel do Discord o policial escolhe a opção: retirar (arma + prefixo/série), devolver, registrar perda ou recuperar. O ID e o nome no servidor vão automaticamente.
          </p>
        </div>
        <span className={cn('inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[11px] font-black uppercase tracking-widest', pronto ? 'border-success/35 bg-success/10 text-success' : 'border-line bg-surface text-muted')}>
          <span className={cn('size-2 rounded-full', pronto ? 'animate-siren bg-success' : 'bg-muted/60')} />
          {!online ? 'Bot desconectado' : !c.painelMensagemId ? 'Painel não publicado' : !c.canalRetiradasId || !c.canalPerdasId ? 'Falta canal de registro' : 'Pronto'}
        </span>
      </div>

      {data.acesso.gestao && (
        <div className="mt-8 grid grid-cols-3 gap-3">
          <Stat icon={<Package className="size-4" />} label="Armas em uso" value={data.emUso.length} />
          <Stat icon={<AlertTriangle className="size-4" />} label="Perdidas" value={data.perdidas.length} tone={data.perdidas.length ? 'perigo' : undefined} />
          <Stat icon={<ListChecks className="size-4" />} label="Modelos cadastrados" value={c.armas.length} />
        </div>
      )}

      {abas.length === 0 ? (
        <Card className="mt-8">
          <EmptyState icon={Lock}>Seu cargo não tem acesso ao controle do baú. A administração escolhe a gestão em Configurações.</EmptyState>
        </Card>
      ) : (
        <>
          <Tabs abas={abas} atual={aba} onChange={irPara} />
          <div role="tabpanel" className="mt-6">
            {aba === 'uso' && <ListaItens itens={data.emUso} arsenal={arsenal} modo="uso" />}
            {aba === 'perdidas' && <ListaItens itens={data.perdidas} arsenal={arsenal} modo="perdida" />}
            {aba === 'historico' && <Historico data={data} />}
            {aba === 'config' && data.acesso.podeConfigurar && <Config data={data} arsenal={arsenal} />}
          </div>
        </>
      )}
    </div>
  )
}

/* ---------- Em uso / Perdidas ---------- */

function ListaItens({ itens, arsenal, modo }: { itens: Item[]; arsenal: ArsenalApi; modo: 'uso' | 'perdida' }) {
  const [busca, setBusca] = useState('')
  const q = busca.trim().toLowerCase()
  const filtrados = q ? itens.filter((i) => [i.armaNome, i.serie, i.pessoa?.nome ?? '', i.pessoa?.id ?? ''].some((t) => t.toLowerCase().includes(q))) : itens
  return (
    <Card>
      <CardHeader
        icon={modo === 'uso' ? <Package className="size-4.5" /> : <AlertTriangle className="size-4.5" />}
        title={modo === 'uso' ? 'Armas retiradas agora' : 'Armas perdidas'}
        hint={modo === 'uso' ? 'Com quem está cada série. “Dar baixa” registra a devolução (ex.: o policial esqueceu de devolver).' : 'Séries bloqueadas até serem recuperadas. “Recuperar” devolve a série ao sistema.'}
        action={<Input aria-label="Buscar" placeholder="Arma, série ou policial…" value={busca} onChange={(e) => setBusca(e.target.value)} className="h-9 w-52" />}
      />
      {filtrados.length === 0 ? (
        <EmptyState icon={modo === 'uso' ? Package : CheckCircle2}>{q ? 'Nada encontrado para essa busca.' : modo === 'uso' ? 'Nenhuma arma retirada no momento.' : 'Nenhuma arma perdida.'}</EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {filtrados.map((i) => (
            <LinhaItem key={i.chave} i={i} arsenal={arsenal} modo={modo} />
          ))}
        </ul>
      )}
    </Card>
  )
}

function LinhaItem({ i, arsenal, modo }: { i: Item; arsenal: ArsenalApi; modo: 'uso' | 'perdida' }) {
  const [confirmando, setConfirmando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function executar() {
    setEnviando(true)
    setErro(null)
    try {
      await arsenal.acao(i.chave, modo === 'uso' ? 'devolver' : 'recuperar', motivo.trim() || undefined)
    } catch (err) {
      setErro(erroArsenal(err))
      setEnviando(false)
    }
  }

  return (
    <li className="px-4 py-3 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className={cn('grid size-9 shrink-0 place-items-center rounded-[10px] border', modo === 'uso' ? 'border-primary/30 bg-primary/10 text-primary-2' : 'border-danger/35 bg-danger/10 text-danger')}>
          {modo === 'uso' ? <Package className="size-4" /> : <AlertTriangle className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold">{i.armaNome}</span>
            <span className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-xs">{i.serie}</span>
          </div>
          <div className="mt-0.5 truncate text-xs text-muted">
            {modo === 'uso' ? 'Com' : 'Perdida por'} {i.pessoa ? `${i.pessoa.nome} · ID ${i.pessoa.id}` : '—'} · {fmtRelativo(i.desde)}
          </div>
        </div>
        {!confirmando && (
          <Button size="sm" variant={modo === 'uso' ? 'ghost' : 'success'} onClick={() => setConfirmando(true)}>
            {modo === 'uso' ? <ArrowDownToLine className="size-3.5" /> : <RotateCcw className="size-3.5" />} {modo === 'uso' ? 'Dar baixa' : 'Recuperar'}
          </Button>
        )}
      </div>
      {confirmando && (
        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:pl-12">
          {modo === 'perdida' ? (
            <Input aria-label="Como foi recuperada" placeholder="Como foi recuperada (opcional)" maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
          ) : (
            <span className="text-xs text-muted">Registrar que {i.pessoa?.nome ?? 'o policial'} devolveu esta arma? Sai no canal das retiradas.</span>
          )}
          <Button size="sm" variant={modo === 'uso' ? 'primary' : 'success'} loading={enviando} onClick={executar}>
            Confirmar
          </Button>
          <Button size="sm" variant="ghost" disabled={enviando} onClick={() => setConfirmando(false)}>
            Voltar
          </Button>
        </div>
      )}
      {erro && <p className="mt-2 text-xs text-danger sm:pl-12">{erro}</p>}
    </li>
  )
}

/* ---------- Histórico ---------- */

function Historico({ data }: { data: ArsenalEstado }) {
  const [busca, setBusca] = useState('')
  const q = busca.trim().toLowerCase()
  const lista = q ? data.movimentos.filter((m) => [m.armaNome, m.serie, m.pessoa.nome, m.pessoa.id].some((t) => t.toLowerCase().includes(q))) : data.movimentos
  return (
    <Card>
      <CardHeader
        icon={<History className="size-4.5" />}
        title="Histórico de movimentos"
        hint="Os 300 mais recentes: retiradas, devoluções, perdas e recuperações."
        action={<Input aria-label="Buscar no histórico" placeholder="Buscar…" value={busca} onChange={(e) => setBusca(e.target.value)} className="h-9 w-44" />}
      />
      {lista.length === 0 ? (
        <EmptyState icon={History}>{q ? 'Nada encontrado para essa busca.' : 'Nenhum movimento ainda.'}</EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {lista.map((m) => {
            const t = TIPO[m.tipo]
            const link = data.guildId && m.canalId && m.mensagemId ? `https://discord.com/channels/${data.guildId}/${m.canalId}/${m.mensagemId}` : null
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
                <Pill className={t.cls}>
                  <t.icon className="size-3" /> {t.label}
                </Pill>
                <div className="min-w-0 flex-1 text-sm">
                  <span className="font-semibold">{m.armaNome}</span> <span className="font-mono text-xs text-muted">{m.serie}</span>
                  <div className="truncate text-xs text-muted">
                    {m.pessoa.nome} · ID {m.pessoa.id}
                    {m.relacionado && ` · ${m.tipo === 'recuperacao' ? 'perdida por' : 'por'} ${m.relacionado.nome}`}
                    {m.motivo && ` · ${m.motivo}`}
                    {m.web && ' · pelo painel web'}
                  </div>
                </div>
                <span className="text-xs text-muted tabular-nums" title={fmtDataHora(m.em)}>
                  {fmtRelativo(m.em)}
                </span>
                {link && (
                  <a href={link} target="_blank" rel="noreferrer" className="text-primary-2 hover:underline" aria-label="Abrir no Discord" title="Abrir no Discord">
                    <ExternalLink className="size-3.5" />
                  </a>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

/* ---------- Configurações ---------- */

const toInput = (d: ArsenalEstado): ArsenalInput => ({
  painelCanalId: d.config.painelCanalId,
  canalRetiradasId: d.config.canalRetiradasId,
  canalPerdasId: d.config.canalPerdasId,
  armas: d.config.armas.map((a) => ({ ...a })),
  cargosUsar: [...d.config.cargosUsar],
  cargosGestao: [...d.config.cargosGestao],
})
const novaArma = (): Arma => ({ id: `a-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, nome: '', emoji: '🔫' })

function Config({ data, arsenal }: { data: ArsenalEstado; arsenal: ArsenalApi }) {
  const original = useMemo(() => toInput(data), [data])
  const [draft, setDraft] = useState(original)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const dirty = JSON.stringify(draft) !== JSON.stringify(original)
  const patch = (p: Partial<ArsenalInput>) => {
    setDraft((d) => ({ ...d, ...p }))
    setSaved(false)
  }
  const texto = data.canais.filter((c) => c.tipo === 'texto' || c.tipo === 'anuncios')

  async function save() {
    setSaving(true)
    setError(null)
    try {
      setAviso(await arsenal.salvarConfig({ ...draft, armas: draft.armas.map((a) => ({ ...a, nome: a.nome.trim(), emoji: a.emoji.trim() })) }))
      setSaved(true)
    } catch (err) {
      setError(erroArsenal(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-5">
      <BotStatus botAtivo={data.botAtivo} gateway={data.gateway} />

      <Card>
        <CardHeader icon={<MessageSquareShare className="size-4.5" />} title="Painel e canais" hint="O painel tem o menu com as 4 opções. Cada movimento é publicado no canal do seu tipo." />
        <div className="grid gap-6 p-6">
          <div className="grid gap-5 lg:grid-cols-3">
            <Field label="Canal do painel" htmlFor="ars-painel" hint="Onde fica o menu de retirada.">
              <CanalSelect id="ars-painel" canais={texto} value={draft.painelCanalId} onChange={(painelCanalId) => patch({ painelCanalId })} vazio="Escolher canal..." />
            </Field>
            <Field label="Canal das retiradas" htmlFor="ars-ret" hint="Retiradas e devoluções.">
              <CanalSelect id="ars-ret" canais={texto} value={draft.canalRetiradasId} onChange={(canalRetiradasId) => patch({ canalRetiradasId })} vazio="Escolher canal..." />
            </Field>
            <Field label="Canal das perdas" htmlFor="ars-perda" hint="Perdas e recuperações.">
              <CanalSelect id="ars-perda" canais={texto} value={draft.canalPerdasId} onChange={(canalPerdasId) => patch({ canalPerdasId })} vazio="Escolher canal..." />
            </Field>
          </div>
          {data.config.painelErro && <Alert>Último erro ao publicar o painel: {data.config.painelErro}.</Alert>}
          <Publicar data={data} arsenal={arsenal} dirty={dirty} aviso={aviso} />
        </div>
      </Card>

      <ListEditor<Arma>
        icon={<Package className="size-4.5" />}
        title="Armas"
        hint="Modelos que aparecem no formulário de retirada. A série é digitada pelo policial na hora."
        items={draft.armas}
        onChange={(armas) => patch({ armas })}
        create={novaArma}
        max={data.limites.armas}
        ordered
        columns={[
          { key: 'emoji', label: 'Emoji', max: 64, width: 'w-16 text-center' },
          { key: 'nome', label: 'Nome da arma', max: data.limites.armaNome },
        ]}
      />

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            icon={<KeyRound className="size-4.5" />}
            title="Quem usa o painel"
            hint="Retiram, devolvem, registram perda e recuperam as próprias armas. Vazio = qualquer membro."
            action={<span className="text-[11px] font-extrabold uppercase tracking-widest text-muted">{draft.cargosUsar.length} de 25</span>}
          />
          <div className="p-6">
            <CargoPicker id="ars-usar" cargos={data.cargos} selecionados={draft.cargosUsar} onChange={(cargosUsar) => patch({ cargosUsar })} max={25} />
          </div>
        </Card>
        <Card>
          <CardHeader
            icon={<ShieldCheck className="size-4.5" />}
            title="Gestão do baú"
            hint="Recuperam qualquer arma perdida, dão baixa pelo site e veem esta página."
            action={<span className="text-[11px] font-extrabold uppercase tracking-widest text-muted">{draft.cargosGestao.length} de 25</span>}
          />
          <div className="p-6">
            <CargoPicker id="ars-gestao" cargos={data.cargos} selecionados={draft.cargosGestao} onChange={(cargosGestao) => patch({ cargosGestao })} max={25} />
          </div>
        </Card>
      </div>

      <SaveBar
        dirty={dirty}
        saved={saved}
        saving={saving}
        error={error}
        onSave={save}
        onDiscard={() => {
          setDraft(original)
          setError(null)
        }}
      />
    </div>
  )
}

function Publicar({ data, arsenal, dirty, aviso }: { data: ArsenalEstado; arsenal: ArsenalApi; dirty: boolean; aviso: string | null }) {
  const [publicando, setPublicando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const c = data.config

  async function publicar(recriar: boolean) {
    setPublicando(true)
    setErro(null)
    setOk(null)
    try {
      await arsenal.publicar(recriar)
      setOk(recriar ? 'Painel publicado de novo no Discord.' : 'Painel publicado no Discord.')
    } catch (err) {
      setErro(erroArsenal(err))
    } finally {
      setPublicando(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
      <Button onClick={() => publicar(false)} loading={publicando} disabled={!data.botAtivo || dirty || !c.painelCanalId}>
        {!publicando && <Send className="size-4" />} {c.painelMensagemId ? 'Atualizar painel' : 'Publicar painel'}
      </Button>
      {c.painelMensagemId && (
        <Button variant="ghost" onClick={() => publicar(true)} disabled={publicando || !data.botAtivo || dirty}>
          <RefreshCw className="size-4" /> Publicar de novo
        </Button>
      )}
      <span className={cn('text-xs', erro ? 'text-danger' : ok ? 'font-semibold text-success' : aviso ? 'font-semibold text-[#f59e0b]' : 'text-muted')}>
        {erro ?? ok ?? aviso ?? (dirty ? 'Salve as alterações antes de publicar.' : c.painelMensagemId ? 'Ao salvar, o painel já publicado é atualizado sozinho.' : 'Escolha os canais, salve e publique.')}
      </span>
    </div>
  )
}

function Stat({ icon, label, value, tone }: { icon: ReactNode; label: string; value: ReactNode; tone?: 'perigo' }) {
  return (
    <div className="rounded-2xl border border-line bg-surface/90 p-4">
      <div className={cn('flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.12em]', tone === 'perigo' ? 'text-danger' : 'text-muted')}>
        {icon} {label}
      </div>
      <div className="display mt-2 text-3xl tabular-nums">{value}</div>
    </div>
  )
}
