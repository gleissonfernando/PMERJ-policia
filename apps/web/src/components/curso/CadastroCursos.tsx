import { Award, BookOpen, GraduationCap, Info, KeyRound, MessageSquareShare, Plus, ShieldCheck, Trash2, UserMinus } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { CanalSelect } from '@/components/discord/CanalSelect'
import { CargoPicker } from '@/components/discord/CargoPicker'
import { Button, Card, CardHeader, Field, Input, Select, Switch, Textarea } from '@/components/form'
import { SaveBar } from '@/components/SaveBar'
import { cn } from '@/lib/cn'
import { erroCurso, type CursoConfig, type CursosApi, type CursosConfigInput, type CursosVisao } from '@/lib/curso'

const corCargo = (n: number) => (n ? `#${n.toString(16).padStart(6, '0')}` : '#99aab5')

function toInput(v: CursosVisao): CursosConfigInput {
  const c = v.config
  return structuredClone({
    cursos: c?.cursos ?? [],
    cargosInstrutores: c?.cargosInstrutores ?? [],
    cargosRemover: c?.cargosRemover ?? [],
    logCanalId: c?.logCanalId ?? null,
    canalTurmasId: c?.canalTurmasId ?? null,
    canalCertificadosId: c?.canalCertificadosId ?? null,
    mencionarTodos: c?.mencionarTodos ?? true,
  })
}

