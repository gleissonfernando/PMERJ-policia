import { ArrowDown, ArrowDownWideNarrow, ArrowUp, Check, ExternalLink, Hash, Layers, Link2, Palette, Plus, RefreshCw, Send, Trash2 } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { BotStatus } from '@/components/discord/BotStatus'
import { CanalSelect } from '@/components/discord/CanalSelect'
import { Button, Card, CardHeader, Field, Input, Select, Switch } from '@/components/form'
import { SaveBar } from '@/components/SaveBar'
import { Alert } from '@/components/ui'
import { cn } from '@/lib/cn'
import { erroHierarquia, type HierarquiaApi, type HierarquiaEstado, type HierarquiaInput, type Nivel } from '@/lib/hierarquia'

const CORES = [0x2b7fff, 0xe10600, 0x22c55e, 0xf59e0b, 0xeab308, 0xa3a3a3]
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`
const corCargo = (n: number) => (n ? hex(n) : 'var(--color-line-strong)')

const toInput = (d: HierarquiaEstado): HierarquiaInput => ({
  canalId: d.config.canalId,
  titulo: d.config.titulo,
  cor: d.config.cor,
  rodape: d.config.rodape,
  mostrarVagos: d.config.mostrarVagos,
  origem: d.config.origem,
  emojisPatentes: { ...d.config.emojisPatentes },
  niveis: d.config.niveis.map((n) => ({ ...n })),
})

const novoId = () => `n-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

