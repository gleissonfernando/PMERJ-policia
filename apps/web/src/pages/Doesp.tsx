import { AlertTriangle, ChevronDown, ExternalLink, FileText, FolderTree, KeyRound, Loader2, Lock, MessageSquareShare, RefreshCw, Search, Send, Settings2, ShieldCheck, Stamp, Swords, UserCog, Users } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { BotStatus } from '@/components/discord/BotStatus'
import { CanalSelect } from '@/components/discord/CanalSelect'
import { CargoPicker } from '@/components/discord/CargoPicker'
import { EmptyState } from '@/components/EmptyState'
import { Button, Card, CardHeader, Field, Input, Pill, Select } from '@/components/form'
import { SaveBar } from '@/components/SaveBar'
import { Tabs, useAba, type Aba } from '@/components/Tabs'
import { Alert } from '@/components/ui'
import { cn } from '@/lib/cn'
import { erroDoesp, numero, useDoesp, type DoespApi, type DoespEstado, type DoespInput, type Requerimento, type StatusRequerimento } from '@/lib/doesp'

type Id = 'requerimentos' | 'canais' | 'cargos'

const dataHora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
const fmt = (ms: number) => dataHora.format(ms)

const STATUS: Record<StatusRequerimento, { label: string; cls: string }> = {
  AGUARDANDO: { label: 'Aguardando despacho', cls: 'border-[#f5c542]/40 bg-[#f5c542]/10 text-[#f5c542]' },
  DEFERIDO: { label: 'Despachado ✅', cls: 'border-success/35 bg-success/10 text-success' },
  EM_EXECUCAO: { label: 'DOESP designado', cls: 'border-[#3b82f6]/40 bg-[#3b82f6]/10 text-[#60a5fa]' },
  CONCLUIDO: { label: 'Concluído', cls: 'border-success/35 bg-success/10 text-success' },
  INDEFERIDO: { label: 'Indeferido', cls: 'border-danger/40 bg-danger/10 text-danger' },
}

