import { randomUUID } from "node:crypto";
import { jsonFile } from "../lib/jsonFile.js";

/**
 * Documento "boletim" (MongoDB, coleção dados) — Boletim Interno.
 * A pessoa escreve no canal configurado (1ª linha = equipe, resto = relatório);
 * o bot apaga a mensagem e publica o boletim num painel Components V2 numerado.
 */

export const LIMITES = { equipeMin: 2, equipe: 80, relatorioMin: 10, relatorio: 3000, rodape: 100 };

export interface BoletimConfig {
  /** Canal onde as equipes escrevem e onde sai o painel. null = módulo desligado. */
  canalId: string | null;
  /** Só quem tem um destes cargos pode enviar (vazio = qualquer pessoa que escreve no canal). */
  cargosPermitidos: string[];
  cor: number;
  rodape: string;
  /** Relatório automático de tudo o que aconteceu no sistema (a cada X horas). */
  relatorio: RelatorioConfig;
  atualizadoEm: number;
  atualizadoPor: string | null;
}

export interface RelatorioConfig {
  ativo: boolean;
  /** Canal onde sai o relatório. */
  canalId: string | null;
  /** De quantas em quantas horas (alinhado ao relógio de Brasília: 00h, 02h, 04h…). */
  intervaloHoras: number;
  /** Não manda nada quando o período não teve movimentação. */
  pularVazio: boolean;
  /** Fim do último período relatado (ms). */
  ultimoFim: number | null;
  /** Cabeçalho: "41º BATALHÃO DE POLÍCIA MILITAR". */
  unidade: string;
  /** Sigla da unidade: "41º BPM". */
  sigla: string;
  /** Texto fixo do "Resumo do Batalhão". */
  resumoTexto: string;
  /** "Determinações do Comando" (ordens e avisos), repetidas em todo boletim até serem trocadas. */
  determinacoes: string;
  /** Assinatura no fim: "Comando do Batalhão". */
  assinatura: string;
  /** Numeração do Boletim Interno automático (Nº 007/2026), reinicia todo ano. */
  numero: number;
  ano: number;
}

export interface Boletim {
  id: string;
  numero: number;
  ano: number;
  equipe: string;
  relatorio: string;
  autor: { id: string; nome: string; avatar: string | null };
  canalId: string;
  mensagemId: string | null;
  em: number;
}

interface Dados {
  versao: 1;
  config: BoletimConfig;
  registros: Boletim[];
}

export const DEFAULT_BOLETIM: BoletimConfig = {
  canalId: null,
  cargosPermitidos: [],
  cor: 0x2b7fff,
  rodape: "Polícia Militar do Estado do Rio de Janeiro",
  relatorio: {
    ativo: false,
    canalId: null,
    intervaloHoras: 2,
    pularVazio: false,
    ultimoFim: null,
    unidade: "41º BATALHÃO DE POLÍCIA MILITAR",
    sigla: "41º BPM",
    resumoTexto: "No período, o 41º BPM realizou atividades de policiamento ostensivo, patrulhamento tático, apoio operacional e atendimento de ocorrências em sua área de atuação.",
    determinacoes: "",
    assinatura: "Comando do Batalhão",
    numero: 0,
    ano: 0,
  },
  atualizadoEm: 0,
  atualizadoPor: null,
};

const HISTORICO = 3_000;

const db = jsonFile<Dados>(
  "boletim",
  () => ({ versao: 1, config: structuredClone(DEFAULT_BOLETIM), registros: [] }),
  (raw) => ({
    versao: 1,
    config: { ...structuredClone(DEFAULT_BOLETIM), ...raw.config, relatorio: { ...DEFAULT_BOLETIM.relatorio, ...raw.config?.relatorio } },
    registros: Array.isArray(raw.registros) ? raw.registros : [],
  }),
);

const anoBR = (ms: number) => Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric" }).format(ms));

/** "Nº 007/2026" */
export const numeroBoletim = (b: Pick<Boletim, "numero" | "ano">) => `Nº ${String(b.numero).padStart(3, "0")}/${b.ano}`;

export const boletimStore = {
  config: () => db.get().config,
  async saveConfig(patch: Partial<BoletimConfig>) {
    const d = db.get();
    d.config = { ...d.config, ...patch };
    await db.save();
    return d.config;
  },

  /** Mais recentes primeiro. */
  recentes: (n: number) => db.get().registros.slice(-n).reverse(),
  contar: (desde: number) => db.get().registros.filter((r) => r.em >= desde).length,
  /** Boletins de um período [desde, ate). */
  entre: (desde: number, ate: number) => db.get().registros.filter((r) => r.em >= desde && r.em < ate),

  /** Reserva o número na hora (síncrono: dois envios simultâneos nunca pegam o mesmo). */
  criar(input: Pick<Boletim, "equipe" | "relatorio" | "autor" | "canalId">): Boletim {
    const d = db.get();
    const em = Date.now();
    const ano = anoBR(em);
    const numero = d.registros.filter((r) => r.ano === ano).reduce((m, r) => Math.max(m, r.numero), 0) + 1;
    const b: Boletim = { id: randomUUID(), numero, ano, ...input, mensagemId: null, em };
    d.registros.push(b);
    if (d.registros.length > HISTORICO) d.registros.splice(0, d.registros.length - HISTORICO);
    void db.save();
    return b;
  },

  atualizar(id: string, patch: Partial<Boletim>) {
    const b = db.get().registros.find((r) => r.id === id);
    if (b) Object.assign(b, patch);
    void db.save();
    return b;
  },

  /** Envio que não chegou ao canal: o número volta a ficar livre se ainda for o último. */
  descartar(id: string) {
    const d = db.get();
    d.registros = d.registros.filter((r) => r.id !== id);
    void db.save();
  },
};