/** Painel → Cadastro de cursos: cursos, cargos, instrutores, quem remove e canais do Discord. */
export function CadastroCursos({ visao, cursos }: { visao: CursosVisao; cursos: CursosApi }) {
  const original = useMemo(() => toInput(visao), [visao])
  const [draft, setDraft] = useState(original)
  const [selId, setSelId] = useState<string | null>(original.cursos[0]?.id ?? null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dirty = JSON.stringify(draft) !== JSON.stringify(original)
  const sel = draft.cursos.find((c) => c.id === selId) ?? null
  const patch = (p: Partial<CursosConfigInput>) => {
    setDraft((d) => ({ ...d, ...p }))
    setSaved(false)
  }
  const setCurso = (id: string, p: Partial<CursoConfig>) => patch({ cursos: draft.cursos.map((c) => (c.id === id ? { ...c, ...p } : c)) })
  const temGerais = draft.cargosInstrutores.length > 0

  function novoCurso() {
    const c: CursoConfig = {
      id: `curso-${crypto.randomUUID().slice(0, 8)}`,
      nome: '',
      sigla: '',
      descricao: '',
      ativo: true,
      patenteMinimaId: null,
      cargoId: null,
      cargosInstrutores: [],
    }
    patch({ cursos: [...draft.cursos, c] })
    setSelId(c.id)
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await cursos.salvarConfig(draft)
      setSaved(true)
    } catch (err) {
      setError(erroCurso(err))
    } finally {
      setSaving(false)
    }
  }

  const nomeCargo = (id: string | null) => (id ? visao.cargos.find((c) => c.id === id) : undefined)

  return (
    <div className="grid gap-5">
      {/* Discord: canais */}
      <Card>
        <CardHeader icon={<MessageSquareShare className="size-4.5" />} title="Discord" hint="Onde o bot posta as turmas e registra o que acontece." />
        <div className="grid gap-5 p-6 md:grid-cols-2 2xl:grid-cols-3">
          <Field label="Canal das turmas" htmlFor="curso-canal" hint="Cada turma aberta vira uma mensagem aqui, com Entrar no curso / Sair do curso.">
            <CanalSelect id="curso-canal" canais={visao.canais} value={draft.canalTurmasId} onChange={(canalTurmasId) => patch({ canalTurmasId })} vazio="Escolha o canal…" disabled={!visao.bot.ativo} />
          </Field>
          <Field label="Canal de log" htmlFor="curso-log" hint="Turmas abertas, iniciadas, finalizadas e cursos removidos.">
            <CanalSelect id="curso-log" canais={visao.canais} value={draft.logCanalId} onChange={(logCanalId) => patch({ logCanalId })} vazio="Sem registro" />
          </Field>
          <Field label="Canal dos certificados" htmlFor="curso-certificados" hint="Ao finalizar a turma, sai um certificado por participante, com a foto do servidor dele.">
            <CanalSelect
              id="curso-certificados"
              canais={visao.canais}
              value={draft.canalCertificadosId}
              onChange={(canalCertificadosId) => patch({ canalCertificadosId })}
              vazio="Só no site"
              disabled={!visao.bot.ativo}
            />
          </Field>
          <div className="divide-y divide-line rounded-[14px] border border-line px-4 md:col-span-2 2xl:col-span-3">
            <Switch
              checked={draft.mencionarTodos}
              onChange={(mencionarTodos) => patch({ mencionarTodos })}
              label="Marcar @everyone ao postar uma turma"
              description="Todo o servidor é notificado quando uma turma nova é agendada. Só a primeira postagem notifica; atualizações não."
            />
          </div>
        </div>
      </Card>

      {/* Instrutores gerais + quem remove */}
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            icon={<ShieldCheck className="size-4.5" />}
            title="Instrutores gerais"
            hint="Valem para TODOS os cursos: quem tem um destes cargos abre, inicia e finaliza turmas de qualquer curso."
            action={<Contador n={draft.cargosInstrutores.length} />}
          />
          <div className="p-6">
            <CargoPicker id="curso-inst-gerais" cargos={visao.cargos} selecionados={draft.cargosInstrutores} onChange={(cargosInstrutores) => patch({ cargosInstrutores })} max={25} />
          </div>
        </Card>
        <Card>
          <CardHeader
            icon={<UserMinus className="size-4.5" />}
            title="Quem pode remover cursos"
            hint="Cargos que usam /remover curso no Discord (e o botão de remover aqui no site)."
            action={<Contador n={draft.cargosRemover.length} />}
          />
          <div className="grid gap-3 p-6">
            <CargoPicker id="curso-remover" cargos={visao.cargos} selecionados={draft.cargosRemover} onChange={(cargosRemover) => patch({ cargosRemover })} max={25} />
            <p className="flex items-start gap-2 rounded-xl border border-line bg-surface-2/50 px-4 py-3 text-xs text-muted">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Para o comando <span className="font-semibold text-ink">aparecer</span> só para esses cargos: Configurações do servidor → Integrações → PMERJ → <span className="font-mono">/remover</span> → adicione os cargos. O Discord não deixa o bot fazer isso sozinho. De qualquer forma, o bot confere o cargo em cada uso.
              </span>
            </p>
          </div>
        </Card>
      </div>

      {/* Cursos */}
      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start 2xl:grid-cols-[380px_minmax(0,1fr)]">
        <Card className="min-w-0 overflow-hidden lg:sticky lg:top-6">
          <CardHeader
            icon={<GraduationCap className="size-4.5" />}
            title={`Cursos · ${draft.cursos.length}`}
            action={
              <Button size="sm" onClick={novoCurso} disabled={draft.cursos.length >= 30}>
                <Plus className="size-3.5" /> Novo
              </Button>
            }
          />
          {draft.cursos.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted">
              Nenhum curso cadastrado. Clique em <span className="font-semibold text-ink">Novo</span>.
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-1 overscroll-contain p-2 lg:max-h-[calc(100dvh-10rem)] lg:overflow-y-auto">
              {draft.cursos.map((c) => {
                const on = c.id === selId
                const cargo = nomeCargo(c.cargoId)
                const incompleto = !c.sigla.trim() || !c.nome.trim() || (c.ativo && !temGerais && c.cargosInstrutores.length === 0)
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setSelId(c.id)}
                      aria-current={on}
                      className={cn(
                        'flex w-full min-w-0 items-start gap-3 rounded-xl px-3 py-3 text-left transition',
                        on ? 'bg-primary/10 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-primary)_35%,transparent)]' : 'hover:bg-white/4',
                      )}
                    >
                      <span className={cn('grid h-9 min-w-12 shrink-0 place-items-center rounded-[9px] border px-1.5 font-display text-xs tracking-wide', on ? 'border-primary/40 bg-primary/15 text-primary-2' : 'border-line text-muted')}>
                        {c.sigla.trim() || '—'}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn('line-clamp-2 wrap-break-word text-sm font-bold leading-snug', c.ativo ? 'text-ink' : 'text-muted line-through decoration-muted/50')}>{c.nome.trim() || 'Curso sem nome'}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
                          {!c.ativo && <span className="font-bold uppercase tracking-[0.08em]">Desativado</span>}
                          {cargo ? (
                            <span className="inline-flex items-center gap-1 truncate">
                              <span className="size-2 rounded-full" style={{ background: corCargo(cargo.cor) }} />
                              {cargo.nome}
                            </span>
                          ) : (
                            <span>Sem cargo</span>
                          )}
                          {incompleto && <span className="font-bold text-[#f59e0b]">· incompleto</span>}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        {sel ? (
          <EditorCurso
            key={sel.id}
            curso={sel}
            visao={visao}
            temGerais={temGerais}
            onChange={(p) => setCurso(sel.id, p)}
            onRemove={() => {
              const resto = draft.cursos.filter((c) => c.id !== sel.id)
              patch({ cursos: resto })
              setSelId(resto[0]?.id ?? null)
            }}
          />
        ) : (
          <Card>
            <div className="grid place-items-center gap-3 px-6 py-16 text-center text-sm text-muted">
              <GraduationCap className="size-8 text-muted/60" />
              Selecione um curso na lista ou crie um novo.
            </div>
          </Card>
        )}
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
          if (!original.cursos.some((c) => c.id === selId)) setSelId(original.cursos[0]?.id ?? null)
        }}
      />
    </div>
  )
}

const Contador = ({ n }: { n: number }) => <span className="text-[11px] font-extrabold uppercase tracking-widest text-muted">{n} de 25</span>

/* ---------- Editor de um curso ---------- */

