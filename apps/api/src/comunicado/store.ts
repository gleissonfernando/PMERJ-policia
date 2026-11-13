import { randomUUID } from "node:crypto";
import type { Midia } from "../doesp/store.js";
import { jsonFile } from "../lib/jsonFile.js";

/**
 * Documento "comunicado" (MongoDB, coleção dados) — Comunicados de Operação.
 * Painel "Gerar comunicado" → canal temporário (dados da operação em 2 formulários, canal de destino,
 * cargos a mencionar, fotos/vídeos como mensagem, prévia) → Publicar: painel V2 no canal escolhido.
 * Fotos/vídeos em "comunicado/<id>/<mídia>" (GridFS) — ver doesp/media.ts.
 */

export type { Midia };

export const LIMITES = {
  operacao: 100,
  data: 40,
  hora: 30,
  local: 150,
  efetivo: 300,
  objetivos: 1000,
  emprego: 1000,
  mencoes: 5,
};

export interface ComunicadoConfig {
  painelCanalId: string | null;
  painelMensagemId: string | null;
  categoriaId: string | null;
  /** Quem gera e publica (vazio = só administradores). */
  cargosPublicar: string[];
  /** Veem os canais temporários e o histórico no painel web. */
  cargosGestores: string[];
  painelErro: string | null;
  atualizadoEm: number;
  atualizadoPor: string | null;
}

/** Tudo o que a pessoa digita nos dois formulários (nada é preenchido pelo sistema). */
export interface Campos {
  operacao?: string;
  data?: string;
  horaApresentacao?: string;
  horaInicio?: string;
  localApresentacao?: string;
  localOperacao?: string;
  efetivo?: string;
  objetivos?: string;
  emprego?: string;
}

export interface Pessoa {
  id: string;
  nome: string;
  avatar: string | null;
}

export type StatusRascunho = "OPEN" | "SENDING" | "SENT" | "CANCELLED";

export interface Rascunho {
  id: string;
  autor: Pessoa;
  canalId: string | null;
  painelMensagemId: string | null;
  painelMidiaChave: string | null;
  ocupadoDesde: number | null;
  campos: Campos;
  destinoCanalId: string | null;
  cargosMencao: string[];
  midias: Midia[];
  status: StatusRascunho;
  aviso: string | null;
  fecharEm: number | null;
  criadoEm: number;
  atualizadoEm: number;
}

export interface Comunicado {
  /** Mesmo id do rascunho (as mídias já estão no lugar). */
  id: string;
  numero: number;
  ano: number;
  campos: Required<Campos>;
  autor: Pessoa;
  destinoCanalId: string;
  cargosMencao: string[];
  midias: Midia[];
  mensagemIds: string[];
  em: number;
}

interface Dados {
  versao: 1;
  config: ComunicadoConfig;
  registros: Comunicado[];
  rascunhos: Rascunho[];
}

export const DEFAULT_COMUNICADO: ComunicadoConfig = {
  painelCanalId: null,
  painelMensagemId: null,
  categoriaId: null,
  cargosPublicar: [],
  cargosGestores: [],
  painelErro: null,
  atualizadoEm: 0,
  atualizadoPor: null,
};

export const RASCUNHO_TTL_MS = 6 * 60 * 60 * 1000;
const HISTORICO = 2_000;

const db = jsonFile<Dados>(
  "comunicado",
  () => ({ versao: 1, config: structuredClone(DEFAULT_COMUNICADO), registros: [], rascunhos: [] }),
  (raw) => ({
    versao: 1,
    config: { ...structuredClone(DEFAULT_COMUNICADO), ...raw.config },
    registros: Array.isArray(raw.registros) ? raw.registros : [],
    rascunhos: Array.isArray(raw.rascunhos) ? raw.rascunhos : [],
  }),
);

const anoBR = (ms: number) => Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric" }).format(ms));

/** "Nº 01/2026" (como no modelo do comunicado). */
export const numeroComunicado = (c: Pick<Comunicado, "numero" | "ano">) => `Nº ${String(c.numero).padStart(2, "0")}/${c.ano}`;

export const comunicadoStore = {
  config: () => db.get().config,
  async saveConfig(patch: Partial<ComunicadoConfig>) {
    const d = db.get();
    d.config = { ...d.config, ...patch };
    await db.save();
    return d.config;
  },

  registros: () => db.get().registros,
  registro: (id: string) => db.get().registros.find((r) => r.id === id),
  contar: (desde: number) => db.get().registros.filter((r) => r.em >= desde).length,
  /** O próximo número do ano (só para a prévia; o definitivo é reservado ao publicar). */
  proximoNumero(): Pick<Comunicado, "numero" | "ano"> {
    const ano = anoBR(Date.now());
    return { ano, numero: db.get().registros.filter((r) => r.ano === ano).reduce((m, r) => Math.max(m, r.numero), 0) + 1 };
  },

  criarRegistro(input: Omit<Comunicado, "numero" | "ano" | "em" | "mensagemIds">): Comunicado {
    const d = db.get();
    const { numero, ano } = comunicadoStore.proximoNumero();
    const c: Comunicado = { ...input, numero, ano, mensagemIds: [], em: Date.now() };
    d.registros.push(c);
    if (d.registros.length > HISTORICO) d.registros.splice(0, d.registros.length - HISTORICO);
    void db.save();
    return c;
  },
  atualizarRegistro(id: string, patch: Partial<Comunicado>) {
    const c = db.get().registros.find((r) => r.id === id);
    if (c) Object.assign(c, patch);
    void db.save();
    return c;
  },
  descartarRegistro(id: string) {
    const d = db.get();
    d.registros = d.registros.filter((r) => r.id !== id);
    void db.save();
  },

  rascunhos: () => db.get().rascunhos,
  rascunho: (id: string) => db.get().rascunhos.find((x) => x.id === id),
  rascunhoDoCanal: (canalId: string) => db.get().rascunhos.find((x) => x.canalId === canalId && x.status === "OPEN"),
  abertoDe: (autorId: string) => db.get().rascunhos.find((x) => x.autor.id === autorId && (x.status === "OPEN" || x.status === "SENDING")),
  criarRascunho(autor: Pessoa): Rascunho {
    const d = db.get();
    const agora = Date.now();
    const r: Rascunho = {
      id: randomUUID(),
      autor,
      canalId: null,
      painelMensagemId: null,
      painelMidiaChave: null,
      ocupadoDesde: null,
      campos: {},
      destinoCanalId: null,
      cargosMencao: [],
      midias: [],
      status: "OPEN",
      aviso: null,
      fecharEm: null,
      criadoEm: agora,
      atualizadoEm: agora,
    };
    d.rascunhos.push(r);
    const fechados = d.rascunhos.filter((x) => (x.status === "SENT" || x.status === "CANCELLED") && x.fecharEm === null);
    if (fechados.length > 200) {
      const sair = new Set(fechados.slice(0, fechados.length - 200).map((x) => x.id));
      d.rascunhos = d.rascunhos.filter((x) => !sair.has(x.id));
    }
    void db.save();
    return r;
  },
  atualizarRascunho(id: string, patch: Partial<Rascunho>, de: StatusRascunho[] | null = ["OPEN"]): Rascunho | null {
    const r = db.get().rascunhos.find((x) => x.id === id);
    if (!r || (de && !de.includes(r.status))) return null;
    Object.assign(r, patch, { atualizadoEm: Date.now() });
    void db.save();
    return r;
  },
};
