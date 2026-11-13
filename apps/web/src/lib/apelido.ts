/**
 * Monta o apelido a partir do modelo.
 * ATENÇÃO: cópia de apps/api/src/set/apelido.ts (quem valida de verdade é a API).
 * Aqui serve só para a prévia ao vivo. Alterou lá, altere aqui.
 */
export const APELIDO_MAX = 32 // limite do Discord

export interface ApelidoInput {
  prefixo: string
  nome: string
  id: string
  orgao?: string | null
}

export function montarApelido(formato: string, v: ApelidoInput): string {
  return formato
    .replaceAll('{prefixo}', v.prefixo)
    .replaceAll('{nome}', v.nome)
    .replaceAll('{id}', v.id)
    .replaceAll('{orgao}', v.orgao ?? '')
    .replace(/\[\s*\]|\(\s*\)/g, '') // colchetes/parênteses que ficaram vazios
    .replace(/\s*\|\s*(?=$|\|)/g, '') // barras soltas no fim
    .replace(/\s+/g, ' ')
    .trim()
}
