import { CheckCircle2, ImageUp, Loader2, Palette, RefreshCw, RotateCcw, ShieldAlert, Upload, XCircle } from 'lucide-react'
import { useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Navigate } from 'react-router'
import { Button, Card, CardHeader } from '@/components/form'
import { Alert } from '@/components/ui'
import { adminDe, api, ApiError } from '@/lib/api'
import { definirBranding, useBrandingInfo, useLogoUrl, type BrandingInfo } from '@/lib/branding'
import { cn } from '@/lib/cn'
import { fmtDataHora } from '@/lib/format'
import { usePainelMe } from '@/lib/usePainelMe'

const TIPOS = ['image/png', 'image/jpeg', 'image/webp']

const ERROS: Record<string, string> = {
  arquivo_vazio: 'O arquivo está vazio.',
  arquivo_grande: 'A imagem passa de 2 MB. Reduza o tamanho e tente de novo.',
  formato_invalido: 'Formato não aceito. Use PNG, JPG ou WebP (de preferência PNG com fundo transparente).',
  proibido: 'Só administradores podem trocar a logo.',
  muitas_requisicoes: 'Muitas tentativas. Aguarde um minuto.',
}
const erroDe = (err: unknown) =>
  err instanceof ApiError ? (ERROS[err.message] ?? 'Não foi possível salvar a logo.') : 'Falha de conexão com o servidor.'

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`)

/** Painel → Aparência: logo usada no site (menu, login, rodapé, ícone da aba) e nas mensagens do bot. */
export function Aparencia() {
  const me = usePainelMe()
  const info = useBrandingInfo()
  const logoAtual = useLogoUrl()
  const input = useRef<HTMLInputElement>(null)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [previa, setPrevia] = useState<string | null>(null)
  const [arrastando, setArrastando] = useState(false)
  const [busy, setBusy] = useState<'salvar' | 'restaurar' | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  if (!adminDe(me, 'branding')) return <Navigate to="/painel" replace />

  const limite = info?.limiteBytes ?? 2 * 1024 * 1024
  const mostrada = previa ?? logoAtual

  function escolher(f: File | undefined) {
    setErro(null)
    setOk(null)
    if (!f) return
    if (!TIPOS.includes(f.type)) return setErro(ERROS.formato_invalido!)
    if (f.size > limite) return setErro(ERROS.arquivo_grande!)
    if (previa) URL.revokeObjectURL(previa)
    setArquivo(f)
    setPrevia(URL.createObjectURL(f))
  }

  function soltar(e: DragEvent) {
    e.preventDefault()
    setArrastando(false)
    escolher(e.dataTransfer.files[0])
  }

  function limparPrevia() {
    if (previa) URL.revokeObjectURL(previa)
    setPrevia(null)
    setArquivo(null)
    if (input.current) input.current.value = ''
  }

  async function salvar() {
    if (!arquivo) return
    setBusy('salvar')
    setErro(null)
    try {
      definirBranding(await api.upload<BrandingInfo>('/branding/logo', arquivo))
      limparPrevia()
      setOk('Logo atualizada no site e nas mensagens do bot.')
    } catch (err) {
      setErro(erroDe(err))
    } finally {
      setBusy(null)
    }
  }

  async function restaurar() {
    setBusy('restaurar')
    setErro(null)
    try {
      definirBranding(await api.del<BrandingInfo>('/branding/logo'))
      limparPrevia()
      setOk('Brasão padrão da PMERJ restaurado.')
    } catch (err) {
      setErro(erroDe(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="animate-rise">
      <span className="kicker">Sistema</span>
      <h1 className="display mt-2 text-[clamp(2rem,4vw,2.6rem)]">Aparência</h1>
      <p className="mt-1.5 max-w-xl text-muted">A logo aparece no menu, no login, no rodapé, no ícone da aba e nas mensagens do bot no Discord.</p>

      <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader icon={<ImageUp className="size-4.5" />} title="Logo da corporação" hint="PNG, JPG ou WebP até 2 MB. Prefira PNG quadrado ou vertical com fundo transparente." />
          <div className="grid gap-5 p-6">
            {erro && <Alert>{erro}</Alert>}
            {ok && (
              <p role="status" className="rounded-xl border border-success/35 bg-success/10 px-4 py-3 text-sm font-semibold text-success">
                {ok}
              </p>
            )}

            <label
              onDragOver={(e) => {
                e.preventDefault()
                setArrastando(true)
              }}
              onDragLeave={() => setArrastando(false)}
              onDrop={soltar}
              className={cn(
                'grid cursor-pointer place-items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition',
                arrastando ? 'border-primary bg-primary/6' : 'border-line-strong hover:border-primary/50 hover:bg-white/2',
              )}
            >
              <input ref={input} type="file" accept={TIPOS.join(',')} className="sr-only" onChange={(e) => escolher(e.target.files?.[0])} />
              <span className="grid size-12 place-items-center rounded-full border border-line bg-surface-2 text-primary">
                <Upload className="size-5" />
              </span>
              <span className="text-sm font-semibold text-ink">{arquivo ? arquivo.name : 'Clique ou arraste a nova logo aqui'}</span>
              <span className="text-xs text-muted">{arquivo ? `${kb(arquivo.size)} · confira a prévia ao lado` : `PNG, JPG ou WebP · até ${kb(limite)}`}</span>
            </label>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button variant="ghost" onClick={restaurar} loading={busy === 'restaurar'} disabled={busy !== null || !info?.personalizada}>
                {busy !== 'restaurar' && <RotateCcw className="size-4" />} Restaurar brasão padrão
              </Button>
              <div className="flex gap-2">
                {arquivo && (
                  <Button variant="ghost" onClick={limparPrevia} disabled={busy !== null}>
                    Cancelar
                  </Button>
                )}
                <Button onClick={salvar} loading={busy === 'salvar'} disabled={!arquivo || busy !== null}>
                  {busy !== 'salvar' && <Upload className="size-4" />} Salvar nova logo
                </Button>
              </div>
            </div>

            <p className="flex items-start gap-2 text-xs text-muted">
              <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
              SVG não é aceito: ele pode carregar código. A imagem é conferida pelo servidor antes de ser usada.
            </p>
          </div>
        </Card>

        <div className="grid content-start gap-5">
          <Card className="p-6">
            <div className="flex items-center justify-between gap-3">
              <span className="kicker">{previa ? 'Prévia (ainda não salva)' : 'Logo atual'}</span>
              {info && !previa && (
                <span className="text-[11px] text-muted">
                  {info.personalizada ? `Personalizada${info.atualizadoEm ? ` · ${fmtDataHora(info.atualizadoEm)}` : ''}` : 'Brasão padrão da PMERJ'}
                </span>
              )}
            </div>

            <div className="mt-4 grid grid-cols-[1fr_auto] gap-4">
              <div className="grid min-h-48 place-items-center rounded-[14px] border border-line bg-[radial-gradient(circle_at_50%_40%,#1c1c1c,#0a0a0a)] p-5">
                {info ? <img src={mostrada} alt="Prévia da logo" className="max-h-40 w-auto object-contain drop-shadow-[0_10px_24px_rgba(0,0,0,.6)]" /> : <Loader2 className="size-6 animate-spin text-muted" />}
              </div>
              <div className="grid content-between gap-3">
                <Amostra rotulo="Menu" className="bg-sidebar">
                  <img src={mostrada} alt="" className="h-9 w-auto object-contain" />
                </Amostra>
                <Amostra rotulo="Aba" className="bg-[#2b2b2b]">
                  <img src={mostrada} alt="" className="size-4 object-contain" />
                </Amostra>
                <Amostra rotulo="Fundo claro" className="bg-[#f2f3f5]">
                  <img src={mostrada} alt="" className="h-9 w-auto object-contain" />
                </Amostra>
              </div>
            </div>
          </Card>

          <AtualizarPaineis />

          <Card className="p-6">
            <span className="kicker">No Discord</span>
            <div className="mt-4 rounded-[14px] border border-white/6 bg-[#313338] p-4 text-[#dbdee1]">
              <div className="overflow-hidden rounded-lg border border-white/6 bg-[#2b2d31]" style={{ borderLeft: '4px solid #e10600' }}>
                <div className="flex gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-lg font-bold text-[#f2f3f5]">Pedir Set</div>
                    <p className="mt-1 text-sm">Solicite sua identificação na Polícia Militar do Estado do Rio de Janeiro.</p>
                  </div>
                  <img src={mostrada} alt="" className="size-[64px] shrink-0 object-contain" />
                </div>
              </div>
            </div>
            <p className="mt-3 flex items-start gap-2 text-xs text-muted">
              <Palette className="mt-0.5 size-3.5 shrink-0" /> Ao salvar, todos os painéis já publicados no Discord são atualizados com a nova logo.
            </p>
          </Card>
        </div>
      </div>
    </div>
  )
}

/** Redesenha todos os painéis publicados com a logo atual (e recria o emoji do rodapé). */
function AtualizarPaineis() {
  const [rodando, setRodando] = useState(false)
  const [relatorio, setRelatorio] = useState<Array<{ painel: string; ok: boolean }> | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function atualizar() {
    setRodando(true)
    setErro(null)
    setRelatorio(null)
    try {
      setRelatorio((await api.post<{ relatorio: Array<{ painel: string; ok: boolean }> }>('/branding/paineis')).relatorio)
    } catch (err) {
      setErro(err instanceof ApiError && err.message === 'muitas_requisicoes' ? 'Muitas tentativas. Aguarde um minuto.' : 'Não foi possível atualizar os painéis agora.')
    } finally {
      setRodando(false)
    }
  }

  const falhas = relatorio?.filter((r) => !r.ok).length ?? 0
  return (
    <Card className="p-6">
      <span className="kicker">Painéis no Discord</span>
      <p className="mt-2 text-sm text-muted">
        Troca a logo e o emoji do rodapé de uma vez: em todos os painéis publicados (Pedir Set, Anúncio, Assunções, Corregedoria, Disciplina, Bate-ponto, DOESP, Ocorrência, Comunicados, Cursos e Hierarquia) e nas mensagens que o bot já enviou (as 100 últimas de cada canal: registros, boletins, comunicados…). Acontece sozinho ao trocar a logo; pode levar alguns minutos.
      </p>
      <Button className="mt-4" onClick={atualizar} loading={rodando}>
        {!rodando && <RefreshCw className="size-4" />} {rodando ? 'Atualizando painéis…' : 'Atualizar todos os painéis'}
      </Button>
      {erro && <p className="mt-3 text-xs text-danger">{erro}</p>}
      {relatorio && (
        <div className="mt-4 grid gap-2">
          <p className={cn('text-xs font-semibold', falhas ? 'text-[#f59e0b]' : 'text-success')}>
            {falhas ? `${relatorio.length - falhas} de ${relatorio.length} atualizados.` : 'Todos os painéis foram atualizados.'}
          </p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {relatorio.map((r) => (
              <li key={r.painel} className="flex items-center gap-1.5 text-xs text-muted">
                {r.ok ? <CheckCircle2 className="size-3.5 text-success" /> : <XCircle className="size-3.5 text-danger" />} {r.painel}
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted">Módulos sem painel publicado são pulados sem erro.</p>
        </div>
      )}
    </Card>
  )
}

function Amostra({ rotulo, className, children }: { rotulo: string; className: string; children: ReactNode }) {
  return (
    <div className="grid justify-items-center gap-1">
      <div className={cn('grid size-14 place-items-center rounded-xl border border-line', className)}>{children}</div>
      <span className="text-[10px] text-muted">{rotulo}</span>
    </div>
  )
}
