import { ArrowLeft, Loader2 } from 'lucide-react'
import { Link, Navigate } from 'react-router'
import { CadastroCursos } from '@/components/curso/CadastroCursos'
import { BotStatus } from '@/components/discord/BotStatus'
import { Alert } from '@/components/ui'
import { adminDe } from '@/lib/api'
import { useCursos } from '@/lib/curso'
import { usePainelMe } from '@/lib/usePainelMe'

/** Painel → Cadastro de cursos (só admin). A API confere de novo em cada requisição. */
export function CadastroCursosPage() {
  const me = usePainelMe()
  const cursos = useCursos()
  const { data } = cursos

  if (!adminDe(me, 'curso')) return <Navigate to="/painel/cursos" replace />
  if (!data) {
    return cursos.loadError ? (
      <div className="mx-auto max-w-md">
        <Alert>{cursos.loadError}</Alert>
      </div>
    ) : (
      <div className="grid min-h-[50vh] place-items-center" aria-busy="true">
        <Loader2 className="size-7 animate-spin text-primary" aria-label="Carregando" />
      </div>
    )
  }

  return (
    <div className="animate-rise">
      <Link to="/painel/cursos" className="inline-flex items-center gap-1.5 text-xs font-bold text-muted transition hover:text-ink">
        <ArrowLeft className="size-3.5" /> Cursos
      </Link>
      <div className="mt-3">
        <span className="kicker">Formação · Administração</span>
        <h1 className="display mt-2 text-[clamp(2rem,4vw,2.6rem)]">Cadastro de cursos</h1>
        <p className="mt-1.5 max-w-2xl text-muted">
          Cadastre cada curso com o <span className="font-semibold text-ink">cargo entregue ao formar</span> e os <span className="font-semibold text-ink">cargos de instrutor</span>. Só quem tem esses cargos pode dar o curso.
        </p>
      </div>
      {!data.bot.ativo && <BotStatus botAtivo={false} gateway={{ estado: 'desligado' }} className="mt-6" />}
      <div className="mt-8">
        <CadastroCursos visao={data} cursos={cursos} />
      </div>
    </div>
  )
}
