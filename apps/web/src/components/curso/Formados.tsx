import { GraduationCap, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button, Card } from '@/components/form'
import { Alert } from '@/components/ui'
import { avatarUrl } from '@/lib/api'
import { erroCurso, removerCurso, type CursoEstado } from '@/lib/curso'

const data = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })

/** Quem concluiu o curso. Com permissão (cargos do /remover curso), dá para remover daqui também. */
export function Formados({ curso, podeRemover, onRemovido }: { curso: CursoEstado; podeRemover: boolean; onRemovido: () => void }) {
  const [confirmar, setConfirmar] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function remover(userId: string) {
    setBusy(true)
    setError(null)
    try {
      await removerCurso(userId, curso.config.id)
      setConfirmar(null)
      onRemovido()
    } catch (err) {
      setError(erroCurso(err))
    } finally {
      setBusy(false)
    }
  }

  if (curso.concluidos.length === 0) {
    return (
      <Card className="grid place-items-center gap-3 px-6 py-16 text-center">
        <span className="grid size-14 place-items-center rounded-full border border-line bg-surface-2 text-muted">
          <GraduationCap className="size-6" />
        </span>
        <h3 className="display text-lg">Ninguém concluiu ainda</h3>
        <p className="text-sm text-muted">Quem concluir o {curso.config.sigla} aparece aqui.</p>
      </Card>
    )
  }
  return (
    <div className="grid gap-3">
      {error && <Alert>{error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {curso.concluidos.map((f) => (
          <div key={f.id} className="group relative overflow-hidden rounded-[18px] border border-line bg-[linear-gradient(150deg,#121212,#0a0a0a)] p-5 transition hover:border-primary/40">
            <GraduationCap aria-hidden="true" strokeWidth={1.2} className="pointer-events-none absolute -bottom-6 -right-6 size-32 text-white opacity-[.04] transition group-hover:opacity-[.07]" />
            <div className="relative flex items-center gap-4">
              <img src={avatarUrl({ id: f.userId, avatar: f.avatar }, 80)} alt="" referrerPolicy="no-referrer" className="size-12 rounded-full border border-line-strong" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold">{f.nome}</div>
                <div className="mt-0.5 text-xs text-muted">
                  {curso.config.sigla} · Turma {f.turma ? String(f.turma).padStart(2, '0') : '?'}
                  {f.concluidoEm && ` · ${data.format(f.concluidoEm)}`}
                </div>
              </div>
              {podeRemover && confirmar !== f.userId && (
                <button
                  type="button"
                  onClick={() => setConfirmar(f.userId)}
                  aria-label={`Remover o curso de ${f.nome}`}
                  title="Remover curso"
                  className="grid size-8 shrink-0 place-items-center rounded-[9px] text-muted opacity-0 transition hover:bg-danger/10 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
            {confirmar === f.userId && (
              <div className="relative mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
                <span className="mr-auto text-xs text-muted">Remover o curso{curso.config.temCargo ? ' e o cargo' : ''}?</span>
                <Button variant="ghost" size="sm" onClick={() => setConfirmar(null)}>
                  Não
                </Button>
                <Button variant="danger" size="sm" loading={busy} onClick={() => remover(f.userId)}>
                  Remover
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
