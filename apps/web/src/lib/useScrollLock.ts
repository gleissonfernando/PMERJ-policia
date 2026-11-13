import { useEffect } from 'react'

let locks = 0
let saved = { overflow: '', paddingRight: '' }

/**
 * Trava a rolagem da página enquanto `active` for true (gaveta, painel lateral, modal).
 * Compensa a largura da barra de rolagem para o layout não "pular".
 * Suporta vários bloqueios ao mesmo tempo (contador).
 */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    const { body, documentElement } = document
    if (locks++ === 0) {
      saved = { overflow: body.style.overflow, paddingRight: body.style.paddingRight }
      const scrollbar = window.innerWidth - documentElement.clientWidth
      body.style.overflow = 'hidden'
      if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`
    }
    return () => {
      if (--locks === 0) {
        body.style.overflow = saved.overflow
        body.style.paddingRight = saved.paddingRight
      }
    }
  }, [active])
}
