import { Building2, Fingerprint, Info, Link2, ListChecks, Medal, MessageSquareShare, ScrollText, Send, ShieldCheck, Wand2, Zap } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { BotStatus } from '@/components/discord/BotStatus'
import { CanalSelect } from '@/components/discord/CanalSelect'
import { CargoPicker } from '@/components/discord/CargoPicker'
import { Button, Card, CardHeader, Field, Input, Select, Switch } from '@/components/form'
import { ListEditor } from '@/components/ListEditor'
import { SaveBar } from '@/components/SaveBar'
import { Alert, Badge } from '@/components/ui'
import { montarApelido } from '@/lib/apelido'
import { cn } from '@/lib/cn'
import { erroSet, LIMITE_LISTA, type SetApi, type SetConfigInput, type SetEstado } from '@/lib/set'

const TOKENS = [
  { token: '{prefixo}', label: 'Prefixo' },
  { token: '{nome}', label: 'Nome' },
  { token: '{id}', label: 'ID' },
  { token: '{orgao}', label: 'Órgão' },
] as const

const PRESETS = ['{prefixo} {nome} | {id}', '[{prefixo}] {nome} | {id}', '{prefixo} {nome} | {orgao} | {id}', '[{orgao}] {prefixo} {nome} | {id}']

const novoId = () => crypto.randomUUID().slice(0, 8)

function toInput(d: SetEstado): SetConfigInput {
  const { atualizadoEm: _a, atualizadoPor: _b, painel: _p, ...rest } = d.config
  return structuredClone(rest)
}

