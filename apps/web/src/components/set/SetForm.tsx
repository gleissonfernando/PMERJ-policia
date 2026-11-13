import { BadgeCheck, Bot, CircleAlert, Clock, IdCard, MessageSquare, Undo2, XCircle } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button, Card, CardHeader, Field, Input, Select } from '@/components/form'
import { Alert } from '@/components/ui'
import { montarApelido } from '@/lib/apelido'
import { avatarUrl, type Me } from '@/lib/api'
import { fmtDataHora, fmtRelativo } from '@/lib/format'
import { erroSet, type SetApi, type SetEstado, type SetRegistro } from '@/lib/set'
import { DiscordPreview } from './DiscordPreview'

/** Aba "Meu set": formulário + prévia ao vivo + situação do set e do pedido. */
export function SetForm({ me, data, set }: { me: Me; data: SetEstado; set: SetApi }) {
  const { config, meu, meuPedido } = data
  const aprovacao = config.modo === 'aprovacao'
  const pendente = meuPedido?.status === 'pendente' ? meuPedido : null
  // Último pedido reprovado depois do set atual: mostra o motivo.
  const reprovado = meuPedido?.status === 'reprovado' && (!meu || meuPedido.em > meu.em) ? meuPedido : null
  const base = pendente ?? meu

  const valid = <T extends { id: string }>(list: T[], id: string | null | undefined) => (id && list.some((x) => x.id === id) ? id : '')
  const [nome, setNome] = useState(base?.nome ?? me.user.globalName ?? '')
  const [gameId, setGameId] = useState(base?.gameId ?? '')
  const [patenteId, setPatenteId] = useState(valid(config.patentes, base?.patente.id) || (config.patentes[0]?.id ?? ''))
  const [orgaoId, setOrgaoId] = useState(valid(config.orgaos, base?.orgao?.id))
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const [enviado, setEnviado] = useState(false)

  const patente = config.patentes.find((p) => p.id === patenteId)
  const orgao = config.campos.orgao ? config.orgaos.find((o) => o.id === orgaoId) : undefined
  const nomeLimpo = nome.replace(/\s+/g, ' ').trim()
  const apelido =
    patente && nomeLimpo
      ? montarApelido(config.formato, { prefixo: patente.prefixo, nome: nomeLimpo, id: gameId || '0000', orgao: orgao?.sigla })
      : ''
  const over = apelido.length > data.limiteApelido
  const missing = !patente || nomeLimpo.length < 2 || !/^\d{1,7}$/.test(gameId) || (config.campos.orgao && !orgao)
  const igual = (r: SetRegistro | null | undefined) =>
    Boolean(r) && r!.nome === nomeLimpo && r!.gameId === gameId && r!.patente.id === patenteId && (r!.orgao?.id ?? '') === (orgao?.id ?? '')
  const semMudanca = pendente ? igual(pendente) : meu?.statusApelido === 'aplicado' && igual(meu)

  const rotulo = semMudanca
    ? pendente
      ? 'Pedido já enviado com estes dados'
      : 'Este já é o seu set'
    : aprovacao
      ? pendente
        ? 'Atualizar pedido'
        : 'Enviar para aprovação'
      : meu
        ? 'Atualizar set'
        : 'Pedir set'

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (missing || over) return
    setSending(true)
    setError(null)
    setEnviado(false)
    try {
      await set.aplicar({ nome: nomeLimpo, gameId, patenteId, orgaoId: config.campos.orgao ? orgaoId : null })
      setEnviado(true)
    } catch (err) {
      setError(erroSet(err))
    } finally {
      setSending(false)
    }
  }

  async function cancelar() {
    setCancelando(true)
    setError(null)
    try {
      await set.cancelar()
    } catch (err) {
      setError(erroSet(err))
    } finally {
      setCancelando(false)
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader
          icon={<IdCard className="size-4.5" />}
          title={pendente ? 'Atualizar meu pedido' : meu ? 'Atualizar meu set' : 'Pedir meu set'}
          hint={aprovacao ? 'Seus dados vão para a equipe analisar. Aprovado, o apelido muda no Discord.' : 'Seus dados viram o apelido no servidor do Discord, na hora.'}
        />
        <form onSubmit={submit} className="grid gap-5 p-6">
          {error && <Alert>{error}</Alert>}
          {reprovado && !pendente && <Reprovado r={reprovado} />}

          <Field label="Patente" htmlFor="st-patente">
            <Select id="st-patente" value={patenteId} onChange={(e) => setPatenteId(e.target.value)} required>
              {config.patentes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.prefixo} — {p.nome}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_160px]">
            <Field label="Nome de guerra" htmlFor="st-nome" hint="Como você quer aparecer. Máx. 24 caracteres.">
              <Input id="st-nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={24} autoComplete="off" placeholder="Ex.: Silva" required />
            </Field>
            <Field label="ID" htmlFor="st-id" hint="Só números.">
              <Input
                id="st-id"
                leading="|"
                value={gameId}
                onChange={(e) => setGameId(e.target.value.replace(/\D/g, '').slice(0, 7))}
                inputMode="numeric"
                autoComplete="off"
                placeholder="1234"
                required
              />
            </Field>
          </div>

          {config.campos.orgao && (
            <Field label="Órgão" htmlFor="st-orgao">
              <Select id="st-orgao" value={orgaoId} onChange={(e) => setOrgaoId(e.target.value)} required>
                <option value="" disabled>
                  Selecione…
                </option>
                {config.orgaos.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.sigla} — {o.nome}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Button type="submit" size="lg" loading={sending} disabled={missing || over || semMudanca} className="mt-1 w-full">
            {!sending && <IdCard className="size-4" />} {rotulo}
          </Button>
          {enviado && (pendente ? <p role="status" className="text-xs font-semibold text-[#f59e0b]">Pedido enviado. Você recebe uma mensagem direta no Discord quando for analisado.</p> : meu && <StatusApelido registro={meu} />)}
        </form>
      </Card>

      <div className="grid content-start gap-5">
        <Card className="p-6">
          <span className="kicker">Prévia</span>
          <h3 className="display mt-1 text-base">Como você vai aparecer</h3>
          <div className="mt-4">
            <DiscordPreview avatar={avatarUrl(me.user, 80)} apelido={apelido} limite={data.limiteApelido} />
          </div>
          <p className="mt-4 rounded-[10px] border border-line bg-surface-2/60 px-3 py-2 font-mono text-[11px] text-muted">Formato: {config.formato}</p>
        </Card>

        {pendente && (
          <Card className="relative overflow-hidden p-6">
            <div aria-hidden="true" className="absolute -right-16 -top-16 size-48 rounded-full bg-[#f59e0b] opacity-[.08] blur-[50px]" />
            <span className="inline-flex items-center gap-2 rounded-full border border-[#f59e0b]/40 bg-[#f59e0b]/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-[#f59e0b]">
              <Clock className="size-3.5" /> Aguardando aprovação
            </span>
            <div className="display mt-3 truncate text-lg">{pendente.apelido}</div>
            <p className="mt-1 text-xs text-muted">
              Enviado {fmtRelativo(pendente.em)} pelo {pendente.origem === 'discord' ? 'Discord' : 'site'}.
              {meu && <> Enquanto isso, continua valendo <span className="font-semibold text-ink">{meu.apelido}</span>.</>}
            </p>
            <Button variant="ghost" size="sm" onClick={cancelar} loading={cancelando} className="mt-4">
              {!cancelando && <Undo2 className="size-3.5" />} Cancelar pedido
            </Button>
          </Card>
        )}

        {meu && !pendente && !enviado && (
          <Card className="p-6">
            <span className="kicker">Set atual</span>
            <div className="display mt-1 truncate text-lg">{meu.apelido}</div>
            <p className="mt-1 text-xs text-muted">
              {meu.decididoPor ? <>Aprovado por @{meu.decididoPor.username}</> : <>Aplicado</>} em {fmtDataHora(meu.decididoEm ?? meu.em)}.
            </p>
            <div className="mt-4">
              <StatusApelido registro={meu} />
            </div>
          </Card>
        )}

        {config.painel && (
          <div className="flex items-start gap-3 rounded-[14px] border border-line bg-surface/70 px-4 py-3.5 text-xs text-muted">
            <MessageSquare className="mt-0.5 size-4 shrink-0" />
            <span>Também dá para pedir o set direto no Discord, pelo botão “Pedir set” no canal de identificação.</span>
          </div>
        )}
      </div>
    </div>
  )
}

function Reprovado({ r }: { r: SetRegistro }) {
  return (
    <div role="status" className="flex items-start gap-3 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-[#ffd5d2]">
      <XCircle className="mt-0.5 size-4 shrink-0 text-danger" />
      <div className="min-w-0">
        <div className="font-semibold">
          Seu pedido “{r.apelido}” foi reprovado{r.decididoPor && <> por @{r.decididoPor.username}</>}.
        </div>
        {r.motivo && <p className="mt-1 wrap-break-word opacity-90">Motivo: {r.motivo}</p>}
        <p className="mt-1 text-xs opacity-75">Corrija os dados abaixo e envie de novo.</p>
      </div>
    </div>
  )
}

const STATUS = {
  aplicado: { icon: BadgeCheck, text: 'Apelido aplicado no Discord.', cls: 'text-success' },
  falhou: {
    icon: CircleAlert,
    text: 'O Discord recusou a troca do apelido (cargo do bot abaixo do seu, ou você é o dono do servidor). Avise a administração.',
    cls: 'text-danger',
  },
  desligado: { icon: Bot, text: 'Set registrado. A troca automática de apelido está desligada.', cls: 'text-muted' },
} as const

function StatusApelido({ registro }: { registro: SetRegistro }) {
  const st = STATUS[registro.statusApelido]
  return (
    <p role="status" className={`flex items-start gap-2 text-xs ${st.cls}`}>
      <st.icon className="mt-px size-4 shrink-0" /> {st.text}
    </p>
  )
}
