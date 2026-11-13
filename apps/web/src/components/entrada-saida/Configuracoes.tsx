import { Bot } from 'lucide-react'
import { useMemo, useState } from 'react'
import { BotStatus } from '@/components/discord/BotStatus'
import { Card, Switch } from '@/components/form'
import { SaveBar } from '@/components/SaveBar'
import { avatarUrl, type Me } from '@/lib/api'
import { erroEntradaSaida, type EntradaSaidaApi, type EntradaSaidaEstado, type EntradaSaidaInput } from '@/lib/entradaSaida'
import { AnuncioEditor } from './AnuncioEditor'
import type { Amostra } from './AnuncioPreview'

function toInput(d: EntradaSaidaEstado): EntradaSaidaInput {
  const { atualizadoEm: _a, atualizadoPor: _b, ...rest } = d.config
  return structuredClone(rest)
}

export function Configuracoes({ me, data, es }: { me: Me; data: EntradaSaidaEstado; es: EntradaSaidaApi }) {
  const original = useMemo(() => toInput(data), [data])
  const [draft, setDraft] = useState<EntradaSaidaInput>(original)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const dirty = JSON.stringify(draft) !== JSON.stringify(original)
  const patch = (p: Partial<EntradaSaidaInput>) => {
    setDraft((d) => ({ ...d, ...p }))
    setSaved(false)
  }

  const amostra: Amostra = {
    nome: me.user.globalName ?? me.user.username,
    usuario: me.user.username,
    avatar: avatarUrl(me.user, 128),
    servidor: data.servidor?.nome ?? 'PMERJ',
    total: data.servidor?.total ?? 1234,
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await es.salvarConfig(draft)
      setSaved(true)
    } catch (err) {
      setError(erroEntradaSaida(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-5">
      <BotStatus botAtivo={data.botAtivo} gateway={data.gateway} />

      {(['entrada', 'saida'] as const).map((tipo) => (
        <AnuncioEditor
          key={tipo}
          tipo={tipo}
          cfg={draft[tipo]}
          onChange={(cfg) => patch({ [tipo]: cfg })}
          canais={data.canais}
          amostra={amostra}
          podeTestar={data.botAtivo && JSON.stringify(draft[tipo]) === JSON.stringify(original[tipo])}
          es={es}
        />
      ))}

      <Card className="px-6">
        <Switch
          checked={draft.ignorarBots}
          onChange={(ignorarBots) => patch({ ignorarBots })}
          label="Ignorar bots"
          description={
            <span className="inline-flex items-center gap-1">
              <Bot className="size-3" /> Não anuncia quando um bot entra ou sai. Eles continuam na atividade.
            </span>
          }
        />
      </Card>

      <SaveBar
        dirty={dirty}
        saved={saved}
        saving={saving}
        error={error}
        onSave={save}
        onDiscard={() => {
          setDraft(original)
          setError(null)
        }}
      />
    </div>
  )
}
