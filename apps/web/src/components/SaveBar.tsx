import { Check, Undo2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/form'
import { Alert } from '@/components/ui'
import { cn } from '@/lib/cn'

/** Quanto tempo o aviso "Configurações salvas" fica na tela. */
const AVISO_SALVO_MS = 3_000

/**
 * Barra fixa no rodapé da tela para salvar/descartar alterações de configuração.
 * Renderizada direto no <body> (portal): assim nenhum ancestral com transform/animação
 * consegue "prendê-la" no meio da página.
 */
export function SaveBar({
  dirty,
  saved,
  saving,
  error,
  onSave,
  onDiscard,
}: {
  dirty: boolean
  saved: boolean
  saving: boolean
  error: string | null
  onSave: () => void
  onDiscard: () => void
}) {
  // "Salvo" aparece por alguns segundos e a barra desce sozinha.
  const [avisoExpirou, setAvisoExpirou] = useState(false)
  useEffect(() => {
    if (!saved || dirty) return
    const t = window.setTimeout(() => setAvisoExpirou(true), AVISO_SALVO_MS)
    return () => {
      window.clearTimeout(t)
      setAvisoExpirou(false)
    }
  }, [saved, dirty])

  const mostrarSalvo = saved && !dirty && !avisoExpirou
  const visible = dirty || mostrarSalvo || Boolean(error)

  return (
    <>
      {/* Reserva espaço no fim da página para a barra fixa não cobrir os últimos campos. */}
      {visible && <div aria-hidden="true" className="h-24" />}
      {createPortal(
        <div
          className={cn(
            'fixed inset-x-0 bottom-0 z-30 border-t border-line bg-sidebar/90 backdrop-blur-md transition duration-300 lg:left-[264px]',
            visible ? 'translate-y-0' : 'pointer-events-none translate-y-full',
          )}
          aria-hidden={!visible}
          inert={!visible}
        >
          <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-3 px-5 py-3.5 sm:px-8">
            <div className="min-w-0 flex-1 text-sm" role="status">
              {error ? (
                <Alert>{error}</Alert>
              ) : mostrarSalvo ? (
                <span className="inline-flex items-center gap-2 font-semibold text-success">
                  <Check className="size-4" /> Configurações salvas
                </span>
              ) : (
                <span className="font-semibold text-ink">Alterações não salvas</span>
              )}
            </div>
            {dirty && (
              <div className="flex gap-2">
                <Button variant="ghost" onClick={onDiscard}>
                  <Undo2 className="size-4" /> Descartar
                </Button>
                <Button loading={saving} onClick={onSave}>
                  {!saving && <Check className="size-4" />} Salvar
                </Button>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
