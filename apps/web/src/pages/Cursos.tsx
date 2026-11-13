import { Award, BadgeCheck, GraduationCap, Loader2, Settings2, ShieldCheck, Users } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Certificados } from '@/components/curso/Certificados'
import { Formados } from '@/components/curso/Formados'
import { Gestao } from '@/components/curso/Gestao'
import { MeuCurso } from '@/components/curso/MeuCurso'
import { Card, Pill } from '@/components/form'
import { Tabs, type Aba } from '@/components/Tabs'
import { Alert } from '@/components/ui'
import { cn } from '@/lib/cn'
import { STATUS_TURMA, useCurso, useCursos, type CursoResumo } from '@/lib/curso'
import { usePainelMe } from '@/lib/usePainelMe'

type Id = 'meu' | 'gestao' | 'formados' | 'certificados'

/** Painel → Cursos: todos os cursos da corporação, cada um com turmas, etapas e formatura. */
export function Cursos() {
  const visao = useCursos()
  const [params, setParams] = useSearchParams()
  const { data } = visao

  if (!data) {
    return visao.loadError ? (
      <div className="mx-auto max-w-md">
        <Alert>{visao.loadError}</Alert>
      </div>
    ) : (
      <div className="grid min-h-[50vh] place-items-center" aria-busy="true">
        <Loader2 className="size-7 animate-spin text-primary" aria-label="Carregando" />
      </div>
    )
  }

  // Curso escolhido fica na URL (?curso=id). Sem escolha: onde a pessoa está ativa, instrui, ou o primeiro.
  const pedido = params.get('curso')
  const sel =
    data.cursos.find((c) => c.id === pedido) ??
    data.cursos.find((c) => c.meu === 'participando') ??
    data.cursos.find((c) => c.instrutor) ??
    data.cursos[0]

  return (
    <div className="animate-rise">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="kicker">Formação</span>
          <h1 className="display mt-2 text-[clamp(2rem,4vw,2.6rem)]">Cursos</h1>
          <p className="mt-1.5 max-w-xl text-muted">
            Entre nas turmas abertas. Quando a turma é finalizada, você recebe o <span className="font-semibold text-ink">cargo do curso</span> no Discord e ele aparece no seu <span className="font-semibold text-ink">/perfil</span>.
          </p>
        </div>
        {data.papel.admin && (
          <Link
            to="/painel/cursos/cadastro"
            className="inline-flex h-10 items-center gap-2 rounded-[11px] border border-line px-4 text-sm font-bold text-muted transition hover:border-line-strong hover:text-ink"
          >
            <Settings2 className="size-4" /> Cadastro de cursos
          </Link>
        )}
      </div>

      {data.cursos.length === 0 ? (
        <Card className="mt-8">
          <div className="grid place-items-center gap-3 px-6 py-16 text-center">
            <span className="grid size-12 place-items-center rounded-full border border-line bg-surface-2 text-muted">
              <GraduationCap className="size-5" />
            </span>
            <h3 className="display text-lg">Nenhum curso disponível</h3>
            <p className="max-w-sm text-sm text-muted">
              {data.papel.admin ? 'Cadastre o primeiro curso em Cadastro de cursos.' : 'Quando a administração cadastrar cursos, eles aparecem aqui.'}
            </p>
          </div>
        </Card>
      ) : (
        <>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Cursos">
            {data.cursos.map((c) => (
              <li key={c.id}>
                <CursoCard curso={c} ativo={c.id === sel?.id} onClick={() => setParams({ curso: c.id }, { replace: true })} />
              </li>
            ))}
          </ul>
          {sel && <DetalheCurso key={sel.id} resumo={sel} podeRemover={data.papel.podeRemover} onMudou={visao.reload} />}
        </>
      )}
    </div>
  )
}

