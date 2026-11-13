import { CalendarDays, Camera, ExternalLink, FolderOpen, FolderTree, KeyRound, ListChecks, Loader2, Lock, Megaphone, MessageSquareShare, RefreshCw, Send, Settings2, Users } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { BotStatus } from '@/components/discord/BotStatus'
import { CanalSelect } from '@/components/discord/CanalSelect'
import { CargoPicker } from '@/components/discord/CargoPicker'
import { EmptyState } from '@/components/EmptyState'
import { Button, Card, CardHeader, Field, Input, Pill, Select } from '@/components/form'
import { SaveBar } from '@/components/SaveBar'
import { Tabs, useAba, type Aba } from '@/components/Tabs'
import { Alert } from '@/components/ui'
import { avatarUrl } from '@/lib/api'
import { cn } from '@/lib/cn'
import { erroComunicado, numeroComunicado, useComunicado, type Comunicado as Registro, type ComunicadoApi, type ComunicadoEstado, type ComunicadoInput } from '@/lib/comunicado'
import { fmtDataHora, fmtRelativo } from '@/lib/format'

type Id = 'registros' | 'config'

/** Painel → Comunicados de Operação: comunicados publicados e configuração do painel. */
export function Comunicado() {
  const comunicado = useComunicado()
  const { data } = comunicado

  const abas: Aba<Id>[] = [
    ...(data?.acesso.podeVer ? [{ id: 'registros' as const, label: 'Comunicados', icon: ListChecks, count: data.registros.length }] : []),
    ...(data?.acesso.podeConfigurar ? [{ id: 'config' as const, label: 'Configurações', icon: Settings2 }] : []),
  ]
  const [aba, irPara] = useAba(abas.length ? abas : [{ id: 'registros', label: '', icon: ListChecks }])

  if (!data) {
    return comunicado.loadError ? (
      <div className="mx-auto max-w-md">
        <Alert>{comunicado.loadError}</Alert>
      </div>
    ) : (
      <div className="grid min-h-[50vh] place-items-center" aria-busy="true">
        <Loader2 className="size-7 animate-spin text-primary" aria-label="Carregando" />
      </div>
    )
  }

  const c = data.config
  const online = data.gateway.estado === 'online'
  const pronto = online && Boolean(c.painelMensagemId) && c.cargosPublicar.length > 0

  return (
    <div className="animate-rise">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="kicker">Efetivo · Operações</span>
          <h1 className="display mt-2 text-[clamp(2rem,4vw,2.6rem)]">Comunicados de Operação</h1>
          <p className="mt-1.5 max-w-xl text-muted">
            Quem tem permissão toca em <span className="font-semibold text-ink">Gerar comunicado</span> no Discord, preenche num canal temporário, anexa fotos ou vídeos, escolhe o canal e os cargos a mencionar, confere a prévia e publica.
          </p>
        </div>
        <span className={cn('inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[11px] font-black uppercase tracking-widest', pronto ? 'border-success/35 bg-success/10 text-success' : 'border-line bg-surface text-muted')}>
          <span className={cn('size-2 rounded-full', pronto ? 'animate-siren bg-success' : 'bg-muted/60')} />
          {!online ? 'Bot desconectado' : !c.painelMensagemId ? 'Painel não publicado' : !c.cargosPublicar.length ? 'Só administradores publicam' : 'Pronto'}
        </span>
      </div>

      <div className="mt-8 grid grid-cols-3 gap-3">
        <Stat icon={<Megaphone className="size-4" />} label="Hoje" value={data.hoje} />
        <Stat icon={<CalendarDays className="size-4" />} label="Últimos 30 dias" value={data.mes} />
        <Stat icon={<FolderOpen className="size-4" />} label="Em preparo" value={data.abertos} />
      </div>

      {abas.length === 0 ? (
        <Card className="mt-8">
          <EmptyState icon={Lock}>Seu cargo não tem acesso aos comunicados. A administração escolhe quem publica e quem gerencia em Configurações.</EmptyState>
        </Card>
      ) : (
        <>
          <Tabs abas={abas} atual={aba} onChange={irPara} />
          <div role="tabpanel" className="mt-6">
            {aba === 'registros' && data.acesso.podeVer && <Lista data={data} />}
            {aba === 'config' && data.acesso.podeConfigurar && <Config data={data} comunicado={comunicado} />}
          </div>
        </>
      )}
    </div>
  )
}

/* ---------- Comunicados publicados ---------- */

