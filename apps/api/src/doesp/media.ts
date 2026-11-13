import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { open } from "node:fs/promises";
import path from "node:path";
import type { Arquivo } from "../discord/bot.js";
import { arquivos } from "../lib/armazenamento.js";
import type { Midia } from "./store.js";
import { comprimirVideo, lerVideo, MAX_ORIGEM_BYTES, MAX_VIDEO_SEGUNDOS, pastaTrabalho, VideoError } from "./video.js";

/**
 * Fotos e vídeos da DOESP, guardados em "doesp/<id do requerimento>/<id da mídia>" — no banco
 * (GridFS) em produção, em apps/api/data/ no desenvolvimento. O Discord só recebe cópias anexadas às mensagens, então tudo pode ser
 * publicado de novo depois de um restart ou falha.
 *
 * Segurança: o servidor só baixa arquivos da CDN do Discord (anexos enviados no canal).
 * Qualquer outro link (YouTube, Drive…) vira botão — nunca é buscado pelo servidor.
 */

/** 10 = o que cabe numa galeria do Discord; links viram botões (5 por linha). */
export const LIMITES_MIDIA = { files: 10, links: 5, linksText: 1500 };

export class MidiaError extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const mb = (b: number) => `${Math.round((b / 1_048_576) * 10) / 10} MB`;

/** Chave no armazenamento: "doesp/<dono>/<mídia>" (GridFS no banco, ou apps/api/data em dev). */
function chave(donoId: string, midiaId?: string, pasta: PastaMidia = "doesp") {
  if (!UUID.test(donoId) || (midiaId !== undefined && !UUID.test(midiaId))) throw new MidiaError("Identificador inválido.");
  return midiaId ? `${pasta}/${donoId}/${midiaId}` : `${pasta}/${donoId}`;
}

/** Módulos que guardam fotos/vídeos com este código (cada um na sua pasta). */
export type PastaMidia = "doesp" | "ocorrencia" | "comunicado";

/** Tipo real pelos bytes (o declarado é ignorado). */
export function detectarMidia(b: Buffer): { kind: Midia["kind"]; contentType: string; ext: string } | null {
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { kind: "image", contentType: "image/png", ext: "png" };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { kind: "image", contentType: "image/jpeg", ext: "jpg" };
  if (b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP") return { kind: "image", contentType: "image/webp", ext: "webp" };
  if (b.subarray(0, 4).toString("ascii") === "GIF8") return { kind: "image", contentType: "image/gif", ext: "gif" };
  if (b.subarray(4, 8).toString("ascii") === "ftyp") {
    return b.subarray(8, 12).toString("ascii") === "qt  " ? { kind: "video", contentType: "video/quicktime", ext: "mov" } : { kind: "video", contentType: "video/mp4", ext: "mp4" };
  }
  if (b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return { kind: "video", contentType: "video/webm", ext: "webm" };
  return null;
}

/** Bytes de uma mídia (para o site mostrar). */
export const lerMidia = (donoId: string, midiaId: string, pasta?: PastaMidia) => arquivos.ler(chave(donoId, midiaId, pasta));

async function salvar(donoId: string, m: Midia, dados: Buffer, pasta?: PastaMidia) {
  await arquivos.salvar(chave(donoId, m.id, pasta), dados, m.contentType);
}

/** Apaga arquivos de um requerimento/rascunho (só `ids`, se informado). */
export async function apagarMidias(donoId: string, ids?: string[], pasta?: PastaMidia) {
  if (!ids) return void (await arquivos.apagarPasta(chave(donoId, undefined, pasta)).catch(() => undefined));
  await Promise.all(ids.map((id) => arquivos.apagar(chave(donoId, id, pasta)).catch(() => undefined)));
}

/** Os arquivos como anexos ("midia-1.mp4"…), na ordem dada. */
export async function arquivosMidia(donoId: string, lista: Midia[], pasta?: PastaMidia): Promise<Arquivo[]> {
  return Promise.all(
    lista.map(async (m) => {
      const dados = await arquivos.ler(chave(donoId, m.id, pasta));
      if (!dados) throw new MidiaError(`O arquivo ${m.name} não está mais salvo.`);
      return { nome: m.name, dados, tipo: m.contentType };
    }),
  );
}

/** Agrupa os arquivos para cada mensagem caber no limite de envio do servidor. */
export function lotesMidia(lista: Midia[], limite: number): Midia[][] {
  const lotes: Midia[][] = [];
  let atual: Midia[] = [];
  let total = 0;
  for (const m of lista) {
    if (m.size > limite) throw new MidiaError(`${m.name} tem ${mb(m.size)}; o limite de envio do servidor agora é ${mb(limite)}.`);
    if (atual.length && (total + m.size > limite || atual.length >= LIMITES_MIDIA.files)) {
      lotes.push(atual);
      atual = [];
      total = 0;
    }
    atual.push(m);
    total += m.size;
  }
  if (atual.length) lotes.push(atual);
  return lotes;
}

/* ---------- Download (só CDN do Discord) ---------- */

const HOSTS_DISCORD = new Set(["cdn.discordapp.com", "media.discordapp.net"]);
function urlDiscord(u: string): URL | null {
  try {
    const url = new URL(u);
    return url.protocol === "https:" && HOSTS_DISCORD.has(url.hostname) ? url : null;
  } catch {
    return null;
  }
}

class GrandeDemais extends Error {}

/** Baixa até `max` bytes para a memória. */
async function baixar(url: URL, max: number): Promise<Buffer> {
  const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(120_000) });
  if (!res.ok || !res.body) throw new MidiaError("Não consegui baixar o arquivo. Envie de novo.");
  if (Number(res.headers.get("content-length") ?? 0) > max) throw new GrandeDemais();
  const partes: Buffer[] = [];
  let total = 0;
  for await (const c of res.body as unknown as AsyncIterable<Uint8Array>) {
    total += c.length;
    if (total > max) throw new GrandeDemais();
    partes.push(Buffer.from(c));
  }
  return Buffer.concat(partes);
}

