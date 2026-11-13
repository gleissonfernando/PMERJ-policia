import { Check, ClipboardCheck, Globe, MessageSquare, X } from 'lucide-react'
import { useState } from 'react'
import { Button, Card, CardHeader, Textarea } from '@/components/form'
import { EmptyState } from '@/components/EmptyState'
import { Alert } from '@/components/ui'
import { avatarUrl } from '@/lib/api'
import { fmtDataHora, fmtRelativo } from '@/lib/format'
import { erroSet, type SetApi, type SetEstado, type SetRegistro } from '@/lib/set'

/** Fila de pedidos aguardando aprovação (mais antigos primeiro). */
export function Aprovacoes({ data, set, myId }: { data: SetEstado; set: SetApi; myId: string }) {
  const expulsar = data.config.expulsarAoReprovar
  return (
    <Card>
      <CardHeader
        icon={<ClipboardCheck className="size-4.5" />}
        title={`Pedidos aguardando · ${data.pendentes.length}`}
        hint={
          data.config.modo === 'aprovacao'
            ? `Aprove ou reprove aqui ou no canal privado que o bot abre no Discord. Aprovado: cargos + apelido. Reprovado: DM com o motivo${expulsar ? ' e expulsão do servidor' : ''}.`
            : 'O Pedir Set está no modo automático: novos pedidos são aplicados na hora.'
        }
      />
      {data.pendentes.length === 0 ? (
        <EmptyState icon={ClipboardCheck}>Nenhum pedido aguardando. Tudo em dia.</EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {data.pendentes.map((r) => (
            <Pedido key={r.id} r={r} set={set} proprio={r.userId === myId} expulsar={expulsar} />
          ))}
        </ul>
      )}
    </Card>
  )
}

function Pedido({ r, set, proprio, expulsar }: { r: SetRegistro; set: SetApi; proprio: boolean; expulsar: boolean }) {
  const [reprovando, setReprovando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [busy, setBusy] = useState<'aprovar' | 'reprovar' | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const Origem = r.origem === 'discord' ? MessageSquare : Globe

  async function decidir(d: 'aprovar' | 'reprovar') {
    setBusy(d)
    setErro(null)
    try {
      if (d === 'aprovar') await set.aprovar(r.id)
      else await set.reprovar(r.id, motivo.trim())
    } catch (err) {
      setErro(erroSet(err))
      setBusy(null)
    }
  }

  return (
    <li className="px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-center gap-4">
        <img src={avatarUrl({ id: r.userId, avatar: r.avatar }, 64)} alt="" referrerPolicy="no-referrer" className="size-11 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-lg font-semibold tracking-wide">{r.apelido}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <span>@{r.username}</span>
            <span className="rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.06em] text-primary-2">
              {r.patente.nome}
            </span>
            <span>ID {r.gameId}</span>
            {r.orgao && <span>{r.orgao.sigla}</span>}
            <span className="inline-flex items-center gap-1" title={fmtDataHora(r.em)}>
              <Origem className="size-3" /> {fmtRelativo(r.em)}
            </span>
          </div>
        </div>
        {proprio ? (
          <span className="text-xs text-muted">Seu pedido — outra pessoa precisa analisar.</span>
        ) : (
          !reprovando && (
            <div className="flex shrink-0 gap-2">
              <Button variant="danger" size="sm" onClick={() => setReprovando(true)} disabled={busy !== null}>
                <X className="size-4" /> {expulsar ? 'Reprovar e expulsar' : 'Reprovar'}
              </Button>
              <Button variant="success" size="sm" onClick={() => decidir('aprovar')} loading={busy === 'aprovar'}>
                {busy !== 'aprovar' && <Check className="size-4" />} Aprovar
              </Button>
            </div>
          )
        )}
      </div>

      {erro && (
        <div className="mt-3">
          <Alert>{erro}</Alert>
        </div>
      )}

      {reprovando && (
        <div className="mt-4 grid gap-3 rounded-[14px] border border-danger/30 bg-danger/5 p-4">
          {expulsar && (
            <p className="text-xs font-semibold text-[#ffd5d2]">
              ⚠️ @{r.username} vai receber o motivo por mensagem direta e será <span className="text-danger">expulso do servidor</span>.
            </p>
          )}
          <label htmlFor={`motivo-${r.id}`} className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted">
            Motivo <span className="font-semibold normal-case tracking-normal">(opcional — vai na mensagem para o policial)</span>
          </label>
          <Textarea
            id={`motivo-${r.id}`}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            maxLength={400}
            rows={2}
            placeholder="Ex.: patente não confere com a ficha"
            className="min-h-20"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setReprovando(false)} disabled={busy !== null}>
              Voltar
            </Button>
            <Button variant="danger" size="sm" onClick={() => decidir('reprovar')} loading={busy === 'reprovar'}>
              {busy !== 'reprovar' && <X className="size-4" />} {expulsar ? 'Confirmar e expulsar' : 'Confirmar reprovação'}
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}
