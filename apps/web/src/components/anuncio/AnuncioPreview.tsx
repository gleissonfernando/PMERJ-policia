import { ImageIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useLogoUrl } from '@/lib/branding'
import type { AnuncioConfigInput } from '@/lib/anuncio'

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`

/** Markdown básico do Discord: **negrito**, *itálico*, __sublinhado__, listas e quebras de linha. */
function inline(linha: string, key: string): ReactNode[] {
  return linha.split(/(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*)/g).map((p, j) => {
    const k = `${key}-${j}`
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={k} className="font-semibold text-[#f2f3f5]">{p.slice(2, -2)}</strong>
    if (/^__[^_]+__$/.test(p)) return <u key={k}>{p.slice(2, -2)}</u>
    if (/^\*[^*]+\*$/.test(p)) return <em key={k}>{p.slice(1, -1)}</em>
    return p
  })
}

function Markdown({ texto }: { texto: string }) {
  return (
    <div className="grid gap-0.5 wrap-break-word">
      {texto.split('\n').map((linha, i) => {
        const lista = /^\s*[-*•]\s+/.exec(linha)
        if (lista) {
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span aria-hidden="true">•</span>
              <span>{inline(linha.slice(lista[0].length), String(i))}</span>
            </div>
          )
        }
        return linha.trim() === '' ? <div key={i} className="h-[1.375em]" /> : <div key={i}>{inline(linha, String(i))}</div>
      })}
    </div>
  )
}

const Divisor = () => <div className="my-3 border-t border-white/10" />

/**
 * Simula o anúncio no Discord (Components V2): título e texto com a logo no canto, divisor,
 * imagem (opcional), divisor e o rodapé com a logo pequena à esquerda.
 */
export function AnuncioPreview({
  cfg,
  titulo,
  texto,
  imagemUrl,
  comImagemDemo,
  autor,
}: {
  cfg: Pick<AnuncioConfigInput, 'cor' | 'rodape' | 'mostrarAutor'>
  titulo: string
  texto: string
  /** Imagem escolhida no simulador (só no navegador, nada é enviado). */
  imagemUrl: string | null
  /** Sem imagem escolhida: mostra um espaço reservado. */
  comImagemDemo: boolean
  autor: string
}) {
  const logo = useLogoUrl()
  const [hora] = useState(() => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))
  return (
    <div className="rounded-[14px] border border-white/6 bg-[#313338] p-4 font-[system-ui] text-[15px] leading-snug text-[#dbdee1]">
      <div className="flex gap-3">
        <img src={logo} alt="" className="size-10 shrink-0 rounded-full bg-[#1e1f22] object-contain p-1" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="font-semibold text-[#f2f3f5]">PMERJ</span>
            <span className="rounded-[3px] bg-discord px-1 text-[10px] font-semibold leading-4 text-white">APP</span>
            <span className="text-xs text-[#949ba4]">hoje</span>
          </div>

          <div className="mt-1.5 overflow-hidden rounded-lg border border-white/6 bg-[#2b2d31] p-4" style={{ borderLeft: `4px solid ${hex(cfg.cor)}` }}>
            {/* Título + texto com a logo no canto superior direito (Section com miniatura). */}
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <div className="wrap-break-word text-xl font-bold leading-tight text-[#f2f3f5]">{titulo || <span className="text-[#6d6f78]">Título do anúncio</span>}</div>
                <div className="mt-2">{texto ? <Markdown texto={texto} /> : <p className="text-[#6d6f78]">O texto do anúncio aparece aqui.</p>}</div>
              </div>
              <img src={logo} alt="" className="size-21.25 shrink-0 rounded-lg bg-[#1e1f22] object-contain p-1.5" />
            </div>

            {(imagemUrl || comImagemDemo) && (
              <>
                <Divisor />
                {imagemUrl ? (
                  <img src={imagemUrl} alt="Imagem do anúncio" className="max-h-80 w-full rounded-lg object-cover" />
                ) : (
                  <div className="grid aspect-16/7 w-full place-items-center rounded-lg border border-dashed border-white/12 bg-[#1e1f22] text-xs text-[#949ba4]">
                    <span className="inline-flex items-center gap-1.5">
                      <ImageIcon className="size-4" /> Imagem enviada no formulário
                    </span>
                  </div>
                )}
              </>
            )}

            <Divisor />
            <div className="text-xs leading-snug text-[#949ba4]">
              <div>
                <div className="flex items-center gap-1.5 wrap-break-word">
                  <img src={logo} alt="" className="size-4 shrink-0 object-contain" />
                  <span>{cfg.rodape || 'Rodapé'}</span>
                </div>
                {cfg.mostrarAutor && (
                  <div className="mt-0.5">
                    Anunciado por <span className="rounded-[3px] bg-discord/30 px-0.5 font-medium text-[#c9cdfb]">@{autor}</span> · hoje às{' '}{hora}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