/** Baixa para o disco (vídeos grandes que serão comprimidos). */
async function baixarParaDisco(url: URL, destino: string, max: number) {
  const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(10 * 60_000) });
  if (!res.ok || !res.body) throw new MidiaError("Não consegui baixar o arquivo. Envie de novo.");
  if (Number(res.headers.get("content-length") ?? 0) > max) throw new GrandeDemais();
  const out = createWriteStream(destino);
  let total = 0;
  try {
    for await (const c of res.body as unknown as AsyncIterable<Uint8Array>) {
      total += c.length;
      if (total > max) throw new GrandeDemais();
      if (!out.write(c)) await new Promise((r) => out.once("drain", r));
    }
  } finally {
    await new Promise((r) => out.end(r));
  }
}

/** Vídeo maior que o limite: salvo em disco, conferido (vídeo, até 4 min) e comprimido. */
async function encolher(url: URL, rotulo: string, limite: number): Promise<Buffer> {
  const w = await pastaTrabalho();
  try {
    const origem = path.join(w.dir, "origem");
    await baixarParaDisco(url, origem, MAX_ORIGEM_BYTES).catch((err: unknown) => {
      throw err instanceof GrandeDemais ? new MidiaError(`${rotulo} passa de ${mb(MAX_ORIGEM_BYTES)}.`) : err;
    });
    const cab = Buffer.alloc(16);
    const fh = await open(origem, "r");
    await fh.read(cab, 0, 16, 0).finally(() => fh.close());
    if (detectarMidia(cab)?.kind !== "video") {
      throw new MidiaError(`${rotulo} passa de ${mb(limite)}, o limite do bot neste servidor. Imagens precisam ser menores; vídeos de até 4 minutos são comprimidos.`);
    }
    const { segundos, fps } = await lerVideo(origem);
    if (segundos > MAX_VIDEO_SEGUNDOS + 1) {
      const dur = `${Math.floor(segundos / 60)}min${String(Math.round(segundos % 60)).padStart(2, "0")}s`;
      throw new MidiaError(`${rotulo} tem ${dur}; por upload o limite é de 4 minutos. Para vídeos maiores, cole o link (YouTube não listado ou Drive).`);
    }
    return await comprimirVideo(origem, limite, segundos, fps);
  } catch (err) {
    throw err instanceof VideoError ? new MidiaError(`${rotulo}: ${err.message}`) : err;
  } finally {
    await w.fim();
  }
}

