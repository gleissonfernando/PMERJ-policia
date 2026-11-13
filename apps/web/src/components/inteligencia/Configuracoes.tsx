import { AlertTriangle, Check, ClipboardList, Eye, KeyRound, MessageSquareShare, Send, UserSearch, Users } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChipsInput } from '@/components/ChipsInput'
import { BotStatus } from '@/components/discord/BotStatus'
import { CanalSelect } from '@/components/discord/CanalSelect'
import { CargoPicker } from '@/components/discord/CargoPicker'
import { Button, Card, CardHeader, Field, Input, Switch, Textarea } from '@/components/form'
import { SaveBar } from '@/components/SaveBar'
import { Alert } from '@/components/ui'
import type { Me } from '@/lib/api'
import { cn } from '@/lib/cn'
import { CAMPOS_INTEL, erroInteligencia, type CampoIntel, type InteligenciaApi, type InteligenciaEstado, type InteligenciaInput } from '@/lib/inteligencia'
import { ModalPreview, ResultadoPreview } from './Previews'

const CORES = [0x111827, 0xe10600, 0x2563eb, 0x22c55e, 0xf59e0b, 0xa3a3a3]
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`

function toInput(d: InteligenciaEstado): InteligenciaInput {
  const { painel: _p, atualizadoEm: _a, atualizadoPor: _b, ...rest } = d.config
  return structuredClone(rest)
}

export function Configuracoes({ me, data, intel }: { me: Me; data: InteligenciaEstado; intel: InteligenciaApi }) {
  const original = useMemo(() => toInput(data), [data])
  const [draft, setDraft] = useState<InteligenciaInput>(original)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
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

  const patch = (p: Partial<InteligenciaInput>) => {
    setDraft((d) => ({ ...d, ...p }))
    setSaved(false)
  }
  const patchCampo = (id: CampoIntel, p: Partial<InteligenciaInput['campos'][CampoIntel]>) => patch({ campos: { ...draft.campos, [id]: { ...draft.campos[id], ...p } } })

  async function save() {
    setSaving(true)
    setError(null)
    try {
      recarregar.current = true
      await intel.salvar(draft)
      setSaved(true)
    } catch (err) {
      recarregar.current = false
      setError(erroInteligencia(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-5">
      <PainelDiscord data={data} intel={intel} dirty={dirty} />

      {/* Identidade */}
      <Card>
        <CardHeader icon={<UserSearch className="size-4.5" />} title="Identidade" hint="Nome e emoji viram o título do formulário e do registro. A logo vem de Painel → Aparência." />
        <div className="grid gap-5 p-6">
          <div className="grid gap-4 sm:grid-cols-[96px_minmax(0,1fr)]">
            <Field label="Emoji" htmlFor="in-emoji" hint="Um só.">
              <Input id="in-emoji" value={draft.emoji} maxLength={16} onChange={(e) => patch({ emoji: e.target.value })} className="text-center text-lg" />
            </Field>
            <Field label="Nome" htmlFor="in-nome" hint={`Título: “Assunção de serviço · ${draft.nome || '…'}”. ${draft.nome.length}/40`}>
              <Input id="in-nome" value={draft.nome} maxLength={40} onChange={(e) => patch({ nome: e.target.value })} aria-invalid={!draft.nome.trim()} />
            </Field>
          </div>
          <Field label="Texto do painel" htmlFor="in-desc" hint={`Aparece na mensagem com o botão “Assumir serviço”. ${draft.descricao.length}/600`}>
            <Textarea id="in-desc" rows={3} maxLength={600} value={draft.descricao} onChange={(e) => patch({ descricao: e.target.value })} />
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
          <div className="divide-y divide-line rounded-[14px] border border-line px-4">
            <Switch checked={draft.ativa} onChange={(ativa) => patch({ ativa })} label="Recebendo registros" description="Desligada, o botão do painel fica cinza e ninguém consegue enviar." />
          </div>
        </div>
      </Card>

      {/* Acesso */}
      <Card>
        <CardHeader
          icon={<KeyRound className="size-4.5" />}
          title="Quem pode usar"
          hint="Só quem tem um destes cargos abre o formulário e vê os registros aqui no painel. Conferido no clique e no envio."
          action={<span className="text-[11px] font-extrabold uppercase tracking-widest text-muted">{draft.cargosPermitidos.length} de 25</span>}
        />
        <div className="grid gap-4 p-6">
          <CargoPicker id="in-cargos" cargos={data.cargos} selecionados={draft.cargosPermitidos} onChange={(cargosPermitidos) => patch({ cargosPermitidos })} max={25} />
          {draft.cargosPermitidos.length === 0 && (
            <p className="flex items-start gap-2 rounded-xl border border-[#f59e0b]/40 bg-[#f59e0b]/10 px-4 py-3 text-xs text-[#fcd34d]">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              Nenhum cargo marcado: ninguém consegue registrar até você escolher pelo menos um.
            </p>
          )}
        </div>
      </Card>

      {/* Resultado */}
      <Card>
        <CardHeader icon={<Send className="size-4.5" />} title="Onde sai o resultado" hint="Canal onde o bot publica cada registro, com fotos, links e a logo da PMERJ. Use um canal restrito da Inteligência." />
        <div className="grid gap-4 p-6">
          <Field label="Canal de resultado" htmlFor="in-resultado">
            <CanalSelect id="in-resultado" canais={data.canais} value={draft.canalResultadoId} onChange={(canalResultadoId) => patch({ canalResultadoId })} vazio="Escolha o canal…" />
          </Field>
          <div className="divide-y divide-line rounded-[14px] border border-line px-4">
            <Switch checked={draft.mencionar} onChange={(mencionar) => patch({ mencionar })} label="Notificar os policiais" description="Os policiais citados recebem a menção. Desligado, os nomes aparecem sem notificar." />
          </div>
        </div>
      </Card>

      {/* Formulário */}
      <Card>
        <CardHeader icon={<ClipboardList className="size-4.5" />} title="Formulário" hint="5 campos, o máximo do Discord. A foto pode vir por upload ou por link." />
        <div className="grid gap-5 p-6">
          <ol className="grid gap-3">
            {CAMPOS_INTEL.map(({ id, tipo, obrigatorio }, i) => (
              <li key={id} className="grid gap-3 rounded-[14px] border border-line bg-surface-2/30 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
                <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted md:col-span-2">
                  <span className="grid size-5 place-items-center rounded-md bg-primary/12 text-primary tabular-nums">{i + 1}</span>
                  {tipo}
                  {obrigatorio && <span className="text-danger">obrigatório</span>}
                </div>
                <Field label="Título" htmlFor={`in-${id}-l`} hint={`${draft.campos[id].label.length}/45`}>
                  <Input id={`in-${id}-l`} value={draft.campos[id].label} maxLength={45} onChange={(e) => patchCampo(id, { label: e.target.value })} aria-invalid={!draft.campos[id].label.trim()} />
                </Field>
                <Field label="Ajuda" htmlFor={`in-${id}-d`} hint={`${draft.campos[id].descricao.length}/100`}>
                  <Input id={`in-${id}-d`} value={draft.campos[id].descricao} maxLength={100} onChange={(e) => patchCampo(id, { descricao: e.target.value })} />
                </Field>
              </li>
            ))}
          </ol>

          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Máximo de policiais" htmlFor="in-max" hint="Opções do campo de quantidade. A quantidade precisa bater com os policiais selecionados.">
              <Input
                id="in-max"
                type="number"
                min={1}
                max={data.limites.policiais}
                value={draft.maxPoliciais}
                onChange={(e) => patch({ maxPoliciais: Math.max(1, Math.min(data.limites.policiais, Math.trunc(Number(e.target.value) || 1))) })}
                leading={<Users className="size-4" />}
              />
            </Field>
            <ChipsInput
              id="in-objeto-novo"
              label="Comunidades / organizações"
              itens={draft.objetos}
              onChange={(objetos) => patch({ objetos })}
              maxLength={100}
              placeholder="Ex.: Comunidade X"
              vazio="Sem itens, o objeto da investigação é texto livre. Com itens, vira um menu de escolha."
            />
          </div>
          <div className="divide-y divide-line rounded-[14px] border border-line px-4">
            <Switch
              checked={draft.exigirFoto}
              onChange={(exigirFoto) => patch({ exigirFoto })}
              label="Exigir foto"
              description={`Pelo menos uma foto: por upload (até ${data.limites.fotos}) ou por link (até ${data.limites.links}).`}
            />
          </div>
        </div>
      </Card>

      {/* Prévias */}
      <Card>
        <CardHeader icon={<Eye className="size-4.5" />} title="Prévia no Discord" hint="Atualiza enquanto você edita." />
        <div className="grid gap-6 p-6 xl:grid-cols-2">
          <div className="grid content-start gap-3">
            <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted">Formulário</span>
            <ModalPreview cfg={draft} />
          </div>
          <div className="grid content-start gap-3">
            <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted">Resultado no canal</span>
            <ResultadoPreview cfg={draft} autor={me.user.globalName ?? me.user.username} />
          </div>
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

/* ---------- Painel "Assumir serviço" no Discord ---------- */

function PainelDiscord({ data, intel, dirty }: { data: InteligenciaEstado; intel: InteligenciaApi; dirty: boolean }) {
  const publicado = data.config.painel
  const [canalId, setCanalId] = useState<string | null>(publicado?.canalId ?? null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  async function publicar() {
    if (!canalId) return
    setSending(true)
    setError(null)
    setOk(false)
    try {
      await intel.publicarPainel(canalId)
      setOk(true)
    } catch (err) {
      setError(erroInteligencia(err))
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
          <Field label="Canal do painel" htmlFor="in-painel">
            <CanalSelect id="in-painel" canais={data.canais} value={canalId} onChange={setCanalId} vazio="Escolha o canal…" disabled={!data.botAtivo} />
          </Field>
          <Button onClick={publicar} loading={sending} disabled={!canalId || !data.botAtivo || dirty} className="h-11">
            {!sending && <Send className="size-4" />} {publicado?.canalId === canalId ? 'Atualizar mensagem' : 'Publicar no canal'}
          </Button>
        </div>
        <p className={cn('text-xs', dirty ? 'font-semibold text-[#fcd34d]' : ok ? 'font-semibold text-success' : 'text-muted')}>
          {dirty
            ? 'Salve as alterações antes de publicar.'
            : ok
              ? 'Pronto! Confira a mensagem no canal.'
              : publicado
                ? 'Painel já publicado. Nome, cargos, cor e logo atualizam a mensagem sozinhos ao salvar. Trocar o canal apaga a mensagem antiga.'
                : 'O bot precisa ver o canal, enviar mensagens e anexar arquivos.'}
        </p>
      </div>
    </Card>
  )
}