/** Painel → DOESP: Requerimento ao Comando (P/2 → Comandante → 1ª Companhia → resultados). */
export function Doesp() {
  const doesp = useDoesp()
  const { data } = doesp
  const c = data?.config
  const abas: Aba<Id>[] = [
    { id: 'requerimentos', label: 'Requerimentos', icon: FileText, count: data?.requests.filter((r) => r.status === 'AGUARDANDO' || r.status === 'DEFERIDO' || r.status === 'EM_EXECUCAO').length },
    { id: 'canais', label: 'Canais e painel', icon: MessageSquareShare },
    { id: 'cargos', label: 'Cargos', icon: KeyRound },
  ]
  const [aba, irPara] = useAba(abas)

  if (!data || !c) {
    return doesp.loadError ? (
      <div className="mx-auto max-w-md">
        <Alert>{doesp.loadError}</Alert>
      </div>
    ) : (
      <div className="grid min-h-[50vh] place-items-center" aria-busy="true">
        <Loader2 className="size-7 animate-spin text-primary" aria-label="Carregando" />
      </div>
    )
  }

  const pendencias = [
    !c.requestsChannelId && { texto: 'Escolha o canal dos requerimentos.', aba: 'canais' as const },
    !c.panelMessageId && { texto: 'Publique o painel com o botão “Novo requerimento”.', aba: 'canais' as const },
    !c.requesterRoleIds.length && { texto: 'Escolha os cargos dos Chefes de Seção – P/2.', aba: 'cargos' as const },
    !c.commanderRoleIds.length && { texto: 'Escolha o cargo do Comandante.', aba: 'cargos' as const },
    !c.companyRoleIds.length && { texto: 'Escolha o cargo do Comando da 1ª Companhia.', aba: 'cargos' as const },
  ].filter(Boolean) as Array<{ texto: string; aba: Id }>
  const pronto = data.gateway.estado === 'online' && pendencias.length === 0

  return (
    <div className="animate-rise">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="kicker">P/2 · Seção de Inteligência</span>
          <h1 className="display mt-2 text-[clamp(2rem,4vw,2.6rem)]">DOESP</h1>
          <p className="mt-1.5 max-w-2xl text-muted">
            Requerimento ao Comando: o Chefe de Seção preenche num <span className="font-semibold text-ink">canal temporário</span>, o Comandante despacha, a 1ª Companhia designa o DOESP e encaminha os resultados — com as imagens e vídeos no canal dos resultados.
          </p>
        </div>
        <span className={cn('inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[11px] font-black uppercase tracking-widest', pronto ? 'border-success/35 bg-success/10 text-success' : 'border-line bg-surface text-muted')}>
          <span className={cn('size-2 rounded-full', pronto ? 'animate-siren bg-success' : 'bg-muted/60')} />
          {data.gateway.estado !== 'online' ? 'Bot desconectado' : pendencias.length ? `${pendencias.length} pendência${pendencias.length > 1 ? 's' : ''}` : 'Pronto'}
        </span>
      </div>

      {!data.acesso.canManage ? (
        <Card className="mt-8">
          <EmptyState icon={Lock}>Somente os gestores da DOESP e a administração acessam esta área. Os requerimentos são abertos pelo painel no Discord.</EmptyState>
        </Card>
      ) : (
        <>
          {c.panelError && (
            <div className="mt-6">
              <Alert>Último erro ao publicar o painel: {c.panelError}.</Alert>
            </div>
          )}
          {pendencias.length > 0 && (
            <div className="mt-6 rounded-[16px] border border-[#f5c542]/30 bg-[#f5c542]/[0.06] px-5 py-4">
              <div className="flex items-center gap-2 text-sm font-bold text-[#f5c542]">
                <AlertTriangle className="size-4" /> Falta pouco para liberar os requerimentos
              </div>
              <ul className="mt-2 grid gap-1 text-sm">
                {pendencias.map((p) => (
                  <li key={p.texto}>
                    <button type="button" onClick={() => irPara(p.aba)} className="text-left text-muted transition hover:text-ink">
                      • {p.texto} <span className="text-xs text-primary-2">→ {p.aba === 'canais' ? 'Canais e painel' : 'Cargos'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Conteudo data={data} doesp={doesp} aba={aba} irPara={irPara} abas={abas} />
        </>
      )}
    </div>
  )
}

function toInput(d: DoespEstado): DoespInput {
  const { panelChannelId, requestsChannelId, resultsChannelId, draftCategoryId, requesterRoleIds, commanderRoleIds, companyRoleIds, managerRoleIds } = d.config
  return structuredClone({ panelChannelId, requestsChannelId, resultsChannelId, draftCategoryId, requesterRoleIds, commanderRoleIds, companyRoleIds, managerRoleIds })
}

/** Abas + barra de salvar (o rascunho das configurações sobrevive à troca de aba). */
function Conteudo({ data, doesp, aba, irPara, abas }: { data: DoespEstado; doesp: DoespApi; aba: Id; irPara: (id: Id) => void; abas: Aba<Id>[] }) {
  const original = useMemo(() => toInput(data), [data])
  const [draft, setDraft] = useState(original)
  const [base, setBase] = useState(original)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  // Atualização automática (a cada 15 s) não apaga o que está sendo editado.
  const dirty = JSON.stringify(draft) !== JSON.stringify(base)
  if (!dirty && JSON.stringify(base) !== JSON.stringify(original)) {
    setBase(original)
    setDraft(original)
  }
  const patch = (p: Partial<DoespInput>) => {
    setDraft((d) => ({ ...d, ...p }))
    setSaved(false)
  }

  async function save() {
    setSaving(true)
    setError(null)
    setAviso(null)
    try {
      const novo = await doesp.salvar(draft)
      const limpo = toInput(novo)
      setBase(limpo)
      setDraft(limpo)
      setSaved(true)
      setAviso(novo.aviso ?? (novo.config.panelMessageId ? 'Configurações salvas e painel atualizado no Discord.' : null))
    } catch (err) {
      setError(erroDoesp(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Tabs abas={abas} atual={aba} onChange={irPara} />
      <div role="tabpanel" className="mt-6">
        {aba === 'requerimentos' && <Lista data={data} doesp={doesp} />}
        {aba === 'canais' && <Canais data={data} doesp={doesp} draft={draft} patch={patch} dirty={dirty} aviso={aviso} />}
        {aba === 'cargos' && <Cargos data={data} draft={draft} patch={patch} />}
      </div>
      {aba !== 'requerimentos' && (
        <SaveBar dirty={dirty} saved={saved} saving={saving} error={error} onSave={save} onDiscard={() => { setDraft(base); setError(null) }} />
      )}
    </>
  )
}

/* ---------- Requerimentos ---------- */

function Lista({ data, doesp }: { data: DoespEstado; doesp: DoespApi }) {
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<StatusRequerimento | 'todos'>('todos')
  const [aberto, setAberto] = useState<string | null>(null)
  const emAndamento = data.requests.filter((r) => r.status === 'AGUARDANDO' || r.status === 'DEFERIDO' || r.status === 'EM_EXECUCAO').length

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return data.requests.filter(
      (r) => (filtro === 'todos' || r.status === filtro) && (!termo || [numero(r), r.requester.name, r.fact, r.subject, r.area, r.doesp ?? ''].some((v) => v.toLowerCase().includes(termo))),
    )
  }, [data.requests, busca, filtro])

  return (
    <Card>
      <CardHeader
        icon={<FileText className="size-4.5" />}
        title="Requerimentos ao Comando"
        hint="Os 300 mais recentes. Cada etapa (despacho ✅, DOESP e resultados) é feita pelos botões da mensagem no Discord."
        action={<span className="whitespace-nowrap rounded-full border border-line px-3 py-1 text-[11px] font-extrabold uppercase tracking-widest text-muted">{emAndamento} em andamento</span>}
      />
      <div className="grid gap-3 border-b border-line px-6 py-4 sm:grid-cols-[minmax(0,1fr)_14rem]">
        <Input aria-label="Buscar" leading={<Search className="size-4" />} placeholder="Número, Chefe de Seção, fato, área ou DOESP" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <Select aria-label="Status" value={filtro} onChange={(e) => setFiltro(e.target.value as StatusRequerimento | 'todos')}>
          <option value="todos">Todos os status</option>
          {(Object.keys(STATUS) as StatusRequerimento[]).map((s) => (
            <option key={s} value={s}>
              {STATUS[s].label}
            </option>
          ))}
        </Select>
      </div>
      {lista.length === 0 ? (
        <EmptyState icon={FileText}>{busca || filtro !== 'todos' ? 'Nenhum requerimento nessa busca.' : 'Nenhum requerimento ainda. Os Chefes de Seção abrem pelo painel no Discord.'}</EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {lista.map((r) => (
            <Item key={r.id} r={r} guildId={data.guildId} aberto={aberto === r.id} alternar={() => setAberto(aberto === r.id ? null : r.id)} doesp={doesp} />
          ))}
        </ul>
      )}
    </Card>
  )
}

function Item({ r, guildId, aberto, alternar, doesp }: { r: Requerimento; guildId: string | null; aberto: boolean; alternar: () => void; doesp: DoespApi }) {
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const link = guildId && r.channelId && r.messageId ? `https://discord.com/channels/${guildId}/${r.channelId}/${r.messageId}` : null
  const falhou = r.mediaTravada

  async function republicar() {
    setEnviando(true)
    setErro(null)
    try {
      await doesp.republicarMidias(r.id)
    } catch (err) {
      setErro(erroDoesp(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <li>
      <button type="button" aria-expanded={aberto} onClick={alternar} className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-white/[0.02] sm:px-6">
        <span className="font-display text-sm tracking-wide text-muted tabular-nums">{numero(r)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{r.fact}</span>
          <span className="block truncate text-xs text-muted">
            {r.requester.name} · {fmt(r.createdAt)}
            {r.doesp ? ` · ${r.doesp}` : ''}
          </span>
        </span>
        <Pill className={STATUS[r.status].cls}>{STATUS[r.status].label}</Pill>
        <ChevronDown className={cn('size-4 shrink-0 text-muted transition', aberto && 'rotate-180')} />
      </button>
      {aberto && (
        <dl className="grid gap-x-6 gap-y-3 border-t border-line bg-surface-2/30 px-4 py-5 text-sm sm:grid-cols-[13rem_minmax(0,1fr)] sm:px-6">
          <Dado t="Fato ou situação">{r.fact}</Dado>
          <Dado t="Objeto do levantamento">{r.subject}</Dado>
          <Dado t="Informações a confirmar">{r.information}</Dado>
          <Dado t="I – Área de interesse">{r.area}</Dado>
          <Dado t="II – Período estimado">{r.period}</Dado>
          {r.dispatchedAt && (
            <Dado t={r.status === 'INDEFERIDO' ? 'Indeferido' : 'Despachado ✅'}>
              {r.dispatchedBy?.name} · {fmt(r.dispatchedAt)}
              {r.refusedReason ? ` — ${r.refusedReason}` : ''}
            </Dado>
          )}
          {r.assignedAt && (
            <Dado t="DOESP designado">
              {r.doesp} · {r.team} · período: {r.assignedPeriod} ({r.assignedBy?.name}, {fmt(r.assignedAt)})
            </Dado>
          )}
          {r.resultAt && (
            <Dado t="Resultados à P/2">
              <span className="whitespace-pre-wrap">{r.result}</span> <span className="text-muted">({r.resultBy?.name}, {fmt(r.resultAt)})</span>
              {falhou && (
                <div className="mt-2 flex flex-wrap items-center gap-3 rounded-xl border border-danger/35 bg-danger/10 px-3 py-2 text-xs text-[#ffd5d2]">
                  Os resultados estão salvos, mas não foram publicados no canal{r.mediaError ? `: ${r.mediaError}` : ''}.
                  <Button size="sm" variant="ghost" loading={enviando} onClick={republicar}>
                    {!enviando && <RefreshCw className="size-3.5" />} Publicar de novo
                  </Button>
                </div>
              )}
              {erro && <p className="mt-1 text-xs text-danger">{erro}</p>}
            </Dado>
          )}
          {(r.media.length > 0 || r.requestLinks.length > 0) && (
            <Dado t="Fotos e vídeos">
              {r.media.length > 0 && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {r.media.map((m) => {
                    const src = `/api/doesp/${r.id}/midia/${m.id}`
                    return m.kind === 'video' ? (
                      <video key={m.id} src={src} controls preload="metadata" className="aspect-video w-full rounded-[10px] border border-line bg-black object-contain" />
                    ) : (
                      <a key={m.id} href={src} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-[10px] border border-line">
                        <img src={src} alt={m.name} loading="lazy" className="aspect-video w-full object-cover transition hover:scale-[1.03]" />
                      </a>
                    )
                  })}
                </div>
              )}
              {r.requestLinks.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer noopener" className="mt-1.5 flex items-center gap-1.5 truncate text-xs font-semibold text-primary-2 hover:underline">
                  <ExternalLink className="size-3.5 shrink-0" /> {url}
                </a>
              ))}
            </Dado>
          )}
          {link && (
            <dd className="sm:col-start-2">
              <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-bold text-primary-2 hover:underline">
                <ExternalLink className="size-3.5" /> Abrir no Discord
              </a>
            </dd>
          )}
        </dl>
      )}
    </li>
  )
}

function Dado({ t, children }: { t: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted sm:pt-0.5">{t}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  )
}

/* ---------- Canais e painel ---------- */

function Canais({ data, doesp, draft, patch, dirty, aviso }: { data: DoespEstado; doesp: DoespApi; draft: DoespInput; patch: (p: Partial<DoespInput>) => void; dirty: boolean; aviso: string | null }) {
  const [publicando, setPublicando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const texto = data.canais.filter((c) => c.tipo === 'texto' || c.tipo === 'anuncios')

  async function publicar(recriar: boolean) {
    setPublicando(true)
    setErro(null)
    setOk(null)
    try {
      await doesp.publicar(recriar)
      setOk(recriar ? 'Painel publicado de novo no Discord.' : 'Painel publicado no Discord.')
    } catch (err) {
      setErro(erroDoesp(err))
    } finally {
      setPublicando(false)
    }
  }

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader
          icon={<MessageSquareShare className="size-4.5" />}
          title="Canais e painel"
          hint="O painel tem o botão “Novo requerimento”. Cada um é preenchido num canal temporário e, ao enviar, sai no canal dos requerimentos marcando o Comandante."
        />
        <div className="grid gap-6 p-6">
          <BotStatus botAtivo={data.botAtivo} gateway={data.gateway} />
          <div className="grid gap-5 lg:grid-cols-2">
            <Field label="Canal do painel" htmlFor="ds-painel" hint="Onde os Chefes de Seção clicam em “Novo requerimento”.">
              <CanalSelect id="ds-painel" canais={texto} value={draft.panelChannelId} onChange={(panelChannelId) => patch({ panelChannelId })} vazio="Escolher canal..." />
            </Field>
            <Field label="Canal dos requerimentos" htmlFor="ds-req" hint="Use um canal restrito ao Comando, P/2 e 1ª Companhia: o conteúdo é de inteligência.">
              <CanalSelect id="ds-req" canais={texto} value={draft.requestsChannelId} onChange={(requestsChannelId) => patch({ requestsChannelId })} vazio="Escolher canal..." />
            </Field>
            <Field label="Canal dos resultados" htmlFor="ds-res" hint="Onde saem os resultados encaminhados à P/2, com as imagens e vídeos num painel logo abaixo. Vazio = canal dos requerimentos.">
              <CanalSelect id="ds-res" canais={texto} value={draft.resultsChannelId} onChange={(resultsChannelId) => patch({ resultsChannelId })} vazio="Canal dos requerimentos" />
            </Field>
            <Field label="Categoria dos canais temporários" htmlFor="ds-cat" hint="Onde aparecem os canais de preenchimento do novo requerimento. O bot precisa de “Gerenciar canais” nessa categoria.">
              <div className="relative">
                <Select id="ds-cat" value={draft.draftCategoryId ?? ''} onChange={(e) => patch({ draftCategoryId: e.target.value || null })} disabled={data.categorias.length === 0} className="pl-10">
                  <option value="">Sem categoria</option>
                  {data.categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </Select>
                <FolderTree className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
              </div>
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
            <Button onClick={() => publicar(false)} loading={publicando} disabled={!data.botAtivo || dirty || !data.config.panelChannelId}>
              {!publicando && <Send className="size-4" />} {data.config.panelMessageId ? 'Atualizar painel' : 'Publicar painel'}
            </Button>
            {data.config.panelMessageId && (
              <Button variant="ghost" onClick={() => publicar(true)} disabled={publicando || !data.botAtivo || dirty}>
                <RefreshCw className="size-4" /> Publicar de novo
              </Button>
            )}
            <span className={cn('text-xs', erro ? 'text-danger' : ok || aviso ? 'font-semibold text-success' : 'text-muted')}>
              {erro ?? ok ?? aviso ?? (dirty ? 'Salve as alterações antes de publicar.' : data.config.panelMessageId ? 'Ao salvar, o painel já publicado é atualizado sozinho.' : 'Escolha o canal do painel, salve e publique.')}
            </span>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader icon={<Stamp className="size-4.5" />} title="Como funciona" hint="Mesmo fluxo do sistema do BOPE." />
        <ol className="grid gap-px overflow-hidden rounded-b-[18px] bg-line sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['1', 'Chefe de Seção', 'Clica em “Novo requerimento”, preenche no canal temporário e manda fotos/vídeos como mensagem. “Enviar” publica e o canal é apagado.'],
            ['2', 'Comandante', 'É marcado no requerimento. Despacha (✅) ou indefere com motivo.'],
            ['3', '1ª Companhia', 'Designa o DOESP, o efetivo e o período de emprego.'],
            ['4', 'Resultados à P/2', 'Encaminha o texto; as imagens e vídeos saem no canal dos resultados, em painéis logo abaixo.'],
          ].map(([n, t, d]) => (
            <li key={n} className="bg-surface p-5">
              <span className="font-display text-2xl text-primary">{n}</span>
              <div className="mt-1 font-bold">{t}</div>
              <p className="mt-1 text-xs text-muted">{d}</p>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  )
}

/* ---------- Cargos ---------- */

function Cargos({ data, draft, patch }: { data: DoespEstado; draft: DoespInput; patch: (p: Partial<DoespInput>) => void }) {
  const lista: Array<{ k: keyof Pick<DoespInput, 'requesterRoleIds' | 'commanderRoleIds' | 'companyRoleIds' | 'managerRoleIds'>; icon: ReactNode; t: string; h: string }> = [
    { k: 'requesterRoleIds', icon: <UserCog className="size-4.5" />, t: 'Chefes de Seção – P/2', h: 'Abrem requerimentos pelo painel.' },
    { k: 'commanderRoleIds', icon: <ShieldCheck className="size-4.5" />, t: 'Comandante', h: 'Despacha (✅) ou indefere. É marcado a cada requerimento.' },
    { k: 'companyRoleIds', icon: <Swords className="size-4.5" />, t: 'Comando da 1ª Companhia', h: 'Designa o DOESP, o efetivo e o período, e encaminha os resultados à P/2.' },
    ...(data.acesso.canConfigure ? [{ k: 'managerRoleIds' as const, icon: <Users className="size-4.5" />, t: 'Gestores (esta página)', h: 'Veem todos os requerimentos, configuram canais e cargos e enxergam os canais temporários.' }] : []),
  ]
  return (
    <div className="grid gap-5">
      <p className="flex items-center gap-2 rounded-xl border border-line bg-surface-2/50 px-4 py-3 text-xs text-muted">
        <Settings2 className="size-3.5 shrink-0" /> Administradores do painel podem todas as etapas. O sistema confere o cargo a cada clique no Discord. Lista vazia = só administradores.
      </p>
      <div className="grid gap-5 xl:grid-cols-2">
        {lista.map(({ k, icon, t, h }) => (
          <Card key={k}>
            <CardHeader icon={icon} title={t} hint={h} action={<span className="text-[11px] font-extrabold uppercase tracking-widest text-muted">{draft[k].length}</span>} />
            <div className="p-5">
              <CargoPicker id={`ds-${k}`} cargos={data.cargos} selecionados={draft[k]} onChange={(v) => patch({ [k]: v })} max={25} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
