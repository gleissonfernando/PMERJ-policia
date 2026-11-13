import { jsonFile } from "../lib/jsonFile.js";
import type { Assuncao, AssuncaoData, AssuncaoRegistro, CampoId, RotuloCampo } from "./types.js";

/** Documento "assuncao" (MongoDB em produção; apps/api/data/assuncao.json sem banco). */
const HISTORY_LIMIT = 3_000;
export const MAX_ASSUNCOES = 10;
export const MAX_DEMAIS = 10;

export const CAMPOS_PADRAO: Record<CampoId, RotuloCampo> = {
  setor: { label: "SETOR", descricao: "Setor de patrulhamento da guarnição." },
  viatura: { label: "VIATURA / PREFIXO", descricao: "Prefixo da viatura. Ex.: 54-1234." },
  comandante: { label: "COMANDANTE (Sargento ou Oficial)", descricao: "Quem comanda a guarnição." },
  motopol: { label: "MOTOPOL (motorista da viatura)", descricao: "Policial que dirige a viatura." },
  demais: { label: "DEMAIS INTEGRANTES (03, 04, 05...)", descricao: "Os outros policiais da viatura. Deixe vazio se a guarnição for só de 2." },
};

export function novaAssuncao(id: string, nome = "Guarnição"): Assuncao {
  return {
    id,
    nome,
    emoji: "🚓",
    descricao: "Ao assumir o serviço, registre a guarnição: setor, viatura, comandante, motopol e demais integrantes.",
    cor: 0xe10600,
    ativa: true,
    cargosPermitidos: [],
    cargosComandante: [],
    canalResultadoId: null,
    setores: [],
    maxDemais: 4,
    mencionar: false,
    campos: structuredClone(CAMPOS_PADRAO),
    painel: null,
  };
}

const migrarAssuncao = (a: Partial<Assuncao> & { id: string }): Assuncao => {
  const base = novaAssuncao(a.id);
  return { ...base, ...a, campos: { ...base.campos, ...(a.campos ?? {}) } };
};

const db = jsonFile<AssuncaoData>(
  "assuncao",
  () => ({ versao: 1, assuncoes: [novaAssuncao("guarnicao")], registros: [], atualizadoEm: 0, atualizadoPor: null }),
  (raw) => ({
    versao: 1,
    assuncoes: Array.isArray(raw.assuncoes) ? raw.assuncoes.map(migrarAssuncao) : [novaAssuncao("guarnicao")],
    registros: Array.isArray(raw.registros) ? raw.registros : [],
    atualizadoEm: raw.atualizadoEm ?? 0,
    atualizadoPor: raw.atualizadoPor ?? null,
  }),
);

export const assuncaoStore = {
  lista: (): Assuncao[] => db.get().assuncoes,
  buscar: (id: string): Assuncao | undefined => db.get().assuncoes.find((a) => a.id === id),
  meta: () => ({ atualizadoEm: db.get().atualizadoEm, atualizadoPor: db.get().atualizadoPor }),

  async salvarLista(assuncoes: Assuncao[], por: string): Promise<void> {
    const d = db.get();
    d.assuncoes = assuncoes;
    d.atualizadoEm = Date.now();
    d.atualizadoPor = por;
    await db.save();
  },

  async definirPainel(id: string, painel: Assuncao["painel"]): Promise<void> {
    const a = db.get().assuncoes.find((x) => x.id === id);
    if (!a) return;
    a.painel = painel;
    await db.save();
  },

  /** Mais recentes primeiro. */
  recentes: (limit: number): AssuncaoRegistro[] => db.get().registros.slice(-limit).reverse(),

  contar(desde: number): number {
    return db.get().registros.filter((r) => r.em >= desde).length;
  },

  async add(r: AssuncaoRegistro): Promise<void> {
    const d = db.get();
    d.registros.push(r);
    if (d.registros.length > HISTORY_LIMIT) d.registros.splice(0, d.registros.length - HISTORY_LIMIT);
    await db.save();
  },
};
