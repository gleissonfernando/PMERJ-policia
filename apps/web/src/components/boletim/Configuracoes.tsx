import { BarChart3, Check, Hash, Info, KeyRound, Palette, Send } from 'lucide-react'
import { useMemo, useState } from 'react'
import { BotStatus } from '@/components/discord/BotStatus'
import { CanalSelect } from '@/components/discord/CanalSelect'
import { CargoPicker } from '@/components/discord/CargoPicker'
import { Button, Card, CardHeader, Field, Input, Select, Switch, Textarea } from '@/components/form'
import { fmtDataHora } from '@/lib/format'
import { SaveBar } from '@/components/SaveBar'
import { useLogoUrl } from '@/lib/branding'
import { erroBoletim, type BoletimApi, type BoletimEstado, type BoletimInput } from '@/lib/boletim'
import { cn } from '@/lib/cn'

const CORES = [0x2b7fff, 0xe10600, 0x22c55e, 0xf59e0b, 0xeab308, 0xa3a3a3]
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`

const toInput = (d: BoletimEstado): BoletimInput => ({
  canalId: d.config.canalId,
  cargosPermitidos: [...d.config.cargosPermitidos],
  cor: d.config.cor,
  rodape: d.config.rodape,
  relatorio: (({ ultimoFim: _u, numero: _n, ano: _a, ...r }) => r)(d.config.relatorio),
})

export function Configuracoes({ data, boletim }: { data: BoletimEstado; boletim: BoletimApi }) {
  const original = useMemo(() => toInput(data), [data])
  const [draft, setDraft] = useState(original)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = JSON.stringify(draft) !== JSON.stringify(original)
  const patch = (p: Partial<BoletimInput>) => {
    setDraft((d) => ({ ...d, ...p }))
    setSaved(false)
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await boletim.salvarConfig(draft)
      setSaved(true)
    } catch (err) {
      setError(erroBoletim(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-5">
      <BotStatus botAtivo={data.botAtivo} gateway={data.gateway} />

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader icon={<Hash className="size-4.5" />} title="Canal do boletim" hint="Onde as equipes escrevem. O bot apaga cada mensagem e publica o painel no mesmo canal." />
          <div className="grid gap-4 p-6">
            <Field label="Canal" htmlFor="boletim-canal">
              <CanalSelect id="boletim-canal" canais={data.canais} value={draft.canalId} onChange={(canalId) => patch({ canalId })} vazio="Desligado" />
            </Field>
            <p className="flex items-start gap-2 rounded-xl border border-line bg-surface-2/50 px-4 py-3 text-xs text-muted">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              <span>
                No canal, o bot precisa de <span className="font-semibold text-ink">Ver canal</span>, <span className="font-semibold text-ink">Enviar mensagens</span>,{' '}
                <span className="font-semibold text-ink">Anexar arquivos</span> (logo) e <span className="font-semibold text-ink">Gerenciar mensagens</span> (para apagar). Use um canal só para o boletim: qualquer outra conversa nele é apagada.
              </span>
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader
            icon={<KeyRound className="size-4.5" />}
            title="Quem pode enviar"
            hint="Vazio = qualquer pessoa que consegue escrever no canal. Os demais têm a mensagem apagada com um aviso."
            action={<span className="text-[11px] font-extrabold uppercase tracking-widest text-muted">{draft.cargosPermitidos.length} de 25</span>}
          />
          <div className="p-6">
            <CargoPicker id="boletim-cargos" cargos={data.cargos} selecionados={draft.cargosPermitidos} onChange={(cargosPermitidos) => patch({ cargosPermitidos })} max={25} />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader icon={<Palette className="size-4.5" />} title="Aparência do painel" hint="Cor da barra e rodapé de todos os boletins. A logo vem de Painel → Aparência." />
        <div className="grid gap-6 p-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="grid content-start gap-5">
            <Field label="Rodapé" htmlFor="boletim-rodape" hint={`${draft.rodape.length}/${data.limites.rodape}`}>
              <Input id="boletim-rodape" value={draft.rodape} maxLength={data.limites.rodape} onChange={(e) => patch({ rodape: e.target.value })} />
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
            <div className="grid gap-1.5">
              <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted">Formato que a equipe manda</span>
              <pre className="whitespace-pre-wrap rounded-xl border border-line bg-surface-2/50 px-4 py-3 font-mono text-xs leading-relaxed text-ink">
                {'Equipe Alfa\nPatrulhamento na Zona Norte das 14h às 18h.\nDuas abordagens, sem alterações.'}
              </pre>
              <p className="text-xs text-muted">
                1ª linha até {data.limites.equipe} caracteres; relatório até {data.limites.relatorio.toLocaleString('pt-BR')}. Só texto: mensagens com anexos são recusadas.
              </p>
            </div>
          </div>
          <Previa cor={draft.cor} rodape={draft.rodape} />
        </div>
      </Card>

      <RelatorioAutomatico data={data} boletim={boletim} valor={draft.relatorio} dirty={dirty} onChange={(relatorio) => patch({ relatorio })} />

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

/** Prévia do painel como sai no Discord, e do aviso privado de quem mandou errado. */
function Previa({ cor, rodape }: { cor: number; rodape: string }) {
  const logo = useLogoUrl()
  return (
    <div className="grid content-start gap-3">
      <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted">Prévia</span>
      <div className="rounded-[14px] border border-white/6 bg-[#313338] p-4 font-[system-ui] text-[15px] leading-snug text-[#dbdee1]">
        <div className="flex gap-3">
          <img src={logo} alt="" className="size-10 shrink-0 rounded-full bg-[#1e1f22] object-contain p-1" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5">
              <span className="font-semibold text-[#f2f3f5]">PMERJ</span>
              <span className="rounded-[3px] bg-discord px-1 text-[10px] font-semibold leading-4 text-white">APP</span>
            </div>
            <div className="mt-1.5 rounded-lg border border-white/6 bg-[#2b2d31] p-4" style={{ borderLeft: `4px solid ${hex(cor)}` }}>
              <div className="flex gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-xl font-bold text-[#f2f3f5]">📋 Boletim Interno</div>
                  <div className="mt-0.5 text-xs text-[#949ba4]">Nº 012/2026 · hoje às 18:42</div>
                </div>
                <img src={logo} alt="" className="size-14 shrink-0 object-contain" />
              </div>
              <hr className="my-3 border-white/8" />
              <div className="font-semibold text-[#f2f3f5]">🚓 Equipe</div>
              <div>Equipe Alfa</div>
              <div className="mt-2 font-semibold text-[#f2f3f5]">📝 Relatório</div>
              <div>Patrulhamento na Zona Norte das 14h às 18h. Duas abordagens, sem alterações.</div>
              <hr className="my-3 border-white/8" />
              <div className="flex items-center gap-1.5 text-xs text-[#949ba4]">
                Enviado por <span className="rounded-[3px] bg-discord/30 px-0.5 font-medium text-[#c9cdfb]">@fulano</span> · <img src={logo} alt="" className="size-4 object-contain" /> {rodape || 'Rodapé'}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="rounded-[14px] border border-white/6 bg-[#313338] p-4 font-[system-ui] text-sm leading-snug text-[#dbdee1]">
        <div className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#949ba4]">Mensagem direta para quem errou</div>
        <div className="rounded-lg border border-white/6 bg-[#2b2d31] p-3.5" style={{ borderLeft: '4px solid #ef5350' }}>
          <div className="font-bold text-[#f2f3f5]">❌ Boletim não publicado</div>
          <div className="mt-1">Faltou o relatório. Escreva o nome da equipe na 1ª linha e o relatório a partir da 2ª.</div>
          <div className="mt-2 text-xs text-[#949ba4]">+ exemplo do formato e o texto dela para copiar e corrigir</div>
        </div>
      </div>
    </div>
  )
}

/* ---------- Relatório automático do sistema ---------- */

const INTERVALOS = [1, 2, 3, 4, 6, 8, 12, 24] as const
const CONTEUDO = [
  'Resumo do Batalhão: ocorrências, prisões, armas, drogas, veículos recuperados, operações e inteligência',
  'Principais ocorrências: local — resumo, apreensões e presos (nome e RG)',
  'Atos internos: promoções, designações (cargos), movimentações, cursos e outras determinações',
  'Operações (comunicados) e emprego do efetivo: guarnições e bate-ponto (entrada, saída e horas)',
  'Determinações do Comando (texto abaixo) e anexo com boletins, baú, corregedoria, DOESP e mais',
]

function RelatorioAutomatico({
  data,
  boletim,
  valor,
  dirty,
  onChange,
}: {
  data: BoletimEstado
  boletim: BoletimApi
  valor: BoletimInput['relatorio']
  dirty: boolean
  onChange: (v: BoletimInput['relatorio']) => void
}) {
  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const set = (p: Partial<BoletimInput['relatorio']>) => onChange({ ...valor, ...p })
  const salvo = data.config.relatorio

  async function enviar() {
    setEnviando(true)
    setMsg(null)
    try {
      await boletim.enviarRelatorio()
      setMsg({ ok: true, texto: `Prévia das últimas ${salvo.intervaloHoras}h enviada (sem número).` })
    } catch (err) {
      setMsg({ ok: false, texto: erroBoletim(err) })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Card>
      <CardHeader
        icon={<BarChart3 className="size-4.5" />}
        title="Boletim Interno automático"
        hint="De tempos em tempos, o Boletim Interno no modelo oficial do batalhão, preenchido com tudo o que aconteceu no sistema. Se não couber, sai em mais painéis (“continuação do relatório”)."
        action={
          <span className={cn('rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest', salvo.ativo && salvo.canalId ? 'border-success/35 bg-success/10 text-success' : 'border-line text-muted')}>
            {salvo.ativo && salvo.canalId ? 'Ligado' : 'Desligado'}
          </span>
        }
      />
      <div className="grid gap-5 p-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-5">
          <div className="divide-y divide-line rounded-[14px] border border-line px-4">
            <Switch checked={valor.ativo} onChange={(ativo) => set({ ativo })} label="Publicar o Boletim Interno automático" description="Todos os dias, no horário de Brasília (ex.: 00h, 02h, 04h… no intervalo de 2 horas)." />
            <Switch checked={valor.pularVazio} onChange={(pularVazio) => set({ pularVazio })} label="Pular períodos sem movimentação" description="Desligado: manda “Sem movimentação” mesmo assim." />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Canal do relatório" htmlFor="rel-canal">
              <CanalSelect id="rel-canal" canais={data.canais.filter((c) => c.tipo === 'texto' || c.tipo === 'anuncios')} value={valor.canalId} onChange={(canalId) => set({ canalId })} vazio="Escolher canal..." />
            </Field>
            <Field label="De quanto em quanto tempo" htmlFor="rel-intervalo">
              <Select id="rel-intervalo" value={valor.intervaloHoras} onChange={(e) => set({ intervaloHoras: Number(e.target.value) as BoletimInput['relatorio']['intervaloHoras'] })}>
                {INTERVALOS.map((h) => (
                  <option key={h} value={h}>
                    {h === 1 ? 'A cada 1 hora' : h === 24 ? 'Uma vez por dia (00h)' : `A cada ${h} horas`}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid gap-5 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Field label="Unidade (cabeçalho)" htmlFor="rel-unidade" hint={`${valor.unidade.length}/80`}>
              <Input id="rel-unidade" value={valor.unidade} maxLength={80} onChange={(e) => set({ unidade: e.target.value })} />
            </Field>
            <Field label="Sigla" htmlFor="rel-sigla">
              <Input id="rel-sigla" value={valor.sigla} maxLength={30} onChange={(e) => set({ sigla: e.target.value })} />
            </Field>
          </div>
          <Field label="Texto do Resumo do Batalhão" htmlFor="rel-resumo" hint={`${valor.resumoTexto.length}/500`}>
            <Textarea id="rel-resumo" rows={3} value={valor.resumoTexto} maxLength={500} onChange={(e) => set({ resumoTexto: e.target.value })} />
          </Field>
          <Field label="Determinações do Comando" htmlFor="rel-det" hint={`Ordens, avisos ou determinações. Saem em todo boletim até serem trocadas · ${valor.determinacoes.length}/1500`}>
            <Textarea id="rel-det" rows={4} value={valor.determinacoes} maxLength={1500} placeholder="Ex.: Todo o efetivo deverá comparecer à formatura de sexta-feira às 20h." onChange={(e) => set({ determinacoes: e.target.value })} />
          </Field>
          <Field label="Assinatura" htmlFor="rel-assin" hint="Sai embaixo de “41º BPM – PMERJ”.">
            <Input id="rel-assin" value={valor.assinatura} maxLength={60} onChange={(e) => set({ assinatura: e.target.value })} />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="ghost" onClick={enviar} loading={enviando} disabled={!data.botAtivo || dirty || !salvo.canalId}>
              {!enviando && <Send className="size-4" />} Enviar prévia agora
            </Button>
            <span className={cn('text-xs', msg ? (msg.ok ? 'font-semibold text-success' : 'text-danger') : 'text-muted')}>
              {msg?.texto ?? (dirty ? 'Salve antes de enviar.' : data.proximoRelatorio ? `Próximo automático: ${fmtDataHora(data.proximoRelatorio)}.` : 'Manda as últimas horas para conferir como fica.')}
            </span>
          </div>
        </div>
        <div className="rounded-[14px] border border-line bg-surface-2/40 p-4">
          <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted">O que entra no boletim{salvo.numero ? ` · último: Nº ${String(salvo.numero).padStart(3, '0')}/${salvo.ano}` : ''}</span>
          <ul className="mt-2 grid gap-1.5 text-xs text-muted">
            {CONTEUDO.map((c) => (
              <li key={c} className="flex gap-2">
                <Check className="mt-0.5 size-3.5 shrink-0 text-success" /> {c}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">Se o bot ficar fora do ar, ao voltar ele relata o período que ficou sem relatório (até 24 horas) numa vez só.</p>
        </div>
      </div>
    </Card>
  )
}
