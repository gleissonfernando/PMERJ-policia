import { ChevronDown, ImageIcon, Upload, X } from 'lucide-react'
import { useState } from 'react'
import { rotuloCurto } from '@/lib/assuncao'
import { useLogoUrl } from '@/lib/branding'
import { CAMPOS_INTEL, type InteligenciaInput } from '@/lib/inteligencia'

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`
const titulo = (c: Pick<InteligenciaInput, 'emoji' | 'nome'>) => `${c.emoji ? `${c.emoji} ` : ''}${c.nome || 'Inteligência'}`

/** Formulário como aparece no Discord ao clicar em "Assumir serviço". */
export function ModalPreview({ cfg }: { cfg: InteligenciaInput }) {
  const logo = useLogoUrl()
  return (
    <div className="mx-auto w-full max-w-[440px] rounded-xl border border-white/8 bg-[#313338] font-[system-ui] text-[#dbdee1] shadow-2xl shadow-black/40">
      <div className="flex items-center gap-2.5 px-4 pt-4">
        <img src={logo} alt="" className="size-6 shrink-0 rounded-full bg-[#1e1f22] object-contain p-0.5" />
        <span className="min-w-0 flex-1 truncate text-lg font-bold text-[#f2f3f5]">{titulo(cfg).slice(0, 45)}</span>
        <X className="size-5 text-[#b5bac1]" aria-hidden="true" />
      </div>
      <div className="grid gap-4 p-4">
        {CAMPOS_INTEL.map(({ id, obrigatorio }) => {
          const c = cfg.campos[id]
          const select = id === 'quantidade' || id === 'policiais' || (id === 'objeto' && cfg.objetos.length > 0)
          return (
            <div key={id} className="grid gap-1">
              <div className="text-[13px] font-semibold leading-tight text-[#f2f3f5]">
                {c.label.slice(0, 45) || <span className="text-[#6d6f78]">Sem título</span>}
                {obrigatorio && <span className="ml-1 text-[#f23f43]">*</span>}
              </div>
              {c.descricao && <div className="text-xs leading-snug text-[#b5bac1]">{c.descricao.slice(0, 100)}</div>}
              {id === 'fotos' ? (
                <div className="mt-1 grid h-16 place-items-center rounded-lg border border-dashed border-white/15 bg-[#1e1f22] text-xs text-[#949ba4]">
                  <span className="inline-flex items-center gap-1.5">
                    <Upload className="size-4" /> Arraste ou clique para enviar
                  </span>
                </div>
              ) : id === 'link' ? (
                <div className="mt-1 h-16 rounded-lg border border-white/10 bg-[#1e1f22] px-3 py-2 text-sm text-[#87898c]">https://…</div>
              ) : (
                <div className="mt-1 flex h-10 items-center justify-between rounded-lg border border-white/10 bg-[#1e1f22] px-3 text-sm text-[#87898c]">
                  <span className="truncate">{select ? (id === 'objeto' ? 'Escolha a comunidade ou organização' : 'Faça uma seleção') : 'Comunidade ou organização'}</span>
                  {select && <ChevronDown className="size-4 shrink-0" aria-hidden="true" />}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="grid grid-cols-2 gap-3 px-4 pb-4">
        <span className="grid h-10 place-items-center rounded-lg bg-[#4e5058] text-sm font-medium text-white">Cancelar</span>
        <span className="grid h-10 place-items-center rounded-lg bg-discord text-sm font-medium text-white">Enviar</span>
      </div>
    </div>
  )
}

const Mencao = ({ nome }: { nome: string }) => <span className="rounded-[3px] bg-discord/30 px-0.5 font-medium text-[#c9cdfb]">@{nome}</span>
const Num = ({ n }: { n: number }) => <code className="rounded-[4px] bg-[#1e1f22] px-1 py-px font-mono text-[12px] text-[#dbdee1]">{String(n).padStart(2, '0')}</code>

/** Registro publicado no canal de resultado. */
export function ResultadoPreview({ cfg, autor }: { cfg: InteligenciaInput; autor: string }) {
  const logo = useLogoUrl()
  const [hora] = useState(() => new Date().toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' }))
  const policiais = ['Sgt. Ferreira', 'Cb. Souza', 'Sd. Almeida'].slice(0, cfg.maxPoliciais)
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
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <div className="wrap-break-word text-xl font-bold leading-tight text-[#f2f3f5]">{titulo(cfg)}</div>
                <div className="mt-1.5">
                  <strong className="font-semibold text-[#f2f3f5]">Assunção de serviço</strong> · {hora}
                </div>
                <div className="mt-1.5 grid gap-0.5">
                  <div>
                    <strong className="font-semibold text-[#f2f3f5]">{rotuloCurto(cfg.campos.objeto.label)}:</strong> {cfg.objetos[0] ?? 'Comunidade do Exemplo'}
                  </div>
                  <div>
                    <strong className="font-semibold text-[#f2f3f5]">Efetivo:</strong> {policiais.length} {policiais.length === 1 ? 'policial' : 'policiais'}
                  </div>
                </div>
              </div>
              <img src={logo} alt="" className="size-21.25 shrink-0 rounded-lg bg-[#1e1f22] object-contain p-1.5" />
            </div>
            <div className="my-3 border-t border-white/10" />
            <div className="grid gap-1">
              {policiais.map((n, i) => (
                <div key={n}>
                  <Num n={i + 1} /> <Mencao nome={n} />
                </div>
              ))}
            </div>
            <div className="my-3 border-t border-white/10" />
            <div className="grid grid-cols-2 gap-1">
              {[0, 1].map((k) => (
                <div key={k} className="grid aspect-4/3 place-items-center rounded-md border border-dashed border-white/12 bg-[#1e1f22] text-[#949ba4]">
                  <ImageIcon className="size-5" />
                </div>
              ))}
            </div>
            <div className="mt-2">
              <strong className="font-semibold text-[#f2f3f5]">Links</strong>
              <div className="truncate text-[#00a8fc]">🔗 https://exemplo.com/foto.jpg</div>
            </div>
            <div className="my-3 border-t border-white/10" />
            <div className="grid gap-0.5 text-xs text-[#949ba4]">
              <div className="flex items-center gap-1.5">
                <img src={logo} alt="" className="size-4 shrink-0 object-contain" />
                PMERJ · Polícia Militar do Estado do Rio de Janeiro
              </div>
              <div>
                Registrado por <Mencao nome={autor} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
