import { logoDiscord } from "../branding/logo.js";
import type { Arquivo } from "../discord/bot.js";

/**
 * Logo da corporação nas mensagens do bot (por padrão o brasão da PMERJ; o admin
 * pode trocar em Painel → Aparência). O Discord não alcança o localhost, então a
 * imagem vai ANEXADA em cada mensagem e é referenciada como attachment://.
 */

/** Anexos a mandar junto (vazio se não houver logo). Sempre a logo atual. */
export function brasao(): Arquivo[] {
  const l = logoDiscord();
  return l ? [{ nome: l.nomeArquivo, dados: l.dados, tipo: l.tipo }] : [];
}

/** Miniatura da logo para usar como acessório de uma Section (ou null sem logo). */
export function thumbBrasao() {
  const l = logoDiscord();
  return l ? { type: 11, media: { url: `attachment://${l.nomeArquivo}` }, description: "Logo da Polícia Militar do Estado do Rio de Janeiro" } : null;
}

/** Cabeçalho padrão: textos com a logo ao lado quando disponível. */
export function cabecalho(textos: string[]) {
  const components = textos.map((content) => ({ type: 10, content }));
  const thumb = thumbBrasao();
  return thumb ? { type: 9, components, accessory: thumb } : components;
}
