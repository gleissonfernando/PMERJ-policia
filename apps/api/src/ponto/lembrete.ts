import { emojiLogo } from "../branding/emoji.js";
import { assuncaoStore } from "../assuncao/store.js";
import { FLAG_COMPONENTS_V2, sendDM } from "../discord/bot.js";
import { env } from "../env.js";
import { pontoStore } from "./store.js";

/**
 * Ponto fechado → DM lembrando de fazer a assunção de serviço.
 * Painel V2 com um botão de link para CADA painel de assunção publicado (até 5), que leva
 * direto à mensagem do painel no canal da assunção.
 */

const COR = 0x1e40af;

export function destinosAssuncao() {
  return assuncaoStore
    .lista()
    .filter((a) => a.ativa && a.painel)
    .slice(0, 5)
    .map((a) => ({ id: a.id, nome: a.nome, emoji: a.emoji, url: `https://discord.com/channels/${env.DISCORD_GUILD_ID}/${a.painel!.canalId}/${a.painel!.mensagemId}`, canalId: a.painel!.canalId }));
}

/** Botão de link: o emoji só vai se for um emoji simples (os personalizados exigem id). */
const emojiBotao = (e: string) => (e && !/[<>:]/.test(e) && [...e].length <= 4 ? { emoji: { name: e } } : {});

export async function lembrarAssuncao(userId: string): Promise<boolean> {
  if (!pontoStore.config().lembreteAssuncao) return false;
  const destinos = destinosAssuncao();
  if (destinos.length === 0) return false; // sem painel publicado não há para onde mandar
  const logo = emojiLogo();
  return sendDM(userId, {
    flags: FLAG_COMPONENTS_V2,
    allowed_mentions: { parse: [] },
    components: [
      {
        type: 17,
        accent_color: COR,
        components: [
          { type: 10, content: "### 🚓 Lembrete: assunção de serviço" },
          {
            type: 10,
            content: `Seu ponto foi encerrado. Não esqueça de realizar a **assunção de serviço** no canal ${destinos.length === 1 ? `<#${destinos[0]!.canalId}>` : "da sua equipe"}.`,
          },
          {
            type: 1,
            components: destinos.map((d) => ({
              type: 2,
              style: 5,
              label: (destinos.length === 1 ? "Ir para a assunção de serviço" : `Assunção · ${d.nome}`).slice(0, 80),
              url: d.url,
              ...emojiBotao(d.emoji),
            })),
          },
          { type: 10, content: `-# ${logo ? `${logo} ` : ""}PMERJ · Bate-ponto` },
        ],
      },
    ],
  });
}
