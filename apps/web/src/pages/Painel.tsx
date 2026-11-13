import { ArrowRight, DoorOpen, IdCard, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import { IconTile } from '@/components/ui'
import { usePainelMe } from '@/lib/usePainelMe'

const MODULOS: Array<{ to: string; icon: LucideIcon; title: string; text: string }> = [
  {
    to: '/painel/set',
    icon: IdCard,
    title: 'Pedir Set',
    text: 'Informe patente, nome e ID e receba seu apelido no Discord na hora.',
  },
  {
    to: '/painel/entrada-saida',
    icon: DoorOpen,
    title: 'Entrada e Saída',
    text: 'Anúncios automáticos de quem entra e sai do servidor, com a atividade recente.',
  },
]

export function Painel() {
  const me = usePainelMe()
  return (
    <div className="animate-rise">
      <span className="kicker">Bem-vindo</span>
      <h1 className="display mt-2 text-4xl">{me.user.globalName ?? me.user.username}</h1>
      <p className="mt-2 text-muted">Login confirmado pelo Discord.</p>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {MODULOS.map(({ to, icon: Icon, title, text }) => (
          <Link
            key={to}
            to={to}
            className="group flex items-start gap-5 rounded-[18px] border border-line bg-surface/90 p-6 transition hover:-translate-y-0.5 hover:border-primary/40"
          >
            <IconTile>
              <Icon className="size-6" />
            </IconTile>
            <div className="min-w-0 flex-1">
              <h2 className="display text-xl">{title}</h2>
              <p className="mt-1 text-sm text-muted">{text}</p>
            </div>
            <ArrowRight className="mt-1 size-5 text-muted transition group-hover:translate-x-0.5 group-hover:text-primary" />
          </Link>
        ))}
      </div>
    </div>
  )
}