export function SetConfig({ data, set }: { data: SetEstado; set: SetApi }) {
  const original = useMemo(() => toInput(data), [data])
  const [draft, setDraft] = useState<SetConfigInput>(original)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const dirty = JSON.stringify(draft) !== JSON.stringify(original)
  const patch = (p: Partial<SetConfigInput>) => {
    setDraft((d) => ({ ...d, ...p }))
    setSaved(false)
  }

  // Prévia com a patente de prefixo mais longo → mostra o pior caso.
  const longest = draft.patentes.reduce((a, b) => (b.prefixo.length > a.prefixo.length ? b : a), draft.patentes[0] ?? { prefixo: 'SD' })
  const orgaoLongo = draft.orgaos.reduce((a, b) => (b.sigla.length > a.sigla.length ? b : a), draft.orgaos[0] ?? { sigla: '' })
  const exemplo = (nome: string) =>
    montarApelido(draft.formato, { prefixo: longest.prefixo, nome, id: '1234567', orgao: draft.campos.orgao ? orgaoLongo.sigla : '' })
  const sobra = data.limiteApelido - exemplo('').length

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await set.salvarConfig(draft)
      setSaved(true)
    } catch (err) {
      setError(erroSet(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-5">
      <PainelDiscord data={data} set={set} />

      <AprovacaoConfig data={data} draft={draft} patch={patch} />

      {/* Campos */}
      <Card>
        <CardHeader icon={<ListChecks className="size-4.5" />} title="Campos do pedido" hint="O que o policial informa ao pedir o set." />
        <div className="divide-y divide-line px-6">
          <Switch checked onChange={() => {}} label="Patente, nome e ID" description="Formam o apelido. Sempre obrigatórios." locked={<Badge>Obrigatório</Badge>} />
          <Switch
            checked={draft.campos.orgao}
            onChange={(v) => patch({ campos: { orgao: v } })}
            label="Órgão"
            description="Batalhão ou unidade (BPM, BOPE, BPChq…). Pode aparecer no apelido com {orgao}."
          />
          <Switch
            checked={draft.alterarApelido}
            onChange={(v) => patch({ alterarApelido: v })}
            label="Trocar apelido no Discord"
            description={
              data.botAtivo
                ? 'O bot aplica o apelido assim que o pedido chega. Desligado, o pedido só fica registrado.'
                : 'Bot ainda não configurado no servidor (DISCORD_BOT_TOKEN). A opção fica guardada.'
            }
          />
        </div>
      </Card>

      {/* Formato */}
      <Card>
        <CardHeader icon={<Fingerprint className="size-4.5" />} title="Formato do apelido" hint="Monte como o nome aparece no Discord." />
        <div className="grid gap-5 p-6">
          <Field label="Modelo" htmlFor="cfg-formato" hint="Precisa ter {nome}. Não use ` @ # : \ < > * _ ~">
            <Input id="cfg-formato" value={draft.formato} maxLength={48} onChange={(e) => patch({ formato: e.target.value })} className="font-mono" />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted">Inserir</span>
            {TOKENS.map(({ token, label }) => (
              <button
                key={token}
                type="button"
                onClick={() => patch({ formato: `${draft.formato.trimEnd()} ${token}`.trim() })}
                className="rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 font-mono text-xs text-ink/85 transition hover:border-primary/50 hover:text-ink"
              >
                {token} <span className="font-sans text-muted">· {label}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted">Modelos</span>
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => patch({ formato: p })}
                className={cn(
                  'rounded-lg border px-2.5 py-1.5 font-mono text-xs transition',
                  draft.formato === p ? 'border-primary/60 bg-primary/10 text-ink' : 'border-line text-muted hover:text-ink',
                )}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="grid gap-3 rounded-[14px] border border-line bg-[#2b2d31] p-4 sm:grid-cols-2">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#949ba4]">Exemplo</div>
              <div className="mt-1 truncate text-[15px] font-semibold text-[#f2f3f5]">{exemplo('Silva')}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#949ba4]">Espaço para o nome (pior caso)</div>
              <div className={cn('mt-1 text-[15px] font-semibold', sobra < 6 ? 'text-danger' : 'text-[#f2f3f5]')}>{Math.max(0, sobra)} caracteres</div>
            </div>
          </div>
        </div>
      </Card>

      <div className="flex items-start gap-3 rounded-[16px] border border-primary/30 bg-primary/6 px-5 py-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-primary/30 bg-primary/12 text-primary">
          <Link2 className="size-4" />
        </span>
        <div className="min-w-0 text-sm">
          <p className="font-bold text-ink">Fonte única das patentes</p>
          <p className="mt-0.5 text-xs text-muted">Patentes, siglas, ordem (hierarquia) e cargos configurados aqui são puxados automaticamente por:</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {[
              ['Promoções e Rebaixamento', '/painel/promocoes'],
              ['Hierarquia', '/painel/hierarquia'],
              ['Sistema de Horas', '/painel/horas'],
              ['Cursos (patente mínima)', '/painel/cursos/cadastro'],
              ['Adicionar Cargo', '/painel/adicionar-cargo'],
            ].map(([nome, to]) => (
              <li key={to}>
                <Link to={to!} className="inline-flex items-center rounded-full border border-line bg-surface-2/60 px-2.5 py-1 text-[11px] font-semibold text-ink/85 transition hover:border-primary/50 hover:text-ink">
                  {nome}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <ListEditor
        icon={<Medal className="size-4.5" />}
        title="Patentes"
        hint="Ordem da lista = hierarquia (de baixo para cima). O prefixo entra no apelido. Vale para o sistema todo."
        items={draft.patentes}
        onChange={(patentes) => patch({ patentes })}
        create={() => ({ id: novoId(), nome: '', prefixo: '' })}
        min={1}
        max={LIMITE_LISTA}
        ordered
        columns={[
          { key: 'prefixo', label: 'Prefixo', max: 10, width: 'w-28', mono: true },
          { key: 'nome', label: 'Nome da patente', max: 40 },
        ]}
      />

      <ListEditor
        icon={<Building2 className="size-4.5" />}
        title="Órgãos"
        hint={draft.campos.orgao ? 'Ativo no pedido.' : 'Campo desativado — a lista fica guardada.'}
        items={draft.orgaos}
        onChange={(orgaos) => patch({ orgaos })}
        create={() => ({ id: novoId(), nome: '', sigla: '' })}
        max={LIMITE_LISTA}
        columns={[
          { key: 'sigla', label: 'Sigla', max: 10, width: 'w-28', mono: true },
          { key: 'nome', label: 'Nome do órgão', max: 60 },
        ]}
      />

      {/* Log */}
      <Card>
        <CardHeader icon={<ScrollText className="size-4.5" />} title="Registro no Discord" hint="Canal onde o bot avisa cada set aplicado. Opcional." />
        <div className="p-6">
          <Field label="Canal de log" htmlFor="cfg-log">
            <CanalSelect id="cfg-log" canais={data.canais} value={draft.logCanalId} onChange={(logCanalId) => patch({ logCanalId })} vazio="Sem registro" />
          </Field>
        </div>
      </Card>

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

/* ---------- Aprovação: modo, quem aprova, cargos e expulsão ---------- */

const MODOS = [
  { id: 'automatico', icon: Zap, title: 'Automático', text: 'Cargos e apelido aplicados na hora, sem análise.' },
  { id: 'aprovacao', icon: ShieldCheck, title: 'Com aprovação', text: 'Os cargos aprovadores analisam cada pedido num canal privado.' },
] as const


const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[º°ª[\]().|-]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()

/**
 * Patentes sem cargo ganham o cargo do Discord com o mesmo nome ("Soldado") ou sigla ("SD"),
 * ou cujo nome contém o nome da patente ("Soldado PM"). Nunca repete um cargo já usado.
 */
function vincularPeloNome(patentes: SetConfigInput['patentes'], cargos: Array<{ id: string; nome: string }>) {
  const usados = new Set(patentes.map((p) => p.cargoId).filter(Boolean))
  let n = 0
  const nova = patentes.map((p) => {
    if (p.cargoId) return p
    const nome = normalizar(p.nome)
    const sigla = normalizar(p.prefixo)
    const livres = cargos.filter((c) => !usados.has(c.id))
    const achado =
      livres.find((c) => normalizar(c.nome) === nome) ??
      livres.find((c) => normalizar(c.nome) === sigla) ??
      livres.find((c) => nome.length > 3 && ` ${normalizar(c.nome)} `.includes(` ${nome} `))
    if (!achado) return p
    usados.add(achado.id)
    n++
    return { ...p, cargoId: achado.id }
  })
  return { patentes: nova, n }
}

function Rotulo({ children, contador }: { children: ReactNode; contador?: number }) {
  return (
    <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted">
      {children}
      {contador !== undefined && <span className="text-ink/70"> · {contador}</span>}
    </span>
  )
}

function AprovacaoConfig({ data, draft, patch }: { data: SetEstado; draft: SetConfigInput; patch: (p: Partial<SetConfigInput>) => void }) {
  const aprovacao = draft.modo === 'aprovacao'
  const nomeCargo = (id: string) => data.cargos.find((c) => c.id === id)?.nome
  const [vinculo, setVinculo] = useState<string | null>(null)

  return (
    <Card>
      <CardHeader icon={<ShieldCheck className="size-4.5" />} title="Aprovação e cargos" hint="Quem analisa os pedidos e o que o bot faz ao aprovar ou reprovar." />
      <div className="grid gap-7 p-6">
        <div role="radiogroup" aria-label="Modo do Pedir Set" className="grid gap-3 sm:grid-cols-2">
          {MODOS.map(({ id, icon: Icon, title, text }) => {
            const on = draft.modo === id
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => patch({ modo: id })}
                className={cn(
                  'flex items-start gap-3 rounded-[14px] border p-4 text-left transition',
                  on ? 'border-primary/60 bg-primary/7 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-primary)_35%,transparent)]' : 'border-line hover:border-line-strong',
                )}
              >
                <span className={cn('grid size-9 shrink-0 place-items-center rounded-[10px] border', on ? 'border-primary/40 bg-primary/15 text-primary' : 'border-line text-muted')}>
                  <Icon className="size-4.5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-ink">{title}</span>
                  <span className="mt-0.5 block text-xs text-muted">{text}</span>
                </span>
              </button>
            )
          })}
        </div>

        {/* Quem aprova */}
        <section className={cn('grid gap-5 transition', !aprovacao && 'pointer-events-none opacity-45')} aria-disabled={!aprovacao}>
          <div className="grid gap-2">
            <Rotulo contador={draft.cargosAprovadores.length}>Cargos aprovadores</Rotulo>
            <p className="-mt-1 text-xs text-muted">
              <span className="font-semibold text-ink">Só</span> quem tem um destes cargos aprova ou reprova — no Discord e no site. Ninguém decide o próprio pedido.
            </p>
            <CargoPicker id="cfg-aprovadores" cargos={data.cargos} selecionados={draft.cargosAprovadores} onChange={(cargosAprovadores) => patch({ cargosAprovadores })} max={25} />
          </div>

          <Field
            label="Categoria dos canais temporários"
            htmlFor="cfg-categoria"
            hint="Cada pedido abre um canal visível só para os cargos aprovadores. Ele é apagado 15 segundos depois da decisão."
          >
            <Select id="cfg-categoria" value={draft.aprovacaoCategoriaId ?? ''} onChange={(e) => patch({ aprovacaoCategoriaId: e.target.value || null })} disabled={data.categorias.length === 0}>
              <option value="">Sem categoria (topo da lista)</option>
              {data.categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          </Field>

          <div className="divide-y divide-line rounded-[14px] border border-line px-4">
            <Switch
              checked={draft.expulsarAoReprovar}
              onChange={(expulsarAoReprovar) => patch({ expulsarAoReprovar })}
              label="Expulsar ao reprovar"
              description="O policial recebe a DM com o motivo e, em seguida, é expulso do servidor."
            />
          </div>
        </section>

        {/* Cargos entregues */}
        <section className="grid gap-5 border-t border-line pt-6">
          <div className="grid gap-2">
            <Rotulo contador={draft.cargosAoAprovar.length}>Cargos entregues no set</Rotulo>
            <p className="-mt-1 text-xs text-muted">Todo set aprovado recebe estes cargos (ex.: “Policial Militar”), além do cargo da patente.</p>
            <CargoPicker id="cfg-cargos-set" cargos={data.cargos} selecionados={draft.cargosAoAprovar} onChange={(cargosAoAprovar) => patch({ cargosAoAprovar })} max={10} />
          </div>

          <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Rotulo>Cargo de cada patente</Rotulo>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const r = vincularPeloNome(draft.patentes, data.cargos)
                  patch({ patentes: r.patentes })
                  setVinculo(r.n ? `${r.n} ${r.n === 1 ? 'patente vinculada' : 'patentes vinculadas'} pelo nome. Confira e salve.` : 'Nenhum cargo novo encontrado com o nome das patentes.')
                }}
                disabled={data.cargos.length === 0 || draft.patentes.every((p) => p.cargoId)}
                title="Procura cargos do Discord com o nome ou a sigla de cada patente sem cargo"
              >
                <Wand2 className="size-3.5" /> Vincular pelo nome
              </Button>
            </div>
            <p className="-mt-1 text-xs text-muted">Ao aprovar, o bot dá o cargo da patente escolhida e tira os cargos das outras patentes.</p>
            {vinculo && <p className="text-xs font-semibold text-success">{vinculo}</p>}
            <ul className="divide-y divide-line rounded-xl border border-line">
              {draft.patentes.map((p, i) => (
                <li key={p.id} className="grid items-center gap-2 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                  <span className="min-w-0 truncate text-sm">
                    <span className="mr-2 font-display font-semibold tracking-wide text-primary-2">{p.prefixo || '—'}</span>
                    {p.nome || <span className="text-muted">Sem nome</span>}
                  </span>
                  <Select
                    aria-label={`Cargo da patente ${p.nome}`}
                    value={p.cargoId ?? ''}
                    onChange={(e) => patch({ patentes: draft.patentes.map((x, j) => (j === i ? { ...x, cargoId: e.target.value || null } : x)) })}
                    className="h-10"
                  >
                    <option value="">Nenhum cargo</option>
                    {data.cargos.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </Select>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {!aprovacao && (draft.cargosAoAprovar.length > 0 || draft.patentes.some((p) => p.cargoId)) && (
          <p className="flex items-start gap-2 rounded-xl border border-[#f59e0b]/40 bg-[#f59e0b]/10 px-4 py-3 text-xs text-[#fcd34d]">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>No modo automático, qualquer membro recebe os cargos da patente que escolher. Use “Com aprovação” para controlar quem recebe cada cargo.</span>
          </p>
        )}

        <p className="flex items-start gap-2 rounded-xl border border-line bg-surface-2/50 px-4 py-3 text-xs text-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>
            O cargo do bot precisa ficar <span className="font-semibold text-ink">acima</span> de todos os cargos que ele entrega e dos membros que ele expulsa.
            {draft.cargosAprovadores.length > 0 && <> Aprovadores: {draft.cargosAprovadores.map((c) => nomeCargo(c) ?? c).join(', ')}.</>}
          </span>
        </p>
      </div>
    </Card>
  )
}

/* ---------- Painel "Pedir Set" no Discord ---------- */

function PainelDiscord({ data, set }: { data: SetEstado; set: SetApi }) {
  const [canalId, setCanalId] = useState<string | null>(data.config.painel?.canalId ?? null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const publicado = data.config.painel
  const mesmoCanal = publicado && publicado.canalId === canalId

  async function publicar() {
    if (!canalId) return
    setSending(true)
    setError(null)
    setOk(false)
    try {
      await set.publicarPainel(canalId)
      setOk(true)
    } catch (err) {
      setError(erroSet(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <Card>
      <CardHeader
        icon={<MessageSquareShare className="size-4.5" />}
        title="Painel no Discord"
        hint="Publica uma mensagem com o botão “Pedir set”. Quem clica preenche um formulário e recebe o apelido na hora."
      />
      <div className="grid gap-4 p-6">
        <BotStatus botAtivo={data.botAtivo} gateway={data.gateway} />
        {error && <Alert>{error}</Alert>}
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <Field label="Canal do painel" htmlFor="cfg-painel">
            <CanalSelect id="cfg-painel" canais={data.canais} value={canalId} onChange={setCanalId} vazio="Escolha o canal…" disabled={!data.botAtivo} />
          </Field>
          <Button onClick={publicar} loading={sending} disabled={!canalId || !data.botAtivo} className="h-11">
            {!sending && <Send className="size-4" />} {mesmoCanal ? 'Atualizar mensagem' : 'Publicar no canal'}
          </Button>
        </div>
        <p className={cn('text-xs', ok ? 'font-semibold text-success' : 'text-muted')}>
          {ok
            ? 'Pronto! Confira a mensagem no canal.'
            : publicado
              ? 'Painel já publicado. Mudanças de formato e campos atualizam a mensagem sozinhas ao salvar.'
              : 'O bot precisa poder ver o canal, enviar mensagens e inserir links.'}
        </p>
      </div>
    </Card>
  )
}
