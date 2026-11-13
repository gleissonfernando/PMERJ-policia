import { ExternalLink, Info, KeyRound, Medal, Megaphone, TrendingDown } from 'lucide-react'
import { Link } from 'react-router'
import { useMemo, useState } from 'react'
import { BotStatus } from '@/components/discord/BotStatus'
import { CanalSelect } from '@/components/discord/CanalSelect'
import { CargoPicker } from '@/components/discord/CargoPicker'
import { Card, CardHeader, Field, Input } from '@/components/form'
import { SaveBar } from '@/components/SaveBar'
import { avatarUrl, type Me } from '@/lib/api'
import { useLogoUrl } from '@/lib/branding'
import { erroPromocao, type PromocaoApi, type PromocaoEstado, type PromocaoInput } from '@/lib/promocao'

function toInput(d: PromocaoEstado): PromocaoInput {
  return {
    cargosPromover: [...d.config.cargosPromover],
    canalAnuncioId: d.config.canalAnuncioId,
    cargosRebaixar: [...d.config.cargosRebaixar],
    canalRebaixamentoId: d.config.canalRebaixamentoId,
    rodape: d.config.rodape,
  }
}

export function Configuracoes({ me, data, promocao }: { me: Me; data: PromocaoEstado; promocao: PromocaoApi }) {
  const original = useMemo(() => toInput(data), [data])
  const [draft, setDraft] = useState(original)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = JSON.stringify(draft) !== JSON.stringify(original)
  const patch = (p: Partial<PromocaoInput>) => {
    setDraft((d) => ({ ...d, ...p }))
    setSaved(false)
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await promocao.salvarConfig(draft)
      setSaved(true)
    } catch (err) {
      setError(erroPromocao(err))
    } finally {
      setSaving(false)
    }
  }

  const semCargo = data.patentes.filter((p) => !p.cargoId).length
  const cargoDe = (id: string | null) => (id ? data.cargos.find((c) => c.id === id) : undefined)

  return (
    <div className="grid gap-5">
      <BotStatus botAtivo={data.botAtivo} gateway={data.gateway} />

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            icon={<KeyRound className="size-4.5" />}
            title="Quem pode promover"
            hint="Só quem tem um destes cargos usa o /promoção."
            action={<span className="text-[11px] font-extrabold uppercase tracking-widest text-muted">{draft.cargosPromover.length} de 25</span>}
          />
          <div className="grid gap-3 p-6">
            <CargoPicker id="promo-cargos" cargos={data.cargos} selecionados={draft.cargosPromover} onChange={(cargosPromover) => patch({ cargosPromover })} max={25} />
            <p className="flex items-start gap-2 rounded-xl border border-line bg-surface-2/50 px-4 py-3 text-xs text-muted">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Para o comando <span className="font-semibold text-ink">aparecer</span> só para esses cargos: Configurações do servidor → Integrações → PMERJ →{' '}
                <span className="font-mono">/promoção</span> → adicione os cargos. O Discord não deixa o bot fazer isso sozinho; de qualquer forma, o bot confere o cargo em cada passo.
              </span>
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader icon={<Megaphone className="size-4.5" />} title="Anúncio" hint="Sai no canal escolhido a cada promoção, notificando só o promovido." />
          <div className="grid gap-5 p-6">
            <Field label="Canal do anúncio" htmlFor="promo-canal">
              <CanalSelect id="promo-canal" canais={data.canais} value={draft.canalAnuncioId} onChange={(canalAnuncioId) => patch({ canalAnuncioId })} vazio="Sem anúncio" />
            </Field>
            <Field label="Rodapé" htmlFor="promo-rodape" hint={`${draft.rodape.length}/100`}>
              <Input id="promo-rodape" value={draft.rodape} maxLength={100} onChange={(e) => patch({ rodape: e.target.value })} />
            </Field>
            <Previa me={me} rodape={draft.rodape} />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          icon={<TrendingDown className="size-4.5" />}
          title="Rebaixamento"
          hint="Quem pode usar o /rebaixamento e onde sai o anúncio. A corregedoria também anuncia rebaixamentos aqui."
          action={<span className="text-[11px] font-extrabold uppercase tracking-widest text-muted">{draft.cargosRebaixar.length} de 25</span>}
        />
        <div className="grid gap-5 p-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="grid content-start gap-2">
            <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted">Quem pode rebaixar</span>
            <CargoPicker id="rebaixar-cargos" cargos={data.cargos} selecionados={draft.cargosRebaixar} onChange={(cargosRebaixar) => patch({ cargosRebaixar })} max={25} />
          </div>
          <div className="grid content-start gap-3">
            <Field label="Canal do anúncio de rebaixamento" htmlFor="rebaixar-canal">
              <CanalSelect id="rebaixar-canal" canais={data.canais} value={draft.canalRebaixamentoId} onChange={(canalRebaixamentoId) => patch({ canalRebaixamentoId })} vazio="Sem anúncio" />
            </Field>
            <p className="text-xs text-muted">
              No /rebaixamento só aparecem patentes <span className="font-semibold text-ink">abaixo</span> da atual. O cargo da patente é trocado e a sigla do apelido muda (nome e ID ficam). Libere o comando para esses cargos em Integrações, como o /promoção.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          icon={<Medal className="size-4.5" />}
          title="Patentes e cargos · sincronizado com o Pedir Set"
          hint="Ordem = hierarquia (de baixo para cima). Na promoção, o bot tira o cargo da patente antiga, dá o da nova e troca a sigla no apelido."
          action={
            <Link to="/painel/set?aba=config" className="inline-flex h-8 items-center gap-1.5 rounded-[9px] border border-line px-3 text-xs font-bold text-muted transition hover:border-line-strong hover:text-ink">
              Editar no Pedir Set <ExternalLink className="size-3.5" />
            </Link>
          }
        />
        <ul className="divide-y divide-line">
          {data.patentes.map((p, i) => {
            const cargo = cargoDe(p.cargoId)
            return (
              <li key={p.id} className="grid items-center gap-2 px-6 py-2.5 sm:grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1.2fr)]">
                <span className="font-display text-sm text-muted tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                <span className="min-w-0 truncate text-sm">
                  <span className="mr-2 font-display font-semibold tracking-wide text-primary-2">{p.prefixo}</span>
                  {p.nome}
                </span>
                {cargo ? (
                  <span className="inline-flex min-w-0 items-center gap-2 truncate text-sm">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: cargo.cor ? `#${cargo.cor.toString(16).padStart(6, '0')}` : '#99aab5' }} />@{cargo.nome}
                  </span>
                ) : (
                  <span className="text-xs font-semibold text-[#f59e0b]">{p.cargoId ? 'Cargo apagado no Discord' : 'Sem cargo: só o apelido muda'}</span>
                )}
              </li>
            )
          })}
        </ul>
        <p className="flex items-start gap-2 border-t border-line px-6 py-4 text-xs text-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {semCargo > 0 && <span className="font-semibold text-[#f59e0b]">{semCargo} sem cargo. </span>}
            Patentes, siglas, ordem e cargos se configuram <span className="font-semibold text-ink">só no Pedir Set</span> e valem para Promoções, Rebaixamento, Hierarquia, Sistema de Horas e Cursos. O cargo do bot precisa ficar{' '}
            <span className="font-semibold text-ink">acima</span> de todos estes cargos. Formato do apelido: <span className="font-mono text-ink">{data.formato}</span>.
          </span>
        </p>
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

/** Prévia do anúncio, como sai no Discord. */
function Previa({ me, rodape }: { me: Me; rodape: string }) {
  const logo = useLogoUrl()
  const nome = me.user.globalName ?? me.user.username
  return (
    <div className="grid gap-1.5">
      <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted">Prévia</span>
      <div className="rounded-[14px] border border-white/6 bg-[#313338] p-4 font-[system-ui] text-[15px] leading-snug text-[#dbdee1]">
        <div className="flex gap-3">
          <img src={logo} alt="" className="size-10 shrink-0 rounded-full bg-[#1e1f22] object-contain p-1" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5">
              <span className="font-semibold text-[#f2f3f5]">PMERJ</span>
              <span className="rounded-[3px] bg-discord px-1 text-[10px] font-semibold leading-4 text-white">APP</span>
            </div>
            <div className="mt-1.5 flex gap-3 rounded-lg border border-white/6 bg-[#2b2d31] p-4" style={{ borderLeft: '4px solid #f1c40f' }}>
              <div className="min-w-0 flex-1">
                <div className="text-base font-bold text-[#f2f3f5]">🎖️ Promoção</div>
                <p className="mt-1">
                  <span className="rounded-[3px] bg-discord/30 px-0.5 font-medium text-[#c9cdfb]">@{nome}</span> <strong className="text-[#f2f3f5]">foi promovido(a) a</strong>{' '}
                  <span className="rounded-[3px] bg-[#f1c40f]/20 px-0.5 font-medium text-[#f1c40f]">@Cabo</span> <strong className="text-[#f2f3f5]">!</strong> 🎉
                </p>
                <p className="mt-1 text-xs text-[#949ba4]">SD → CB · por @você</p>
                <p className="mt-3 flex items-center gap-1.5 text-xs text-[#949ba4]">
                  <img src={logo} alt="" className="size-4 object-contain" /> {rodape || 'Rodapé'} · hoje
                </p>
              </div>
              <img src={avatarUrl(me.user, 128)} alt="" referrerPolicy="no-referrer" className="size-18 shrink-0 rounded-lg object-cover" />
            </div>
            <div className="mt-1.5 inline-flex items-center gap-1 rounded-lg border border-discord/50 bg-discord/15 px-2 py-0.5 text-sm">🎉 1</div>
          </div>
        </div>
      </div>
    </div>
  )
}
