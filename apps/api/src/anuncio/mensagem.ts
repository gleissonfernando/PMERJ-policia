import { emojiLogo } from "../branding/emoji.js";
import { logoDiscord } from "../branding/logo.js";
import { FLAG_COMPONENTS_V2, type Arquivo, type MessageBody } from "../discord/bot.js";
import { cabecalho } from "../set/brasao.js";
import type { AnuncioConfig } from "./types.js";

/**
 * Mensagem do anúncio (Components V2):
 *
 *   ┃ ## Título                     [LOGO]
 *   ┃ Texto…                        (a logo fica no topo, à direita,
 *   ┃                                seja qual for o tamanho do texto)
 *   ┃ ───────────────
 *   ┃ [ imagem ]                    (opcional)
 *   ┃ ───────────────
 *   ┃ -# [logo] rodapé              (logo pequena à esquerda = emoji do bot)
 *   ┃ -# Anunciado por @x · data
 *
 * O Discord aceita no máximo 4.000 caracteres somando TODOS os textos da mensagem.
 * A imagem não gasta caracteres; título e rodapé, sim — por isso o limite do texto varia.
 */
export const LIMITE_TOTAL = 4_000;
export const TITULO_MAX = 100;
/** Limite de anexo de bot em servidor sem impulso é 10 MB; deixamos folga para a logo. */
export const IMAGEM_MAX_BYTES = 8 * 1024 * 1024;

export const CUSTOM_ABRIR = "anuncio:abrir";

const DESCRICAO_LOGO = "Logo da PMERJ";

export interface ConteudoAnuncio {
  titulo: string;
  texto: string;
  /** Nome do anexo (attachment://nome) — null sem imagem. */
  imagem: string | null;
  autorId: string;
  em: number;
}

const linhaTitulo = (titulo: string) => `## ${titulo}`;

/**
 * Rodapé: logo pequena À ESQUERDA (emoji do bot) + texto em letra miúda.
 * Sem o emoji (bot ainda sincronizando, logo grande demais), sai só o texto.
 */
function linhasRodape(cfg: AnuncioConfig, autorId: string, em: number): string[] {
  const emoji = emojiLogo();
  const linhas = [`-# ${emoji ? `${emoji} ` : ""}${cfg.rodape}`];
  if (cfg.mostrarAutor) linhas.push(`-# Anunciado por <@${autorId}> · <t:${Math.floor(em / 1000)}:f>`);
  return linhas;
}

/** Caracteres que o anúncio gasta além do texto (título, rodapé, descrição da logo). */
export function caracteresFixos(cfg: AnuncioConfig, titulo: string, autorId: string, em = Date.now()): number {
  const rodape = linhasRodape(cfg, autorId, em).join("").length;
  const logo = logoDiscord() ? DESCRICAO_LOGO.length : 0;
  return linhaTitulo(titulo).length + rodape + logo;
}

/** Quantos caracteres sobram para o texto com este título. */
export const limiteTexto = (cfg: AnuncioConfig, titulo: string, autorId: string) =>
  LIMITE_TOTAL - caracteresFixos(cfg, titulo, autorId);

/** Maior texto possível (título de 1 letra): vira o max_length da caixa no formulário. */
export const limiteTextoMaximo = (cfg: AnuncioConfig, autorId: string) => Math.min(4_000, limiteTexto(cfg, "A", autorId));

const separador = { type: 14, divider: true, spacing: 1 };

export function montarAnuncio(cfg: AnuncioConfig, a: ConteudoAnuncio): MessageBody {
  const logo = logoDiscord();
  const corpo = [
    { type: 10, content: linhaTitulo(a.titulo) },
    { type: 10, content: a.texto },
  ];
  return {
    flags: FLAG_COMPONENTS_V2,
    // Anúncio nunca pinga ninguém: @everyone, cargos e usuários aparecem só como texto.
    allowed_mentions: { parse: [] },
    components: [
      {
        type: 17,
        accent_color: cfg.cor,
        components: [
          // Título + texto com a logo no canto superior direito.
          logo ? { type: 9, components: corpo, accessory: { type: 11, media: { url: `attachment://${logo.nomeArquivo}` }, description: DESCRICAO_LOGO } } : corpo,
          ...(a.imagem ? [separador, { type: 12, items: [{ media: { url: `attachment://${a.imagem}` } }] }] : []),
          separador,
          linhasRodape(cfg, a.autorId, a.em).map((content) => ({ type: 10, content })),
        ].flat(),
      },
    ],
  };
}

/** Logo (canto superior) + imagem do anúncio. */
export function anexosAnuncio(imagem: Arquivo | null): Arquivo[] {
  const l = logoDiscord();
  return [...(l ? [{ nome: l.nomeArquivo, dados: l.dados, tipo: l.tipo }] : []), ...(imagem ? [imagem] : [])];
}

/* ---------- Painel fixo com o botão "Realizar anúncio" ---------- */

export function painelMensagem(cfg: AnuncioConfig): MessageBody {
  const cargos = cfg.cargosPermitidos.length
    ? cfg.cargosPermitidos.map((id) => `<@&${id}>`).join(" ")
    : "_nenhum cargo configurado ainda_";
  return {
    flags: FLAG_COMPONENTS_V2,
    allowed_mentions: { parse: [] },
    components: [
      {
        type: 17,
        accent_color: cfg.cor,
        components: [
          ...[
            cabecalho([
              "## 📢 Central de Anúncios",
              "Publique comunicados oficiais da **Polícia Militar do Estado do Rio de Janeiro** em qualquer canal do servidor.",
            ]),
          ].flat(),
          separador,
          {
            type: 10,
            content: [
              "**Como funciona**",
              "1. Clique em **Realizar anúncio** e escolha o canal.",
              "2. Preencha o título, o texto e, se quiser, envie uma imagem.",
              "3. Envie — o anúncio sai no canal com a identidade da PMERJ.",
              "",
              `**Quem pode usar:** ${cargos}`,
            ].join("\n"),
          },
          { type: 1, components: [{ type: 2, style: 1, label: "Realizar anúncio", emoji: { name: "📢" }, custom_id: CUSTOM_ABRIR }] },
          { type: 10, content: `-# ${emojiLogo() ? `${emojiLogo()} ` : ""}${cfg.rodape}` },
        ],
      },
    ],
  };
}
