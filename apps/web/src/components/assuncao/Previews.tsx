import { ChevronDown, X } from 'lucide-react'
import { useState } from 'react'
import { useLogoUrl } from '@/lib/branding'
import { rotuloCurto, type AssuncaoInput, type CampoId } from '@/lib/assuncao'

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`
const titulo = (a: Pick<AssuncaoInput, 'emoji' | 'nome'>) => `${a.emoji ? `${a.emoji} ` : ''}${a.nome || 'Assunção'}`

/** Formulário como aparece no Discord ao clicar em "Assumir serviço". */
export function ModalPreview({ a }: { a: AssuncaoInput }) {
  const logo = useLogoUrl()
  const campos: CampoId[] = ['setor', 'viatura', 'comandante', 'motopol', ...(a.maxDemais > 0 ? (['demais'] as const) : [])]
  return (
    <div className="mx-auto w-full max-w-[440px] rounded-xl border border-white/8 bg-[#313338] font-[system-ui] text-[#dbdee1] shadow-2xl shadow-black/40">
      <div className="flex items-center gap-2.5 px-4 pt-4">
        <img src={logo} alt="" className="size-6 shrink-0 rounded-full bg-[#1e1f22] object-contain p-0.5" />
        <span className="min-w-0 flex-1 truncate text-lg font-bold text-[#f2f3f5]">{titulo(a).slice(0, 45)}</span>
        <X className="size-5 text-[#b5bac1]" aria-hidden="true" />
      </div>
      <div className="grid gap-4 p-4">
        {campos.map((id) => {
          const c = a.campos[id]
          const obrigatorio = id !== 'demais'
          const lista = id === 'setor' && a.setores.length > 0
          const select = lista || id === 'comandante' || id === 'motopol' || id === 'demais'
          return (
            <div key={id} className="grid gap-1">
              <div className="text-[13px] font-semibold leading-tight text-[#f2f3f5]">
                {c.label.slice(0, 45) || <span className="text-[#6d6f78]">Sem título</span>}
                {obrigatorio && <span className="ml-1 text-[#f23f43]">*</span>}
              </div>
              {c.descricao && <div className="text-xs leading-snug text-[#b5bac1]">{c.descricao.slice(0, 100)}</div>}
              <div className="mt-1 flex h-10 items-center justify-between rounded-lg border border-white/10 bg-[#1e1f22] px-3 text-sm text-[#87898c]">
                <span className="truncate">{select ? (lista ? 'Escolha o setor' : 'Faça uma seleção') : id === 'setor' ? 'Ex.: Centro' : 'Ex.: 54-1234'}</span>
                {select && <ChevronDown className="size-4 shrink-0" aria-hidden="true" />}
              </div>
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
const Num = ({ n }: { n: number }) => (
  <code className="rounded-[4px] bg-[#1e1f22] px-1 py-px font-mono text-[12px] text-[#dbdee1]">{String(n).padStart(2, '0')}</code>
)

/** Registro publicado no canal de resultado (Components V2 com a logo da corporação). */
export function ResultadoPreview({ a, autor }: { a: AssuncaoInput; autor: string }) {
  const logo = useLogoUrl()
  const [hora] = useState(() => new Date().toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' }))
  const demais = ['Sd. Almeida', 'Sd. Costa'].slice(0, a.maxDemais)
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
          <div className="mt-1.5 overflow-hidden rounded-lg border border-white/6 bg-[#2b2d31] p-4" style={{ borderLeft: `4px solid ${hex(a.cor)}` }}>
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <div className="wrap-break-word text-xl font-bold leading-tight text-[#f2f3f5]">{titulo(a)}</div>
                <div className="mt-1.5">
                  <strong className="font-semibold text-[#f2f3f5]">Assunção de serviço</strong> · {hora}
                </div>
                <div className="mt-1.5 grid gap-0.5">
                  <div>
                    <strong className="font-semibold text-[#f2f3f5]">{rotuloCurto(a.campos.setor.label)}:</strong> {a.setores[0] ?? 'Centro'}
                  </div>
                  <div>
                    <strong className="font-semibold text-[#f2f3f5]">{rotuloCurto(a.campos.viatura.label)}:</strong> 54-1234
                  </div>
                  <div>
                    <strong className="font-semibold text-[#f2f3f5]">Efetivo:</strong> {2 + demais.length} policiais
                  </div>
                </div>
              </div>
              <img src={logo} alt="" className="size-21.25 shrink-0 rounded-lg bg-[#1e1f22] object-contain p-1.5" />
            </div>
            <div className="my-3 border-t border-white/10" />
            <div className="grid gap-1">
              <div>
                <Num n={1} /> <strong className="font-semibold text-[#f2f3f5]">{rotuloCurto(a.campos.comandante.label)}</strong> · <Mencao nome="Sgt. Ferreira" />
              </div>
              <div>
                <Num n={2} /> <strong className="font-semibold text-[#f2f3f5]">{rotuloCurto(a.campos.motopol.label)}</strong> · <Mencao nome="Cb. Souza" />
              </div>
              {demais.map((n, i) => (
                <div key={n}>
                  <Num n={i + 3} /> <Mencao nome={n} />
                </div>
              ))}
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
