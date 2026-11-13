import { Check, Crown, History, Loader2, Lock, Pencil, Search, ShieldCheck, Trash2, UserPlus, UsersRound, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { EmptyState } from '@/components/EmptyState'
import { Button, Card, CardHeader, Field, Input, Select } from '@/components/form'
import { Alert } from '@/components/ui'
import { avatarUrl } from '@/lib/api'
import { cn } from '@/lib/cn'
import { ACESSOS, buscarPessoas, erroEquipe, useEquipe, type Acesso, type EquipeApi, type EquipeEstado, type MembroEquipe, type MembroInput, type PessoaBusca } from '@/lib/equipe'
import { fmtDataHora, fmtRelativo } from '@/lib/format'

const corCargo = (n: number) => (n ? `#${n.toString(16).padStart(6, '0')}` : '#99aab5')

/** Painel → Equipe: quem administra a dashboard e o que cada um pode ver. */
export function Equipe() {
  const api = useEquipe()
  const { data } = api
  const [editando, setEditando] = useState<MembroEquipe | 'novo' | null>(null)

  if (!data) {
    return api.loadError ? (
      <div className="mx-auto max-w-md">
        <Alert>{api.loadError}</Alert>
      </div>
    ) : (
      <div className="grid min-h-[50vh] place-items-center" aria-busy="true">
        <Loader2 className="size-7 animate-spin text-primary" aria-label="Carregando" />
      </div>
    )
  }

  const conta = (a: Acesso) => data.membros.filter((m) => m.acesso === a).length

  return (
    <div className="animate-rise">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="kicker">Sistema</span>
          <h1 className="display mt-2 text-[clamp(2rem,4vw,2.6rem)]">Equipe</h1>
          <p className="mt-1.5 max-w-xl text-muted">
            Cadastre quem ajuda a administrar a dashboard pelo usuário ou ID do Discord, dê uma função e escolha o que cada pessoa pode ver e configurar.
          </p>
        </div>
        <Button onClick={() => setEditando('novo')}>
          <UserPlus className="size-4" /> Adicionar à equipe
        </Button>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Na equipe" valor={data.membros.length} />
        <Stat label="Administradores" valor={conta('admin')} />
        <Stat label="Acesso total" valor={conta('total')} />
        <Stat label="Personalizado" valor={conta('personalizado')} />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] xl:items-start">
        <div className="grid gap-5">
          <Card>
            <CardHeader icon={<UsersRound className="size-4.5" />} title="Membros da equipe" hint="O acesso vale pelo ID do Discord e é conferido pelo servidor a cada ação." />
            {data.membros.length === 0 ? (
              <EmptyState icon={UsersRound}>Ninguém na equipe ainda. Clique em “Adicionar à equipe”.</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {data.membros.map((m) => (
                  <Linha key={m.userId} m={m} data={data} api={api} selecionado={editando !== 'novo' && editando?.userId === m.userId} onEditar={() => setEditando(m)} />
                ))}
              </ul>
            )}
            <p className="flex items-start gap-2 border-t border-line px-6 py-4 text-xs text-muted">
              <Crown className="mt-0.5 size-3.5 shrink-0 text-primary" />
              <span>
                {data.donos > 0 ? `${data.donos} ${data.donos === 1 ? 'administrador fixo' : 'administradores fixos'} (configurados no servidor)` : 'Os administradores fixos do servidor'} sempre têm acesso total e não aparecem nesta lista.
              </span>
            </p>
          </Card>

          <Historico data={data} />
        </div>

        {editando ? (
          <Editor key={editando === 'novo' ? 'novo' : editando.userId} data={data} api={api} membro={editando === 'novo' ? null : editando} onFechar={() => setEditando(null)} />
        ) : (
          <Card className="grid place-items-center gap-3 px-6 py-14 text-center xl:sticky xl:top-6">
            <span className="grid size-14 place-items-center rounded-full border border-line bg-surface-2 text-muted">
              <ShieldCheck className="size-6" />
            </span>
            <h3 className="display text-lg">Escolha alguém para editar</h3>
            <p className="max-w-sm text-sm text-muted">Ou adicione uma pessoa nova. Você define a função, o acesso (Administrador, Acesso total ou Personalizado) e, se quiser, um cargo do Discord.</p>
            <Button variant="ghost" onClick={() => setEditando('novo')}>
              <UserPlus className="size-4" /> Adicionar à equipe
            </Button>
          </Card>
        )}
      </div>
    </div>
  )
}

function Stat({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="rounded-2xl border border-line bg-surface/90 p-4">
      <div className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className="display mt-2 text-3xl tabular-nums">{valor}</div>
    </div>
  )
}