function Lista({ data }: { data: ComunicadoEstado }) {
  const [busca, setBusca] = useState('')
  const canais = useMemo(() => new Map(data.canais.map((c) => [c.id, c.nome])), [data.canais])
  const cargos = useMemo(() => new Map(data.cargos.map((c) => [c.id, c.nome])), [data.cargos])
  const q = busca.trim().toLowerCase()
  const filtrados = q ? data.registros.filter((r) => [numeroComunicado(r), r.campos.operacao, r.campos.data, r.autor.nome].some((t) => t.toLowerCase().includes(q))) : data.registros

  return (
    <Card>
      <CardHeader
        icon={<ListChecks className="size-4.5" />}
        title="Comunicados publicados"
        hint="Os 200 mais recentes. Clique para ver o comunicado completo e as mídias."
        action={<Input aria-label="Buscar comunicado" placeholder="Buscar…" value={busca} onChange={(e) => setBusca(e.target.value)} className="h-9 w-44" />}
      />
      {filtrados.length === 0 ? (
        <EmptyState icon={Megaphone}>{q ? 'Nenhum comunicado encontrado para essa busca.' : 'Nenhum comunicado publicado ainda.'}</EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {filtrados.map((r) => (
            <Item key={r.id} r={r} guildId={data.guildId} canal={canais.get(r.destinoCanalId)} cargos={cargos} />
          ))}
        </ul>
      )}
    </Card>
  )
}

function Item({ r, guildId, canal, cargos }: { r: Registro; guildId: string | null; canal?: string; cargos: Map<string, string> }) {
  const link = guildId && r.mensagemIds[0] ? `https://discord.com/channels/${guildId}/${r.destinoCanalId}/${r.mensagemIds[0]}` : null
  const c = r.campos
  return (
    <li>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 transition hover:bg-white/3 sm:px-6 [&::-webkit-details-marker]:hidden">
          <span className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-line bg-surface-2 text-lg" aria-hidden="true">
            📢
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className="font-display text-xs tracking-wide text-primary-2 tabular-nums">{numeroComunicado(r)}</span>
              <span className="truncate font-semibold">{c.operacao}</span>
              {r.midias.length > 0 && (
                <Pill className="border-line bg-surface-2 text-muted">
                  <Camera className="size-3" /> {r.midias.length}
                </Pill>
              )}
            </div>
            <div className="mt-0.5 truncate text-xs text-muted">
              {c.data} · {r.autor.nome}
              {canal ? ` · #${canal}` : ''}
            </div>
          </div>
          <span className="shrink-0 text-xs text-muted tabular-nums" title={fmtDataHora(r.em)}>
            {fmtRelativo(r.em)}
          </span>
        </summary>

        <div className="grid gap-4 px-4 pb-5 sm:px-6 sm:pl-[4.5rem]">
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[12rem_minmax(0,1fr)]">
            <Dado t="Data">{c.data}</Dado>
            <Dado t="Apresentação">
              {c.horaApresentacao} · {c.localApresentacao}
            </Dado>
            <Dado t="Início previsto">{c.horaInicio}</Dado>
            <Dado t="Local da operação">{c.localOperacao}</Dado>
            <Dado t="Efetivo">{c.efetivo}</Dado>
            <Dado t="Objetivos">
              <p className="whitespace-pre-wrap">{c.objetivos}</p>
            </Dado>
            <Dado t="Emprego operacional">
              <p className="whitespace-pre-wrap">{c.emprego}</p>
            </Dado>
            <Dado t="Publicado por">
              <span className="inline-flex items-center gap-2">
                <img src={avatarUrl({ id: r.autor.id, avatar: r.autor.avatar }, 32)} alt="" referrerPolicy="no-referrer" className="size-5 rounded-full" />
                {r.autor.nome} · {fmtDataHora(r.em)}
              </span>
            </Dado>
            {r.cargosMencao.length > 0 && <Dado t="Cargos mencionados">{r.cargosMencao.map((id) => `@${cargos.get(id) ?? 'cargo'}`).join(', ')}</Dado>}
          </dl>

          {r.midias.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {r.midias.map((m) => {
                const src = `/api/comunicado/${r.id}/midia/${m.id}`
                return m.kind === 'video' ? (
                  <video key={m.id} src={src} controls preload="metadata" className="aspect-video w-full rounded-[10px] border border-line bg-black object-contain" />
                ) : (
                  <a key={m.id} href={src} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-[10px] border border-line">
                    <img src={src} alt={`Mídia ${m.name}`} loading="lazy" className="aspect-video w-full object-cover transition hover:scale-[1.03]" />
                  </a>
                )
              })}
            </div>
          )}

          {link && (
            <a href={link} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1.5 text-xs font-bold text-primary-2 hover:underline">
              <ExternalLink className="size-3.5" /> Abrir no Discord
            </a>
          )}
        </div>
      </details>
    </li>
  )
}

/* ---------- Configurações ---------- */

const toInput = (d: ComunicadoEstado): ComunicadoInput => ({
  painelCanalId: d.config.painelCanalId,
  categoriaId: d.config.categoriaId,
  cargosPublicar: [...d.config.cargosPublicar],
  cargosGestores: [...d.config.cargosGestores],
})

