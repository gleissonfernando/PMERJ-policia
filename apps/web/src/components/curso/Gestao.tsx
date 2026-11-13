import { CalendarClock, ExternalLink, Flag, History, Info, Play, Users, X } from 'lucide-react'
import { useState } from 'react'
import { Button, Card, CardHeader, Field, Input, Pill, Textarea } from '@/components/form'
import { EmptyState } from '@/components/EmptyState'
import { Alert } from '@/components/ui'
import { avatarUrl } from '@/lib/api'
import { erroCurso, STATUS_TURMA, type CursoApi, type CursoEstado } from '@/lib/curso'
import { fmtDataHora, fmtRelativo } from '@/lib/format'

type Confirmacao = 'iniciar' | 'finalizar' | 'cancelar' | { tirar: string } | null

const ROTULO_EVENTO = { agendado: 'agendado', andamento: 'em andamento', encerrado: 'encerrado', cancelado: 'cancelado' } as const

/** "Agora" no formato do campo datetime-local (horário do computador). */
function agoraLocal(): string {
  const d = new Date(Date.now() + 60_000)
  d.setSeconds(0, 0)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

/** Gestão da turma (só instrutores do curso): abrir, iniciar, finalizar, cancelar e tirar participantes. */
export function Gestao({ data, curso }: { data: CursoEstado; curso: CursoApi }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [vagas, setVagas] = useState('')
  const [quando, setQuando] = useState('')
  const [duracao, setDuracao] = useState('')
  const [local, setLocal] = useState('')
  const [observacoes, setObservacoes] = useState('')
  // Horário no passado é recusado pela API com mensagem clara.
  const quandoOk = Boolean(quando) && !Number.isNaN(new Date(quando).getTime())
  const [confirmar, setConfirmar] = useState<Confirmacao>(null)
  const t = data.turmaAtual
  const n = data.participantes.length

  async function exec(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      setConfirmar(null)
    } catch (err) {
      setError(erroCurso(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-5">
      {error && <Alert>{error}</Alert>}
      {!data.bot.canalTurmas && (
        <p className="flex items-start gap-2 rounded-xl border border-[#f59e0b]/40 bg-[#f59e0b]/10 px-4 py-3 text-xs text-[#fcd34d]">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>Nenhum canal de turmas configurado: a mensagem com Entrar / Sair não vai para o Discord. Configure em Cadastro de cursos.</span>
        </p>
      )}

      {!t ? (
        <Card>
          <CardHeader
            icon={<CalendarClock className="size-4.5" />}
            title="Agendar turma"
            hint="Também dá para agendar pelo /curso no Discord. O bot cria o evento no servidor e posta a turma com Entrar / Sair."
          />
          <div className="grid gap-4 p-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Field label="Data e horário" htmlFor="g-quando" hint="Horário do seu computador.">
                <Input id="g-quando" type="datetime-local" value={quando} min={agoraLocal()} onChange={(e) => setQuando(e.target.value)} aria-invalid={Boolean(quando) && !quandoOk} />
              </Field>
              <Field label="Duração" htmlFor="g-duracao" hint="Opcional. Ex.: 1h, 1h30.">
                <Input id="g-duracao" value={duracao} maxLength={40} placeholder="1h" onChange={(e) => setDuracao(e.target.value)} />
              </Field>
              <Field label="Local" htmlFor="g-local" hint="Opcional.">
                <Input id="g-local" value={local} maxLength={80} placeholder="Ex.: Batalhão do BOPE" onChange={(e) => setLocal(e.target.value)} />
              </Field>
              <Field label="Vagas" htmlFor="g-vagas" hint="Vazio = sem limite.">
                <Input id="g-vagas" inputMode="numeric" value={vagas} placeholder="Sem limite" onChange={(e) => setVagas(e.target.value.replace(/\D/g, '').slice(0, 3))} />
              </Field>
            </div>
            <Field label="Observações" htmlFor="g-obs" hint={`Opcional. Material, uniforme, pré-requisitos… ${observacoes.length}/500`}>
              <Textarea id="g-obs" value={observacoes} maxLength={500} rows={2} placeholder="Ex.: 1 fuzil, 150 munições" onChange={(e) => setObservacoes(e.target.value)} className="min-h-0" />
            </Field>
            <div className="flex justify-end">
              <Button
                loading={busy}
                disabled={!data.config.ativo || !quandoOk}
                onClick={() =>
                  exec(() =>
                    curso.abrirTurma({
                      agendadoPara: new Date(quando).getTime(),
                      vagas: vagas ? Math.max(1, Number(vagas)) : null,
                      duracao: duracao.trim() || null,
                      local: local.trim() || null,
                      observacoes: observacoes.trim() || null,
                    }),
                  )
                }
              >
                {!busy && <CalendarClock className="size-4" />} Agendar turma {data.turmas[0] ? String(data.turmas[0].numero + 1).padStart(2, '0') : '01'}
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-6 py-5">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="display text-xl">Turma {String(t.numero).padStart(2, '0')}</h2>
                <Pill className={STATUS_TURMA[t.status].cls}>{STATUS_TURMA[t.status].label}</Pill>
              </div>
              <p className="mt-1 text-xs text-muted">
                {n}
                {t.vagas ? `/${t.vagas}` : ''} {n === 1 ? 'participante' : 'participantes'} · aberta {fmtRelativo(t.criadaEm)}
                {t.inicioEm && ` · iniciada ${fmtRelativo(t.inicioEm)}`}
              </p>
              {t.agendadoPara && (
                <p className="mt-2 inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  <CalendarClock className="size-3.5 text-primary" />
                  <span className="font-semibold text-ink">Agendado para {fmtDataHora(t.agendadoPara)}</span>
                  {t.evento?.url ? (
                    <a href={t.evento.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold text-primary-2 hover:underline">
                      Evento {ROTULO_EVENTO[t.evento.status]} <ExternalLink className="size-3" />
                    </a>
                  ) : (
                    <span className="text-muted">· sem evento no Discord</span>
                  )}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {t.status === 'inscricoes' ? (
                <Button loading={busy && confirmar === 'iniciar'} disabled={n === 0} onClick={() => setConfirmar('iniciar')}>
                  <Play className="size-4" /> Iniciar curso
                </Button>
              ) : (
                <Button variant="success" loading={busy && confirmar === 'finalizar'} onClick={() => setConfirmar('finalizar')}>
                  <Flag className="size-4" /> Finalizar curso
                </Button>
              )}
              <Button variant="ghost" onClick={() => setConfirmar('cancelar')}>
                <X className="size-4" /> Cancelar turma
              </Button>
            </div>
          </div>

          {(confirmar === 'iniciar' || confirmar === 'finalizar' || confirmar === 'cancelar') && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface-2/50 px-6 py-4 text-sm">
              <span>
                {confirmar === 'iniciar' && <>Iniciar com <strong>{n}</strong> {n === 1 ? 'participante' : 'participantes'}? Depois disso <strong>ninguém mais entra nem sai</strong>.</>}
                {confirmar === 'finalizar' && <><strong>{n} {n === 1 ? 'participante recebe' : 'participantes recebem'}</strong> o curso{data.config.temCargo ? ' e o cargo' : ''} agora. Confirmar?</>}
                {confirmar === 'cancelar' && <>Cancelar a turma? <strong>Ninguém recebe o curso.</strong></>}
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setConfirmar(null)}>
                  Voltar
                </Button>
                <Button
                  size="sm"
                  variant={confirmar === 'cancelar' ? 'danger' : confirmar === 'finalizar' ? 'success' : 'primary'}
                  loading={busy}
                  onClick={() => exec(() => (confirmar === 'iniciar' ? curso.iniciar(t.id) : confirmar === 'finalizar' ? curso.finalizar(t.id) : curso.cancelar(t.id)))}
                >
                  Confirmar
                </Button>
              </div>
            </div>
          )}

          {n === 0 ? (
            <EmptyState icon={Users}>Ninguém entrou ainda. Os participantes entram pelo botão no Discord ou por aqui em Meu curso.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {data.participantes.map((p) => {
                const tirando = typeof confirmar === 'object' && confirmar?.tirar === p.id
                return (
                  <li key={p.id} className="flex items-center gap-3 px-4 py-3 sm:px-6">
                    <img src={avatarUrl({ id: p.userId, avatar: p.avatar }, 64)} alt="" referrerPolicy="no-referrer" className="size-9 rounded-full" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{p.nome}</div>
                      <div className="truncate text-xs text-muted">@{p.username} · entrou {fmtRelativo(p.entrouEm)}</div>
                    </div>
                    {tirando ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted">Tirar da turma?</span>
                        <Button variant="ghost" size="sm" onClick={() => setConfirmar(null)}>
                          Não
                        </Button>
                        <Button variant="danger" size="sm" loading={busy} onClick={() => exec(() => curso.tirar(t.id, p.id))}>
                          Tirar
                        </Button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmar({ tirar: p.id })}
                        aria-label={`Tirar ${p.nome} da turma`}
                        title="Tirar da turma"
                        className="grid size-8 place-items-center rounded-[9px] text-muted transition hover:bg-danger/10 hover:text-danger"
                      >
                        <X className="size-4" />
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      )}

      {data.turmas.some((x) => x.status === 'encerrada' || x.status === 'cancelada') && (
        <Card>
          <CardHeader icon={<History className="size-4.5" />} title="Turmas anteriores" />
          <ul className="divide-y divide-line">
            {data.turmas
              .filter((x) => x.status === 'encerrada' || x.status === 'cancelada')
              .map((x) => (
                <li key={x.id} className="flex flex-wrap items-center gap-3 px-6 py-3 text-sm">
                  <span className="w-20 font-display tracking-wide">Turma {String(x.numero).padStart(2, '0')}</span>
                  <Pill className={STATUS_TURMA[x.status].cls}>{STATUS_TURMA[x.status].label}</Pill>
                  <span className="text-xs text-muted">
                    {x.status === 'encerrada' ? `${x.participantes} concluíram` : 'ninguém recebeu'}
                    {x.encerradaEm && ` · ${fmtDataHora(x.encerradaEm)}`}
                  </span>
                </li>
              ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
