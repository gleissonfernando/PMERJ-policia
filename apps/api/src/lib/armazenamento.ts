import { existsSync, readdirSync, statSync } from "node:fs";
import { mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GridFSBucket, MongoClient, type Db } from "mongodb";
import { env } from "../env.js";

/**
 * Onde a API guarda os dados.
 *  - Com MONGODB_URI (produção, banco da Discloud): tudo no MongoDB —
 *      coleção "dados": um documento por módulo (set, ponto, doesp…), JSON em texto
 *      GridFS "arquivos": fotos, vídeos e provas (doesp/…, corregedoria/…)
 *  - Sem MONGODB_URI (desenvolvimento): arquivos em apps/api/data/, como sempre.
 * Na primeira vez com o banco, o que existir em apps/api/data/ é importado sozinho.
 */

export const usandoBanco = Boolean(env.MONGODB_URI);
const DATA_DIR = fileURLToPath(new URL("../../data/", import.meta.url));

let db: Db | null = null;
let bucket: GridFSBucket | null = null;
const documentos = new Map<string, string>();

/** Nome do banco pela URI (…/pmerj?…); sem nome, "PMERJ". */
function nomeDoBanco(uri: string) {
  const semEsquema = uri.replace(/^mongodb(?:\+srv)?:\/\//i, "");
  const antesQuery = semEsquema.split("?")[0] ?? "";
  const barra = antesQuery.indexOf("/");
  const nome = barra >= 0 ? decodeURIComponent(antesQuery.slice(barra + 1).trim()) : "";
  return nome || "PMERJ";
}

/** Conecta, carrega os documentos e importa os dados locais. Chamado uma vez, antes da API subir. */
export async function prepararArmazenamento(): Promise<void> {
  if (!usandoBanco) {
    console.info("[dados] sem MONGODB_URI: usando arquivos em apps/api/data (somente desenvolvimento).");
    return;
  }
  const client = new MongoClient(env.MONGODB_URI!, { serverSelectionTimeoutMS: 10_000, appName: "pmerj-painel" });
  try {
    await client.connect();
  } catch (err) {
    const e = (err ?? {}) as { name?: string; code?: unknown };
    console.error(`[dados] não conectou ao MongoDB (${e.name ?? "erro"}${e.code ? ` ${String(e.code)}` : ""}). Confira MONGODB_URI e o IP liberado no banco.`);
    process.exit(1);
  }
  db = client.db(nomeDoBanco(env.MONGODB_URI!));
  bucket = new GridFSBucket(db, { bucketName: "arquivos" });
  console.info(`[dados] MongoDB conectado · banco ${db.databaseName}`);

  for (const doc of await db.collection<{ _id: string; json: string }>("dados").find({}).toArray()) documentos.set(doc._id, doc.json);
  await importarArquivosLocais();

  const fechar = () => void client.close().catch(() => undefined);
  process.once("beforeExit", fechar);
}

/* ---------- Documentos JSON (um por módulo) ---------- */

/** Documento já carregado do banco (texto JSON) ou undefined se ainda não existe lá. */
export const documentoCarregado = (nome: string) => documentos.get(nome);

const LIMITE_DOC = 15 * 1024 * 1024;
export async function salvarDocumento(nome: string, json: string): Promise<void> {
  if (!db) throw new Error("banco não conectado");
  if (json.length > LIMITE_DOC) console.error(`[dados] ${nome} está com ${(json.length / 1_048_576).toFixed(1)} MB — perto do limite de 16 MB do MongoDB.`);
  await db.collection<{ _id: string; json: string; atualizadoEm: Date }>("dados").replaceOne({ _id: nome }, { json, atualizadoEm: new Date() }, { upsert: true });
  documentos.set(nome, json);
}

/* ---------- Arquivos (fotos, vídeos, provas) ---------- */

/** Chave = caminho relativo, ex.: "doesp/<id>/<midia>" ou "corregedoria/<ticket>/001.jpg". Sem "..". */
const CHAVE = /^[a-z0-9-]+(?:\/[A-Za-z0-9._-]+)+$/;
function validar(chave: string) {
  if (!CHAVE.test(chave) || chave.includes("..")) throw new Error(`chave de arquivo inválida: ${chave}`);
  return chave;
}
const caminhoLocal = (chave: string) => path.join(DATA_DIR, ...validar(chave).split("/"));
const escaparRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const arquivos = {
  async salvar(chave: string, dados: Buffer, tipo = "application/octet-stream"): Promise<void> {
    validar(chave);
    if (!bucket) {
      const p = caminhoLocal(chave);
      await mkdir(path.dirname(p), { recursive: true });
      await writeFile(p, dados, { mode: 0o600 });
      return;
    }
    await this.apagar(chave); // substitui, nunca duplica
    const b = bucket;
    await new Promise<void>((resolve, reject) => b.openUploadStream(chave, { metadata: { tipo } }).once("finish", () => resolve()).once("error", reject).end(dados));
  },

  async ler(chave: string): Promise<Buffer | null> {
    validar(chave);
    if (!bucket) {
      const p = caminhoLocal(chave);
      return existsSync(p) ? readFile(p) : null;
    }
    const [f] = await bucket.find({ filename: chave }).sort({ uploadDate: -1 }).limit(1).toArray();
    if (!f) return null;
    const partes: Buffer[] = [];
    for await (const c of bucket.openDownloadStream(f._id)) partes.push(c as Buffer);
    return Buffer.concat(partes);
  },

  async existe(chave: string): Promise<boolean> {
    validar(chave);
    if (!bucket) return existsSync(caminhoLocal(chave));
    return (await bucket.find({ filename: chave }).limit(1).toArray()).length > 0;
  },

  async apagar(chave: string): Promise<void> {
    validar(chave);
    if (!bucket) return void (await unlink(caminhoLocal(chave)).catch(() => undefined));
    const b = bucket;
    for (const f of await b.find({ filename: chave }).toArray()) await b.delete(f._id).catch(() => undefined);
  },

  /** Apaga tudo que começa com "prefixo/" (ex.: todos os arquivos de um requerimento). */
  async apagarPasta(prefixo: string): Promise<void> {
    const p = prefixo.replace(/\/+$/, "");
    if (!/^[a-z0-9-]+(?:\/[A-Za-z0-9._-]+)*$/.test(p) || p.includes("..")) throw new Error(`pasta inválida: ${prefixo}`);
    if (!bucket) return void (await rm(path.join(DATA_DIR, ...p.split("/")), { recursive: true, force: true }).catch(() => undefined));
    const b = bucket;
    for (const f of await b.find({ filename: { $regex: `^${escaparRegex(p)}/` } }).toArray()) await b.delete(f._id).catch(() => undefined);
  },
};

/* ---------- Importação única de apps/api/data/ para o banco ---------- */

/** Pastas de arquivos que passam para o GridFS (os JSON são importados pelo jsonFile). */
const PASTAS = ["doesp", "corregedoria"];

async function importarArquivosLocais() {
  if (!bucket) return;
  let total = 0;
  for (const pasta of PASTAS) {
    const raiz = path.join(DATA_DIR, pasta);
    if (!existsSync(raiz)) continue;
    const andar = async (dir: string, rel: string) => {
      for (const nome of readdirSync(dir)) {
        const abs = path.join(dir, nome);
        const chave = `${rel}/${nome}`;
        if (statSync(abs).isDirectory()) await andar(abs, chave);
        else if (CHAVE.test(chave) && !(await arquivos.existe(chave))) {
          await arquivos.salvar(chave, await readFile(abs));
          total++;
        }
      }
    };
    await andar(raiz, pasta);
  }
  if (total) console.info(`[dados] ${total} arquivo(s) de apps/api/data importados para o banco.`);
}