function Config({ data, comunicado }: { data: ComunicadoEstado; comunicado: ComunicadoApi }) {
  const original = useMemo(() => toInput(data), [data])
  const [draft, setDraft] = useState(original)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = JSON.stringify(draft) !== JSON.stringify(original)
  const patch = (p: Partial<ComunicadoInput>) => {
    setDraft((d) => ({ ...d, ...p }))
    setSaved(false)
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await comunicado.salvarConfig(draft)
      setSaved(true)
    } catch (err) {
      setError(erroComunicado(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-5">
      <BotStatus botAtivo={data.botAtivo} gateway={data.gateway} />

      <Card>
        <CardHeader
          icon={<MessageSquareShare className="size-4.5" />}
          title="Painel e canais temporários"
          hint="O painel tem o botão “Gerar comunicado”. Cada comunicado é montado num canal temporário e publicado no canal que a pessoa escolher lá."
        />
        <div className="grid gap-6 p-6">
          <div className="grid gap-5 lg:grid-cols-2">
            <Field label="Canal do painel" htmlFor="com-painel">
              <CanalSelect id="com-painel" canais={data.canais.filter((c) => c.tipo === 'texto' || c.tipo === 'anuncios')} value={draft.painelCanalId} onChange={(painelCanalId) => patch({ painelCanalId })} vazio="Escolher canal..." />
            </Field>
            <Field label="Categoria dos canais temporários" htmlFor="com-cat" hint="O bot precisa de “Gerenciar canais” nela.">
              <div className="relative">
                <Select id="com-cat" value={draft.categoriaId ?? ''} onChange={(e) => patch({ categoriaId: e.target.value || null })} disabled={data.categorias.length === 0} className="pl-10">
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
          {data.config.painelErro && <Alert>Último erro ao publicar o painel: {data.config.painelErro}.</Alert>}
          <Publicar data={data} comunicado={comunicado} dirty={dirty} />
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            icon={<KeyRound className="size-4.5" />}
            title="Quem pode publicar"
            hint="Geram e publicam comunicados. Lista vazia = só os administradores do painel."
            action={<span className="text-[11px] font-extrabold uppercase tracking-widest text-muted">{draft.cargosPublicar.length} de 25</span>}
          />
          <div className="p-6">
            <CargoPicker id="com-publicar" cargos={data.cargos} selecionados={draft.cargosPublicar} onChange={(cargosPublicar) => patch({ cargosPublicar })} max={25} />
          </div>
        </Card>
        <Card>
          <CardHeader
            icon={<Users className="size-4.5" />}
            title="Gestores"
            hint="Enxergam os canais temporários e o histórico desta página."
            action={<span className="text-[11px] font-extrabold uppercase tracking-widest text-muted">{draft.cargosGestores.length} de 25</span>}
          />
          <div className="p-6">
            <CargoPicker id="com-gestores" cargos={data.cargos} selecionados={draft.cargosGestores} onChange={(cargosGestores) => patch({ cargosGestores })} max={25} />
          </div>
        </Card>
      </div>

      <p className="rounded-xl border border-line bg-surface-2/50 px-4 py-3 text-xs text-muted">
        Para a menção <span className="font-semibold text-ink">notificar</span> um cargo, ele precisa estar marcado como mencionável no Discord, ou o bot precisa da permissão <span className="font-semibold text-ink">Mencionar @everyone, @here e todos os cargos</span>. No canal escolhido, o bot precisa de Ver canal, Enviar mensagens e Anexar arquivos.
      </p>

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

function Publicar({ data, comunicado, dirty }: { data: ComunicadoEstado; comunicado: ComunicadoApi; dirty: boolean }) {
  const [publicando, setPublicando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const c = data.config

  async function publicar(recriar: boolean) {
    setPublicando(true)
    setErro(null)
    setOk(null)
    try {
      await comunicado.publicar(recriar)
      setOk(recriar ? 'Painel publicado de novo no Discord.' : 'Painel publicado no Discord.')
    } catch (err) {
      setErro(erroComunicado(err))
    } finally {
      setPublicando(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
      <Button onClick={() => publicar(false)} loading={publicando} disabled={!data.botAtivo || dirty || !c.painelCanalId}>
        {!publicando && <Send className="size-4" />} {c.painelMensagemId ? 'Atualizar painel' : 'Publicar painel'}
      </Button>
      {c.painelMensagemId && (
        <Button variant="ghost" onClick={() => publicar(true)} disabled={publicando || !data.botAtivo || dirty}>
          <RefreshCw className="size-4" /> Publicar de novo
        </Button>
      )}
      <span className={cn('text-xs', erro ? 'text-danger' : ok ? 'font-semibold text-success' : 'text-muted')}>
        {erro ?? ok ?? (dirty ? 'Salve as alterações antes de publicar.' : 'Escolha o canal do painel, salve e publique.')}
      </span>
    </div>
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

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface/90 p-4">
      <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted">
        {icon} {label}
      </div>
      <div className="display mt-2 text-3xl tabular-nums">{value}</div>
    </div>
  )
}