export function Configuracoes({ data, hierarquia }: { data: HierarquiaEstado; hierarquia: HierarquiaApi }) {
  const original = useMemo(() => toInput(data), [data])
  const [draft, setDraft] = useState(original)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const dirty = JSON.stringify(draft) !== JSON.stringify(original)
  const patch = (p: Partial<HierarquiaInput>) => {
    setDraft((d) => ({ ...d, ...p }))
    setSaved(false)
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      setAviso(await hierarquia.salvarConfig(draft))
      setSaved(true)
    } catch (err) {
      setError(erroHierarquia(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-5">
      <BotStatus botAtivo={data.botAtivo} gateway={data.gateway} />

      <Origem valor={draft.origem} onChange={(origem) => patch({ origem })} />
      {draft.origem === 'patentes' && (
        <PatentesSincronizadas data={data} emojis={draft.emojisPatentes} extras={draft.niveis} onEmoji={(id, emoji) => patch({ emojisPatentes: { ...draft.emojisPatentes, [id]: emoji } })} />
      )}
      <Niveis data={data} niveis={draft.niveis} onChange={(niveis) => patch({ niveis })} extras={draft.origem === 'patentes'} />

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader icon={<Hash className="size-4.5" />} title="Painel no Discord" hint="O bot mantém o painel atualizado sozinho a cada troca de cargo, entrada ou saída." />
          <div className="grid gap-5 p-6">
            <Field label="Canal do painel" htmlFor="hq-canal" hint="Use um canal só de leitura para os membros.">
              <CanalSelect id="hq-canal" canais={data.canais.filter((c) => c.tipo === 'texto' || c.tipo === 'anuncios')} value={draft.canalId} onChange={(canalId) => patch({ canalId })} vazio="Escolher canal..." />
            </Field>
            {data.config.erro && <Alert>Último erro ao publicar: {data.config.erro}.</Alert>}
            <Publicar data={data} hierarquia={hierarquia} dirty={dirty} aviso={aviso} />
          </div>
        </Card>

        <Card>
          <CardHeader icon={<Palette className="size-4.5" />} title="Aparência" hint="Título, cor da barra e rodapé do painel. A logo vem de Painel → Aparência." />
          <div className="grid gap-5 p-6">
            <Field label="Título" htmlFor="hq-titulo" hint={`${draft.titulo.length}/${data.limites.titulo}`}>
              <Input id="hq-titulo" value={draft.titulo} maxLength={data.limites.titulo} onChange={(e) => patch({ titulo: e.target.value })} />
            </Field>
            <Field label="Rodapé" htmlFor="hq-rodape" hint={`${draft.rodape.length}/${data.limites.rodape}`}>
              <Input id="hq-rodape" value={draft.rodape} maxLength={data.limites.rodape} onChange={(e) => patch({ rodape: e.target.value })} />
            </Field>
            <div className="grid gap-1.5">
              <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted">Cor da barra</span>
              <div className="flex flex-wrap items-center gap-2">
                {CORES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Cor ${hex(c)}`}
                    aria-pressed={draft.cor === c}
                    onClick={() => patch({ cor: c })}
                    className={cn('grid size-8 place-items-center rounded-full border-2 transition', draft.cor === c ? 'border-ink' : 'border-transparent hover:border-line-strong')}
                    style={{ background: hex(c) }}
                  >
                    {draft.cor === c && <Check className="size-4 text-white drop-shadow" />}
                  </button>
                ))}
                <label className="relative grid size-8 cursor-pointer place-items-center overflow-hidden rounded-full border border-dashed border-line-strong text-[10px] text-muted" title="Outra cor">
                  +
                  <input type="color" value={hex(draft.cor)} onChange={(e) => patch({ cor: parseInt(e.target.value.slice(1), 16) })} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Escolher outra cor" />
                </label>
              </div>
            </div>
            <div className="rounded-[14px] border border-line px-4">
              <Switch checked={draft.mostrarVagos} onChange={(mostrarVagos) => patch({ mostrarVagos })} label="Mostrar níveis vagos" description="Desligado: cargos sem ninguém somem do painel." />
            </div>
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

/* ---------- Níveis (cargos) ---------- */

function Niveis({ data, niveis, onChange, extras }: { data: HierarquiaEstado; niveis: Nivel[]; onChange: (n: Nivel[]) => void; extras: boolean }) {
  const [novo, setNovo] = useState('')
  const cargos = useMemo(() => new Map(data.cargos.map((c) => [c.id, c])), [data.cargos])
  /** Posição no Discord (0 = mais alto): a lista de cargos já vem do mais alto para o mais baixo. */
  const posicao = useMemo(() => new Map(data.cargos.map((c, i) => [c.id, i])), [data.cargos])
  const usados = new Set(niveis.map((n) => n.cargoId))
  const disponiveis = data.cargos.filter((c) => !usados.has(c.id))
  const contagem = useMemo(() => new Map((data.arvore ?? []).map((n) => [n.cargoId, n.membros.length])), [data.arvore])

  const atualizar = (i: number, p: Partial<Nivel>) => onChange(niveis.map((n, j) => (j === i ? { ...n, ...p } : n)))
  const mover = (i: number, dir: -1 | 1) => {
    const next = [...niveis]
    const [n] = next.splice(i, 1)
    if (n) next.splice(i + dir, 0, n)
    onChange(next)
  }
  const adicionar = () => {
    if (!novo) return
    onChange([...niveis, { id: novoId(), cargoId: novo, titulo: '', emoji: '' }])
    setNovo('')
  }
  const ordenarPeloDiscord = () => onChange([...niveis].sort((a, b) => (posicao.get(a.cargoId) ?? 999) - (posicao.get(b.cargoId) ?? 999)))

  return (
    <Card>
      <CardHeader
        icon={<Layers className="size-4.5" />}
        title={extras ? `Níveis extras acima das patentes · ${niveis.length}/${data.limites.niveis}` : `Níveis da hierarquia · ${niveis.length}/${data.limites.niveis}`}
        hint={extras ? 'Opcional: cargos que ficam no topo, acima de todas as patentes (ex.: Comando-Geral, Corregedoria).' : 'De cima (mais alto) para baixo. Quem tem vários destes cargos aparece só no mais alto. Título vazio = nome do cargo no Discord.'}
        action={
          <Button size="sm" variant="ghost" onClick={ordenarPeloDiscord} disabled={niveis.length < 2} title="Mesma ordem dos cargos nas configurações do servidor">
            <ArrowDownWideNarrow className="size-3.5" /> Ordem do Discord
          </Button>
        }
      />

      {niveis.length === 0 ? (
        <p className="px-6 py-8 text-center text-sm text-muted">{extras ? 'Nenhum nível extra. As patentes acima já formam a hierarquia.' : 'Nenhum nível ainda. Adicione os cargos abaixo, do mais alto para o mais baixo.'}</p>
      ) : (
        <ol className="divide-y divide-line">
          {niveis.map((n, i) => {
            const cargo = cargos.get(n.cargoId)
            return (
              <li key={n.id} className="grid items-center gap-2 px-4 py-2.5 sm:grid-cols-[2rem_3.5rem_minmax(0,1fr)_minmax(0,1fr)_auto] sm:px-6">
                <span className="hidden text-center font-display text-sm text-muted tabular-nums sm:block">{i + 1}</span>
                <input
                  aria-label={`Emoji do nível ${i + 1}`}
                  placeholder="🎖️"
                  value={n.emoji}
                  maxLength={64}
                  onChange={(e) => atualizar(i, { emoji: e.target.value })}
                  className="h-10 min-w-0 rounded-[10px] border border-line bg-surface-2/50 px-2 text-center text-sm outline-none transition focus:border-primary/60"
                />
                <div className="flex min-w-0 items-center gap-2.5 text-sm">
                  <span className="size-3 shrink-0 rounded-full" style={{ background: corCargo(cargo?.cor ?? 0) }} aria-hidden="true" />
                  <span className={cn('truncate font-semibold', !cargo && 'text-danger')}>{cargo ? `@${cargo.nome}` : 'Cargo apagado no Discord'}</span>
                  {data.arvore && <span className="shrink-0 text-xs text-muted tabular-nums">{contagem.get(n.cargoId) ?? 0} membro(s)</span>}
                </div>
                <input
                  aria-label={`Título do nível ${i + 1}`}
                  placeholder={cargo?.nome ?? 'Título'}
                  value={n.titulo}
                  maxLength={data.limites.tituloNivel}
                  onChange={(e) => atualizar(i, { titulo: e.target.value })}
                  className="h-10 min-w-0 rounded-[10px] border border-line bg-surface-2/50 px-3 text-sm outline-none transition focus:border-primary/60"
                />
                <div className="flex shrink-0 items-center justify-end">
                  <IconBtn label="Subir" onClick={() => mover(i, -1)} disabled={i === 0}>
                    <ArrowUp className="size-4" />
                  </IconBtn>
                  <IconBtn label="Descer" onClick={() => mover(i, 1)} disabled={i === niveis.length - 1}>
                    <ArrowDown className="size-4" />
                  </IconBtn>
                  <IconBtn label="Remover" danger onClick={() => onChange(niveis.filter((_, j) => j !== i))}>
                    <Trash2 className="size-4" />
                  </IconBtn>
                </div>
              </li>
            )
          })}
        </ol>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-4 sm:px-6">
        <Select aria-label="Cargo para adicionar" value={novo} onChange={(e) => setNovo(e.target.value)} className="h-10 min-w-0 flex-1 sm:max-w-sm" disabled={!disponiveis.length || niveis.length >= data.limites.niveis}>
          <option value="">{disponiveis.length ? 'Escolher cargo para adicionar…' : 'Todos os cargos já estão na hierarquia'}</option>
          {disponiveis.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </Select>
        <Button size="md" onClick={adicionar} disabled={!novo}>
          <Plus className="size-4" /> Adicionar nível
        </Button>
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
      className={cn(
        'grid size-9 place-items-center rounded-[9px] text-muted transition disabled:pointer-events-none disabled:opacity-25',
        danger ? 'hover:bg-danger/10 hover:text-danger' : 'hover:bg-white/5 hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}

/* ---------- Publicar ---------- */

function Publicar({ data, hierarquia, dirty, aviso }: { data: HierarquiaEstado; hierarquia: HierarquiaApi; dirty: boolean; aviso: string | null }) {
  const [publicando, setPublicando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const c = data.config
  const publicado = c.mensagemIds.length > 0

  async function publicar(recriar: boolean) {
    setPublicando(true)
    setErro(null)
    setOk(null)
    try {
      await hierarquia.publicar(recriar)
      setOk(recriar ? 'Painel publicado de novo.' : publicado ? 'Painel atualizado.' : 'Painel publicado.')
    } catch (err) {
      setErro(erroHierarquia(err))
    } finally {
      setPublicando(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
      <Button onClick={() => publicar(false)} loading={publicando} disabled={!data.botAtivo || dirty || !c.canalId || !c.niveis.length}>
        {!publicando && <Send className="size-4" />} {publicado ? 'Atualizar agora' : 'Publicar painel'}
      </Button>
      {publicado && (
        <Button variant="ghost" onClick={() => publicar(true)} disabled={publicando || !data.botAtivo || dirty}>
          <RefreshCw className="size-4" /> Publicar de novo
        </Button>
      )}
      <span className={cn('text-xs', erro ? 'text-danger' : ok ? 'font-semibold text-success' : aviso ? 'font-semibold text-[#f59e0b]' : 'text-muted')}>
        {erro ?? ok ?? aviso ?? (dirty ? 'Salve as alterações antes de publicar.' : publicado ? 'Atualiza sozinho a cada troca de cargo.' : 'Escolha o canal, monte os níveis, salve e publique.')}
      </span>
    </div>
  )
}

/* ---------- Origem dos níveis ---------- */

function Origem({ valor, onChange }: { valor: HierarquiaInput['origem']; onChange: (v: HierarquiaInput['origem']) => void }) {
  const opcoes: Array<{ id: HierarquiaInput['origem']; titulo: string; texto: string; icon: ReactNode }> = [
    { id: 'patentes', titulo: 'Puxar do Pedir Set', texto: 'As patentes e seus cargos, na ordem configurada no Pedir Set. Mudou lá, muda aqui sozinho.', icon: <Link2 className="size-4" /> },
    { id: 'manual', titulo: 'Montar à mão', texto: 'Você escolhe cada cargo e a ordem dos níveis aqui.', icon: <Layers className="size-4" /> },
  ]
  return (
    <div role="radiogroup" aria-label="De onde vêm os níveis" className="grid gap-3 md:grid-cols-2">
      {opcoes.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={valor === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            'flex items-start gap-3 rounded-[16px] border p-4 text-left transition',
            valor === o.id ? 'border-primary/60 bg-primary/8 shadow-[0_0_0_1px_var(--color-primary)]' : 'border-line bg-surface/60 hover:border-line-strong',
          )}
        >
          <span className={cn('grid size-9 shrink-0 place-items-center rounded-[10px] border', valor === o.id ? 'border-primary/40 bg-primary/15 text-primary' : 'border-line text-muted')}>{o.icon}</span>
          <span className="min-w-0">
            <span className="flex items-center gap-2 text-sm font-bold text-ink">
              {o.titulo}
              {o.id === 'patentes' && <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-widest text-success">Recomendado</span>}
            </span>
            <span className="mt-0.5 block text-xs text-muted">{o.texto}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

/** Patentes vindas do Pedir Set (só leitura, menos o emoji). */
function PatentesSincronizadas({ data, emojis, extras, onEmoji }: { data: HierarquiaEstado; emojis: Record<string, string>; extras: Nivel[]; onEmoji: (patenteId: string, emoji: string) => void }) {
  const cargos = useMemo(() => new Map(data.cargos.map((c) => [c.id, c])), [data.cargos])
  const contagem = useMemo(() => new Map((data.arvore ?? []).map((n) => [n.cargoId, n.membros.length])), [data.arvore])
  const emExtras = new Set(extras.map((n) => n.cargoId))
  const lista = [...data.patentes].reverse()
  const noPainel = lista.filter((p) => p.cargoId && !emExtras.has(p.cargoId)).length
  return (
    <Card>
      <CardHeader
        icon={<Link2 className="size-4.5" />}
        title={`Patentes do Pedir Set · ${noPainel} no painel`}
        hint="Da mais alta para a mais baixa. Nome, sigla, ordem e cargo se editam no Pedir Set; aqui só o emoji."
        action={
          <Link to="/painel/set?aba=config" className="inline-flex h-8 items-center gap-1.5 rounded-[9px] border border-line px-3 text-xs font-bold text-muted transition hover:border-line-strong hover:text-ink">
            Editar no Pedir Set <ExternalLink className="size-3.5" />
          </Link>
        }
      />
      <ol className="divide-y divide-line">
        {lista.map((p) => {
          const cargo = p.cargoId ? cargos.get(p.cargoId) : undefined
          const nosExtras = Boolean(p.cargoId && emExtras.has(p.cargoId))
          const fora = !p.cargoId || nosExtras
          return (
            <li key={p.id} className={cn('grid items-center gap-2 px-4 py-2.5 sm:grid-cols-[3.5rem_5.5rem_minmax(0,1fr)_auto] sm:px-6', fora && 'opacity-55')}>
              <input
                aria-label={`Emoji da patente ${p.nome}`}
                placeholder="🎖️"
                value={emojis[p.id] ?? ''}
                maxLength={64}
                disabled={fora}
                onChange={(e) => onEmoji(p.id, e.target.value)}
                className="h-10 min-w-0 rounded-[10px] border border-line bg-surface-2/50 px-2 text-center text-sm outline-none transition focus:border-primary/60 disabled:cursor-not-allowed"
              />
              <span className="font-display text-sm font-semibold tracking-wide text-primary-2">{p.prefixo}</span>
              <div className="flex min-w-0 items-center gap-2.5 text-sm">
                <span className="truncate font-semibold">{p.nome}</span>
                {cargo ? (
                  <span className="inline-flex min-w-0 items-center gap-1.5 truncate text-xs text-muted">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: corCargo(cargo.cor) }} /> @{cargo.nome}
                  </span>
                ) : (
                  <span className="text-xs font-semibold text-[#f59e0b]">{p.cargoId ? 'Cargo apagado no Discord' : 'Sem cargo no Pedir Set: fica fora do painel'}</span>
                )}
              </div>
              <span className="text-right text-xs text-muted tabular-nums">{nosExtras ? 'já está nos extras' : p.cargoId && data.arvore ? `${contagem.get(p.cargoId) ?? 0} membro(s)` : ''}</span>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
