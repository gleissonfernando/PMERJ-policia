import { Award, ExternalLink, Search, Send, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button, Card, Input } from '@/components/form'
import { Alert } from '@/components/ui'
import { avatarUrl } from '@/lib/api'
import { cn } from '@/lib/cn'
import { erroCurso, type CursoApi, type CursoEstado, type Pessoa } from '@/lib/curso'

const data = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
const nn = (n: number | null) => (n === null ? '—' : String(n).padStart(2, '0'))

type Formado = Pessoa & { turma: number | null }

/**
 * Certificados do curso. Saem no Discord quando o instrutor finaliza a turma; aqui ficam todos
 * reunidos. Instrutor emite os de quem concluiu antes dos certificados e publica de novo o que falhou.
 */
export function Certificados({ curso, api, meuId }: { curso: CursoEstado; api: CursoApi; meuId: string }) {
  const [busca, setBusca] = useState('')
  const [enviando, setEnviando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const instrutor = curso.papel.instrutor

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase()
    const filtrada = curso.concluidos.filter(
      (f) => !t || f.nome.toLowerCase().includes(t) || f.username.toLowerCase().includes(t) || f.certificado?.codigo.toLowerCase().includes(t),
    )
    // O seu primeiro; depois do mais recente para o mais antigo.
    return [...filtrada.filter((f) => f.userId === meuId), ...filtrada.filter((f) => f.userId !== meuId)]
  }, [curso.concluidos, busca, meuId])

  const emitidos = curso.concluidos.filter((f) => f.certificado).length
  const publicados = curso.concluidos.filter((f) => f.certificado?.url).length

  async function publicar(f: Formado) {
    setEnviando(f.id)
    setError(null)
    try {
      await api.publicarCertificado(f.id)
    } catch (err) {
      setError(erroCurso(err))
    } finally {
      setEnviando(null)
    }
  }

  if (curso.concluidos.length === 0) {
    return (
      <Card className="grid place-items-center gap-3 px-6 py-16 text-center">
        <span className="grid size-14 place-items-center rounded-full border border-[#c9a227]/40 bg-[#c9a227]/10 text-[#e3c35a]">
          <Award className="size-6" />
        </span>
        <h3 className="display text-lg">Nenhum certificado ainda</h3>
        <p className="max-w-sm text-sm text-muted">Quando o instrutor finalizar uma turma do {curso.config.sigla}, cada participante recebe o certificado aqui e no Discord.</p>
      </Card>
    )
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-4 text-xs font-extrabold uppercase tracking-[0.12em] text-muted">
          <span>
            <span className="font-display text-base text-ink tabular-nums">{emitidos}</span> emitidos
          </span>
          <span aria-hidden="true" className="h-4 w-px bg-line" />
          <span>
            <span className="font-display text-base text-ink tabular-nums">{publicados}</span> no Discord
          </span>
        </div>
        <div className="ml-auto w-full sm:w-72">
          <Input
            aria-label="Buscar certificado"
            placeholder="Buscar por nome ou código…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            leading={<Search className="size-4" />}
          />
        </div>
      </div>

      {!curso.bot.canalCertificados && (
        <p className="flex items-start gap-2 rounded-xl border border-[#f59e0b]/30 bg-[#f59e0b]/8 px-4 py-3 text-xs text-[#fbbf24]">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          Nenhum canal de certificados configurado: os certificados ficam só no site. A administração escolhe o canal em Cadastro de cursos.
        </p>
      )}
      {error && <Alert>{error}</Alert>}

      {lista.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">Nenhum certificado encontrado para “{busca}”.</p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {lista.map((f) => (
            <CertificadoCard
              key={f.id}
              f={f}
              sigla={curso.config.sigla}
              nomeCurso={curso.config.nome}
              meu={f.userId === meuId}
              instrutor={instrutor}
              podePublicar={curso.bot.canalCertificados}
              enviando={enviando === f.id}
              onPublicar={() => publicar(f)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function CertificadoCard({
  f,
  sigla,
  nomeCurso,
  meu,
  instrutor,
  podePublicar,
  enviando,
  onPublicar,
}: {
  f: Formado
  sigla: string
  nomeCurso: string
  meu: boolean
  instrutor: boolean
  podePublicar: boolean
  enviando: boolean
  onPublicar: () => void
}) {
  const c = f.certificado
  const foto = c?.foto ?? avatarUrl({ id: f.userId, avatar: f.avatar }, 256)
  return (
    <li
      className={cn(
        'group relative overflow-hidden rounded-[18px] border bg-[linear-gradient(160deg,#16130a_0%,#0d0d0d_55%)] p-1.5 transition',
        meu ? 'border-[#c9a227]/60' : 'border-[#c9a227]/20 hover:border-[#c9a227]/45',
        !c && 'opacity-80',
      )}
    >
      {/* Moldura interna, como num diploma */}
      <div className="relative h-full rounded-[13px] border border-[#c9a227]/15 px-5 pb-5 pt-4">
        <Award aria-hidden="true" strokeWidth={1} className="pointer-events-none absolute -right-5 -top-5 size-28 text-[#c9a227] opacity-[.06]" />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-black uppercase tracking-[0.22em] text-[#e3c35a]">Certificado de conclusão</span>
          {meu && <span className="rounded-full border border-[#c9a227]/40 bg-[#c9a227]/15 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-widest text-[#e3c35a]">Seu</span>}
        </div>

        <div className="mt-4 flex items-center gap-4">
          <img src={foto} alt="" referrerPolicy="no-referrer" className="size-16 shrink-0 rounded-full border-2 border-[#c9a227]/60 object-cover shadow-[0_0_0_4px_rgb(201_162_39/0.08)]" />
          <div className="min-w-0">
            <div className="truncate font-display text-lg font-semibold leading-tight text-ink">{c?.nome ?? f.nome}</div>
            <div className="mt-0.5 truncate text-xs text-muted">@{f.username}</div>
          </div>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-ink/85">
          Concluiu o <span className="font-semibold text-ink">{nomeCurso}</span> ({sigla}), turma {nn(f.turma)}
          {f.concluidoEm ? `, em ${data.format(f.concluidoEm)}` : ''}.
        </p>

        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-[#c9a227]/15 pt-3 text-xs">
          <div className="min-w-0">
            <dt className="font-extrabold uppercase tracking-[0.12em] text-muted">Código</dt>
            <dd className="mt-0.5 truncate font-mono text-[13px] text-ink">{c?.codigo ?? '—'}</dd>
          </div>
          <div className="min-w-0">
            <dt className="font-extrabold uppercase tracking-[0.12em] text-muted">Instrutor</dt>
            <dd className="mt-0.5 truncate text-ink">{c?.instrutor.nome ?? '—'}</dd>
          </div>
        </dl>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {c?.url ? (
            <a
              href={c.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex h-8 items-center gap-1.5 rounded-[9px] border border-[#c9a227]/35 px-3 text-xs font-bold text-[#e3c35a] transition hover:bg-[#c9a227]/10"
            >
              Ver no Discord <ExternalLink className="size-3.5" />
            </a>
          ) : (
            <span className="text-xs text-muted">{c ? 'Não publicado no Discord' : 'Concluiu antes dos certificados'}</span>
          )}
          {instrutor && !c?.url && podePublicar && (
            <Button size="sm" variant="ghost" loading={enviando} onClick={onPublicar} className="ml-auto">
              {!enviando && <Send className="size-3.5" />} {c ? 'Publicar' : 'Emitir certificado'}
            </Button>
          )}
        </div>
      </div>
    </li>
  )
}
