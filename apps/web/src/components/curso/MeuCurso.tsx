import { Award, CheckCircle2, DoorOpen, ExternalLink, Flag, Lock, LogIn, Play, Users } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button, Card, CardHeader, Pill } from '@/components/form'
import { Alert } from '@/components/ui'
import { avatarUrl } from '@/lib/api'
import { cn } from '@/lib/cn'
import { erroCurso, STATUS_TURMA, type CursoApi, type CursoEstado } from '@/lib/curso'
import { fmtDataHora } from '@/lib/format'

const PASSOS: Array<{ icon: typeof LogIn; titulo: string; texto: string }> = [
  { icon: LogIn, titulo: 'Entre no curso', texto: 'Enquanto as inscrições estão abertas, você pode entrar e sair.' },
  { icon: Play, titulo: 'O curso começa', texto: 'O instrutor inicia: ninguém mais entra nem sai.' },
  { icon: Flag, titulo: 'Curso finalizado', texto: 'Todos os participantes recebem o curso, o cargo e o certificado automaticamente.' },
]

/** Visão do policial: entrar / sair da turma e acompanhar. */
export function MeuCurso({ data, curso }: { data: CursoEstado; curso: CursoApi }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const t = data.turmaAtual
  const aberta = t?.status === 'inscricoes'
  const lotada = Boolean(t?.vagas && t.participantes >= t.vagas)

  async function exec(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(erroCurso(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="grid content-start gap-5">
        {data.eu.concluido && (
          <Card className="relative overflow-hidden">
            <div className="flex items-start gap-4 p-6">
              <span className="grid size-12 shrink-0 place-items-center rounded-full border border-success/40 bg-success/10 text-success">
                <Award className="size-6" />
              </span>
              <div>
                <h3 className="display text-lg">Curso concluído</h3>
                <p className="mt-1 text-sm text-muted">
                  Você concluiu o <strong className="text-ink">{data.config.sigla}</strong>
                  {data.eu.concluido.concluidoEm ? ` em ${fmtDataHora(data.eu.concluido.concluidoEm)}` : ''}.
                  {data.config.temCargo &&
                    (data.eu.concluido.cargoEntregue === false ? ' O bot não conseguiu entregar o cargo — avise um instrutor.' : ' O cargo do curso foi entregue no Discord.')}
                </p>
                <p className="mt-2 text-xs text-muted/80">Ele aparece no seu /perfil.</p>
                {data.eu.concluido.certificado && (
                  <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[#c9a227]/30 bg-[#c9a227]/8 px-3.5 py-2.5 text-xs">
                    <span className="font-black uppercase tracking-[0.16em] text-[#e3c35a]">Certificado</span>
                    <span className="font-mono text-ink">{data.eu.concluido.certificado.codigo}</span>
                    {data.eu.concluido.certificado.url && (
                      <a href={data.eu.concluido.certificado.url} target="_blank" rel="noreferrer noopener" className="ml-auto inline-flex items-center gap-1 font-bold text-[#e3c35a] hover:underline">
                        Ver no Discord <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}

        {!data.eu.concluido && !t && (
          <Card className="grid place-items-center gap-3 px-6 py-14 text-center">
            <span className="grid size-12 place-items-center rounded-full border border-line bg-surface-2 text-muted">
              <Lock className="size-5" />
            </span>
            <h3 className="display text-lg">Nenhuma turma aberta</h3>
            <p className="max-w-sm text-sm text-muted">Quando um instrutor abrir a próxima turma, você pode entrar por aqui ou pelo Discord.</p>
          </Card>
        )}

        {!data.eu.concluido && t && (
          <Card>
            <div className="p-6 sm:p-7">
              <div className="flex flex-wrap items-center gap-3">
                <Pill className={STATUS_TURMA[t.status].cls}>{STATUS_TURMA[t.status].label}</Pill>
                <span className="text-xs text-muted">
                  {t.agendadoPara ? <>Agendado para <strong className="text-ink">{fmtDataHora(t.agendadoPara)}</strong></> : <>Aberta em {fmtDataHora(t.criadaEm)}</>}
                  {t.evento?.url && (
                    <>
                      {' · '}
                      <a href={t.evento.url} target="_blank" rel="noopener noreferrer" className="font-bold text-primary-2 hover:underline">
                        ver evento
                      </a>
                    </>
                  )}
                </span>
              </div>
              <div className="mt-5 flex flex-wrap items-end gap-6">
                <div>
                  <div className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-muted">Turma</div>
                  <div className="display text-6xl leading-none text-primary tabular-nums">{String(t.numero).padStart(2, '0')}</div>
                </div>
                <div className="pb-1">
                  <div className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-muted">Participantes</div>
                  <div className="display text-3xl tabular-nums">
                    {t.participantes}
                    {t.vagas && <span className="text-muted">/{t.vagas}</span>}
                  </div>
                </div>
              </div>

              {error && (
                <div className="mt-5">
                  <Alert>{error}</Alert>
                </div>
              )}

              <div className="mt-6 flex flex-wrap items-center gap-3">
                {data.eu.participando ? (
                  <Button variant="ghost" size="lg" loading={busy} disabled={!aberta} onClick={() => exec(curso.sair)}>
                    {!busy && <DoorOpen className="size-4" />} Sair do curso
                  </Button>
                ) : (
                  <Button variant="success" size="lg" loading={busy} disabled={!aberta || lotada} onClick={() => exec(curso.entrar)}>
                    {!busy && <LogIn className="size-4" />} Entrar no curso
                  </Button>
                )}
                <span className={cn('text-sm', data.eu.participando ? 'font-semibold text-success' : 'text-muted')}>
                  {t.status === 'andamento'
                    ? data.eu.participando
                      ? 'Curso em andamento. Ao finalizar, você recebe o curso.'
                      : 'Curso em andamento: entradas encerradas.'
                    : data.eu.participando
                      ? 'Você está participando.'
                      : lotada
                        ? 'Turma lotada.'
                        : 'Também dá para entrar pelo botão no Discord.'}
                </span>
              </div>
            </div>
          </Card>
        )}

        {t && data.participantes.length > 0 && (
          <Card>
            <CardHeader icon={<Users className="size-4.5" />} title={`Participantes · ${data.participantes.length}`} />
            <ul className="flex flex-wrap gap-2 p-5">
              {data.participantes.map((p) => (
                <li key={p.id} className="flex items-center gap-2 rounded-full border border-line bg-surface-2/60 py-1 pl-1 pr-3 text-xs">
                  <img src={avatarUrl({ id: p.userId, avatar: p.avatar }, 32)} alt="" referrerPolicy="no-referrer" className="size-6 rounded-full" />
                  <span className="max-w-40 truncate font-semibold">{p.nome}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader icon={<CheckCircle2 className="size-4.5" />} title="Como funciona" />
        <ol className="divide-y divide-line">
          {PASSOS.map(({ icon: Icon, titulo, texto }, i) => (
            <Passo key={titulo} n={i + 1} icon={<Icon className="size-4" />} titulo={titulo} texto={texto} />
          ))}
        </ol>
      </Card>
    </div>
  )
}

function Passo({ n, icon, titulo, texto }: { n: number; icon: ReactNode; titulo: string; texto: string }) {
  return (
    <li className="flex gap-4 px-6 py-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-primary/25 bg-primary/10 text-primary">{icon}</span>
      <div className="min-w-0">
        <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted">Passo {n}</div>
        <div className="font-bold">{titulo}</div>
        <p className="mt-0.5 text-xs text-muted">{texto}</p>
      </div>
    </li>
  )
}
