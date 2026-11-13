import { Select } from '@/components/form'
import type { CanalTexto, TipoCanal } from '@/lib/discord'

const ICONE: Record<TipoCanal, string> = { texto: '#', anuncios: '📢', voz: '🔊', palco: '🎙️' }

function Opcao({ c }: { c: CanalTexto }) {
  return (
    <option value={c.id} disabled={!c.podeEnviar}>
      {ICONE[c.tipo]} {c.nome}
      {!c.podeEnviar && ' — bot sem permissão'}
    </option>
  )
}

/**
 * Seletor com todos os canais do servidor que aceitam mensagem (texto, anúncios,
 * chat de voz e de palco), agrupados por categoria como no Discord.
 * Canais onde o bot não pode escrever aparecem desativados.
 */
export function CanalSelect({
  id,
  canais,
  value,
  onChange,
  vazio = 'Nenhum canal',
  disabled,
}: {
  id: string
  canais: CanalTexto[]
  value: string | null
  onChange: (canalId: string | null) => void
  vazio?: string
  disabled?: boolean
}) {
  const grupos = new Map<string, CanalTexto[]>()
  for (const c of canais) {
    const key = c.categoria ?? ''
    grupos.set(key, [...(grupos.get(key) ?? []), c])
  }
  // Canal salvo que não aparece mais (apagado): mantém visível para não sumir em silêncio.
  const perdido = value && !canais.some((c) => c.id === value)
  const semPermissao = canais.filter((c) => !c.podeEnviar).length

  return (
    <div className="grid gap-1.5">
      <Select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} disabled={disabled || canais.length === 0}>
        <option value="">{canais.length === 0 ? 'Nenhum canal disponível' : vazio}</option>
        {perdido && <option value={value}>Canal indisponível ({value})</option>}
        {[...grupos].map(([categoria, list]) =>
          categoria ? (
            <optgroup key={categoria} label={categoria}>
              {list.map((c) => (
                <Opcao key={c.id} c={c} />
              ))}
            </optgroup>
          ) : (
            list.map((c) => <Opcao key={c.id} c={c} />)
          ),
        )}
      </Select>
      {semPermissao > 0 && (
        <p className="text-xs text-muted/80">
          {semPermissao} {semPermissao === 1 ? 'canal aparece bloqueado' : 'canais aparecem bloqueados'}: o bot não pode ver ou escrever neles. Libere nas permissões do canal.
        </p>
      )}
    </div>
  )
}
