import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { availableParallelism, tmpdir } from "node:os";
import path from "node:path";

/**
 * Comprime um vídeo para caber no limite de envio do bot no servidor (10 MB no nível 1),
 * para tocar dentro do painel do Discord. Trabalha em disco; um vídeo por vez (poupa CPU e RAM).
 * Mesma regra do sistema do BOPE.
 */

/** Vídeo mais longo aceito para compressão: 4 minutos. */
export const MAX_VIDEO_SEGUNDOS = 4 * 60;
/** Maior arquivo que um membro pode mandar para comprimir. */
export const MAX_ORIGEM_BYTES = 1024 * 1024 * 1024;

export class VideoError extends Error {}

const ffmpegPath = ((): string => {
  try {
    const p = createRequire(import.meta.url)("ffmpeg-static") as string | null;
    if (p && existsSync(p)) return p;
  } catch {
    // Sem o pacote: usa o ffmpeg instalado no servidor.
  }
  return "ffmpeg";
})();

let fila: Promise<unknown> = Promise.resolve();
/** Uma compressão por vez; as outras esperam a vez. */
function umPorVez<T>(trabalho: () => Promise<T>): Promise<T> {
  const proximo = fila.then(trabalho, trabalho);
  fila = proximo.catch(() => undefined);
  return proximo;
}

function rodar(args: string[], timeoutMs: number) {
  return new Promise<{ code: number | null; stderr: string }>((resolve, reject) => {
    const filho = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    let stderr = "";
    const timer = setTimeout(() => filho.kill("SIGKILL"), timeoutMs);
    filho.stderr.on("data", (c: Buffer) => {
      stderr = (stderr + c.toString()).slice(-20_000);
    });
    filho.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(err.code === "ENOENT" ? new VideoError("O compressor de vídeo não está instalado no servidor.") : err);
    });
    filho.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stderr });
    });
  });
}

/** Duração em segundos e fps, lidos do relatório do ffmpeg. */
export async function lerVideo(arquivo: string) {
  const { stderr } = await rodar(["-hide_banner", "-i", arquivo], 60_000);
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  if (!m) throw new VideoError("Não consegui ler esse vídeo. Envie em MP4, MOV ou WEBM.");
  const fps = Number(/Video:.*?(\d+(?:\.\d+)?) fps/.exec(stderr)?.[1]);
  return { segundos: Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]), fps: Number.isFinite(fps) ? fps : null };
}

const threads = String(Math.min(4, Math.max(1, availableParallelism())));

/** Pasta de trabalho de uma compressão (apagada no fim). */
export async function pastaTrabalho() {
  const dir = path.join(tmpdir(), `doesp-video-${randomUUID()}`);
  await mkdir(dir, { recursive: true });
  return { dir, fim: () => rm(dir, { recursive: true, force: true }).catch(() => undefined) };
}

/**
 * MP4 (H.264 + AAC) de no máximo `limite` bytes. O bitrate sai da duração; se ainda passar,
 * tenta de novo com menos. Acima de 30 fps vira 30 (metade dos quadros) com preset "superfast".
 */
export function comprimirVideo(origem: string, limite: number, segundos: number, fps: number | null = null) {
  return umPorVez(async () => {
    const saida = `${origem}.out.mp4`;
    let kbps = Math.floor((limite * 0.92 * 8) / Math.max(segundos, 1) / 1000); // 8% de margem do contêiner

    for (let tentativa = 0; tentativa < 3; tentativa++) {
      const audio = kbps >= 700 ? 96 : kbps >= 300 ? 64 : 32;
      const video = Math.max(kbps - audio, 60);
      const altura = video >= 1500 ? 720 : video >= 700 ? 480 : video >= 300 ? 360 : 240;
      const { code } = await rodar(
        [
          "-hide_banner", "-y", "-i", origem,
          "-vf", `${fps && fps > 30.5 ? "fps=30," : ""}scale=-2:'min(${altura},ih)':flags=fast_bilinear`,
          "-c:v", "libx264", "-preset", "superfast",
          "-b:v", `${video}k`, "-maxrate", `${Math.round(video * 1.2)}k`, "-bufsize", `${video * 2}k`,
          "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", `${audio}k`, "-ac", "2",
          "-movflags", "+faststart", "-threads", threads, saida,
        ],
        10 * 60 * 1000,
      );
      if (code !== 0) throw new VideoError("Não consegui comprimir esse vídeo. Tente outro arquivo ou envie por link.");
      const { size } = await stat(saida);
      if (size <= limite) return readFile(saida);
      kbps = Math.floor(kbps * (limite / size) * 0.9);
    }
    throw new VideoError("Não consegui deixar o vídeo pequeno o bastante. Envie por link (YouTube, Drive...).");
  });
}
