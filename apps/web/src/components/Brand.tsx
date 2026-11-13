import { useLogoUrl } from '@/lib/branding'
import { cn } from '@/lib/cn'

/**
 * Logo da corporação: brasão da PMERJ por padrão; o admin troca em Painel → Aparência.
 * O tamanho vem de quem chama (ex.: size-10); o escudo se ajusta dentro sem distorcer.
 */
export function Crest({ className }: { className?: string }) {
  const src = useLogoUrl()
  return (
    // A caixa tem tamanho fixo e a imagem se encaixa dentro (object-contain): logos altas,
    // largas ou quadradas nunca vazam nem empurram o que está ao lado.
    <span className={cn('relative block size-12 shrink-0', className)}>
      <img
        src={src}
        alt="Logo da PMERJ"
        className="absolute inset-0 size-full object-contain drop-shadow-[0_6px_14px_rgba(0,0,0,.45)]"
        draggable={false}
      />
    </span>
  )
}

export function Wordmark({ subtitle = 'Portal de atendimento e acesso militar' }: { subtitle?: string }) {
  return (
    <div className="flex items-center gap-3.5">
      <Crest />
      <div className="leading-tight">
        <div className="display text-[15px] text-ink sm:text-base">Polícia Militar do Estado do Rio de Janeiro</div>
        <div className="mt-1 flex items-center gap-2 text-[11px] font-medium text-muted">
          <span className="h-0.5 w-3.5 bg-primary" />
          {subtitle}
        </div>
      </div>
    </div>
  )
}
