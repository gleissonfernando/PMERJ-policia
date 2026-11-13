import { appendFile, stat, writeFile } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Registro de falhas na conversa com o Discord: apps/api/data/discord-erros.log
 * (interação recusada, resposta atrasada, erro no tratamento). Não grava tokens.
 * Limitado a ~256 KB: ao passar disso, recomeça do zero.
 */
const DIR = fileURLToPath(new URL("../../data/", import.meta.url));
const ARQUIVO = `${DIR}discord-erros.log`;
const MAX_BYTES = 256 * 1024;

let fila: Promise<void> = Promise.resolve();

export function diagLog(linha: string): void {
  const texto = `${new Date().toISOString()} ${linha.replace(/\s+/g, " ").slice(0, 2000)}\n`;
  fila = fila
    .then(async () => {
      mkdirSync(DIR, { recursive: true });
      const tam = await stat(ARQUIVO).then((s) => s.size, () => 0);
      if (tam > MAX_BYTES) await writeFile(ARQUIVO, "", { mode: 0o600 });
      await appendFile(ARQUIVO, texto, { mode: 0o600 });
    })
    .catch(() => {});
}

/** Quanto tempo se passou desde que o Discord criou a interação (o ID carrega a data). */
export function idadeInteracao(interactionId: string): number {
  try {
    return Date.now() - (Number(BigInt(interactionId) >> 22n) + 1_420_070_400_000);
  } catch {
    return -1;
  }
}
