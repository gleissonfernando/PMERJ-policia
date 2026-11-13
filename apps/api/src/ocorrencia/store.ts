import { randomUUID } from "node:crypto";
import type { Midia } from "../doesp/store.js";
import { jsonFile } from "../lib/jsonFile.js";

/**
 * Documento "ocorrencia" (MongoDB, coleção dados) — Registro de Ocorrência.
 * Painel → modal com o tipo → canal temporário (relato · participantes · evidências como mensagem)
 * → Enviar: painel V2 completo, com as fotos, no canal das ocorrências.
 * Evidências guardadas em "ocorrencia/<id>/<mídia>" (GridFS) — ver doesp/media.ts.
 */

export type { Midia };

export const LIMITES = { local: 120, quando: 60, relato: 1500, apreensoes: 500, desfecho: 300, participantes: 15, tipos: 25, tipoNome: 80, tipoDescricao: 100, presos: 10, presoNome: 60, presoRg: 20 };

export interface TipoOcorrencia {
  id: string;
  nome: string;
  emoji: string;
  descricao: string;
}

export interface OcorrenciaConfig {
  /** Onde fica o painel "Registrar ocorrência". */
  painelCanalId: string | null;
  painelMensagemId: string | null;
  /** Onde cada ocorrência enviada é publicada (com as evidências). */
  destinoCanalId: string | null;
  /** Categoria dos canais temporários. */
  categoriaId: string | null;
  /** Quem registra (vazio = qualquer membro). */
  cargosRegistrar: string[];
  /** Veem os canais temporários e os registros no painel web. */
  cargosGestores: string[];
  tipos: TipoOcorrencia[];
  /** Canal (de logs) onde sai o resumo semanal das apreensões, toda segunda-feira. */
  canalResumoId: string | null;
  /** Semana do último resumo enviado (data da segunda-feira, AAAA-MM-DD). */
  ultimoResumo: string | null;
  painelErro: string | null;
  atualizadoEm: number;
  atualizadoPor: string | null;
}

export interface Pessoa {
  id: string;
  nome: string;
  avatar: string | null;
}

/** Pessoa presa na ocorrência. */
export interface Preso {
  id: string;
  nome: string;
  /** RG = ID na cidade. */
  rg: string;
  /** Discord do preso (opcional). */
  discordId: string | null;
}

export interface Relato {
  local?: string;
  quando?: string;
  relato?: string;
  apreensoes?: string;
  desfecho?: string;
}

export type StatusRascunho = "OPEN" | "SENDING" | "SENT" | "CANCELLED";

export interface Rascunho {
  id: string;
  tipo: Pick<TipoOcorrencia, "id" | "nome" | "emoji">;
  autor: Pessoa;
  canalId: string | null;
  painelMensagemId: string | null;
  /** Ids das evidências já anexadas ao painel: igual = edita sem reenviar os arquivos. */
  painelMidiaChave: string | null;
  /** Upload em processamento desde (null = livre): Enviar espera. */
  ocupadoDesde: number | null;
  relato: Relato;
  participantes: string[];
  /** "Houve preso?" — null = ainda não respondeu (obrigatório para enviar). */
  houvePreso: boolean | null;
  presos: Preso[];
  midias: Midia[];
  status: StatusRascunho;
  aviso: string | null;
  /** Quando apagar o canal (após enviar/cancelar). */
  fecharEm: number | null;
  criadoEm: number;
  atualizadoEm: number;
}

export interface Ocorrencia {
  /** Mesmo id do rascunho (as evidências já estão no lugar). */
  id: string;
  numero: number;
  ano: number;
  tipo: Pick<TipoOcorrencia, "id" | "nome" | "emoji">;
  autor: Pessoa;
  participantes: string[];
  local: string;
  quando: string;
  relato: string;
  apreensoes: string | null;
  desfecho: string | null;
  houvePreso: boolean;
  presos: Preso[];
  midias: Midia[];
  canalId: string;
  mensagemIds: string[];
  em: number;
}

interface Dados {
  versao: 1;
  config: OcorrenciaConfig;
  registros: Ocorrencia[];
  rascunhos: Rascunho[];
}

const TIPOS_PADRAO: TipoOcorrencia[] = [
  { id: "abordagem", nome: "Abordagem", emoji: "🚓", descricao: "Abordagem a pessoa ou veículo" },
  { id: "apreensao", nome: "Apreensão de drogas / armas", emoji: "📦", descricao: "Material ilícito apreendido" },
  { id: "prisao", nome: "Prisão em flagrante", emoji: "🔗", descricao: "Condução de suspeito à delegacia" },
  { id: "perseguicao", nome: "Perseguição / acompanhamento", emoji: "🚨", descricao: "Acompanhamento tático de veículo" },
  { id: "confronto", nome: "Confronto armado", emoji: "💥", descricao: "Troca de tiros ou agressão armada" },
  { id: "outros", nome: "Outros", emoji: "📋", descricao: "Ocorrência não listada" },
];

