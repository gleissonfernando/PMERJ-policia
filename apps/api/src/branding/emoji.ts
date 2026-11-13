import { createHash } from "node:crypto";
import { createAppEmoji, deleteAppEmoji, listAppEmojis } from "../discord/bot.js";
import { logoDiscord } from "./logo.js";

/**
 * A logo também vira um EMOJI do bot, para aparecer pequena e à ESQUERDA no rodapé
 * (como o ícone do rodapé de um embed). Miniatura de Section fica sempre à direita e grande.
 *
 * Nome = pmerj_logo_<hash da imagem>: trocar a logo cria um emoji novo e apaga os antigos.
 * Emojis do bot (application emojis) funcionam em qualquer servidor, sem ocupar vaga do servidor.
 */
const PREFIXO = "pmerj_logo_";
const EMOJI_MAX_BYTES = 256 * 1024;

let atual: string | null = null;
let rodando: Promise<void> | null = null;

/** Emoji pronto para usar no texto (`<:nome:id>`), ou null se ainda não existe. */
export const emojiLogo = (): string | null => atual;

async function sincronizar(): Promise<void> {
  const logo = logoDiscord();
  if (!logo || logo.dados.length > EMOJI_MAX_BYTES) {
    atual = null;
    return;
  }
  const nome = `${PREFIXO}${createHash("sha1").update(logo.dados).digest("hex").slice(0, 10)}`;
  const lista = await listAppEmojis();
  if (!lista) return; // bot desligado ou Discord fora: tenta de novo na próxima troca/reinício

  let emoji = lista.find((e) => e.name === nome) ?? null;
  if (!emoji) emoji = await createAppEmoji(nome, logo.dados, logo.tipo);
  if (!emoji) {
    atual = null;
    return;
  }
  atual = `<:${emoji.name}:${emoji.id}>`;
  // Logos antigas.
  for (const e of lista) if (e.name.startsWith(PREFIXO) && e.id !== emoji.id) await deleteAppEmoji(e.id);
  console.info(`[branding] emoji da logo pronto (${emoji.name})`);
}

export function sincronizarEmojiLogo(): Promise<void> {
  rodando = (rodando ?? Promise.resolve()).then(sincronizar).catch((err: unknown) => {
    console.warn("[branding] falha ao sincronizar o emoji da logo:", err instanceof Error ? err.message : err);
  });
  return rodando;
}