/* ---------- Lista ---------- */

function Linha({ m, data, api, selecionado, onEditar }: { m: MembroEquipe; data: EquipeEstado; api: EquipeApi; selecionado: boolean; onEditar: () => void }) {
  const [confirmar, setConfirmar] = useState(false)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const eu = m.userId === data.eu
  const cargo = m.cargoDiscordId ? data.cargos.find((c) => c.id === m.cargoDiscordId) : undefined
  const nomeModulo = (id: string) => data.modulos.find((x) => x.id === id)?.nome ?? id

  async function remover() {
    setBusy(true)
    setErro(null)
    try {
      await api.remover(m.userId)
    } catch (err) {
      setErro(erroEquipe(err))
      setBusy(false)
    }
  }

  return (
    <li className={cn('px-4 py-3.5 transition sm:px-6', selecionado && 'bg-primary/6')}>
      <div className="flex items-center gap-3">
        <img src={avatarUrl({ id: m.userId, avatar: m.avatar }, 64)} alt="" referrerPolicy="no-referrer" className="size-10 rounded-full border border-line-strong" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-bold">{m.nome}</span>
            {eu && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-widest text-muted">Você</span>}
            <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-widest', ACESSOS[m.acesso].cls)}>{ACESSOS[m.acesso].titulo}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
            <span className="font-semibold text-ink/85">{m.funcao}</span>
            <span>@{m.username}</span>
            {cargo && (
              <span className="inline-flex items-center gap-1">
                <span className="size-2 rounded-full" style={{ background: corCargo(cargo.cor) }} />@{cargo.nome}
                {m.cargoEntregue === false && <span className="font-semibold text-[#f59e0b]">(não entregue)</span>}
              </span>
            )}
          </div>
          {m.acesso === 'personalizado' && <div className="mt-1 truncate text-xs text-muted">Vê: {m.modulos.map(nomeModulo).join(', ')}</div>}
        </div>
        {eu ? (
          <span title="Ninguém altera o próprio acesso" className="grid size-8 place-items-center text-muted/60">
            <Lock className="size-4" />
          </span>
        ) : (
          !confirmar && (
            <div className="flex shrink-0 items-center">
              <button type="button" onClick={onEditar} aria-label={`Editar ${m.nome}`} className="grid size-8 place-items-center rounded-[9px] text-muted transition hover:bg-surface-2 hover:text-ink">
                <Pencil className="size-4" />
              </button>
              <button type="button" onClick={() => setConfirmar(true)} aria-label={`Remover ${m.nome} da equipe`} className="grid size-8 place-items-center rounded-[9px] text-muted transition hover:bg-danger/10 hover:text-danger">
                <Trash2 className="size-4" />
              </button>
            </div>
          )
        )}
      </div>
      {confirmar && (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
          <span className="mr-auto text-xs text-muted">Tirar {m.nome} da equipe{m.cargoDiscordId ? ' (e o cargo do Discord)' : ''}?</span>
          {erro && <span className="text-xs text-danger">{erro}</span>}
          <Button size="sm" variant="ghost" onClick={() => setConfirmar(false)}>
            Não
          </Button>
          <Button size="sm" variant="danger" loading={busy} onClick={remover}>
            Remover
          </Button>
        </div>
      )}
    </li>
  )
}

/* ---------- Editor ---------- */

function Editor({ data, api, membro, onFechar }: { data: EquipeEstado; api: EquipeApi; membro: MembroEquipe | null; onFechar: () => void }) {
  const [pessoa, setPessoa] = useState<PessoaBusca | null>(membro ? { id: membro.userId, nome: membro.nome, username: membro.username, avatar: membro.avatar } : null)
  const [funcao, setFuncao] = useState(membro?.funcao ?? '')
  const [acesso, setAcesso] = useState<Acesso>(membro?.acesso ?? 'personalizado')
  const [modulos, setModulos] = useState<string[]>(membro?.modulos ?? [])
  const [cargo, setCargo] = useState<string | null>(membro?.cargoDiscordId ?? null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const grupos = useMemo(() => [...new Set(data.modulos.map((m) => m.grupo))], [data.modulos])

  const jaNaEquipe = !membro && pessoa ? data.membros.find((m) => m.userId === pessoa.id) : undefined

  async function salvar() {
    if (!pessoa) return
    setSalvando(true)
    setErro(null)
    setOk(null)
    try {
      const input: MembroInput = { userId: pessoa.id, funcao, acesso, modulos: acesso === 'personalizado' ? modulos : [], cargoDiscordId: cargo }
      const r = await api.salvar(input)
      setOk(r.cargoFalhou ? 'Salvo, mas o Discord recusou dar o cargo: o cargo do bot precisa ficar acima dele.' : membro ? 'Alterações salvas.' : `${pessoa.nome} entrou na equipe.`)
      if (!membro && !r.cargoFalhou) onFechar()
    } catch (err) {
      setErro(erroEquipe(err))
    } finally {
      setSalvando(false)
    }
  }

  const toggle = (id: string) => setModulos((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]))
  const valido = Boolean(pessoa && funcao.trim() && (acesso !== 'personalizado' || modulos.length) && pessoa.id !== data.eu)

  return (
    <Card className="xl:sticky xl:top-6">
      <CardHeader
        icon={membro ? <Pencil className="size-4.5" /> : <UserPlus className="size-4.5" />}
        title={membro ? `Editar ${membro.nome}` : 'Adicionar à equipe'}
        hint={membro ? 'As mudanças valem na próxima ação da pessoa no painel.' : 'Busque pelo nome ou cole o ID do Discord da pessoa.'}
        action={
          <button type="button" onClick={onFechar} aria-label="Fechar" className="grid size-8 place-items-center rounded-[9px] text-muted transition hover:bg-surface-2 hover:text-ink">
            <X className="size-4" />
          </button>
        }
      />
      <div className="grid gap-5 p-6">
        {/* Pessoa */}
        {pessoa ? (
          <div className="flex items-center gap-3 rounded-[14px] border border-line bg-surface-2/50 p-3">
            <img src={avatarUrl({ id: pessoa.id, avatar: pessoa.avatar }, 64)} alt="" referrerPolicy="no-referrer" className="size-10 rounded-full" />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate font-bold">{pessoa.nome}</div>
              <div className="truncate font-mono text-xs text-muted">
                @{pessoa.username} · {pessoa.id}
              </div>
            </div>
            {!membro && (
              <Button size="sm" variant="ghost" onClick={() => setPessoa(null)}>
                Trocar
              </Button>
            )}
          </div>
        ) : (
          <BuscarPessoa onEscolher={setPessoa} />
        )}
        {pessoa?.id === data.eu && <Alert>Você não pode alterar o seu próprio acesso.</Alert>}
        {jaNaEquipe && <p className="text-xs font-semibold text-[#f59e0b]">Essa pessoa já está na equipe ({jaNaEquipe.funcao}). Salvar vai substituir o acesso dela.</p>}

        <Field label="Função na equipe" htmlFor="eq-funcao" hint="Ex.: Comando-Geral, Moderador, Instrutor-chefe.">
          <Input id="eq-funcao" value={funcao} maxLength={40} onChange={(e) => setFuncao(e.target.value)} placeholder="Ex.: Moderador" />
        </Field>

        {/* Acesso */}
        <div role="radiogroup" aria-label="Acesso na dashboard" className="grid gap-2">
          <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted">O que pode ver e fazer</span>
          {(Object.keys(ACESSOS) as Acesso[]).map((a) => (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={acesso === a}
              onClick={() => setAcesso(a)}
              className={cn(
                'flex items-start gap-3 rounded-[14px] border p-3.5 text-left transition',
                acesso === a ? 'border-primary/60 bg-primary/8 shadow-[0_0_0_1px_var(--color-primary)]' : 'border-line hover:border-line-strong',
              )}
            >
              <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border', acesso === a ? 'border-primary bg-primary text-on-primary' : 'border-line-strong')}>
                {acesso === a && <Check className="size-3" />}
              </span>
              <span>
                <span className="block text-sm font-bold text-ink">{ACESSOS[a].titulo}</span>
                <span className="block text-xs text-muted">{ACESSOS[a].texto}</span>
              </span>
            </button>
          ))}
        </div>

        {acesso === 'personalizado' && (
          <div className="grid gap-3 rounded-[14px] border border-line p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted">Módulos liberados · {modulos.length}</span>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setModulos(data.modulos.map((m) => m.id))}>
                  Marcar todos
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setModulos([])} disabled={!modulos.length}>
                  Limpar
                </Button>
              </div>
            </div>
            {grupos.map((g) => (
              <div key={g} className="grid gap-1.5">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-muted/70">{g}</span>
                <div className="flex flex-wrap gap-1.5">
                  {data.modulos
                    .filter((m) => m.grupo === g)
                    .map((m) => {
                      const on = modulos.includes(m.id)
                      return (
                        <button
                          key={m.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggle(m.id)}
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                            on ? 'border-primary/55 bg-primary/15 text-ink' : 'border-line text-muted hover:border-line-strong hover:text-ink',
                          )}
                        >
                          {on && <Check className="size-3 text-primary" />}
                          {m.nome}
                        </button>
                      )
                    })}
                </div>
              </div>
            ))}
            <p className="text-xs text-muted">Nos módulos marcados a pessoa vê e configura tudo, como um administrador. Os outros somem do menu dela.</p>
          </div>
        )}

        <Field label="Cargo do Discord (opcional)" htmlFor="eq-cargo" hint="Entregue ao salvar e retirado se a pessoa sair da equipe.">
          <Select id="eq-cargo" value={cargo ?? ''} onChange={(e) => setCargo(e.target.value || null)}>
            <option value="">Nenhum cargo</option>
            {data.cargos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        </Field>

        {erro && <Alert>{erro}</Alert>}
        {ok && <p className="text-sm font-semibold text-success">{ok}</p>}
        <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          <Button variant="ghost" onClick={onFechar}>
            Cancelar
          </Button>
          <Button onClick={salvar} loading={salvando} disabled={!valido}>
            {!salvando && <Check className="size-4" />} {membro ? 'Salvar alterações' : 'Adicionar à equipe'}
          </Button>
        </div>
      </div>
    </Card>
  )
}