export const DEFAULT_OCORRENCIA: OcorrenciaConfig = {
  painelCanalId: null,
  painelMensagemId: null,
  destinoCanalId: null,
  categoriaId: null,
  cargosRegistrar: [],
  cargosGestores: [],
  tipos: TIPOS_PADRAO,
  canalResumoId: null,
  ultimoResumo: null,
  painelErro: null,
  atualizadoEm: 0,
  atualizadoPor: null,
};

/** Rascunho aberto há mais que isso é cancelado e o canal apagado. */
export const RASCUNHO_TTL_MS = 6 * 60 * 60 * 1000;
const HISTORICO = 3_000;

const db = jsonFile<Dados>(
  "ocorrencia",
  () => ({ versao: 1, config: structuredClone(DEFAULT_OCORRENCIA), registros: [], rascunhos: [] }),
  (raw) => ({
    versao: 1,
    config: { ...structuredClone(DEFAULT_OCORRENCIA), ...raw.config },
    registros: (Array.isArray(raw.registros) ? raw.registros : []).map((r) => ({ ...r, houvePreso: r.houvePreso ?? false, presos: r.presos ?? [] })),
    rascunhos: (Array.isArray(raw.rascunhos) ? raw.rascunhos : []).map((r) => ({ ...r, houvePreso: r.houvePreso ?? null, presos: r.presos ?? [] })),
  }),
);

const anoBR = (ms: number) => Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric" }).format(ms));

/** "Nº 007/2026" */
export const numeroOcorrencia = (o: Pick<Ocorrencia, "numero" | "ano">) => `Nº ${String(o.numero).padStart(3, "0")}/${o.ano}`;

export const ocorrenciaStore = {
  config: () => db.get().config,
  async saveConfig(patch: Partial<OcorrenciaConfig>) {
    const d = db.get();
    d.config = { ...d.config, ...patch };
    await db.save();
    return d.config;
  },

  registros: () => db.get().registros,
  registro: (id: string) => db.get().registros.find((r) => r.id === id),
  contar: (desde: number) => db.get().registros.filter((r) => r.em >= desde).length,

  /** Numerada por ano; síncrono (dois envios ao mesmo tempo nunca pegam o mesmo número). */
  criarRegistro(input: Omit<Ocorrencia, "numero" | "ano" | "em" | "mensagemIds">): Ocorrencia {
    const d = db.get();
    const em = Date.now();
    const ano = anoBR(em);
    const numero = d.registros.filter((r) => r.ano === ano).reduce((m, r) => Math.max(m, r.numero), 0) + 1;
    const o: Ocorrencia = { ...input, numero, ano, mensagemIds: [], em };
    d.registros.push(o);
    if (d.registros.length > HISTORICO) d.registros.splice(0, d.registros.length - HISTORICO);
    void db.save();
    return o;
  },
  atualizarRegistro(id: string, patch: Partial<Ocorrencia>) {
    const o = db.get().registros.find((r) => r.id === id);
    if (o) Object.assign(o, patch);
    void db.save();
    return o;
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
  criarRascunho(autor: Pessoa, tipo: TipoOcorrencia): Rascunho {
    const d = db.get();
    const agora = Date.now();
    const r: Rascunho = {
      id: randomUUID(),
      tipo: { id: tipo.id, nome: tipo.nome, emoji: tipo.emoji },
      autor,
      canalId: null,
      painelMensagemId: null,
      painelMidiaChave: null,
      ocupadoDesde: null,
      relato: {},
      participantes: [],
      houvePreso: null,
      presos: [],
      midias: [],
      status: "OPEN",
      aviso: null,
      fecharEm: null,
      criadoEm: agora,
      atualizadoEm: agora,
    };
    d.rascunhos.push(r);
    // Encerrados e com o canal já apagado não servem mais: guarda só os últimos 200.
    const fechados = d.rascunhos.filter((x) => (x.status === "SENT" || x.status === "CANCELLED") && x.fecharEm === null);
    if (fechados.length > 200) {
      const sair = new Set(fechados.slice(0, fechados.length - 200).map((x) => x.id));
      d.rascunhos = d.rascunhos.filter((x) => !sair.has(x.id));
    }
    void db.save();
    return r;
  },
  /** Atualiza só se o status for um de `de` (padrão: OPEN). null = qualquer. Síncrono. */
  atualizarRascunho(id: string, patch: Partial<Rascunho>, de: StatusRascunho[] | null = ["OPEN"]): Rascunho | null {
    const r = db.get().rascunhos.find((x) => x.id === id);
    if (!r || (de && !de.includes(r.status))) return null;
    Object.assign(r, patch, { atualizadoEm: Date.now() });
    void db.save();
    return r;
  },
};
