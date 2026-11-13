import { ArrowRight, BellRing, ListChecks, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ChipsInput } from '@/components/ChipsInput'
import { BotStatus } from '@/components/discord/BotStatus'
import { CanalSelect } from '@/components/discord/CanalSelect'
import { CargoPicker } from '@/components/discord/CargoPicker'
import { Button, Card, CardHeader, Field, Input, Select, Switch } from '@/components/form'
import { SaveBar } from '@/components/SaveBar'
import { cn } from '@/lib/cn'
import { erroHoras, type HorasApi, type HorasEstado, type HorasInput, type RegraHoras } from '@/lib/horas'

const toInput = (d: HorasEstado): HorasInput =>
  structuredClone({ ativo: d.config.ativo, canalAlertaId: d.config.canalAlertaId, cargosMencionar: d.config.cargosMencionar, contagem: d.config.contagem, regras: d.config.regras })

export function Configuracoes({ data, api }: { data: HorasEstado; api: HorasApi }) {
  const original = useMemo(() => toInput(data), [data])
  const [draft, setDraft] = useState(original)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = JSON.stringify(draft) !== JSON.stringify(original)
  const patch = (p: Partial<HorasInput>) => {
    setDraft((d) => ({ ...d, ...p }))
    setSaved(false)
  }
  const setRegra = (id: string, p: Partial<RegraHoras>) => patch({ regras: draft.regras.map((r) => (r.id === id ? { ...r, ...p } : r)) })
  const ordem = (id: string) => data.patentes.findIndex((p) => p.id === id)
  const regras = [...draft.regras].sort((a, b) => ordem(a.dePatenteId) - ordem(b.dePatenteId))

  function novaRegra() {
    const usadas = new Set(draft.regras.map((r) => r.dePatenteId))
    const i = data.patentes.findIndex((p) => !usadas.has(p.id))
    const de = data.patentes[i] ?? data.patentes[0]
    const para = data.patentes[i + 1] ?? data.patentes[0]
    if (!de || !para) return
    patch({ regras: [...draft.regras, { id: `regra-${crypto.randomUUID().slice(0, 8)}`, dePatenteId: de.id, paraPatenteId: para.id, horas: 10, cursos: [], requisitos: [] }] })
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await api.salvarConfig(draft)
      setSaved(true)
    } catch (err) {
      setError(erroHoras(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-5">
      <BotStatus botAtivo={data.botAtivo} gateway={data.gateway} />

      <Card>
        <CardHeader icon={<BellRing className="size-4.5" />} title="Alertas no Discord" hint="Cada policial que bater as horas da próxima patente gera um alerta V2 no canal escolhido." />
        <div className="grid gap-5 p-6">
          <div className="divide-y divide-line rounded-[14px] border border-line px-4">
            <Switch checked={draft.ativo} onChange={(ativo) => patch({ ativo })} label="Enviar alertas" description="Confere quando horas são aprovadas, quando a patente muda e a cada 30 minutos." />
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Canal dos alertas" htmlFor="hr-canal">
              <CanalSelect id="hr-canal" canais={data.canais} value={draft.canalAlertaId} onChange={(canalAlertaId) => patch({ canalAlertaId })} vazio="Só no site" />
            </Field>
            <Field label="Quais horas contam" htmlFor="hr-contagem" hint={draft.contagem === 'total' ? 'Horas aprovadas no Bate-ponto desde o último /zerar horas.' : 'Só as horas aprovadas depois da última promoção (recomeça a cada patente).'}>
              <Select id="hr-contagem" value={draft.contagem} onChange={(e) => patch({ contagem: e.target.value as HorasInput['contagem'] })}>
                <option value="total">Total de horas aprovadas</option>
                <option value="promocao">Desde a última promoção</option>
              </Select>
            </Field>
          </div>
          <div className="grid gap-2">
            <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted">Cargos notificados em cada alerta · {draft.cargosMencionar.length} de 5</span>
            <CargoPicker id="hr-mencionar" cargos={data.cargos} selecionados={draft.cargosMencionar} onChange={(cargosMencionar) => patch({ cargosMencionar })} max={5} />
            <p className="text-xs text-muted">Ex.: Comando. Só a primeira publicação notifica; a atualização de "Promovido" não.</p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          icon={<ListChecks className="size-4.5" />}
          title="Requisitos por promoção"
          hint="Patentes e ordem vêm do Pedir Set. Horas comprovadas e cursos são conferidos sozinhos; os demais requisitos aparecem no alerta para o Comando conferir."
          action={
            <Button size="sm" variant="ghost" onClick={novaRegra} disabled={draft.regras.length >= Math.min(40, data.patentes.length)}>
              <Plus className="size-3.5" /> Promoção
            </Button>
          }
        />
        {regras.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-muted">Nenhuma promoção configurada. Clique em “Promoção” para adicionar.</p>
        ) : (
          <ul className="divide-y divide-line">
            {regras.map((r) => (
              <li key={r.id} className="grid gap-4 px-6 py-5">
                <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_8rem_auto]">
                  <Field label="De" htmlFor={`${r.id}-de`}>
                    <Select id={`${r.id}-de`} value={r.dePatenteId} onChange={(e) => setRegra(r.id, { dePatenteId: e.target.value })}>
                      {data.patentes.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.prefixo} · {p.nome}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <ArrowRight className="mb-3 hidden size-4 text-muted sm:block" aria-hidden="true" />
                  <Field label="Para" htmlFor={`${r.id}-para`}>
                    <Select id={`${r.id}-para`} value={r.paraPatenteId} onChange={(e) => setRegra(r.id, { paraPatenteId: e.target.value })}>
                      {data.patentes.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.prefixo} · {p.nome}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Horas" htmlFor={`${r.id}-h`}>
                    <Input id={`${r.id}-h`} type="number" min={0} max={10000} value={r.horas} onChange={(e) => setRegra(r.id, { horas: Math.max(0, Math.min(10000, Math.round(Number(e.target.value) || 0))) })} />
                  </Field>
                  <button
                    type="button"
                    onClick={() => patch({ regras: draft.regras.filter((x) => x.id !== r.id) })}
                    aria-label="Remover esta promoção"
                    className="mb-1 grid size-9 place-items-center rounded-[9px] text-muted transition hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="grid content-start gap-1.5">
                    <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted">Cursos exigidos · {r.cursos.length}</span>
                    {data.cursos.length === 0 ? (
                      <p className="text-xs text-muted">Nenhum curso cadastrado. Use os requisitos ao lado ou cadastre em Cadastro de cursos.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {data.cursos.map((c) => {
                          const on = r.cursos.includes(c.id)
                          return (
                            <button
                              key={c.id}
                              type="button"
                              aria-pressed={on}
                              title={c.nome}
                              onClick={() => setRegra(r.id, { cursos: on ? r.cursos.filter((x) => x !== c.id) : [...r.cursos, c.id] })}
                              className={cn(
                                'rounded-full border px-3 py-1 font-display text-xs font-semibold tracking-wide transition',
                                on ? 'border-primary/50 bg-primary/15 text-primary-2' : 'border-line text-muted hover:border-line-strong hover:text-ink',
                              )}
                            >
                              {c.sigla}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                  <ChipsInput
                    id={`${r.id}-req`}
                    label="Outros requisitos"
                    itens={r.requisitos}
                    onChange={(requisitos) => setRegra(r.id, { requisitos })}
                    max={10}
                    maxLength={120}
                    placeholder="Ex.: 1 qualificação operacional"
                    vazio="Só horas e cursos."
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <SaveBar dirty={dirty} saved={saved} saving={saving} error={error} onSave={save} onDiscard={() => { setDraft(original); setError(null) }} />
    </div>
  )
}
