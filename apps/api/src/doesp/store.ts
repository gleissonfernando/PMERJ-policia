import { randomUUID } from "node:crypto";
import { jsonFile } from "../lib/jsonFile.js";

/**
 * apps/api/data/doesp.json — Requerimento ao Comando (P/2 → Comandante → 1ª Companhia → resultados).
 * Igual ao sistema do BOPE: o requerimento é preenchido num canal temporário (rascunho) e, ao enviar,
 * sai no canal dos requerimentos; os resultados saem no canal dos resultados com as mídias abaixo.
 * Arquivos (fotos/vídeos) em apps/api/data/doesp/<id>/ — ver media.ts.
 */

export type StatusRequerimento = "AGUARDANDO" | "DEFERIDO" | "EM_EXECUCAO" | "CONCLUIDO" | "INDEFERIDO";
export type StatusMidia = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "RETRYING";

export const LIMITES = { fact: 300, subject: 250, information: 400, area: 120, period: 100, doesp: 120, team: 300, result: 800, reason: 400 };

export interface Pessoa {
  id: string;
  name: string;
}

export interface Midia {
  id: string;
  kind: "image" | "video";
  /** Nome do anexo no Discord: midia-1.jpg, midia-2.mp4… */
  name: string;
  contentType: string;
  size: number;
}

export interface DoespConfig {
  /** Onde fica o painel "Novo requerimento". */
  panelChannelId: string | null;
  panelMessageId: string | null;
  /** Onde cada requerimento é publicado (canal restrito: assunto de inteligência). */
  requestsChannelId: string | null;
  /** Onde saem os resultados com as imagens/vídeos (vazio = canal dos requerimentos). */
  resultsChannelId: string | null;
  /** Categoria dos canais temporários de preenchimento. */
  draftCategoryId: string | null;
  /** Chefes de Seção (P/2): abrem requerimentos. */
  requesterRoleIds: string[];
  /** Comandante: despacha ou indefere (é marcado em cada requerimento). */
  commanderRoleIds: string[];
  /** Comando da 1ª Companhia: designa o DOESP e encaminha os resultados. */
  companyRoleIds: string[];
  /** Gestores: veem a página e os canais temporários. */
  managerRoleIds: string[];
  panelError: string | null;
  updatedAt: number;
}

export interface Requerimento {
  id: string;
  number: number;
  year: number;
  status: StatusRequerimento;
  requester: Pessoa;
  fact: string;
  subject: string;
  information: string;
  area: string;
  period: string;
  channelId: string | null;
  messageId: string | null;
  dispatchedBy: Pessoa | null;
  dispatchedAt: number | null;
  refusedReason: string | null;
  doesp: string | null;
  team: string | null;
  assignedPeriod: string | null;
  assignedBy: Pessoa | null;
  assignedAt: number | null;
  result: string | null;
  resultBy: Pessoa | null;
  resultAt: number | null;
  /** Fotos e vídeos anexados na abertura (só aparecem no canal dos resultados). */
  media: Midia[];
  /** Links que não são arquivo direto (YouTube, Drive…): viram botões. */
  requestLinks: string[];
  mediaStatus: StatusMidia | null;
  mediaError: string | null;
  resultChannelId: string | null;
  resultMessageId: string | null;
  mediaMessageIds: string[];
  createdAt: number;
  updatedAt: number;
}

export type StatusRascunho = "OPEN" | "SENDING" | "SENT" | "CANCELLED";

export interface CamposRascunho {
  fact?: string;
  subject?: string;
  information?: string;
  area?: string;
  period?: string;
}

/** Requerimento sendo preenchido no canal temporário. Ao enviar, vira o requerimento (mesmo id). */
export interface Rascunho {
  id: string;
  author: Pessoa;
  channelId: string | null;
  panelMessageId: string | null;
  /** Ids dos arquivos já anexados ao painel: igual = edita sem reenviar. */
  panelMediaKey: string | null;
  /** Upload em processamento (download/compressão) desde; null = livre. */
  mediaBusyAt: number | null;
  fields: CamposRascunho;
  media: Midia[];
  links: string[];
  status: StatusRascunho;
  notice: string | null;
  /** Quando apagar o canal (após enviar/cancelar). */
  channelCloseAt: number | null;
  createdAt: number;
  updatedAt: number;
}

interface Dados {
  versao: 1;
  config: DoespConfig;
  requests: Requerimento[];
  drafts: Rascunho[];
}

export const DEFAULT_DOESP: DoespConfig = {
  panelChannelId: null,
  panelMessageId: null,
  requestsChannelId: null,
  resultsChannelId: null,
  draftCategoryId: null,
  requesterRoleIds: [],
  commanderRoleIds: [],
  companyRoleIds: [],
  managerRoleIds: [],
  panelError: null,
  updatedAt: 0,
};