function EditorCurso({
  curso,
  visao,
  temGerais,
  onChange,
  onRemove,
}: {
  curso: CursoConfig
  visao: CursosVisao
  temGerais: boolean
  onChange: (p: Partial<CursoConfig>) => void
  onRemove: () => void
}) {
  const [confirmar, setConfirmar] = useState(false)
  const id = (s: string) => `${curso.id}-${s}`

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader icon={<BookOpen className="size-4.5" />} title="Dados do curso" hint="Como o curso aparece no site, na mensagem da turma e no /perfil." />
        <div className="grid gap-5 p-6">
          <div className="grid gap-5 sm:grid-cols-[160px_minmax(0,1fr)]">
            <Field label="Sigla" htmlFor={id('sigla')} hint="Ex.: CAT, CFS, COEsp">
              <Input id={id('sigla')} value={curso.sigla} maxLength={12} aria-invalid={!curso.sigla.trim()} onChange={(e) => onChange({ sigla: e.target.value })} />
            </Field>
            <Field label="Nome" htmlFor={id('nome')}>
              <Input id={id('nome')} value={curso.nome} maxLength={60} placeholder="Ex.: Curso de Ações Táticas" aria-invalid={!curso.nome.trim()} onChange={(e) => onChange({ nome: e.target.value })} />
            </Field>
          </div>
          <Field label="Descrição" htmlFor={id('desc')} hint={`Aparece na mensagem da turma. ${curso.descricao.length}/600`}>
            <Textarea id={id('desc')} value={curso.descricao} maxLength={600} rows={3} onChange={(e) => onChange({ descricao: e.target.value })} />
          </Field>
          <Field label="Patente mínima para entrar" htmlFor={id('pmin')} hint="Usa o set (Pedir Set) da pessoa. Qualquer patente = não exige set.">
            <Select id={id('pmin')} value={curso.patenteMinimaId ?? ''} onChange={(e) => onChange({ patenteMinimaId: e.target.value || null })}>
              <option value="">Qualquer patente</option>
              {visao.patentes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.prefixo} — {p.nome}
                </option>
              ))}
            </Select>
          </Field>
          <div className="divide-y divide-line rounded-[14px] border border-line px-4">
            <Switch checked={curso.ativo} onChange={(ativo) => onChange({ ativo })} label="Curso ativo" description="Desativado: não abre turmas novas. Quem já concluiu continua com o curso no /perfil." />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader icon={<Award className="size-4.5" />} title="Cargo do curso" hint="Entregue automaticamente a todos os participantes quando a turma é finalizada." />
        <div className="grid gap-3 p-6">
          <Field label="Cargo entregue ao concluir" htmlFor={id('cargo')}>
            <Select id={id('cargo')} value={curso.cargoId ?? ''} onChange={(e) => onChange({ cargoId: e.target.value || null })} disabled={visao.cargos.length === 0}>
              <option value="">Nenhum cargo</option>
              {curso.cargoId && !visao.cargos.some((c) => c.id === curso.cargoId) && <option value={curso.cargoId}>Cargo indisponível ({curso.cargoId})</option>}
              {visao.cargos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          </Field>
          <p className="text-xs text-muted">
            O cargo do bot precisa ficar <span className="font-semibold text-ink">acima</span> deste cargo. Remover o curso (/remover curso) retira o cargo.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader
          icon={<KeyRound className="size-4.5" />}
          title="Instrutores deste curso"
          hint={temGerais ? 'Opcional: os instrutores gerais já valem para este curso. Adicione cargos que instruem só este.' : 'Quem tem um destes cargos abre, inicia e finaliza as turmas deste curso.'}
          action={<Contador n={curso.cargosInstrutores.length} />}
        />
        <div className="grid gap-3 p-6">
          <CargoPicker id={id('inst')} cargos={visao.cargos} selecionados={curso.cargosInstrutores} onChange={(cargosInstrutores) => onChange({ cargosInstrutores })} max={25} />
          {curso.ativo && !temGerais && curso.cargosInstrutores.length === 0 && (
            <Aviso>Sem instrutores: escolha cargos aqui ou em Instrutores gerais. Senão ninguém consegue dar este curso.</Aviso>
          )}
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {confirmar ? (
          <>
            <span className="text-xs text-muted">Apagar “{curso.sigla || curso.nome || 'este curso'}”? Cursos com turmas não podem ser apagados (desative).</span>
            <Button variant="ghost" size="sm" onClick={() => setConfirmar(false)}>
              Cancelar
            </Button>
            <Button variant="danger" size="sm" onClick={onRemove}>
              <Trash2 className="size-3.5" /> Apagar curso
            </Button>
          </>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setConfirmar(true)}>
            <Trash2 className="size-3.5" /> Apagar curso
          </Button>
        )}
      </div>
    </div>
  )
}

const Aviso = ({ children }: { children: ReactNode }) => (
  <p className="rounded-xl border border-[#f59e0b]/40 bg-[#f59e0b]/10 px-4 py-3 text-xs text-[#fcd34d]">{children}</p>
)