function CursoCard({ curso: c, ativo, onClick }: { curso: CursoResumo; ativo: boolean; onClick: () => void }) {
  const st = c.meu === 'concluido' ? { label: 'Concluído', cls: 'border-success/40 bg-success/10 text-success' } : c.meu === 'participando' ? { label: 'Participando', cls: 'border-sky-400/35 bg-sky-400/10 text-sky-300' } : null
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        'group relative flex h-full w-full flex-col overflow-hidden rounded-[18px] border p-5 text-left transition',
        ativo
          ? 'border-primary/55 bg-primary/6 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-primary)_30%,transparent)]'
          : 'border-line bg-surface/90 hover:border-line-strong',
      )}
    >
      <GraduationCap aria-hidden="true" strokeWidth={1.2} className="pointer-events-none absolute -bottom-5 -right-5 size-28 text-white opacity-[.035]" />
      <div className="flex items-start justify-between gap-3">
        <span className={cn('display text-2xl leading-none tracking-wide', ativo ? 'text-primary-2' : 'text-ink')}>{c.sigla}</span>
        <div className="flex flex-wrap justify-end gap-1.5">
          {!c.ativo && <Pill className="border-line-strong bg-surface-2 text-muted">Desativado</Pill>}
          {c.instrutor && (
            <Pill className="border-primary/40 bg-primary/10 text-primary-2">
              <ShieldCheck className="size-3" /> Instrutor
            </Pill>
          )}
        </div>
      </div>
      <div className="mt-2 line-clamp-2 text-sm font-bold text-ink/90">{c.nome}</div>
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-4 text-[11px] text-muted">
        {c.turmaAtual ? (
          <Pill className={STATUS_TURMA[c.turmaAtual.status].cls}>
            Turma {c.turmaAtual.numero} · {STATUS_TURMA[c.turmaAtual.status].label}
          </Pill>
        ) : (
          <span>Sem turma aberta</span>
        )}
        {st && <Pill className={st.cls}>{st.label}</Pill>}
        <span className="inline-flex items-center gap-1">
          <Award className="size-3" /> {c.concluidos} {c.concluidos === 1 ? 'concluiu' : 'concluíram'}
        </span>
      </div>
    </button>
  )
}

function DetalheCurso({ resumo, podeRemover, onMudou }: { resumo: CursoResumo; podeRemover: boolean; onMudou: () => void }) {
  const me = usePainelMe()
  const curso = useCurso(resumo.id, onMudou)
  const { data } = curso
  // null = automático: instrutor sem inscrição própria abre direto na Gestão.
  const [aba, setAba] = useState<Id | null>(null)

  const participantes = data?.participantes.length ?? 0
  const abas: Aba<Id>[] = [
    { id: 'meu', label: 'Meu curso', icon: GraduationCap },
    ...(data?.papel.instrutor ? [{ id: 'gestao' as const, label: 'Gestão', icon: Users, count: participantes }] : []),
    { id: 'formados', label: 'Concluíram', icon: Award },
    { id: 'certificados', label: 'Certificados', icon: BadgeCheck },
  ]
  const automatica: Id = data?.papel.instrutor && !data.eu.participando ? 'gestao' : 'meu'
  const atual = aba && abas.some((a) => a.id === aba) ? aba : automatica

  if (!data) {
    return curso.loadError ? (
      <div className="mt-8">
        <Alert>{curso.loadError}</Alert>
      </div>
    ) : (
      <div className="grid min-h-[30vh] place-items-center" aria-busy="true">
        <Loader2 className="size-6 animate-spin text-primary" aria-label="Carregando curso" />
      </div>
    )
  }

  return (
    <section className="mt-8" aria-label={data.config.nome}>
      <div className="rounded-[18px] border border-line bg-surface/70 p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="display text-xl">{data.config.nome}</h2>
          <span className="font-display text-sm tracking-wide text-primary-2">{data.config.sigla}</span>
        </div>
        {data.config.descricao && <p className="mt-1.5 max-w-3xl text-sm text-muted">{data.config.descricao}</p>}
        {data.config.temCargo && (
          <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-ink/80">
            <Award className="size-3.5 text-primary" /> Ao finalizar a turma, todos os participantes recebem o cargo do curso no Discord.
          </p>
        )}
      </div>

      <Tabs abas={abas} atual={atual} onChange={setAba} />
      <div role="tabpanel" className="mt-6">
        {atual === 'meu' && <MeuCurso data={data} curso={curso} />}
        {atual === 'gestao' && data.papel.instrutor && <Gestao data={data} curso={curso} />}
        {atual === 'formados' && <Formados curso={data} podeRemover={podeRemover} onRemovido={onMudou} />}
        {atual === 'certificados' && <Certificados curso={data} api={curso} meuId={me.user.id} />}
      </div>
    </section>
  )
}
