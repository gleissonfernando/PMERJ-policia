import { Lock, Loader2, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { Crest } from '@/components/Brand'
import { Card } from '@/components/form'
import { Alert } from '@/components/ui'
import { avatarUrl } from '@/lib/api'
import { useLogoUrl } from '@/lib/branding'
import { cn } from '@/lib/cn'
import { urlArquivo, useTranscript, type Anexo, type EventoTranscript, type Transcript as T } from '@/lib/corregedoria'
import { fmtDataHora } from '@/lib/format'

const nn = (n: number) => String(n).padStart(4, '0')
const hora = (ms: number) => new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/**
 * Transcript da corregedoria: /transcript/<ID de quem abriu>?ticket=<id>&chave=<segredo>
 * Com a chave do link (enviada na DM e no log), abre sem login. Sem chave, só a equipe logada.
 * Mostra o atendimento como foi no Discord: painel do ticket, provas e conversa.
 * Para quem abriu, a equipe aparece só pelo nome de exibição.
 */
export function Transcript() {
  const { userId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const valido = /^\d{17,20}$/.test(userId)
  const chave = params.get('chave')
  const { data, erro } = useTranscript(valido ? userId : '0', params.get('ticket'), chave)

  if (!valido) return <Moldura><Alert>Endereço de transcript inválido.</Alert></Moldura>

  if (erro) {
    const volta = `/transcript/${userId}${params.get('ticket') ? `?ticket=${params.get('ticket')}` : ''}`
    return (
      <Moldura>
        <Card className="mx-auto max-w-md">
          <div className="grid place-items-center gap-4 px-6 py-12 text-center">
            <span className="grid size-12 place-items-center rounded-full border border-line bg-surface-2 text-muted">
              <Lock className="size-5" />
            </span>
            <p className="text-sm text-muted">{chave ? 'Link inválido ou expirado. Use o botão “Ver transcript” da mensagem que você recebeu.' : erro.texto}</p>
            {!chave && erro.codigo === 'nao_autenticado' && (
              <a
                href={`/api/auth/discord?${new URLSearchParams({ context: 'painel', volta }).toString()}`}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-discord px-5 text-sm font-bold text-white transition hover:bg-discord-2"
              >
                Entrar com o Discord (equipe)
              </a>
            )}
          </div>
        </Card>
      </Moldura>
    )
  }

  if (!data) {
    return (
      <Moldura>
        <div className="grid min-h-[40vh] place-items-center" aria-busy="true">
          <Loader2 className="size-7 animate-spin text-primary" aria-label="Carregando" />
        </div>
      </Moldura>
    )
  }

  if (data.tickets.length === 0) return <Moldura><Card className="mx-auto max-w-md px-6 py-12 text-center text-sm text-muted">Nenhum ticket fechado para este policial ainda.</Card></Moldura>

  const sel = data.tickets.find((t) => t.id === params.get('ticket')) ?? data.tickets[0]!

  return (
    <Moldura>
      <div className={cn('grid gap-5', data.tickets.length > 1 && 'lg:grid-cols-[250px_minmax(0,1fr)] lg:items-start')}>
        {data.tickets.length > 1 && (
          <Card className="lg:sticky lg:top-6">
            <div className="border-b border-line px-5 py-4 text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted">Tickets · {data.tickets.length}</div>
            <ul className="grid gap-1 p-2">
              {data.tickets.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setParams({ ticket: t.id }, { replace: true })}
                    aria-current={t.id === sel.id}
                    className={cn('w-full rounded-xl px-3 py-2.5 text-left transition', t.id === sel.id ? 'bg-primary/10' : 'hover:bg-white/4')}
                  >
                    <div className="text-sm font-bold">
                      {t.tipo.emoji} #{nn(t.numero)} · <span className="font-normal text-ink/85">{t.assunto}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted">{fmtDataHora(t.abertoEm)}</div>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <TicketView t={sel} equipe={data.equipe} chave={chave} />
      </div>
    </Moldura>
  )
}

function Moldura({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-275 flex-1 px-5 py-10 sm:px-8">
      <div className="mb-8 flex items-center gap-3.5">
        <Crest className="size-12" />
        <div className="leading-tight">
          <div className="display text-lg">Corregedoria · Transcript</div>
          <div className="mt-0.5 text-xs text-muted">Polícia Militar do Estado do Rio de Janeiro · registro do atendimento</div>
        </div>
      </div>
      {children}
    </main>
  )
}

/* ---------- Visual do Discord ---------- */

const NAVY = '#1e3a8a'

/** Uma mensagem no estilo do Discord (avatar, nome, tag, horário). */
function Mensagem({ avatar, nome, tag, em, cor, children }: { avatar: ReactNode; nome: string; tag?: string; em: number; cor?: string; children: ReactNode }) {
  return (
    <li className="flex gap-4 px-4 py-2 hover:bg-black/6">
      <div className="mt-0.5 shrink-0">{avatar}</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-1.5">
          <span className="font-semibold" style={{ color: cor ?? '#f2f3f5' }}>
            {nome}
          </span>
          {tag && <span className="rounded-[3px] bg-discord px-1 text-[10px] font-semibold leading-4 text-white">{tag}</span>}
          <span className="text-xs text-[#949ba4]">{hora(em)}</span>
        </div>
        <div className="mt-0.5 text-[15px] leading-snug text-[#dbdee1]">{children}</div>
      </div>
    </li>
  )
}

/** Container V2 (barra lateral colorida). */
function Container({ cor, children }: { cor: string; children: ReactNode }) {
  return (
    <div className="mt-1 max-w-[560px] overflow-hidden rounded-lg border border-white/6 bg-[#2b2d31] p-4" style={{ borderLeft: `4px solid ${cor}` }}>
      {children}
    </div>
  )
}

const Divisor = () => <div className="my-3 border-t border-white/10" />

function BotaoDiscord({ cor, children }: { cor: 'verde' | 'azul' | 'cinza' | 'vermelho'; children: ReactNode }) {
  const cls = { verde: 'bg-[#248046]', azul: 'bg-discord', cinza: 'bg-[#4e5058]', vermelho: 'bg-[#da373c]' }[cor]
  return <span className={cn('inline-flex h-8 cursor-not-allowed items-center gap-1.5 rounded-[3px] px-3.5 text-sm font-medium text-white opacity-60', cls)}>{children}</span>
}

function Midia({ ticketId, anexos, chave }: { ticketId: string; anexos: Anexo[]; chave: string | null }) {
  if (anexos.length === 0) return null
  return (
    <div className={cn('mt-2 grid gap-1 overflow-hidden rounded-lg', anexos.length > 1 && 'grid-cols-2')}>
      {anexos.map((a) =>
        a.tipo.startsWith('video/') ? (
          <video key={a.arquivo} src={urlArquivo(ticketId, a, chave)} controls preload="metadata" className="max-h-80 w-full bg-black" />
        ) : (
          <a key={a.arquivo} href={urlArquivo(ticketId, a, chave)} target="_blank" rel="noopener noreferrer" className="block">
            <img src={urlArquivo(ticketId, a, chave)} alt={a.nome} loading="lazy" className="max-h-80 w-full object-cover transition hover:opacity-90" />
          </a>
        ),
      )}
    </div>
  )
}

function TicketView({ t, equipe, chave }: { t: T; equipe: boolean; chave: string | null }) {
  const logo = useLogoUrl()
  const avBot = <img src={logo} alt="" className="size-10 rounded-full bg-[#1e1f22] object-contain p-1" />
  const avDenunciante = <img src={avatarUrl({ id: t.denunciante.id, avatar: t.denunciante.avatar }, 80)} alt="" referrerPolicy="no-referrer" className="size-10 rounded-full" />
  const eventos = t.eventos.filter((e) => e.tipo !== 'abertura')
  const nomeDenunciante = `${t.denunciante.insignia ? `${t.denunciante.insignia} ` : ''}${t.denunciante.nome}`

  return (
    <div className="grid gap-5">
      {/* Resumo */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div>
            <h1 className="display text-xl">
              {t.tipo.emoji} Ticket #{nn(t.numero)} · <span className="text-muted">{t.tipo.nome}</span>
            </h1>
            <p className="mt-0.5 text-xs text-muted">
              Aberto {fmtDataHora(t.abertoEm)}
              {t.fechadoEm && ` · fechado ${fmtDataHora(t.fechadoEm)}`} · {t.eventos.filter((e) => e.tipo === 'mensagem').length} mensagens · {t.provas.length} provas
            </p>
          </div>
        </div>
        {equipe && t.interno && (
          <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-line bg-primary/5 px-6 py-3 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5 font-bold uppercase tracking-widest text-primary-2">
              <ShieldCheck className="size-3.5" /> Uso interno
            </span>
            <span>Atendido por: <strong className="text-ink">{t.interno.assumidoPor?.nome ?? 'ninguém assumiu'}</strong></span>
            <span>Fechado por: <strong className="text-ink">{t.interno.fechadoPor?.nome ?? '—'}</strong></span>
          </div>
        )}
      </Card>

      {/* O canal, como no Discord */}
      <div className="overflow-hidden rounded-[18px] border border-line bg-[#313338] font-[system-ui]">
        <div className="flex items-center gap-2 border-b border-black/30 px-4 py-3 text-[15px] font-semibold text-[#f2f3f5]">
          <span className="text-xl text-[#80848e]">#</span> 🛡️・ticket-{nn(t.numero)}
        </div>
        <ol className="grid gap-1 py-4">
          {/* 1) Painel do ticket */}
          <Mensagem avatar={avBot} nome="PMERJ" tag="APP" em={t.abertoEm}>
            <Container cor={t.status === 'fechado' ? '#4b5563' : NAVY}>
              <div className="flex gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-xl font-bold leading-tight text-[#f2f3f5]">
                    {t.tipo.emoji} Corregedoria · Ticket #{nn(t.numero)}
                  </div>
                  <p className="mt-1.5">
                    <strong className="text-[#f2f3f5]">Órgão:</strong> {t.tipo.nome}
                    <br />
                    <strong className="text-[#f2f3f5]">Aberto por:</strong> <span className="rounded-[3px] bg-discord/30 px-0.5 font-medium text-[#c9cdfb]">@{t.denunciante.username}</span> · {nomeDenunciante}
                  </p>
                </div>
                <img src={logo} alt="" className="size-20 shrink-0 rounded-lg object-contain" />
              </div>
              <Divisor />
              <p>
                <strong className="text-[#f2f3f5]">Motivo:</strong> {t.motivo}
                <br />
                <strong className="text-[#f2f3f5]">Assunto:</strong> {t.assunto}
              </p>
              <p className="mt-1 font-semibold text-[#f2f3f5]">Descrição</p>
              <p className="whitespace-pre-wrap border-l-4 border-[#4e5058] pl-3">{t.descricao}</p>
              <p className="mt-2">📎 <strong className="text-[#f2f3f5]">Provas:</strong> {t.provas.length ? `${t.provas.length} ${t.provas.length === 1 ? 'arquivo' : 'arquivos'} (abaixo)` : 'nenhuma enviada'}</p>
              <Divisor />
              <p>{t.status === 'fechado' ? '🔒 ' : t.assumido ? '🟢 ' : '🟡 '}<strong className="text-[#f2f3f5]">{t.status === 'fechado' ? 'Ticket fechado.' : t.assumido ? 'Assumido pela Corregedoria.' : 'Aguardando a Corregedoria assumir.'}</strong></p>
              <p className="mt-2 text-xs text-[#949ba4]">🛡️ Somente Corregedoria</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                <BotaoDiscord cor="verde">🛡️ Assumir ticket</BotaoDiscord>
                <BotaoDiscord cor="azul">💬 Responder</BotaoDiscord>
                <BotaoDiscord cor="cinza">🔔 Chamar oficial</BotaoDiscord>
                <BotaoDiscord cor="vermelho">🔒 Fechar ticket</BotaoDiscord>
              </div>
              <p className="mt-3 flex items-center gap-1.5 text-xs text-[#949ba4]">
                <img src={logo} alt="" className="size-4 object-contain" /> {t.nomeExibicao}
              </p>
            </Container>
          </Mensagem>

          {/* 2) Provas */}
          {t.provas.length > 0 && (
            <Mensagem avatar={avBot} nome="PMERJ" tag="APP" em={t.abertoEm}>
              <Container cor={NAVY}>
                <div className="text-base font-bold text-[#f2f3f5]">📎 Provas</div>
                <Midia ticketId={t.id} anexos={t.provas} chave={chave} />
              </Container>
            </Mensagem>
          )}

          <Mensagem avatar={avBot} nome="PMERJ" tag="APP" em={t.abertoEm}>
            <span className="rounded-[3px] bg-discord/30 px-0.5 font-medium text-[#c9cdfb]">@{t.denunciante.username}</span>, seu ticket foi aberto. Aguarde: a Corregedoria vai responder por aqui.
          </Mensagem>

          {/* 3) Conversa e avisos */}
          {eventos.map((e) => (
            <Evento key={e.id} e={e} t={t} equipe={equipe} chave={chave} avBot={avBot} avDenunciante={avDenunciante} />
          ))}
        </ol>
      </div>
    </div>
  )
}

function Evento({ e, t, equipe, chave, avBot, avDenunciante }: { e: EventoTranscript; t: T; equipe: boolean; chave: string | null; avBot: ReactNode; avDenunciante: ReactNode }) {
  if (e.tipo === 'sistema') {
    return (
      <li className="flex items-center gap-3 px-4 py-1.5 text-xs text-[#949ba4]">
        <span className="h-px flex-1 bg-white/10" />
        <span>
          {e.conteudo} · {hora(e.em)}
          {equipe && e.autor.agente && <span className="text-[#c9cdfb]"> · {e.autor.agente}</span>}
        </span>
        <span className="h-px flex-1 bg-white/10" />
      </li>
    )
  }
  const corregedoria = e.papel === 'corregedoria'
  return (
    <Mensagem avatar={corregedoria ? avBot : avDenunciante} nome={e.autor.nome} tag={corregedoria ? 'APP' : undefined} em={e.em} cor={corregedoria ? '#c9cdfb' : undefined}>
      {equipe && corregedoria && e.autor.agente && <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-widest text-[#949ba4]">agente: {e.autor.agente}</span>}
      {e.conteudo && <p className="whitespace-pre-wrap wrap-break-word">{e.conteudo}</p>}
      <Midia ticketId={t.id} anexos={e.anexos} chave={chave} />
    </Mensagem>
  )
}
