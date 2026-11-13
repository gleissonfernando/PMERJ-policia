import { AlertTriangle, Check, ImagePlus, Info, KeyRound, MessageSquareShare, Palette, ScrollText, Send, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { BotStatus } from '@/components/discord/BotStatus'
import { CanalSelect } from '@/components/discord/CanalSelect'
import { CargoPicker } from '@/components/discord/CargoPicker'
import { Button, Card, CardHeader, Field, Input, Switch, Textarea } from '@/components/form'
import { SaveBar } from '@/components/SaveBar'
import { Alert } from '@/components/ui'
import type { Me } from '@/lib/api'
import { caracteresFixos, erroAnuncio, type AnuncioApi, type AnuncioConfigInput, type AnuncioEstado } from '@/lib/anuncio'
import { cn } from '@/lib/cn'
import { AnuncioPreview } from './AnuncioPreview'

const CORES = [0xe10600, 0x2563eb, 0x22c55e, 0xf59e0b, 0xeab308, 0xa3a3a3]
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`
const fmt = (n: number) => n.toLocaleString('pt-BR')

function toInput(d: AnuncioEstado): AnuncioConfigInput {
  const { painel: _p, atualizadoEm: _a, atualizadoPor: _b, ...rest } = d.config
  return structuredClone(rest)
}

export function Configuracoes({ me, data, anuncio }: { me: Me; data: AnuncioEstado; anuncio: AnuncioApi }) {
  const original = useMemo(() => toInput(data), [data])
  const [draft, setDraft] = useState<AnuncioConfigInput>(original)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [sim, setSim] = useState<Simulado>(SIMULADO_INICIAL)

  const dirty = JSON.stringify(draft) !== JSON.stringify(original)
  const patch = (p: Partial<AnuncioConfigInput>) => {
    setDraft((d) => ({ ...d, ...p }))
    setSaved(false)
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await anuncio.salvarConfig(draft)
      setSaved(true)
    } catch (err) {
      setError(erroAnuncio(err))
    } finally {
      setSaving(false)
    }
  }

  const nomeCargo = (id: string) => data.cargos.find((c) => c.id === id)?.nome ?? id

  return (
    <div className="grid gap-5">
      <PainelDiscord data={data} anuncio={anuncio} />

      {/* Quem pode anunciar */}
      <Card>
        <CardHeader
          icon={<KeyRound className="size-4.5" />}
          title="Quem pode anunciar"
          hint="Só quem tem um destes cargos consegue usar o botão “Realizar anúncio” no Discord."
          action={<span className="text-[11px] font-extrabold uppercase tracking-widest text-muted">{draft.cargosPermitidos.length} de 25</span>}
        />
        <div className="grid gap-4 p-6">
          <CargoPicker id="anuncio-cargos" cargos={data.cargos} selecionados={draft.cargosPermitidos} onChange={(cargosPermitidos) => patch({ cargosPermitidos })} max={25} />
          {draft.cargosPermitidos.length === 0 ? (
            <p className="flex items-start gap-2 rounded-xl border border-[#f59e0b]/40 bg-[#f59e0b]/10 px-4 py-3 text-xs text-[#fcd34d]">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>Nenhum cargo marcado: ninguém consegue fazer anúncios até você escolher pelo menos um.</span>
            </p>
          ) : (
            <p className="flex items-start gap-2 rounded-xl border border-line bg-surface-2/50 px-4 py-3 text-xs text-muted">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              <span>
                O cargo é conferido em cada clique, direto do Discord: quem perde o cargo perde o acesso na hora. Autorizados:{' '}
                <span className="text-ink">{draft.cargosPermitidos.map(nomeCargo).join(', ')}</span>.
              </span>
            </p>
          )}
        </div>
      </Card>

      {/* Aparência + simulador */}
      <Card>
        <CardHeader icon={<Palette className="size-4.5" />} title="Aparência dos anúncios" hint="Rodapé e cor valem para todos os anúncios. A logo vem de Painel → Aparência." />
        <div className="grid gap-6 p-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="grid content-start gap-5">
            <Field label="Texto do rodapé" htmlFor="anuncio-rodape" hint={`Fica no fim de todo anúncio, ao lado da logo. ${draft.rodape.length}/120`}>
              <Input id="anuncio-rodape" value={draft.rodape} maxLength={120} onChange={(e) => patch({ rodape: e.target.value })} />
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
              <Switch
                checked={draft.mostrarAutor}
                onChange={(mostrarAutor) => patch({ mostrarAutor })}
                label="Mostrar quem anunciou"
                description="Adiciona “Anunciado por @fulano · data” no rodapé (sem notificar ninguém)."
              />
            </div>

            <Simulador
              me={me}
              cfg={draft}
              limiteTotal={data.limites.total}
              limiteTitulo={data.limites.titulo}
              s={sim}
              onChange={(p) => setSim((atual) => ({ ...atual, ...p }))}
            />
          </div>

          <SimuladorPreview me={me} cfg={draft} s={sim} />
        </div>
      </Card>

      {/* Log */}
      <Card>
        <CardHeader icon={<ScrollText className="size-4.5" />} title="Registro no Discord" hint="Canal onde o bot avisa cada anúncio publicado (autor, canal e link). Opcional." />
        <div className="p-6">
          <Field label="Canal de log" htmlFor="anuncio-log">
            <CanalSelect id="anuncio-log" canais={data.canais} value={draft.logCanalId} onChange={(logCanalId) => patch({ logCanalId })} vazio="Sem registro" />
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

/* ---------- Simulador: o mesmo limite que o bot aplica no Discord ---------- */

export interface Simulado {
  titulo: string
  texto: string
  /** URL local (blob:) da imagem escolhida — nunca sai do navegador. */
  imagem: string | null
}

const SIMULADO_INICIAL: Simulado = {
  titulo: 'Operação Verão 2026',
  texto:
    'A partir de **sexta-feira**, todas as unidades reforçam o patrulhamento na orla.\n\n- Apresentação às 07h no batalhão\n- Uniforme operacional completo\n\nDúvidas, procure o seu comandante.',
  imagem: null,
}

function Simulador({
  me,
  cfg,
  limiteTotal,
  limiteTitulo,
  s,
  onChange,
}: {
  me: Me
  cfg: AnuncioConfigInput
  limiteTotal: number
  limiteTitulo: number
  s: Simulado
  onChange: (p: Partial<Simulado>) => void
}) {
  const set = onChange
  const fixos = caracteresFixos(cfg, s.titulo, me.user.id)
  const limite = limiteTotal - fixos
  const usados = s.texto.length
  const excesso = usados - limite
  const pct = Math.min(100, ((usados + fixos) / limiteTotal) * 100)

  // Libera a imagem da memória ao trocar ou sair.
  useEffect(() => () => void (s.imagem && URL.revokeObjectURL(s.imagem)), [s.imagem])

  return (
    <div className="grid gap-4 rounded-[14px] border border-line bg-surface-2/40 p-4">
      <div>
        <div className="text-sm font-bold text-ink">Simulador de limite</div>
        <p className="mt-0.5 text-xs text-muted">
          Teste um anúncio aqui: é a mesma conta do bot. Nada é salvo nem enviado — os anúncios são feitos pelo botão no Discord.
        </p>
      </div>
      <Field label="Título" htmlFor="sim-titulo" hint={`${s.titulo.length}/${limiteTitulo}`}>
        <Input id="sim-titulo" value={s.titulo} maxLength={limiteTitulo} onChange={(e) => set({ titulo: e.target.value })} />
      </Field>
      <Field label="Texto" htmlFor="sim-texto" hint="Aceita **negrito**, *itálico*, listas com “-” e quebras de linha.">
        <Textarea id="sim-texto" value={s.texto} rows={6} onChange={(e) => set({ texto: e.target.value })} aria-invalid={excesso > 0} />
      </Field>

      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className={cn('font-bold tabular-nums', excesso > 0 ? 'text-danger' : 'text-ink')}>
            {fmt(usados)} / {fmt(Math.max(0, limite))} caracteres no texto
          </span>
          <span className="text-muted tabular-nums">mensagem: {fmt(usados + fixos)} / {fmt(limiteTotal)}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="meter" aria-valuemin={0} aria-valuemax={limiteTotal} aria-valuenow={usados + fixos} aria-label="Caracteres usados na mensagem">
          <div className={cn('h-full rounded-full transition-all', excesso > 0 ? 'bg-danger' : pct > 85 ? 'bg-[#f59e0b]' : 'bg-success')} style={{ width: `${pct}%` }} />
        </div>
        {excesso > 0 ? (
          <p className="flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2.5 text-xs text-[#ffd5d2]">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Passou <strong>{fmt(excesso)}</strong> {excesso === 1 ? 'caractere' : 'caracteres'}. No Discord, o bot mostra este mesmo aviso com o botão <strong>Editar anúncio</strong>.
            </span>
          </p>
        ) : (
          <p className="text-xs text-muted">
            Título e rodapé usam {fmt(fixos)} dos {fmt(limiteTotal)} caracteres. A imagem não gasta caracteres.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-[11px] border border-line px-3 text-xs font-bold text-muted transition hover:border-line-strong hover:text-ink">
          <ImagePlus className="size-3.5" /> {s.imagem ? 'Trocar imagem' : 'Testar com imagem'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) set({ imagem: URL.createObjectURL(f) })
              e.target.value = ''
            }}
          />
        </label>
        {s.imagem && (
          <Button variant="ghost" size="sm" onClick={() => set({ imagem: null })}>
            <X className="size-3.5" /> Tirar imagem
          </Button>
        )}
      </div>
    </div>
  )
}

function SimuladorPreview({ me, cfg, s }: { me: Me; cfg: AnuncioConfigInput; s: Simulado }) {
  return (
    <div className="grid content-start gap-3 xl:sticky xl:top-6">
      <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted">Prévia no Discord</span>
      <AnuncioPreview cfg={cfg} titulo={s.titulo} texto={s.texto} imagemUrl={s.imagem} comImagemDemo={false} autor={me.user.globalName ?? me.user.username} />
    </div>
  )
}

/* ---------- Painel "Realizar anúncio" no Discord ---------- */

function PainelDiscord({ data, anuncio }: { data: AnuncioEstado; anuncio: AnuncioApi }) {
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
      await anuncio.publicarPainel(canalId)
      setOk(true)
    } catch (err) {
      setError(erroAnuncio(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <Card>
      <CardHeader
        icon={<MessageSquareShare className="size-4.5" />}
        title="Painel no Discord"
        hint="Publica a mensagem com o botão “Realizar anúncio”. Quem tem cargo autorizado escolhe o canal, preenche o formulário e envia."
      />
      <div className="grid gap-4 p-6">
        <BotStatus botAtivo={data.botAtivo} gateway={data.gateway} />
        {error && <Alert>{error}</Alert>}
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <Field label="Canal do painel" htmlFor="anuncio-painel">
            <CanalSelect id="anuncio-painel" canais={data.canais} value={canalId} onChange={setCanalId} vazio="Escolha o canal…" disabled={!data.botAtivo} />
          </Field>
          <Button onClick={publicar} loading={sending} disabled={!canalId || !data.botAtivo} className="h-11">
            {!sending && <Send className="size-4" />} {mesmoCanal ? 'Atualizar mensagem' : 'Publicar no canal'}
          </Button>
        </div>
        <p className={cn('text-xs', ok ? 'font-semibold text-success' : 'text-muted')}>
          {ok
            ? 'Pronto! Confira a mensagem no canal.'
            : publicado
              ? 'Painel já publicado. Cargos, cor e rodapé atualizam a mensagem sozinhos ao salvar.'
              : 'Dica: use um canal da equipe de comando. O bot precisa ver o canal, enviar mensagens e anexar arquivos.'}
        </p>
      </div>
    </Card>
  )
}
