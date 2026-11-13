import { CalendarClock, FolderTree, KeyRound, ListChecks, MessageSquareShare, RefreshCw, Send, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { BotStatus } from '@/components/discord/BotStatus'
import { CanalSelect } from '@/components/discord/CanalSelect'
import { CargoPicker } from '@/components/discord/CargoPicker'
import { Button, Card, CardHeader, Field, Select } from '@/components/form'
import { ListEditor } from '@/components/ListEditor'
import { SaveBar } from '@/components/SaveBar'
import { Alert } from '@/components/ui'
import { cn } from '@/lib/cn'
import type { CanalTexto } from '@/lib/discord'
import { fmtDataHora } from '@/lib/format'
import { erroOcorrencia, type OcorrenciaApi, type OcorrenciaEstado, type OcorrenciaInput, type TipoOcorrencia } from '@/lib/ocorrencia'

const toInput = (d: OcorrenciaEstado): OcorrenciaInput => ({
  painelCanalId: d.config.painelCanalId,
  destinoCanalId: d.config.destinoCanalId,
  categoriaId: d.config.categoriaId,
  cargosRegistrar: [...d.config.cargosRegistrar],
  cargosGestores: [...d.config.cargosGestores],
  canalResumoId: d.config.canalResumoId,
  tipos: d.config.tipos.map((t) => ({ ...t })),
})

const novoTipo = (): TipoOcorrencia => ({ id: `t-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, nome: '', emoji: '📋', descricao: '' })

export function Configuracoes({ data, ocorrencia }: { data: OcorrenciaEstado; ocorrencia: OcorrenciaApi }) {
  const original = useMemo(() => toInput(data), [data])
  const [draft, setDraft] = useState(original)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const dirty = JSON.stringify(draft) !== JSON.stringify(original)
  const patch = (p: Partial<OcorrenciaInput>) => {
    setDraft((d) => ({ ...d, ...p }))
    setSaved(false)
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      setAviso(await ocorrencia.salvarConfig({ ...draft, tipos: draft.tipos.map((t) => ({ ...t, nome: t.nome.trim(), descricao: t.descricao.trim(), emoji: t.emoji.trim() })) }))
      setSaved(true)
    } catch (err) {
      setError(erroOcorrencia(err))
    } finally {
      setSaving(false)
    }
  }

  const texto = data.canais.filter((c) => c.tipo === 'texto' || c.tipo === 'anuncios')

  return (
    <div className="grid gap-5">
      <BotStatus botAtivo={data.botAtivo} gateway={data.gateway} />

      <Card>
        <CardHeader
          icon={<MessageSquareShare className="size-4.5" />}
          title="Canais e painel"
          hint="O painel tem o botão “Registrar ocorrência”. Cada registro é preenchido num canal temporário e, ao enviar, sai completo no canal das ocorrências."
        />
        <div className="grid gap-6 p-6">
          <div className="grid gap-5 lg:grid-cols-3">
            <Field label="Canal do painel" htmlFor="oc-painel" hint="Onde os policiais clicam em “Registrar ocorrência”.">
              <CanalSelect id="oc-painel" canais={texto} value={draft.painelCanalId} onChange={(painelCanalId) => patch({ painelCanalId })} vazio="Escolher canal..." />
            </Field>
            <Field label="Canal das ocorrências" htmlFor="oc-destino" hint="Onde sai cada ocorrência enviada, com relato, participantes e fotos.">
              <CanalSelect id="oc-destino" canais={texto} value={draft.destinoCanalId} onChange={(destinoCanalId) => patch({ destinoCanalId })} vazio="Escolher canal..." />
            </Field>
            <Field label="Categoria dos canais temporários" htmlFor="oc-cat" hint="O bot precisa de “Gerenciar canais” nela.">
              <div className="relative">
                <Select id="oc-cat" value={draft.categoriaId ?? ''} onChange={(e) => patch({ categoriaId: e.target.value || null })} disabled={data.categorias.length === 0} className="pl-10">
                  <option value="">Sem categoria</option>
                  {data.categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </Select>
                <FolderTree className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
              </div>
            </Field>
          </div>
          {data.config.painelErro && <Alert>Último erro ao publicar o painel: {data.config.painelErro}.</Alert>}
          <Publicar data={data} ocorrencia={ocorrencia} dirty={dirty} aviso={aviso} />
        </div>
      </Card>

      <ResumoSemanal data={data} ocorrencia={ocorrencia} draft={draft} dirty={dirty} canais={texto} onCanal={(canalResumoId) => patch({ canalResumoId })} />

      <ListEditor<TipoOcorrencia>
        icon={<ListChecks className="size-4.5" />}
        title="Tipos de ocorrência"
        hint="Aparecem no select do modal, na ordem desta lista. Emoji opcional (unicode ou <:nome:id>)."
        items={draft.tipos}
        onChange={(tipos) => patch({ tipos })}
        create={novoTipo}
        max={data.limites.tipos}
        ordered
        columns={[
          { key: 'emoji', label: 'Emoji', max: 64, width: 'w-16 text-center' },
          { key: 'nome', label: 'Nome da ocorrência', max: data.limites.tipoNome },
          { key: 'descricao', label: 'Descrição curta (opcional)', max: data.limites.tipoDescricao },
        ]}
      />

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            icon={<KeyRound className="size-4.5" />}
            title="Quem pode registrar"
            hint="Vazio = qualquer membro do servidor. O cargo é conferido a cada clique."
            action={<span className="text-[11px] font-extrabold uppercase tracking-widest text-muted">{draft.cargosRegistrar.length} de 25</span>}
          />
          <div className="p-6">
            <CargoPicker id="oc-registrar" cargos={data.cargos} selecionados={draft.cargosRegistrar} onChange={(cargosRegistrar) => patch({ cargosRegistrar })} max={25} />
          </div>
        </Card>
        <Card>
          <CardHeader
            icon={<Users className="size-4.5" />}
            title="Gestores"
            hint="Enxergam os canais temporários e veem as ocorrências e evidências nesta página."
            action={<span className="text-[11px] font-extrabold uppercase tracking-widest text-muted">{draft.cargosGestores.length} de 25</span>}
          />
          <div className="p-6">
            <CargoPicker id="oc-gestores" cargos={data.cargos} selecionados={draft.cargosGestores} onChange={(cargosGestores) => patch({ cargosGestores })} max={25} />
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

function Publicar({ data, ocorrencia, dirty, aviso }: { data: OcorrenciaEstado; ocorrencia: OcorrenciaApi; dirty: boolean; aviso: string | null }) {
  const [publicando, setPublicando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const c = data.config

  async function publicar(recriar: boolean) {
    setPublicando(true)
    setErro(null)
    setOk(null)
    try {
      await ocorrencia.publicar(recriar)
      setOk(recriar ? 'Painel publicado de novo no Discord.' : 'Painel publicado no Discord.')
    } catch (err) {
      setErro(erroOcorrencia(err))
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

/* ---------- Resumo semanal de apreensões ---------- */

function ResumoSemanal({
  data,
  ocorrencia,
  draft,
  dirty,
  canais,
  onCanal,
}: {
  data: OcorrenciaEstado
  ocorrencia: OcorrenciaApi
  draft: OcorrenciaInput
  dirty: boolean
  canais: CanalTexto[]
  onCanal: (id: string | null) => void
}) {
  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const r = data.resumo

  async function enviar() {
    setEnviando(true)
    setMsg(null)
    try {
      await ocorrencia.enviarResumo()
      setMsg({ ok: true, texto: 'Resumo dos últimos 7 dias enviado no canal.' })
    } catch (err) {
      setMsg({ ok: false, texto: erroOcorrencia(err) })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Card>
      <CardHeader icon={<CalendarClock className="size-4.5" />} title="Resumo semanal de apreensões" hint="Toda segunda-feira, às 09:00 (Brasília), sai nas logs um resumo das apreensões e presos dos 7 dias anteriores." />
      <div className="grid gap-5 p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-4">
          <Field label="Canal de logs do resumo" htmlFor="oc-resumo" hint={draft.canalResumoId ? `Próximo resumo automático: ${fmtDataHora(r.proximo)}.` : 'Sem canal: o resumo não é enviado.'}>
            <CanalSelect id="oc-resumo" canais={canais} value={draft.canalResumoId} onChange={onCanal} vazio="Sem resumo semanal" />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="ghost" onClick={enviar} loading={enviando} disabled={!data.botAtivo || dirty || !data.config.canalResumoId}>
              {!enviando && <Send className="size-4" />} Enviar resumo agora
            </Button>
            <span className={cn('text-xs', msg ? (msg.ok ? 'font-semibold text-success' : 'text-danger') : 'text-muted')}>
              {msg?.texto ?? (dirty ? 'Salve antes de enviar.' : 'Manda os últimos 7 dias para conferir como fica.')}
            </span>
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-3 self-start">
          {[
            ['Ocorrências', r.ocorrencias],
            ['Com apreensão', r.apreensoes],
            ['Presos', r.presos],
          ].map(([t, n]) => (
            <div key={t} className="rounded-xl border border-line bg-surface-2/40 p-3">
              <dt className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-muted">{t}</dt>
              <dd className="display mt-1 text-2xl tabular-nums">{n}</dd>
            </div>
          ))}
          <p className="col-span-3 text-xs text-muted">Últimos 7 dias, até agora.</p>
        </dl>
      </div>
    </Card>
  )
}
