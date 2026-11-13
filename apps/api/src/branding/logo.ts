import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { documentoCarregado, usandoBanco } from "../lib/armazenamento.js";
import { jsonFile } from "../lib/jsonFile.js";
import { centralizarEmQuadrado } from "./quadrado.js";

/**
 * Logo da corporação usada no site e nas mensagens do bot.
 *   padrão: apps/api/assets/brasao-pmerj.png (brasão da PMERJ)
 *   personalizada: documento "branding" (banco ou apps/api/data/branding.json), enviada pelo admin no painel.
 *   Versões antigas (apps/api/data/branding/logo.*) são importadas sozinhas.
 */

export type TipoImagem = "image/png" | "image/jpeg" | "image/webp";
const EXT: Record<TipoImagem, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

const PADRAO = fileURLToPath(new URL("../../assets/brasao-pmerj.png", import.meta.url));
const DIR = fileURLToPath(new URL("../../data/branding/", import.meta.url));
const META_ANTIGO = `${DIR}logo.json`;

interface Meta {
  tipo: TipoImagem;
  arquivo: string;
  atualizadoEm: number;
  atualizadoPor: string;
}

/** Logo personalizada salva (imagem em base64; até 2 MB). */
interface Personalizada {
  tipo: TipoImagem;
  base64: string;
  atualizadoEm: number;
  atualizadoPor: string;
}

/** Formato antigo em pasta: vira o documento novo uma única vez. */
interface DadosBranding {
  logo: Personalizada | null;
  /** Versão da logo já aplicada às mensagens antigas do bot (varredura feita uma vez por troca). */
  mensagensVersao?: string | null;
}

function importarAntiga(): DadosBranding {
  try {
    if (!existsSync(META_ANTIGO)) return { logo: null };
    const meta = JSON.parse(readFileSync(META_ANTIGO, "utf8")) as Meta;
    const dados = readFileSync(`${DIR}${meta.arquivo}`);
    return detectarTipo(dados) === meta.tipo ? { logo: { tipo: meta.tipo, base64: dados.toString("base64"), atualizadoEm: meta.atualizadoEm, atualizadoPor: meta.atualizadoPor } } : { logo: null };
  } catch {
    return { logo: null };
  }
}

const db = jsonFile<DadosBranding>("branding", importarAntiga, (raw) => ({ logo: raw.logo ?? null, mensagensVersao: raw.mensagensVersao ?? null }));

export const versaoNasMensagens = () => db.get().mensagensVersao ?? null;
export async function marcarVersaoNasMensagens(versao: string) {
  db.get().mensagensVersao = versao;
  await db.save();
}
// Primeira subida com o banco: a logo antiga (pasta) vai para lá.
if (usandoBanco && documentoCarregado("branding") === undefined && db.get().logo) void db.save();

export interface Logo {
  dados: Buffer;
  tipo: TipoImagem;
  /** Nome do anexo nas mensagens do Discord (attachment://...). */
  nomeArquivo: string;
  personalizada: boolean;
  /** Muda a cada troca: usado para o navegador não mostrar a versão antiga do cache. */
  versao: string;
  atualizadoEm: number | null;
  atualizadoPor: string | null;
}

/** Descobre o formato pelos primeiros bytes (não confia no Content-Type enviado). */
export function detectarTipo(buf: Buffer): TipoImagem | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

function carregar(): Logo | null {
  const p = db.get().logo;
  if (p) {
    const dados = Buffer.from(p.base64, "base64");
    if (detectarTipo(dados) === p.tipo) {
      return { dados, tipo: p.tipo, nomeArquivo: `logo.${EXT[p.tipo]}`, personalizada: true, versao: String(p.atualizadoEm), atualizadoEm: p.atualizadoEm, atualizadoPor: p.atualizadoPor };
    }
    console.warn("[branding] logo personalizada inválida; usando o brasão padrão.");
  }
  if (!existsSync(PADRAO)) return null;
  const dados = readFileSync(PADRAO);
  return {
    dados,
    tipo: "image/png",
    nomeArquivo: "logo.png",
    personalizada: false,
    // Muda quando o arquivo padrão é trocado: o navegador não fica preso no brasão antigo (cache de 1 ano).
    versao: `padrao-${createHash("sha1").update(dados).digest("hex").slice(0, 10)}`,
    atualizadoEm: null,
    atualizadoPor: null,
  };
}

let atual = carregar();
if (!atual) console.warn(`[branding] brasão padrão não encontrado em ${PADRAO}.`);

const ouvintes: Array<() => void> = [];
/** Avisa quem depende da logo (ex.: atualizar o painel publicado no Discord). */
export const onLogoAlterada = (fn: () => void) => ouvintes.push(fn);
const avisar = () => ouvintes.forEach((fn) => setTimeout(fn, 0));

export const logoAtual = (): Logo | null => atual;

/** Resultado de "atualizar todos os painéis": um item por módulo. */
export type RelatorioPaineis = Array<{ painel: string; ok: boolean }>;
let atualizador: ((forcarMensagens?: boolean) => Promise<RelatorioPaineis>) | null = null;
/** O index.ts registra aqui a rotina que conhece todos os módulos (evita importação circular). */
export const registrarAtualizadorPaineis = (fn: (forcarMensagens?: boolean) => Promise<RelatorioPaineis>) => void (atualizador = fn);
/** Emoji novo do rodapé + todos os painéis publicados, em sequência. */
export const atualizarTodosPaineis = (forcarMensagens = false): Promise<RelatorioPaineis> => (atualizador ? atualizador(forcarMensagens) : Promise.resolve([]));

/**
 * Versão da logo para as mensagens do bot: quadrada, com margens transparentes.
 * O Discord recorta toda miniatura em quadrado — assim o brasão aparece inteiro.
 * Calculada uma vez por versão da logo; se não der para processar, usa a original.
 */
let discordCache: { versao: string; logo: Logo } | null = null;
export function logoDiscord(): Logo | null {
  if (!atual) return null;
  if (discordCache?.versao === atual.versao) return discordCache.logo;
  const quadrada = atual.tipo === "image/png" ? centralizarEmQuadrado(atual.dados) : null;
  const logo: Logo = quadrada ? { ...atual, dados: quadrada, tipo: "image/png", nomeArquivo: "logo.png" } : atual;
  discordCache = { versao: atual.versao, logo };
  return logo;
}

export async function salvarLogo(dados: Buffer, por: string): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (dados.length === 0) return { ok: false, erro: "arquivo_vazio" };
  if (dados.length > LOGO_MAX_BYTES) return { ok: false, erro: "arquivo_grande" };
  const tipo = detectarTipo(dados);
  if (!tipo) return { ok: false, erro: "formato_invalido" };

  db.get().logo = { tipo, base64: dados.toString("base64"), atualizadoEm: Date.now(), atualizadoPor: por };
  await db.save();
  atual = carregar();
  avisar();
  return { ok: true };
}

export function restaurarPadrao(): void {
  db.get().logo = null;
  void db.save();
  atual = carregar();
  avisar();
}
