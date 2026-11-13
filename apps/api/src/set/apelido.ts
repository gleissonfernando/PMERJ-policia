/**
 * Monta o apelido a partir do modelo.
 * ATENÇÃO: existe uma cópia idêntica em apps/web/src/lib/apelido.ts
 * (prévia ao vivo). Alterou aqui, altere lá.
 */
export const APELIDO_MAX = 32; // limite do Discord

export interface ApelidoInput {
  prefixo: string;
  nome: string;
  id: string;
  orgao?: string | null;
}

export function montarApelido(formato: string, v: ApelidoInput): string {
  return formato
    .replaceAll("{prefixo}", v.prefixo)
    .replaceAll("{nome}", v.nome)
    .replaceAll("{id}", v.id)
    .replaceAll("{orgao}", v.orgao ?? "")
    .replace(/\[\s*\]|\(\s*\)/g, "") // colchetes/parênteses que ficaram vazios
    .replace(/\s*\|\s*(?=$|\|)/g, "") // barras soltas no fim
    .replace(/\s+/g, " ")
    .trim();
}
