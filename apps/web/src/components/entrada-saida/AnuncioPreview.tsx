import type { ReactNode } from 'react'
import type { AnuncioConfig, TipoAnuncio } from '@/lib/entradaSaida'

export interface Amostra {
  nome: string
  usuario: string
  avatar: string
  servidor: string
  total: number
}

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`

/** Renderiza o markdown básico do Discord usado nos anúncios: **negrito**, quebras de linha e a menção. */
function render(modelo: string, a: Amostra): ReactNode[] {
  const texto = modelo
    .replaceAll('{nome}', a.nome)
    .replaceAll('{usuario}', `@${a.usuario}`)
    .replaceAll('{servidor}', a.servidor)
    .replaceAll('{total}', a.total.toLocaleString('pt-BR'))
  return texto.split('\n').flatMap((linha, i) => [
    ...(i > 0 ? [<br key={`br${i}`} />] : []),
    ...linha.split(/(\{membro\}|\*\*[^*]+\*\*)/g).map((parte, j) => {
      if (parte === '{membro}')
        return (
          <span key={`${i}-${j}`} className="rounded-[3px] bg-discord/30 px-0.5 font-medium text-[#c9cdfb]">
            @{a.nome}
          </span>
        )
      if (/^\*\*[^*]+\*\*$/.test(parte)) return <strong key={`${i}-${j}`}>{parte.slice(2, -2)}</strong>
      return parte
    }),
  ])
}

/** Simula a mensagem do bot no Discord (Components V2: container, seção com miniatura, divisor). */
export function AnuncioPreview({ tipo, cfg, amostra }: { tipo: TipoAnuncio; cfg: AnuncioConfig; amostra: Amostra }) {
  const titulo = render(cfg.titulo, amostra)
  return (
    <div className="rounded-[14px] border border-white/6 bg-[#313338] p-4 font-[system-ui] text-[15px] leading-snug text-[#dbdee1]">
      <div className="flex gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-xs font-black text-white">PM</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="font-semibold text-[#f2f3f5]">PMERJ</span>
            <span className="rounded-[3px] bg-discord px-1 text-[10px] font-semibold leading-4 text-white">APP</span>
            <span className="text-xs text-[#949ba4]">hoje</span>
          </div>
          {tipo === 'entrada' && cfg.mencionar && <div className="mt-0.5 text-xs text-[#949ba4]">notifica @{amostra.nome}</div>}

          <div className="mt-1.5 overflow-hidden rounded-lg border border-white/6 bg-[#2b2d31]" style={{ borderLeft: `4px solid ${hex(cfg.cor)}` }}>
            <div className="flex gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="text-xl font-bold leading-tight text-[#f2f3f5]">
                  {tipo === 'entrada' ? '📥' : '📤'} {titulo}
                </div>
                <p className="mt-1.5 wrap-break-word">{render(cfg.mensagem, amostra)}</p>
              </div>
              <img src={amostra.avatar} alt="" referrerPolicy="no-referrer" className="size-18 shrink-0 rounded-lg object-cover" />
            </div>
            {cfg.detalhes && (
              <div className="mx-4 border-t border-white/8 py-3 text-sm">
                <strong>Conta criada</strong> há 3 anos{tipo === 'entrada' ? <>  ·  <strong>Membro nº</strong> {amostra.total.toLocaleString('pt-BR')}</> : <>  ·  <strong>Estava no servidor desde</strong> 12/03/2025</>}
              </div>
            )}
            <div className="px-4 pb-3 text-xs text-[#949ba4]">ID 123456789012345678 · hoje</div>
          </div>
        </div>
      </div>
    </div>
  )
}
