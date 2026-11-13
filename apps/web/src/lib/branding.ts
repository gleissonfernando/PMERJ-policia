import { useSyncExternalStore } from 'react'

/**
 * Logo da corporação (padrão: brasão da PMERJ; o admin troca em Painel → Aparência).
 * Estado global simples: uma busca por página, e todos os <Crest/> e o rodapé
 * mudam juntos quando a logo é trocada.
 */

export interface BrandingInfo {
  versao: string
  personalizada: boolean
  tipo: string | null
  bytes: number
  atualizadoEm: number | null
  atualizadoPor: string | null
  limiteBytes: number
}

/** Enquanto a API não responde, usa o brasão que vem com o site. */
const PADRAO = '/brasao-pmerj.png'

let info: BrandingInfo | null = null
let url = PADRAO
const ouvintes = new Set<() => void>()

function aplicar(novo: BrandingInfo) {
  info = novo
  url = novo.versao === 'nenhuma' ? PADRAO : `/api/branding/logo?v=${encodeURIComponent(novo.versao)}`
  // Ícone da aba acompanha a logo.
  document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="apple-touch-icon"]').forEach((l) => {
    l.href = url
    l.removeAttribute('type')
  })
  ouvintes.forEach((fn) => fn())
}

let carregando: Promise<void> | null = null
export function carregarBranding(forcar = false): Promise<void> {
  if (carregando && !forcar) return carregando
  const p = fetch('/api/branding', { credentials: 'same-origin' })
    .then((r) => (r.ok ? (r.json() as Promise<BrandingInfo>) : null))
    .then((b) => {
      if (b) aplicar(b)
    })
    .catch(() => {})
  carregando = p
  return p
}

const assinar = (fn: () => void) => {
  ouvintes.add(fn)
  void carregarBranding()
  return () => ouvintes.delete(fn)
}

/** URL da logo atual (com versão, para o cache do navegador não mostrar a antiga). */
export function useLogoUrl(): string {
  return useSyncExternalStore(assinar, () => url, () => PADRAO)
}

export function useBrandingInfo(): BrandingInfo | null {
  return useSyncExternalStore(assinar, () => info, () => null)
}

/** Depois de enviar/restaurar no painel: atualiza tudo na tela. */
export const definirBranding = aplicar