/** Rascunho aberto há mais que isso é cancelado e o canal apagado. */
export const DRAFT_TTL_MS = 6 * 60 * 60 * 1000;

const db = jsonFile<Dados>(
  "doesp",
  () => ({ versao: 1, config: structuredClone(DEFAULT_DOESP), requests: [], drafts: [] }),
  (raw) => ({
    versao: 1,
    config: { ...structuredClone(DEFAULT_DOESP), ...raw.config },
    requests: Array.isArray(raw.requests) ? raw.requests : [],
    drafts: Array.isArray(raw.drafts) ? raw.drafts : [],
  }),
);

const anoBR = (ms: number) => Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric" }).format(ms));

/** "Nº 007/2026 - P/2" */
export const numeroRequerimento = (r: Pick<Requerimento, "number" | "year">) => `Nº ${String(r.number).padStart(3, "0")}/${r.year} - P/2`;

export const doespStore = {
  config: () => db.get().config,
  async updateConfig(patch: Partial<DoespConfig>) {
    const d = db.get();
    d.config = { ...d.config, ...patch, updatedAt: Date.now() };
    await db.save();
    return d.config;
  },

  requests: () => db.get().requests,
  get: (id: string) => db.get().requests.find((r) => r.id === id),

  /** Numerado por ano: Nº 001/2026, Nº 002/2026… */
  create(input: Pick<Requerimento, "id" | "requester" | "fact" | "subject" | "information" | "area" | "period" | "media" | "requestLinks" | "mediaStatus">): Requerimento {
    const d = db.get();
    const agora = Date.now();
    const year = anoBR(agora);
    const number = d.requests.filter((r) => r.year === year).reduce((m, r) => Math.max(m, r.number), 0) + 1;
    const r: Requerimento = {
      ...input,
      number,
      year,
      status: "AGUARDANDO",
      channelId: null,
      messageId: null,
      dispatchedBy: null,
      dispatchedAt: null,
      refusedReason: null,
      doesp: null,
      team: null,
      assignedPeriod: null,
      assignedBy: null,
      assignedAt: null,
      result: null,
      resultBy: null,
      resultAt: null,
      mediaError: null,
      resultChannelId: null,
      resultMessageId: null,
      mediaMessageIds: [],
      createdAt: agora,
      updatedAt: agora,
    };
    d.requests.push(r);
    void db.save();
    return r;
  },

  update(id: string, patch: Partial<Requerimento>): Requerimento | undefined {
    const r = db.get().requests.find((x) => x.id === id);
    if (r) Object.assign(r, patch, { updatedAt: Date.now() });
    void db.save();
    return r;
  },

  /** Muda o status só se ainda estiver em `from` (dois cliques ao mesmo tempo nunca ganham os dois). Síncrono. */
  move(id: string, from: StatusRequerimento[], patch: Partial<Requerimento> & { status: StatusRequerimento }): Requerimento | null {
    const r = db.get().requests.find((x) => x.id === id);
    if (!r || !from.includes(r.status)) return null;
    Object.assign(r, patch, { updatedAt: Date.now() });
    void db.save();
    return r;
  },

  drafts: () => db.get().drafts,
  draft: (id: string) => db.get().drafts.find((x) => x.id === id),
  draftByChannel: (channelId: string) => db.get().drafts.find((x) => x.channelId === channelId && x.status === "OPEN"),
  openDraftOf: (authorId: string) => db.get().drafts.find((x) => x.author.id === authorId && (x.status === "OPEN" || x.status === "SENDING")),
  createDraft(author: Pessoa): Rascunho {
    const d = db.get();
    const agora = Date.now();
    const r: Rascunho = { id: randomUUID(), author, channelId: null, panelMessageId: null, panelMediaKey: null, mediaBusyAt: null, fields: {}, media: [], links: [], status: "OPEN", notice: null, channelCloseAt: null, createdAt: agora, updatedAt: agora };
    d.drafts.push(r);
    // Mantém só os últimos 500 encerrados.
    const fechados = d.drafts.filter((x) => (x.status === "SENT" || x.status === "CANCELLED") && x.channelCloseAt === null);
    if (fechados.length > 500) {
      const sair = new Set(fechados.slice(0, fechados.length - 500).map((x) => x.id));
      d.drafts = d.drafts.filter((x) => !sair.has(x.id));
    }
    void db.save();
    return r;
  },
  /** Atualiza só enquanto o status for um de `from` (padrão: OPEN). Síncrono. */
  updateDraft(id: string, patch: Partial<Rascunho>, from: StatusRascunho[] | null = ["OPEN"]): Rascunho | null {
    const r = db.get().drafts.find((x) => x.id === id);
    if (!r || (from && !from.includes(r.status))) return null;
    Object.assign(r, patch, { updatedAt: Date.now() });
    void db.save();
    return r;
  },

  salvar: () => db.save(),
};
