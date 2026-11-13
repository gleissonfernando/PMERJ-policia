import { randomUUID } from "node:crypto";
import { jsonFile } from "../lib/jsonFile.js";

/**
 * Documento "arsenal" (MongoDB, coleção dados) — Retirada de Baú (controle de armas).
 *  Retirar: a pessoa escolhe a arma e digita o prefixo/série → a série fica com ela.
 *  Devolver: a série deixa de ficar com ela (volta a ficar livre).
 *  Perda: a série fica marcada como perdida (ninguém retira).
 *  Recuperar: a série perdida volta ao sistema (livre para retirar).
 */

export const LIMITES = { armas: 25, armaNome: 60, serie: 40, motivo: 300, porPessoa: 10 };

export interface Arma {
  id: string;
  nome: string;
  emoji: string;
}

export interface ArsenalConfig {
  painelCanalId: string | null;
  painelMensagemId: string | null;
  /** Onde saem as retiradas e devoluções. */
  canalRetiradasId: string | null;
  /** Onde saem as perdas e recuperações. */
  canalPerdasId: string | null;
  armas: Arma[];
  /** Quem usa o painel (vazio = qualquer membro). */
  cargosUsar: string[];
  /** Recuperam qualquer arma perdida e veem o controle no painel web. */
  cargosGestao: string[];
  painelErro: string | null;
  atualizadoEm: number;
  atualizadoPor: string | null;
}

export interface Pessoa {
  id: string;
  /** Nome que a pessoa tem no servidor (apelido) no momento da ação. */
  nome: string;
}

export type StatusItem = "retirada" | "perdida" | "livre";

/** Uma arma física: modelo + série. A chave é "<armaId>:<SÉRIE>". */
export interface Item {
  chave: string;
  armaId: string;
  armaNome: string;
  serie: string;
  status: StatusItem;
  /** Com quem está (retirada) ou quem perdeu (perdida). */
  pessoa: Pessoa | null;
  desde: number;
}

export type TipoMovimento = "retirada" | "devolucao" | "perda" | "recuperacao";

export interface Movimento {
  id: string;
  tipo: TipoMovimento;
  chave: string;
  armaNome: string;
  serie: string;
  pessoa: Pessoa;
  /** Perda/recuperação: quem estava com a arma, se for outra pessoa. */
  relacionado: Pessoa | null;
  motivo: string | null;
  /** Feito pelo painel web (e não pelo Discord). */
  web: boolean;
  canalId: string | null;
  mensagemId: string | null;
  em: number;
}

interface Dados {
  versao: 1;
  config: ArsenalConfig;
  itens: Record<string, Item>;
  movimentos: Movimento[];
}

const ARMAS_PADRAO: Arma[] = [
  { id: "pistola", nome: "Pistola", emoji: "🔫" },
  { id: "fuzil", nome: "Fuzil", emoji: "🪖" },
  { id: "submetralhadora", nome: "Submetralhadora", emoji: "💥" },
  { id: "espingarda", nome: "Espingarda", emoji: "🎯" },
];

export const DEFAULT_ARSENAL: ArsenalConfig = {
  painelCanalId: null,
  painelMensagemId: null,
  canalRetiradasId: null,
  canalPerdasId: null,
  armas: ARMAS_PADRAO,
  cargosUsar: [],
  cargosGestao: [],
  painelErro: null,
  atualizadoEm: 0,
  atualizadoPor: null,
};

const HISTORICO = 5_000;

const db = jsonFile<Dados>(
  "arsenal",
  () => ({ versao: 1, config: structuredClone(DEFAULT_ARSENAL), itens: {}, movimentos: [] }),
  (raw) => ({
    versao: 1,
    config: { ...structuredClone(DEFAULT_ARSENAL), ...raw.config },
    itens: raw.itens && typeof raw.itens === "object" ? raw.itens : {},
    movimentos: Array.isArray(raw.movimentos) ? raw.movimentos : [],
  }),
);

/** Série como a pessoa digitou, só padronizada: maiúsculas e espaços simples (para achar a mesma arma depois). */
export const normalizarSerie = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim().toUpperCase();
export const chaveItem = (armaId: string, serie: string) => `${armaId}:${normalizarSerie(serie)}`;

export const arsenalStore = {
  config: () => db.get().config,
  async saveConfig(patch: Partial<ArsenalConfig>) {
    const d = db.get();
    d.config = { ...d.config, ...patch };
    await db.save();
    return d.config;
  },

  item: (chave: string) => db.get().itens[chave],
  itens: () => Object.values(db.get().itens),
  comPessoa: (userId: string) => Object.values(db.get().itens).filter((i) => i.status === "retirada" && i.pessoa?.id === userId),
  perdidas: () => Object.values(db.get().itens).filter((i) => i.status === "perdida"),
  movimentos: () => db.get().movimentos,

  /**
   * Muda o estado de uma arma e registra o movimento, de uma vez e sem esperar nada (síncrono):
   * dois cliques ao mesmo tempo nunca retiram a mesma série duas vezes.
   */
  aplicar(item: Item, mov: Omit<Movimento, "id" | "em" | "canalId" | "mensagemId" | "chave" | "armaNome" | "serie">): Movimento {
    const d = db.get();
    const em = Date.now();
    d.itens[item.chave] = { ...item, desde: em };
    const m: Movimento = { ...mov, id: randomUUID(), chave: item.chave, armaNome: item.armaNome, serie: item.serie, canalId: null, mensagemId: null, em };
    d.movimentos.push(m);
    if (d.movimentos.length > HISTORICO) d.movimentos.splice(0, d.movimentos.length - HISTORICO);
    void db.save();
    return m;
  },
  marcarPublicado(id: string, canalId: string, mensagemId: string) {
    const m = db.get().movimentos.find((x) => x.id === id);
    if (m) Object.assign(m, { canalId, mensagemId });
    void db.save();
  },
};
