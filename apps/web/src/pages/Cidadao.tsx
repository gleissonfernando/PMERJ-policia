import { Clock, UserPlus } from 'lucide-react'
import { SessionShell } from '@/components/SessionShell'
import { Badge, IconTile } from '@/components/ui'

export function Cidadao() {
  return (
    <SessionShell require="civil" loginPath="/acesso" title="Área do cidadão">
      {(me) => (
        <div className="animate-rise">
          <span className="kicker">Olá, cidadão</span>
          <h1 className="display mt-2 text-4xl">{me.user.globalName ?? me.user.username}</h1>
          <p className="mt-2 text-muted">Você está identificado com sua conta do Discord.</p>

          <div className="mt-8 flex items-start gap-5 rounded-[18px] border border-line bg-surface/90 p-7">
            <IconTile>
              <UserPlus className="size-6" />
            </IconTile>
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="display text-xl">Recrutamento</h2>
                <Badge>
                  <Clock className="size-3" /> Em breve
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted">O processo seletivo da PMERJ será aberto por aqui.</p>
            </div>
          </div>
        </div>
      )}
    </SessionShell>
  )
}
