import { jsonFile } from "../lib/jsonFile.js";
import type { CampoId, InteligenciaConfig, InteligenciaData, InteligenciaRegistro, RotuloCampo } from "./types.js";

/** Documento "inteligencia" (MongoDB em produção; apps/api/data/inteligencia.json sem banco). */
const HISTORY_LIMIT = 3_000;
export const MAX_POLICIAIS = 10;
export const MAX_FOTOS = 5;
export const MAX_LINKS = 5;

export const CAMPOS_PADRAO: Record<CampoId, RotuloCampo> = {
  quantidade: { label: "QUANTIDADE de policiais", descricao: "Quantos policiais participam da investigação." },
  policiais: { label: "POLICIAIS", descricao: "Selecione todos os policiais envolvidos." },
  objeto: { label: "OBJETO DA INVESTIGAÇÃO", descricao: "Comunidade ou organização investigada." },
  fotos: { label: "FOTOS (upload)", descricao: "Até 5 imagens. Se preferir, mande o link no campo abaixo." },
  link: { label: "LINK", descricao: "Link das fotos ou da investigação. Um por linha." },
};

export const DEFAULT_CONFIG: InteligenciaConfig = {
  nome: "Inteligência",
  emoji: "🕵️",
  descricao: "Registre a assunção de serviço da Inteligência: policiais envolvidos, objeto da investigação e as fotos (upload ou link).",
  cor: 0x111827,
  ativa: true,
  cargosPermitidos: [],
  canalResultadoId: null,
  objetos: [],
  maxPoliciais: 6,
  exigirFoto: true,
  mencionar: false,
  campos: structuredClone(CAMPOS_PADRAO),
  painel: null,
  atualizadoEm: 0,
  atualizadoPor: null,
};

const db = jsonFile<InteligenciaData>(
  "inteligencia",
  () => ({ versao: 1, config: structuredClone(DEFAULT_CONFIG), registros: [] }),
  (raw) => ({
    versao: 1,
    config: {
      ...structuredClone(DEFAULT_CONFIG),
      ...raw.config,
      campos: { ...structuredClone(CAMPOS_PADRAO), ...(raw.config?.campos ?? {}) },
    },
    registros: Array.isArray(raw.registros) ? raw.registros : [],
  }),
);

export const inteligenciaStore = {
  config: (): InteligenciaConfig => db.get().config,

  async saveConfig(config: InteligenciaConfig): Promise<void> {
    db.get().config = config;
    await db.save();
  },

  /** Mais recentes primeiro. */
  recentes: (limit: number): InteligenciaRegistro[] => db.get().registros.slice(-limit).reverse(),

  contar(desde: number): number {
    return db.get().registros.filter((r) => r.em >= desde).length;
  },

  async add(r: InteligenciaRegistro): Promise<void> {
    const d = db.get();
    d.registros.push(r);
    if (d.registros.length > HISTORY_LIMIT) d.registros.splice(0, d.registros.length - HISTORY_LIMIT);
    await db.save();
  },
};
