import { cn } from '@/lib/cn'

/** Simula a linha do policial na lista de membros do Discord. */
export function DiscordPreview({
  avatar,
  apelido,
  limite,
  placeholder = 'Preencha os dados',
}: {
  avatar: string
  apelido: string
  limite: number
  placeholder?: string
}) {
  const over = apelido.length > limite
  return (
    <div>
      <div className="overflow-hidden rounded-[14px] border border-white/6 bg-[#2b2d31]">
        <div className="border-b border-black/30 px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.04em] text-[#949ba4]">
          Policiais — 1
        </div>
        <div className="flex items-center gap-3 px-3 py-3">
          <span className="relative shrink-0">
            <img src={avatar} alt="" referrerPolicy="no-referrer" className="size-10 rounded-full" />
            <span className="absolute -bottom-0.5 -right-0.5 size-4 rounded-full border-[3px] border-[#2b2d31] bg-[#23a55a]" />
          </span>
          <span
            className={cn(
              'min-w-0 truncate text-[15px] font-semibold',
              apelido ? (over ? 'text-danger' : 'text-[#f2f3f5]') : 'italic text-[#949ba4]',
            )}
          >
            {apelido || placeholder}
          </span>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px]">
        <span className={over ? 'font-bold text-danger' : 'text-muted'}>
          {over ? 'Passa do limite do Discord' : 'Apelido que o bot vai aplicar'}
        </span>
        <span className={cn('tabular-nums', over ? 'font-bold text-danger' : 'text-muted')}>
          {apelido.length}/{limite}
        </span>
      </div>
    </div>
  )
}
