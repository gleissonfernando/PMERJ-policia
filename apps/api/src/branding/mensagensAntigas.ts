import { editMessage, idDoBot, listMessages, listTextChannels, type MensagemCanal } from "../discord/bot.js";
import { emojiLogo } from "./emoji.js";
import { logoDiscord } from "./logo.js";

/**
 * Troca a logo nas mensagens que o bot JÁ enviou (registros de assunção, boletins, ocorrências,
 * comunicados, anúncios…), sem mexer em mais nada: texto, botões, fotos e vídeos ficam.
 *
 * Para cada canal que o bot enxerga, lê as últimas 100 mensagens e, nas dele em Components V2:
 *  - a miniatura/anexo "logo.png|jpg|webp" é substituído pela logo atual;
 *  - o emoji antigo do rodapé (<:pmerj_logo_…:id>) vira o emoji atual.
 * Os demais anexos (fotos, vídeos) continuam os mesmos (mantidos pelo id).
 */

const FLAG_V2 = 1 << 15;
const LOGO_ARQUIVO = /^logo\.(png|jpe?g|webp)$/i;
const EMOJI_LOGO = /<a?:pmerj_logo_[0-9a-f]+:\d{17,20}>/g;
/** O Discord aceita ~5 edições a cada 5 s por canal. */
const PAUSA_EDICAO_MS = 1_200;
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Nome do arquivo no fim de uma URL da CDN (sem a query de assinatura). */
const nomeNaUrl = (url: string) => {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
  } catch {
    return "";
  }
};

/**
 * Componentes como o Discord devolve → como precisam ser reenviados:
 * mídias dos próprios anexos voltam a ser `attachment://nome`; o emoji antigo vira o atual.
 */
export function reescrever(componentes: unknown[], anexos: MensagemCanal["attachments"], emojiNovo: string | null, nomeLogoNovo: string) {
  let mudou = false;
  const porNome = new Map(anexos.map((a) => [a.filename, a]));
  const visitar = (n: unknown): unknown => {
    if (Array.isArray(n)) return n.map(visitar);
    if (!n || typeof n !== "object") return n;
    const o = { ...(n as Record<string, unknown>) };
    if (typeof o.content === "string") {
      const novo = o.content.replace(EMOJI_LOGO, () => emojiNovo ?? "");
      if (novo !== o.content) {
        o.content = novo;
        mudou = true;
      }
    }
    const media = o.media as { url?: string } | undefined;
    if (media && typeof media.url === "string") {
      const nome = nomeNaUrl(media.url);
      if (LOGO_ARQUIVO.test(nome)) {
        o.media = { url: `attachment://${nomeLogoNovo}` };
        mudou = true;
      } else if (porNome.has(nome)) {
        o.media = { url: `attachment://${nome}` }; // foto/vídeo do próprio post: continua o mesmo anexo
      } else {
        o.media = { url: media.url };
      }
    }
    for (const k of ["components", "component", "accessory", "items"]) if (o[k]) o[k] = visitar(o[k]);
    return o;
  };
  return { componentes: visitar(componentes) as unknown[], mudou };
}

export interface ResultadoMensagens {
  canais: number;
  atualizadas: number;
  falhas: number;
}

let rodando: Promise<ResultadoMensagens> | null = null;

/** Varre os canais e atualiza a logo das mensagens antigas do bot. Uma varredura por vez. */
export function atualizarMensagensAntigas(): Promise<ResultadoMensagens> {
  if (rodando) return rodando;
  rodando = (async () => {
    const res: ResultadoMensagens = { canais: 0, atualizadas: 0, falhas: 0 };
    const eu = await idDoBot();
    const logo = logoDiscord();
    if (!eu || !logo) return res;
    const emoji = emojiLogo();
    const canais = (await listTextChannels()).filter((c) => c.tipo === "texto" || c.tipo === "anuncios");

    for (const canal of canais) {
      res.canais++;
      const msgs = await listMessages(canal.id, 100);
      for (const m of msgs) {
        if (m.author.id !== eu || !((m.flags ?? 0) & FLAG_V2) || !m.components?.length) continue;
        const temLogo = m.attachments.some((a) => LOGO_ARQUIVO.test(a.filename));
        const { componentes, mudou } = reescrever(m.components, m.attachments, emoji, logo.nomeArquivo);
        if (!mudou && !temLogo) continue;

        // Fica tudo o que não é a logo; a logo atual vai como arquivo novo.
        const manter = m.attachments.filter((a) => !LOGO_ARQUIVO.test(a.filename)).map((a) => ({ id: a.id }));
        const ok = await editMessage(canal.id, m.id, { components: componentes, attachments: manter }, temLogo ? [{ nome: logo.nomeArquivo, dados: logo.dados, tipo: logo.tipo }] : undefined);
        if (ok) res.atualizadas++;
        else res.falhas++;
        await esperar(PAUSA_EDICAO_MS);
      }
    }
    console.info(`[branding] logo trocada em ${res.atualizadas} mensagem(ns) antiga(s) (${res.canais} canais${res.falhas ? `, ${res.falhas} falha(s)` : ""}).`);
    return res;
  })().finally(() => (rodando = null));
  return rodando;
}
