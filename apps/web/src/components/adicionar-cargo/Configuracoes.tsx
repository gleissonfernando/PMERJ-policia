import { CheckCircle2, Eye, Info, KeyRound, ListChecks, ScrollText, ShieldAlert, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { BotStatus } from '@/components/discord/BotStatus'
import { CanalSelect } from '@/components/discord/CanalSelect'
import { CargoPicker } from '@/components/discord/CargoPicker'
import { Card, CardHeader, Field } from '@/components/form'
import { SaveBar } from '@/components/SaveBar'
import { cn } from '@/lib/cn'
import { fmtDataHora } from '@/lib/format'
import {
  erroAdicionarCargo,
  urlAplicarVisibilidade,
  type AdicionarCargoApi,
  type AdicionarCargoEstado,
  type AdicionarCargoInput,
} from '@/lib/adicionarCargo'

const corCargo = (n: number) => (n ? `#${n.toString(16).padStart(6, '0')}` : '#99aab5')

const toInput = (d: AdicionarCargoEstado): AdicionarCargoInput => ({
  cargosUsar: [...d.config.cargosUsar],
  cargosPermitidos: [...d.config.cargosPermitidos],
  canalLogId: d.config.canalLogId,
})

const TRAVAS = [
  'Nunca cargos de bots, integrações ou impulso',
  'Nunca acima do cargo do bot',
  'Só abaixo do cargo mais alto de quem está dando',
  'Sem permissões de administração (banir, gerenciar cargos…)',
  'Sem cargos de patente (patente é pelo /promoção)',
]

export function Configuracoes({ data, api }: { data: AdicionarCargoEstado; api: AdicionarCargoApi }) {
  const original = useMemo(() => toInput(data), [data])
  const [draft, setDraft] = useState(original)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = JSON.stringify(draft) !== JSON.stringify(original)
  const patch = (p: Partial<AdicionarCargoInput>) => {
    setDraft((d) => ({ ...d, ...p }))
    setSaved(false)
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await api.salvarConfig(draft)
      setSaved(true)
    } catch (err) {
      setError(erroAdicionarCargo(err))
    } finally {
      setSaving(false)
    }
  }

  const livre = draft.cargosPermitidos.length === 0

  return (
    <div className="grid gap-5">
      <BotStatus botAtivo={data.botAtivo} gateway={data.gateway} />

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            icon={<KeyRound className="size-4.5" />}
            title="Quem pode usar"
            hint="Só quem tem um destes cargos usa o /adicionar-cargo. O bot confere em cada passo."
            action={<Contador n={draft.cargosUsar.length} />}
          />
          <div className="p-6">
            <CargoPicker id="ac-usar" cargos={data.cargos} selecionados={draft.cargosUsar} onChange={(cargosUsar) => patch({ cargosUsar })} max={25} />
          </div>
        </Card>

        <Card>
          <CardHeader
            icon={<ListChecks className="size-4.5" />}
            title="Cargos que podem ser dados"
            hint={livre ? 'Nenhum marcado: quem usa escolhe qualquer cargo, com as travas abaixo.' : 'Só estes cargos aparecem no menu do /adicionar-cargo.'}
            action={<Contador n={draft.cargosPermitidos.length} />}
          />
          <div className="grid gap-3 p-6">
            <CargoPicker id="ac-permitidos" cargos={data.cargos} selecionados={draft.cargosPermitidos} onChange={(cargosPermitidos) => patch({ cargosPermitidos })} max={25} />
            <div className={cn('rounded-xl border px-4 py-3 text-xs', livre ? 'border-[#f59e0b]/30 bg-[#f59e0b]/8' : 'border-line bg-surface-2/50')}>
              <p className={cn('flex items-center gap-2 font-bold', livre ? 'text-[#f59e0b]' : 'text-muted')}>
                <ShieldAlert className="size-3.5" /> {livre ? 'Modo "qualquer cargo" — travas ativas' : 'Lista definida — o bot ainda bloqueia'}
              </p>
              <ul className="mt-2 grid gap-1 text-muted">
                {(livre ? TRAVAS : TRAVAS.slice(0, 2)).map((t) => (
                  <li key={t} className="flex gap-2">
                    <span aria-hidden="true">·</span> {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      </div>

      <Visibilidade data={data} draft={draft} dirty={dirty} />

      <Card>
        <CardHeader icon={<ScrollText className="size-4.5" />} title="Registro" hint="Cada cargo dado vira uma mensagem neste canal (sem notificar ninguém)." />
        <div className="p-6">
          <Field label="Canal de registro" htmlFor="ac-canal">
            <CanalSelect id="ac-canal" canais={data.canais} value={draft.canalLogId} onChange={(canalLogId) => patch({ canalLogId })} vazio="Sem registro no Discord" />
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

/** Quem VÊ o comando no Discord: aplicado pela conta do admin (o bot não consegue sozinho). */
function Visibilidade({ data, draft, dirty }: { data: AdicionarCargoEstado; draft: AdicionarCargoInput; dirty: boolean }) {
  const v = data.config.visibilidade
  const semCargos = draft.cargosUsar.length === 0
  const bloqueio = dirty
    ? 'Salve as alterações antes de aplicar.'
    : semCargos
      ? 'Escolha quem pode usar primeiro.'
      : !data.comandoRegistrado
        ? 'O comando ainda não foi registrado (bot desligado?).'
        : null
  const estado = !v ? 'nunca' : data.visibilidadeEmDia ? 'ok' : 'desatualizado'
  const nome = (id: string) => data.cargos.find((c) => c.id === id)

  return (
    <Card>
      <CardHeader
        icon={<Eye className="size-4.5" />}
        title="Quem vê o comando no Discord"
        hint="Faz o /adicionar-cargo aparecer só para os cargos de uso (administradores sempre veem)."
        action={
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest',
              estado === 'ok' ? 'border-success/35 bg-success/10 text-success' : 'border-[#f59e0b]/35 bg-[#f59e0b]/10 text-[#f59e0b]',
            )}
          >
            {estado === 'ok' ? <CheckCircle2 className="size-3" /> : <TriangleAlert className="size-3" />}
            {estado === 'ok' ? 'Em dia' : estado === 'nunca' ? 'Não aplicado' : 'Desatualizado'}
          </span>
        }
      />
      <div className="grid gap-5 p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="grid gap-3">
          {v ? (
            <>
              <p className="text-sm text-muted">
                Aplicado em <span className="font-semibold text-ink">{fmtDataHora(v.em)}</span> por <span className="font-semibold text-ink">{v.por.nome}</span>
                {estado === 'desatualizado' && ' — os cargos de uso mudaram desde então.'}
              </p>
              <ul className="flex flex-wrap gap-1.5" aria-label="Cargos que veem o comando">
                {v.cargos.length === 0 && <li className="text-xs text-muted">Nenhum cargo (só administradores).</li>}
                {v.cargos.map((id) => {
                  const c = nome(id)
                  return (
                    <li key={id} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2/60 px-2.5 py-1 text-xs font-semibold">
                      <span className="size-2 rounded-full" style={{ background: corCargo(c?.cor ?? 0) }} />
                      {c?.nome ?? 'Cargo removido'}
                    </li>
                  )
                })}
              </ul>
            </>
          ) : (
            <p className="text-sm text-muted">Ainda não aplicado: hoje o comando aparece só para os administradores do servidor.</p>
          )}
          <p className="flex items-start gap-2 text-xs text-muted">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>
              O Discord não deixa o bot fazer isso sozinho: ao clicar, ele pede a autorização da <span className="font-semibold text-ink">sua conta</span> (precisa de
              “Gerenciar servidor” e “Gerenciar cargos”). A autorização é usada uma única vez e descartada na hora.
            </span>
          </p>
        </div>
        <div className="grid justify-items-start gap-1.5 lg:justify-items-end">
          {bloqueio ? (
            <span
              aria-disabled="true"
              className="inline-flex h-12 cursor-not-allowed items-center gap-2 rounded-[11px] bg-discord px-5 text-sm font-bold text-white opacity-50"
            >
              <Eye className="size-4" /> Aplicar no Discord
            </span>
          ) : (
            <a
              href={urlAplicarVisibilidade}
              className="inline-flex h-12 items-center gap-2 rounded-[11px] bg-discord px-5 text-sm font-bold text-white shadow-[0_10px_28px_rgb(88_101_242/0.35)] transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-discord"
            >
              <Eye className="size-4" /> {estado === 'nunca' ? 'Aplicar no Discord' : 'Aplicar de novo'}
            </a>
          )}
          {bloqueio && <span className="text-xs text-muted">{bloqueio}</span>}
        </div>
      </div>
    </Card>
  )
}

function Contador({ n }: { n: number }) {
  return <span className="text-[11px] font-extrabold uppercase tracking-widest text-muted">{n} de 25</span>
}
