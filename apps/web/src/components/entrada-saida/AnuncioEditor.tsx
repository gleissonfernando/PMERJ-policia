import { Check, Send, UserMinus, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { CanalSelect } from '@/components/discord/CanalSelect'
import { Button, Card, CardHeader, Field, Input, Switch, Textarea } from '@/components/form'
import { Alert } from '@/components/ui'
import { cn } from '@/lib/cn'
import type { CanalTexto } from '@/lib/discord'
import { erroEntradaSaida, type AnuncioConfig, type EntradaSaidaApi, type TipoAnuncio } from '@/lib/entradaSaida'
import { AnuncioPreview, type Amostra } from './AnuncioPreview'

const TOKENS: Record<TipoAnuncio, Array<{ token: string; label: string }>> = {
  entrada: [
    { token: '{membro}', label: 'Menção' },
    { token: '{nome}', label: 'Nome' },
    { token: '{usuario}', label: '@usuário' },
    { token: '{servidor}', label: 'Servidor' },
    { token: '{total}', label: 'Total' },
  ],
  saida: [
    { token: '{nome}', label: 'Nome' },
    { token: '{usuario}', label: '@usuário' },
    { token: '{servidor}', label: 'Servidor' },
    { token: '{total}', label: 'Total' },
    { token: '{membro}', label: 'Menção' },
  ],
}

const CORES = [0x22c55e, 0xe10600, 0x5865f2, 0xf59e0b, 0xeab308, 0xa3a3a3]
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`

export function AnuncioEditor({
  tipo,
  cfg,
  onChange,
  canais,
  amostra,
  podeTestar,
  es,
}: {
  tipo: TipoAnuncio
  cfg: AnuncioConfig
  onChange: (cfg: AnuncioConfig) => void
  canais: CanalTexto[]
  amostra: Amostra
  /** Só testa o que já está salvo (o teste usa a configuração do servidor). */
  podeTestar: boolean
  es: EntradaSaidaApi
}) {
  const [testando, setTestando] = useState(false)
  const [testeOk, setTesteOk] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const set = (p: Partial<AnuncioConfig>) => onChange({ ...cfg, ...p })
  const entrada = tipo === 'entrada'
  const id = (s: string) => `${tipo}-${s}`

  async function testar() {
    setTestando(true)
    setErro(null)
    setTesteOk(false)
    try {
      await es.testar(tipo)
      setTesteOk(true)
    } catch (err) {
      setErro(erroEntradaSaida(err))
    } finally {
      setTestando(false)
    }
  }

  return (
    <Card>
      <CardHeader
        icon={entrada ? <UserPlus className="size-4.5" /> : <UserMinus className="size-4.5" />}
        title={entrada ? 'Anúncio de entrada' : 'Anúncio de saída'}
        hint={entrada ? 'Publicado quando alguém entra no servidor.' : 'Publicado quando alguém sai (ou é removido) do servidor.'}
        action={
          <span className={cn('text-[11px] font-extrabold uppercase tracking-widest', cfg.ativo ? 'text-success' : 'text-muted')}>
            {cfg.ativo ? 'Ativo' : 'Desligado'}
          </span>
        }
      />
      <div className="grid gap-6 p-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-5">
          <div className="divide-y divide-line rounded-[14px] border border-line px-4">
            <Switch checked={cfg.ativo} onChange={(ativo) => set({ ativo })} label="Anunciar" description={cfg.canalId ? undefined : 'Escolha o canal abaixo para ativar.'} />
          </div>

          <Field label="Canal" htmlFor={id('canal')}>
            <CanalSelect id={id('canal')} canais={canais} value={cfg.canalId} onChange={(canalId) => set({ canalId })} vazio="Escolha o canal…" />
          </Field>

          <Field label="Título" htmlFor={id('titulo')} hint={`${cfg.titulo.length}/80`}>
            <Input id={id('titulo')} value={cfg.titulo} maxLength={80} onChange={(e) => set({ titulo: e.target.value })} />
          </Field>

          <Field label="Mensagem" htmlFor={id('msg')} hint={`Aceita **negrito** e quebra de linha. ${cfg.mensagem.length}/600`}>
            <Textarea id={id('msg')} value={cfg.mensagem} maxLength={600} rows={4} onChange={(e) => set({ mensagem: e.target.value })} />
          </Field>
          <div className="-mt-2 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted">Inserir</span>
            {TOKENS[tipo].map(({ token, label }) => (
              <button
                key={token}
                type="button"
                onClick={() => set({ mensagem: `${cfg.mensagem.trimEnd()} ${token}`.trim() })}
                className="rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 font-mono text-xs text-ink/85 transition hover:border-primary/50 hover:text-ink"
              >
                {token} <span className="font-sans text-muted">· {label}</span>
              </button>
            ))}
          </div>

          <div className="grid gap-1.5">
            <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted">Cor da barra</span>
            <div className="flex flex-wrap items-center gap-2">
              {CORES.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Cor ${hex(c)}`}
                  aria-pressed={cfg.cor === c}
                  onClick={() => set({ cor: c })}
                  className={cn('grid size-8 place-items-center rounded-full border-2 transition', cfg.cor === c ? 'border-ink' : 'border-transparent hover:border-line-strong')}
                  style={{ background: hex(c) }}
                >
                  {cfg.cor === c && <Check className="size-4 text-white drop-shadow" />}
                </button>
              ))}
              <label className="relative grid size-8 cursor-pointer place-items-center overflow-hidden rounded-full border border-dashed border-line-strong text-[10px] text-muted" title="Outra cor">
                +
                <input type="color" value={hex(cfg.cor)} onChange={(e) => set({ cor: parseInt(e.target.value.slice(1), 16) })} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Escolher outra cor" />
              </label>
            </div>
          </div>

          <div className="divide-y divide-line rounded-[14px] border border-line px-4">
            <Switch checked={cfg.detalhes} onChange={(detalhes) => set({ detalhes })} label="Mostrar detalhes" description={entrada ? 'Idade da conta e número do membro.' : 'Idade da conta e desde quando estava no servidor.'} />
            {entrada && <Switch checked={cfg.mencionar} onChange={(mencionar) => set({ mencionar })} label="Notificar o novo membro" description="A menção {membro} faz a pessoa receber notificação." />}
          </div>
        </div>

        <div className="grid content-start gap-3">
          <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted">Prévia no Discord</span>
          <AnuncioPreview tipo={tipo} cfg={cfg} amostra={amostra} />
          {erro && <Alert>{erro}</Alert>}
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="ghost" size="sm" onClick={testar} loading={testando} disabled={!podeTestar || !cfg.canalId}>
              {!testando && <Send className="size-3.5" />} Enviar teste no canal
            </Button>
            <span className={cn('text-xs', testeOk ? 'font-semibold text-success' : 'text-muted')}>
              {testeOk ? 'Teste enviado com os seus dados.' : !podeTestar ? 'Salve as alterações para testar.' : 'Usa os seus dados; não entra na atividade.'}
            </span>
          </div>
        </div>
      </div>
    </Card>
  )
}
