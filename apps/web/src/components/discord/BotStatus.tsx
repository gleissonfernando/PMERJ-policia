import { Bot, Loader2, Plug, Unplug } from 'lucide-react'
import type { GatewayStatus } from '@/lib/discord'
import { cn } from '@/lib/cn'

/**
 * Situação da conexão do bot com o Discord. Mostra o que fazer quando algo falta,
 * para o comando resolver sem precisar abrir o terminal.
 */
export function BotStatus({ botAtivo, gateway, className }: { botAtivo: boolean; gateway: GatewayStatus; className?: string }) {
  const s = !botAtivo
    ? {
        icon: Unplug,
        tone: 'border-line bg-surface/70 text-muted',
        title: 'Bot não configurado',
        text: 'Preencha DISCORD_BOT_TOKEN e DISCORD_GUILD_ID no .env da API e reinicie.',
      }
    : gateway.estado === 'online'
      ? {
          icon: Plug,
          tone: 'border-success/30 bg-success/6 text-success',
          title: 'Bot conectado',
          text: `Recebendo eventos do Discord em tempo real como ${gateway.bot}.`,
        }
      : gateway.estado === 'erro'
        ? { icon: Unplug, tone: 'border-danger/40 bg-danger/10 text-[#ffd5d2]', title: 'Bot sem conexão', text: gateway.motivo }
        : { icon: Loader2, tone: 'border-line bg-surface/70 text-muted', title: 'Conectando ao Discord…', text: 'Aguarde alguns segundos e atualize.' }

  const Icon = s.icon
  return (
    <div role="status" className={cn('flex items-start gap-3 rounded-[14px] border px-4 py-3.5 text-xs', s.tone, className)}>
      <Icon className={cn('mt-0.5 size-4 shrink-0', Icon === Loader2 && 'animate-spin')} />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 font-bold">
          <Bot className="size-3.5 opacity-70" /> {s.title}
        </div>
        <p className="mt-0.5 opacity-85">{s.text}</p>
      </div>
    </div>
  )
}
