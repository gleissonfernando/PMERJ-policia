import { AlertTriangle, Check, ClipboardList, Eye, KeyRound, MessageSquareShare, Plus, Send, Siren, Trash2, UserCog, Users, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChipsInput } from '@/components/ChipsInput'
import { BotStatus } from '@/components/discord/BotStatus'
import { CanalSelect } from '@/components/discord/CanalSelect'
import { CargoPicker } from '@/components/discord/CargoPicker'
import { Button, Card, CardHeader, Field, Input, Switch, Textarea } from '@/components/form'
import { SaveBar } from '@/components/SaveBar'
import { Alert } from '@/components/ui'
import type { Me } from '@/lib/api'
import { CAMPOS, erroAssuncao, novaAssuncao, type AssuncaoApi, type AssuncaoEstado, type AssuncaoInput, type CampoId } from '@/lib/assuncao'
import { cn } from '@/lib/cn'
import { ModalPreview, ResultadoPreview } from './Previews'

const CORES = [0xe10600, 0x2563eb, 0x22c55e, 0xf59e0b, 0x111827, 0xa3a3a3]
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`

const toInput = (d: AssuncaoEstado): AssuncaoInput[] => d.assuncoes.map(({ painel: _p, ...rest }) => structuredClone(rest))

export function Configuracoes({ me, data, assuncao }: { me: Me; data: AssuncaoEstado; assuncao: AssuncaoApi }) {
  const original = useMemo(() => toInput(data), [data])
  const [draft, setDraft] = useState<AssuncaoInput[]>(original)
  const [selId, setSelId] = useState<string>(original[0]?.id ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [apagar, setApagar] = useState<string | null>(null)

  const dirty = JSON.stringify(draft) !== JSON.stringify(original)

  // Dados novos do servidor (salvou, ou a atualização de 30s): sem edição pendente, o rascunho acompanha.
  const anterior = useRef(original)
  const recarregar = useRef(false)
  useEffect(() => {
    if (anterior.current === original) return
    setDraft((d) => (recarregar.current || JSON.stringify(d) === JSON.stringify(anterior.current) ? original : d))
    anterior.current = original
    recarregar.current = false
  }, [original])
  const sel = draft.find((a) => a.id === selId) ?? draft[0]
  const salva = sel ? data.assuncoes.find((a) => a.id === sel.id) : undefined

  const patch = (p: Partial<AssuncaoInput>) => {
    if (!sel) return
    setDraft((l) => l.map((a) => (a.id === sel.id ? { ...a, ...p } : a)))
    setSaved(false)
  }
  const patchCampo = (id: CampoId, p: Partial<AssuncaoInput['campos'][CampoId]>) => sel && patch({ campos: { ...sel.campos, [id]: { ...sel.campos[id], ...p } } })

  function adicionar() {
    const nova = novaAssuncao(`Assunção ${draft.length + 1}`)
    setDraft((l) => [...l, nova])
    setSelId(nova.id)
    setSaved(false)
  }

  function remover(id: string) {
    const resto = draft.filter((a) => a.id !== id)
    setDraft(resto)
    setSelId(resto[0]?.id ?? '')
    setApagar(null)
    setSaved(false)
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      recarregar.current = true
      await assuncao.salvar(draft)
      setSaved(true)
    } catch (err) {
      recarregar.current = false
      setError(erroAssuncao(err))
    } finally {
      setSaving(false)
    }
  }

  const nomeCargo = (id: string) => data.cargos.find((c) => c.id === id)?.nome ?? id

  return (
    <div className="grid gap-5 lg:grid-cols-[250px_minmax(0,1fr)] lg:items-start">
      {/* Lista de assunções */}
      <nav aria-label="Assunções de serviço" className="grid gap-2 lg:sticky lg:top-6">
        <span className="px-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted">
          Assunções · {draft.length}/{data.limites.assuncoes}
        </span>
        {draft.map((a) => {
          const pub = data.assuncoes.find((x) => x.id === a.id)?.painel
          const pronta = Boolean(pub && a.cargosPermitidos.length && a.canalResultadoId)
          return (
            <button
              key={a.id}
              type="button"
              aria-current={a.id === sel?.id}
              onClick={() => setSelId(a.id)}
              className={cn(
                'flex items-center gap-3 rounded-[14px] border p-3 text-left transition',
                a.id === sel?.id ? 'border-primary/45 bg-primary/8' : 'border-line bg-surface/60 hover:border-line-strong',
              )}
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-line bg-surface-2 text-lg" style={{ borderLeft: `3px solid ${hex(a.cor)}` }}>
                {a.emoji || <Siren className="size-4 text-muted" />}
              </span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-sm font-bold text-ink">{a.nome || 'Sem nome'}</span>
                <span className={cn('mt-0.5 flex items-center gap-1.5 text-[11px]', !a.ativa ? 'text-muted' : pronta ? 'text-success' : 'text-[#fcd34d]')}>
                  <span className={cn('size-1.5 rounded-full', !a.ativa ? 'bg-muted/60' : pronta ? 'bg-success' : 'bg-[#f59e0b]')} />
                  {!a.ativa ? 'Fechada' : !pub ? 'Painel não publicado' : !a.cargosPermitidos.length ? 'Sem cargos' : !a.canalResultadoId ? 'Sem canal de resultado' : 'Pronta'}
                </span>
              </span>
            </button>
          )
        })}
        <Button variant="ghost" onClick={adicionar} disabled={draft.length >= data.limites.assuncoes} className="mt-1 border-dashed">
          <Plus className="size-4" /> Nova assunção
        </Button>
      </nav>

      {sel ? (
        <div className="grid gap-5">
          <PainelDiscord key={sel.id} data={data} assuncao={assuncao} id={sel.id} salva={Boolean(salva)} dirty={dirty} />

          {/* Identidade */}
          <Card>
            <CardHeader
              icon={<Siren className="size-4.5" />}
              title="Identidade"
              hint="Nome e emoji viram o título do formulário e do registro. A logo vem de Painel → Aparência."
              action={
                apagar === sel.id ? (
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="danger" onClick={() => remover(sel.id)}>
                      <Check className="size-3.5" /> Remover
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setApagar(null)} aria-label="Cancelar remoção">
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setApagar(sel.id)} disabled={draft.length <= 1} title={draft.length <= 1 ? 'Mantenha pelo menos uma' : undefined}>
                    <Trash2 className="size-3.5" /> Remover
                  </Button>
                )
              }
            />
            <div className="grid gap-5 p-6">
              {apagar === sel.id && salva?.painel && (
                <p className="flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-xs text-[#ffd5d2]">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  Ao salvar, o painel desta assunção é apagado do Discord. Os registros antigos continuam no histórico.
                </p>
              )}
              <div className="grid gap-4 sm:grid-cols-[96px_minmax(0,1fr)]">
                <Field label="Emoji" htmlFor="as-emoji" hint="Um só.">
                  <Input id="as-emoji" value={sel.emoji} maxLength={16} onChange={(e) => patch({ emoji: e.target.value })} className="text-center text-lg" />
                </Field>
                <Field label="Nome" htmlFor="as-nome" hint={`Ex.: Guarnição, Moto Patrulha, Ocorrência. ${sel.nome.length}/40`}>
                  <Input id="as-nome" value={sel.nome} maxLength={40} onChange={(e) => patch({ nome: e.target.value })} aria-invalid={!sel.nome.trim()} />
                </Field>
              </div>
              <Field label="Texto do painel" htmlFor="as-desc" hint={`Aparece na mensagem com o botão “Assumir serviço”. ${sel.descricao.length}/600`}>
                <Textarea id="as-desc" rows={3} maxLength={600} value={sel.descricao} onChange={(e) => patch({ descricao: e.target.value })} />
              </Field>
              <div className="grid gap-1.5">
                <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted">Cor da barra</span>
                <div className="flex flex-wrap items-center gap-2">
                  {CORES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Cor ${hex(c)}`}
                      aria-pressed={sel.cor === c}
                      onClick={() => patch({ cor: c })}
                      className={cn('grid size-8 place-items-center rounded-full border-2 transition', sel.cor === c ? 'border-ink' : 'border-transparent hover:border-line-strong')}
                      style={{ background: hex(c) }}
                    >
                      {sel.cor === c && <Check className="size-4 text-white drop-shadow" />}
                    </button>
                  ))}
                  <label className="relative grid size-8 cursor-pointer place-items-center overflow-hidden rounded-full border border-dashed border-line-strong text-[10px] text-muted" title="Outra cor">
                    +
                    <input type="color" value={hex(sel.cor)} onChange={(e) => patch({ cor: parseInt(e.target.value.slice(1), 16) })} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Escolher outra cor" />
                  </label>
                </div>
              </div>
              <div className="divide-y divide-line rounded-[14px] border border-line px-4">
                <Switch checked={sel.ativa} onChange={(ativa) => patch({ ativa })} label="Recebendo registros" description="Desligada, o botão do painel fica cinza e ninguém consegue enviar." />
              </div>
            </div>
          </Card>

          {/* Acesso */}
          <Card>
            <CardHeader
              icon={<KeyRound className="size-4.5" />}
              title="Quem pode usar"
              hint="Só quem tem um destes cargos abre o formulário. Conferido no clique e no envio, direto do Discord."
              action={<span className="text-[11px] font-extrabold uppercase tracking-widest text-muted">{sel.cargosPermitidos.length} de 25</span>}
            />
            <div className="grid gap-4 p-6">
              <CargoPicker id="as-cargos" cargos={data.cargos} selecionados={sel.cargosPermitidos} onChange={(cargosPermitidos) => patch({ cargosPermitidos })} max={25} />
              {sel.cargosPermitidos.length === 0 && (
                <p className="flex items-start gap-2 rounded-xl border border-[#f59e0b]/40 bg-[#f59e0b]/10 px-4 py-3 text-xs text-[#fcd34d]">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  Nenhum cargo marcado: ninguém consegue registrar esta assunção até você escolher pelo menos um.
                </p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              icon={<UserCog className="size-4.5" />}
              title="Quem pode ser comandante"
              hint="Opcional. Com cargos marcados, o bot recusa um comandante que não tenha nenhum deles (ex.: só Sargentos e Oficiais)."
              action={<span className="text-[11px] font-extrabold uppercase tracking-widest text-muted">{sel.cargosComandante.length ? `${sel.cargosComandante.length} de 25` : 'Qualquer um'}</span>}
            />
            <div className="grid gap-3 p-6">
              <CargoPicker id="as-cmt" cargos={data.cargos} selecionados={sel.cargosComandante} onChange={(cargosComandante) => patch({ cargosComandante })} max={25} />
              {sel.cargosComandante.length > 0 && <p className="text-xs text-muted">Aceitos: <span className="text-ink">{sel.cargosComandante.map(nomeCargo).join(', ')}</span>.</p>}
            </div>
          </Card>

          {/* Resultado */}
          <Card>
            <CardHeader icon={<Send className="size-4.5" />} title="Para onde vai o resultado" hint="Canal onde o bot publica cada guarnição registrada, com a logo da PMERJ." />
            <div className="grid gap-4 p-6">
              <Field label="Canal de resultado" htmlFor="as-resultado">
                <CanalSelect id="as-resultado" canais={data.canais} value={sel.canalResultadoId} onChange={(canalResultadoId) => patch({ canalResultadoId })} vazio="Escolha o canal…" />
              </Field>
              <div className="divide-y divide-line rounded-[14px] border border-line px-4">
                <Switch checked={sel.mencionar} onChange={(mencionar) => patch({ mencionar })} label="Notificar os policiais" description="Os integrantes da guarnição recebem a menção. Desligado, os nomes aparecem sem notificar." />
              </div>
            </div>
          </Card>

          {/* Formulário */}
          <Card>
            <CardHeader
              icon={<ClipboardList className="size-4.5" />}
              title="Formulário"
              hint="O Discord aceita 5 campos por formulário. A quantidade de policiais é contada sozinha (comandante + motopol + demais)."
            />
            <div className="grid gap-5 p-6">
              <ol className="grid gap-3">
                {CAMPOS.map(({ id, tipo }, i) => (
                  <li key={id} className={cn('grid gap-3 rounded-[14px] border border-line bg-surface-2/30 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]', id === 'demais' && sel.maxDemais === 0 && 'opacity-50')}>
                    <div className="md:col-span-2 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted">
                      <span className="grid size-5 place-items-center rounded-md bg-primary/12 text-primary tabular-nums">{i + 1}</span>
                      {tipo}
                      {id !== 'demais' && <span className="text-danger">obrigatório</span>}
                    </div>
                    <Field label="Título" htmlFor={`as-${id}-l`} hint={`${sel.campos[id].label.length}/45`}>
                      <Input id={`as-${id}-l`} value={sel.campos[id].label} maxLength={45} onChange={(e) => patchCampo(id, { label: e.target.value })} aria-invalid={!sel.campos[id].label.trim()} />
                    </Field>
                    <Field label="Ajuda" htmlFor={`as-${id}-d`} hint={`${sel.campos[id].descricao.length}/100`}>
                      <Input id={`as-${id}-d`} value={sel.campos[id].descricao} maxLength={100} onChange={(e) => patchCampo(id, { descricao: e.target.value })} />
                    </Field>
                  </li>
                ))}
              </ol>

              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Máximo de demais integrantes" htmlFor="as-max" hint={`Guarnição de 2 a ${2 + sel.maxDemais} policiais. 0 tira o campo do formulário.`}>
                  <Input
                    id="as-max"
                    type="number"
                    min={0}
                    max={data.limites.demais}
                    value={sel.maxDemais}
                    onChange={(e) => patch({ maxDemais: Math.max(0, Math.min(data.limites.demais, Math.trunc(Number(e.target.value) || 0))) })}
                    leading={<Users className="size-4" />}
                  />
                </Field>
                <ChipsInput
                  id="as-setor-novo"
                  label="Setores"
                  itens={sel.setores}
                  onChange={(setores) => patch({ setores })}
                  placeholder="Ex.: Centro"
                  vazio="Sem setores, o campo é texto livre. Com setores, vira um menu de escolha."
                />
              </div>
            </div>
          </Card>

          {/* Prévias */}
          <Card>
            <CardHeader icon={<Eye className="size-4.5" />} title="Prévia no Discord" hint="Atualiza enquanto você edita. O formulário abre ao clicar em “Assumir serviço”." />
            <div className="grid gap-6 p-6 xl:grid-cols-2">
              <div className="grid content-start gap-3">
                <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted">Formulário</span>
                <ModalPreview a={sel} />
              </div>
              <div className="grid content-start gap-3">
                <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted">Resultado no canal</span>
                <ResultadoPreview a={sel} autor={me.user.globalName ?? me.user.username} />
              </div>
            </div>
          </Card>
        </div>
      ) : null}

      <div className="lg:col-span-2">
        <SaveBar
          dirty={dirty}
          saved={saved}
          saving={saving}
          error={error}
          onSave={save}
          onDiscard={() => {
            setDraft(original)
            setSelId((id) => (original.some((a) => a.id === id) ? id : (original[0]?.id ?? '')))
            setApagar(null)
            setError(null)
          }}
        />
      </div>
    </div>
  )
}

