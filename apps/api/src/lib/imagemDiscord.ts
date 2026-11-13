import type { Arquivo } from "../discord/bot.js";

/**
 * Imagem enviada num formulário do Discord (FileUpload): baixada do CDN e reenviada como
 * anexo da mensagem do bot (o link do upload expira). Só o CDN oficial, sem redirecionamento,
 * com limite de tamanho e tipo conferido pelos BYTES (não pelo nome do arquivo).
 */

const HOSTS_CDN = new Set(["cdn.discordapp.com", "media.discordapp.net"]);
type TipoImagem = "image/png" | "image/jpeg" | "image/webp" | "image/gif";
const EXT: Record<TipoImagem, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

export function detectarImagem(buf: Buffer): TipoImagem | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buf.length >= 6 && /^GIF8[79]a$/.test(buf.toString("ascii", 0, 6))) return "image/gif";
  return null;
}

export type ImagemBaixada = { ok: true; arquivo: Arquivo } | { ok: false; erro: string };

/** `nomeBase` sem extensão (ex.: "foto-1"); a extensão sai do tipo detectado. */
export async function baixarImagemDiscord(att: { url: string; size: number; filename: string }, nomeBase: string, maxBytes: number, origem: string): Promise<ImagemBaixada> {
  const nome = att.filename.slice(0, 40);
  const mb = (maxBytes / 1024 / 1024).toFixed(0);
  if (att.size > maxBytes) return { ok: false, erro: `“${nome}” passa de ${mb} MB.` };
  let url: URL;
  try {
    url = new URL(att.url);
  } catch {
    return { ok: false, erro: `Não foi possível ler “${nome}”.` };
  }
  if (url.protocol !== "https:" || !HOSTS_CDN.has(url.hostname)) return { ok: false, erro: `Não foi possível ler “${nome}”.` };
  try {
    const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return { ok: false, erro: `Não foi possível baixar “${nome}”. Envie de novo.` };
    if (Number(res.headers.get("content-length") ?? 0) > maxBytes) return { ok: false, erro: `“${nome}” passa de ${mb} MB.` };
    const dados = Buffer.from(await res.arrayBuffer());
    if (dados.length > maxBytes) return { ok: false, erro: `“${nome}” passa de ${mb} MB.` };
    const tipo = detectarImagem(dados);
    if (!tipo) return { ok: false, erro: `“${nome}” não é imagem. Envie PNG, JPG, WEBP ou GIF.` };
    return { ok: true, arquivo: { nome: `${nomeBase}.${EXT[tipo]}`, dados, tipo } };
  } catch (err) {
    console.warn(`[${origem}] falha ao baixar imagem:`, err instanceof Error ? err.message : err);
    return { ok: false, erro: `Não foi possível baixar “${nome}”. Envie de novo.` };
  }
}
