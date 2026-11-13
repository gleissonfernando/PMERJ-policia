import { ClipboardCheck, History, IdCard, Loader2, Settings2 } from 'lucide-react'
import { Aprovacoes } from '@/components/set/Aprovacoes'
import { SetConfig } from '@/components/set/SetConfig'
import { Recentes } from '@/components/set/Recentes'
import { SetForm } from '@/components/set/SetForm'
import { Tabs, useAba, type Aba } from '@/components/Tabs'
import { Alert } from '@/components/ui'
import { useLogoUrl } from '@/lib/branding'
import { cn } from '@/lib/cn'
import { useSet } from '@/lib/set'
import { usePainelMe } from '@/lib/usePainelMe'

type Id = 'meu' | 'aprovacoes' | 'recentes' | 'config'

export function PedirSet() {
  const me = usePainelMe()
  const set = useSet()
  const { data } = set
  const logo = useLogoUrl()

  const abas: Aba<Id>[] = [
    { id: 'meu', label: 'Meu set', icon: IdCard },
    ...(data?.podeAprovar ? [{ id: 'aprovacoes' as const, label: 'Aprovações', icon: ClipboardCheck, count: data.pendentes.length }] : []),
    { id: 'recentes', label: 'Recentes', icon: History },
    ...(data?.admin ? [{ id: 'config' as const, label: 'Configurações', icon: Settings2 }] : []),
  ]
  const [aba, irPara] = useAba(abas)

  if (!data) {
    return set.loadError ? (
      <div className="mx-auto max-w-md">
        <Alert>{set.loadError}</Alert>
      </div>
    ) : (
      <div className="grid min-h-[50vh] place-items-center" aria-busy="true">
        <Loader2 className="size-7 animate-spin text-primary" aria-label="Carregando" />
      </div>
    )
  }

  const pendente = data.meuPedido?.status === 'pendente' ? data.meuPedido : null
  const status = pendente ? 'pendente' : data.meu?.statusApelido
  return (
    <div className="animate-rise">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-5">
          <img src={logo} alt="Logo da Polícia Militar do Estado do Rio de Janeiro" width={78} height={100} className="h-[100px] w-auto shrink-0 drop-shadow-[0_10px_24px_rgba(0,0,0,.5)]" />
          <div>
          <span className="kicker">Identificação</span>
          <h1 className="display mt-2 text-[clamp(2rem,4vw,2.6rem)]">Pedir Set</h1>
          <p className="mt-1.5 max-w-xl text-muted">
            Informe patente, nome e ID. O apelido no Discord vira <span className="font-semibold text-ink">prefixo da patente + nome + ID</span>
            {data.config.modo === 'aprovacao' ? ' depois que a equipe aprovar.' : ' na hora.'}
          </p>
          </div>
        </div>
        <span
          className={cn(
            'inline-flex max-w-full items-center gap-2 truncate rounded-full border px-3.5 py-2 text-[11px] font-black uppercase tracking-widest',
            status === 'pendente' ? 'border-[#f59e0b]/40 bg-[#f59e0b]/10 text-[#f59e0b]' : status === 'aplicado' ? 'border-success/35 bg-success/10 text-success' : status === 'falhou' ? 'border-danger/40 bg-danger/10 text-danger' : 'border-line bg-surface text-muted',
          )}
        >
          <span className={cn('size-2 shrink-0 rounded-full', status === 'pendente' ? 'animate-siren bg-[#f59e0b]' : status === 'aplicado' ? 'bg-success' : status === 'falhou' ? 'bg-danger' : 'bg-muted/60')} />
          {pendente ? `Aguardando · ${pendente.apelido}` : data.meu ? data.meu.apelido : 'Sem set'}
        </span>
      </div>

      <Tabs abas={abas} atual={aba} onChange={irPara} />

      <div role="tabpanel" className="mt-6">
        {aba === 'meu' && <SetForm key={data.meu?.id ?? 'novo'} me={me} data={data} set={set} />}
        {aba === 'aprovacoes' && <Aprovacoes data={data} set={set} myId={me.user.id} />}
        {aba === 'recentes' && <Recentes data={data} myId={me.user.id} />}
        {aba === 'config' && <SetConfig data={data} set={set} />}
      </div>
    </div>
  )
}
