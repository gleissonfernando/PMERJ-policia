import { useOutletContext } from 'react-router'
import type { Me } from './api'

/** Dados da sessão para as páginas filhas do painel (vindos do PainelLayout). */
export function usePainelMe(): Me {
  return useOutletContext<Me>()
}
