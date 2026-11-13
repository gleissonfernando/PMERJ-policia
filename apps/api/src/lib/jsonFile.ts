import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { documentoCarregado, salvarDocumento, usandoBanco } from "./armazenamento.js";

/**
 * Dados de um módulo (set, ponto, doesp…), sempre em memória e gravados a cada mudança.
 *  - Com MONGODB_URI: documento "<nome>" na coleção "dados" do MongoDB (carregado antes da API subir).
 *    Se ainda não existir no banco, importa apps/api/data/<nome>.json (primeira subida).
 *  - Sem banco: apps/api/data/<nome>.json, escrita atômica (.tmp + rename).
 * Gravações enfileiradas; arquivo/documento corrompido → a API para em vez de sobrescrever.
 */
const DATA_DIR = fileURLToPath(new URL("../../data/", import.meta.url));

export function jsonFile<T>(name: string, initial: () => T, migrate: (raw: Partial<T>) => T = (r) => r as T) {
  const file = `${DATA_DIR}${name}.json`;
  const ler = (texto: string, origem: string): T => {
    try {
      return migrate(JSON.parse(texto) as Partial<T>);
    } catch (err) {
      console.error(`[dados] ${origem} está corrompido. Corrija ou remova.`, err);
      process.exit(1);
    }
  };

  let data: T;
  let importar = false;
  const doBanco = usandoBanco ? documentoCarregado(name) : undefined;
  if (doBanco !== undefined) {
    data = ler(doBanco, `documento "${name}" do banco`);
  } else if (existsSync(file)) {
    data = ler(readFileSync(file, "utf8"), file);
    importar = usandoBanco; // primeira subida com o banco: leva o arquivo local para lá
  } else {
    data = initial();
  }

  let queue: Promise<void> = Promise.resolve();
  function save(): Promise<void> {
    const snapshot = JSON.stringify(data, null, usandoBanco ? 0 : 2);
    queue = queue
      .then(async () => {
        if (usandoBanco) return salvarDocumento(name, snapshot);
        mkdirSync(DATA_DIR, { recursive: true });
        const tmp = `${file}.tmp`;
        await writeFile(tmp, snapshot, { encoding: "utf8", mode: 0o600 });
        await rename(tmp, file);
      })
      .catch((err: unknown) => console.error(`[dados] falha ao salvar ${name}:`, err));
    return queue;
  }

  if (importar) void save().then(() => console.info(`[dados] ${name}.json importado para o banco.`));

  return { get: () => data, save };
}