export interface Upload {
  url: string;
  size: number;
}

/** Links http(s) do texto, sem repetição. */
export const linksNoTexto = (texto: string) => [...new Set(texto.slice(0, LIMITES_MIDIA.linksText).match(/https?:\/\/[^\s<>]+/gi) ?? [])].map((l) => l.replace(/[).,;!?]+$/, ""));

/**
 * Baixa os anexos (e links diretos da CDN do Discord) e guarda sob `donoId`.
 * Páginas (YouTube, Drive…) ficam como link. `files`/`linkCount`: quantos o rascunho já tem.
 */
export async function coletarMidias(input: { donoId: string; uploads: Upload[]; links: string[]; limite: number; files: number; linkCount: number; aoComprimir?: () => Promise<unknown>; pasta?: PastaMidia }) {
  const { donoId, uploads, limite, pasta } = input;
  if (uploads.length + input.links.length > LIMITES_MIDIA.files + LIMITES_MIDIA.links) throw new MidiaError(`Muitos anexos: até ${LIMITES_MIDIA.files} arquivos e ${LIMITES_MIDIA.links} links.`);

  const media: Midia[] = [];
  const links: string[] = [];

  const guardar = async (dados: Buffer, rotulo: string) => {
    const tipo = detectarMidia(dados);
    if (!tipo) throw new MidiaError(`${rotulo}: formato não suportado. Imagens PNG, JPG, WEBP ou GIF; vídeos MP4, MOV ou WEBM.`);
    if (input.files + media.length >= LIMITES_MIDIA.files) throw new MidiaError(`No máximo ${LIMITES_MIDIA.files} fotos e vídeos. Use "Limpar mídias" para recomeçar.`);
    const m: Midia = { id: randomUUID(), kind: tipo.kind, name: `midia-${input.files + media.length + 1}.${tipo.ext}`, contentType: tipo.contentType, size: dados.length };
    await salvar(donoId, m, dados, pasta);
    media.push(m);
  };

  try {
    // Os que cabem são baixados juntos; guardados na ordem.
    const baixados = uploads.map((u) => {
      const url = urlDiscord(u.url);
      if (!url || u.size > limite) return null;
      const p = baixar(url, limite);
      p.catch(() => undefined);
      return p;
    });

    for (const [i, u] of uploads.entries()) {
      const rotulo = `Arquivo ${i + 1}`;
      const url = urlDiscord(u.url);
      if (!url) continue;
      const comprimir = async () => {
        await input.aoComprimir?.().catch(() => undefined);
        return encolher(url, rotulo, limite);
      };
      if (u.size > limite) {
        await guardar(await comprimir(), rotulo);
        continue;
      }
      const dados = await baixados[i]!.catch((err: unknown) => {
        if (err instanceof GrandeDemais) return null;
        throw err instanceof MidiaError ? err : new MidiaError(`${rotulo}: não consegui baixar o arquivo. Envie de novo.`);
      });
      await guardar(dados ?? (await comprimir()), rotulo);
    }

    for (const link of input.links) {
      const url = urlDiscord(link);
      const dados = url && input.files + media.length < LIMITES_MIDIA.files ? await baixar(url, limite).catch(() => null) : null;
      if (dados && detectarMidia(dados)) await guardar(dados, link);
      else links.push(link);
    }
  } catch (err) {
    await apagarMidias(donoId, media.map((m) => m.id), pasta);
    throw err;
  }

  if (input.linkCount + links.length > LIMITES_MIDIA.links) {
    await apagarMidias(donoId, media.map((m) => m.id), pasta);
    throw new MidiaError(`No máximo ${LIMITES_MIDIA.links} links que não sejam arquivo direto (YouTube, Drive...).`);
  }
  return { media, links };
}