function BuscarPessoa({ onEscolher }: { onEscolher: (p: PessoaBusca) => void }) {
  const [q, setQ] = useState('')
  const [lista, setLista] = useState<PessoaBusca[]>([])
  const [estado, setEstado] = useState<'ocioso' | 'buscando' | 'carregando' | 'erro'>('ocioso')

  useEffect(() => {
    const termo = q.trim()
    if (termo.length < 2) return
    const id = window.setTimeout(async () => {
      setEstado('buscando')
      try {
        const r = await buscarPessoas(termo)
        setLista(r.membros)
        setEstado(r.carregando ? 'carregando' : 'ocioso')
      } catch {
        setEstado('erro')
      }
    }, 250)
    return () => window.clearTimeout(id)
  }, [q])

  const curto = q.trim().length < 2
  return (
    <div className="grid gap-2">
      <Field label="Pessoa" htmlFor="eq-busca">
        <Input id="eq-busca" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, @usuário ou ID do Discord" leading={<Search className="size-4" />} autoComplete="off" />
      </Field>
      {!curto && (
        <ul className="grid max-h-72 gap-1 overflow-y-auto rounded-[14px] border border-line p-1.5" aria-live="polite">
          {estado === 'buscando' && <li className="px-3 py-2 text-xs text-muted">Buscando…</li>}
          {estado === 'carregando' && <li className="px-3 py-2 text-xs text-muted">A lista de membros ainda está carregando. Cole o ID do Discord para achar direto.</li>}
          {estado === 'erro' && <li className="px-3 py-2 text-xs text-danger">Falha ao buscar. Tente de novo.</li>}
          {estado === 'ocioso' && lista.length === 0 && <li className="px-3 py-2 text-xs text-muted">Ninguém encontrado com “{q.trim()}”.</li>}
          {estado !== 'buscando' &&
            lista.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => onEscolher(p)} className="flex w-full items-center gap-3 rounded-[10px] px-2.5 py-2 text-left transition hover:bg-surface-2">
                  <img src={avatarUrl({ id: p.id, avatar: p.avatar }, 48)} alt="" referrerPolicy="no-referrer" className="size-8 rounded-full" />
                  <span className="min-w-0 leading-tight">
                    <span className="block truncate text-sm font-semibold">{p.nome}</span>
                    <span className="block truncate text-xs text-muted">@{p.username}</span>
                  </span>
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}

function Historico({ data }: { data: EquipeEstado }) {
  const VERBO = { adicionou: 'adicionou', alterou: 'alterou', removeu: 'removeu' } as const
  return (
    <Card>
      <CardHeader icon={<History className="size-4.5" />} title="Histórico" hint="Quem mexeu na equipe e quando." />
      {data.historico.length === 0 ? (
        <EmptyState icon={History}>Nenhuma mudança ainda.</EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {data.historico.map((h, i) => (
            <li key={`${h.em}-${i}`} className="flex items-start gap-3 px-4 py-2.5 text-sm sm:px-6">
              <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', h.acao === 'removeu' ? 'bg-danger' : h.acao === 'adicionou' ? 'bg-success' : 'bg-primary')} />
              <div className="min-w-0 flex-1">
                <span className="font-semibold">{h.por.nome}</span> {VERBO[h.acao]} <span className="font-semibold">{h.alvo.nome}</span>
                <div className="truncate text-xs text-muted">{h.resumo}</div>
              </div>
              <span className="shrink-0 text-xs text-muted tabular-nums" title={fmtDataHora(h.em)}>
                {fmtRelativo(h.em)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