/* ---------- Painel "Assumir serviço" no Discord ---------- */

function PainelDiscord({ data, assuncao, id, salva, dirty }: { data: AssuncaoEstado; assuncao: AssuncaoApi; id: string; salva: boolean; dirty: boolean }) {
  const publicado = data.assuncoes.find((a) => a.id === id)?.painel ?? null
  const [canalId, setCanalId] = useState<string | null>(publicado?.canalId ?? null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const bloqueado = !salva || dirty

  async function publicar() {
    if (!canalId) return
    setSending(true)
    setError(null)
    setOk(false)
    try {
      await assuncao.publicarPainel(id, canalId)
      setOk(true)
    } catch (err) {
      setError(erroAssuncao(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <Card>
      <CardHeader
        icon={<MessageSquareShare className="size-4.5" />}
        title="Painel no Discord"
        hint="Mensagem com o botão “Assumir serviço”. Quem tem cargo autorizado clica, preenche o formulário e envia."
      />
      <div className="grid gap-4 p-6">
        <BotStatus botAtivo={data.botAtivo} gateway={data.gateway} />
        {error && <Alert>{error}</Alert>}
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <Field label="Canal do painel" htmlFor={`as-painel-${id}`}>
            <CanalSelect id={`as-painel-${id}`} canais={data.canais} value={canalId} onChange={setCanalId} vazio="Escolha o canal…" disabled={!data.botAtivo} />
          </Field>
          <Button onClick={publicar} loading={sending} disabled={!canalId || !data.botAtivo || bloqueado} className="h-11">
            {!sending && <Send className="size-4" />} {publicado?.canalId === canalId ? 'Atualizar mensagem' : 'Publicar no canal'}
          </Button>
        </div>
        <Hint ok={ok} bloqueado={bloqueado} publicado={Boolean(publicado)} />
      </div>
    </Card>
  )
}

function Hint({ ok, bloqueado, publicado }: { ok: boolean; bloqueado: boolean; publicado: boolean }): ReactNode {
  if (bloqueado) return <p className="text-xs font-semibold text-[#fcd34d]">Salve as alterações antes de publicar.</p>
  return (
    <p className={cn('text-xs', ok ? 'font-semibold text-success' : 'text-muted')}>
      {ok
        ? 'Pronto! Confira a mensagem no canal.'
        : publicado
          ? 'Painel já publicado. Nome, cargos, cor e logo atualizam a mensagem sozinhos ao salvar. Trocar o canal apaga a mensagem antiga.'
          : 'O bot precisa ver o canal, enviar mensagens e anexar arquivos.'}
    </p>
  )
}
