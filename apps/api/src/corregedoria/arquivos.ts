import { arquivos } from "../lib/armazenamento.js";
import type { Anexo } from "./store.js";

/**
 * Provas e anexos dos tickets: baixados do CDN do Discord e guardados no servidor
 * (os links do Discord expiram; o transcript precisa deles para sempre).
 *   - só o CDN oficial, sem redirecionamento
 *   - tipo conferido pelos BYTES (imagem ou vídeo), não pelo nome
 *   - nome do arquivo gerado por nós (sem caminho vindo do usuário)
 */

/** Guardados em "corregedoria/<ticket>/<arquivo>" (GridFS no banco, ou apps/api/data em dev). */
const HOSTS = new Set(["cdn.discordapp.com", "media.discordapp.net"]);
/** Limite por arquivo (o mesmo de envio do Discord sem Nitro). */
export const ARQUIVO_MAX_BYTES = 10 * 1024 * 1024;

type Tipo = "image/png" | "image/jpeg" | "image/webp" | "image/gif" | "video/mp4" | "video/quicktime" | "video/webm";
const EXT: Record<Tipo, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

function detectar(b: Buffer): Tipo | null {
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (b.length >= 6 && /^GIF8[79]a$/.test(b.toString("ascii", 0, 6))) return "image/gif";
  if (b.length >= 4 && b.readUInt32BE(0) === 0x1a45dfa3) return "video/webm";
  if (b.length >= 12 && b.toString("ascii", 4, 8) === "ftyp") return b.toString("ascii", 8, 10) === "qt" ? "video/quicktime" : "video/mp4";
  return null;
}

export const ehVideo = (tipo: string) => tipo.startsWith("video/");

export type Baixado = { ok: true; anexo: Anexo; dados: Buffer } | { ok: false; erro: string };

/** Baixa um anexo do Discord e guarda no ticket. `n` numera os arquivos. */
export async function baixarAnexo(ticketId: string, n: number, att: { url: string; size: number; filename: string }): Promise<Baixado> {
  if (att.size > ARQUIVO_MAX_BYTES) return { ok: false, erro: `“${att.filename.slice(0, 40)}” passa de 10 MB.` };
  let url: URL;
  try {
    url = new URL(att.url);
  } catch {
    return { ok: false, erro: "Arquivo inválido." };
  }
  if (url.protocol !== "https:" || !HOSTS.has(url.hostname)) return { ok: false, erro: "Arquivo inválido." };
  try {
    const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return { ok: false, erro: `Não foi possível baixar “${att.filename.slice(0, 40)}”.` };
    const dados = Buffer.from(await res.arrayBuffer());
    if (dados.length > ARQUIVO_MAX_BYTES) return { ok: false, erro: `“${att.filename.slice(0, 40)}” passa de 10 MB.` };
    const tipo = detectar(dados);
    if (!tipo) return { ok: false, erro: `“${att.filename.slice(0, 40)}” não é imagem nem vídeo (PNG, JPG, WEBP, GIF, MP4, MOV ou WEBM).` };
    const arquivo = `${String(n).padStart(3, "0")}.${EXT[tipo]}`;
    await arquivos.salvar(`corregedoria/${ticketId}/${arquivo}`, dados, tipo);
    const nome = att.filename.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 80) || arquivo;
    return { ok: true, anexo: { arquivo, nome, tipo, bytes: dados.length }, dados };
  } catch (err) {
    console.warn("[corregedoria] falha ao baixar anexo:", err instanceof Error ? err.message : err);
    return { ok: false, erro: `Não foi possível baixar “${att.filename.slice(0, 40)}”.` };
  }
}

/** Lê um arquivo do ticket (para o transcript). Nome validado: nada de "../". */
export async function lerAnexo(ticketId: string, arquivo: string): Promise<Buffer | null> {
  if (!/^[0-9a-f-]{36}$/.test(ticketId) || !/^\d{3}\.(png|jpg|webp|gif|mp4|mov|webm)$/.test(arquivo)) return null;
  return arquivos.ler(`corregedoria/${ticketId}/${arquivo}`);
}

export const TIPO_POR_EXT: Record<string, string> = Object.fromEntries(Object.entries(EXT).map(([t, e]) => [e, t]));
