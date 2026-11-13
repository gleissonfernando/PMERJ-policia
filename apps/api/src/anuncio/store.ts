import { jsonFile } from "../lib/jsonFile.js";
import type { AnuncioConfig, AnuncioData, AnuncioRegistro } from "./types.js";

/** apps/api/data/anuncio.json — trocar por Postgres quando o banco entrar no projeto. */
const HISTORY_LIMIT = 2_000;

export const DEFAULT_ANUNCIO_CONFIG: AnuncioConfig = {
  cargosPermitidos: [],
  rodape: "PMERJ · Polícia Militar do Estado do Rio de Janeiro",
  mostrarAutor: true,
  cor: 0xe10600,
  logCanalId: null,
  painel: null,
  atualizadoEm: 0,
  atualizadoPor: null,
};

const db = jsonFile<AnuncioData>(
  "anuncio",
  () => ({ versao: 1, config: structuredClone(DEFAULT_ANUNCIO_CONFIG), registros: [] }),
  (raw) => ({
    versao: 1,
    config: { ...structuredClone(DEFAULT_ANUNCIO_CONFIG), ...raw.config },
    registros: Array.isArray(raw.registros) ? raw.registros : [],
  }),
);

export const anuncioStore = {
  config: (): AnuncioConfig => db.get().config,

  async saveConfig(config: AnuncioConfig): Promise<void> {
    db.get().config = config;
    await db.save();
  },

  /** Mais recentes primeiro. */
  recentes: (limit: number): AnuncioRegistro[] => db.get().registros.slice(-limit).reverse(),

  contar(desde: number): number {
    return db.get().registros.filter((r) => r.em >= desde).length;
  },

  async add(r: AnuncioRegistro): Promise<void> {
    const d = db.get();
    d.registros.push(r);
    if (d.registros.length > HISTORY_LIMIT) d.registros.splice(0, d.registros.length - HISTORY_LIMIT);
    await db.save();
  },
};
