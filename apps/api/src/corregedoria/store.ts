import { randomBytes } from "node:crypto";
import { jsonFile } from "../lib/jsonFile.js";

/**
 * apps/api/data/corregedoria.json — configuração e tickets.
 * Provas e anexos ficam em apps/api/data/corregedoria/<ticketId>/ (os links do Discord expiram).
 */

export interface TipoTicket {
  id: string;
  nome: string;
  descricao: string;
  emoji: string;
}

export interface CorregedoriaConfig {
  tipos: TipoTicket[];
  /** Quem atende: vê os canais, assume, responde (anonimamente) e fecha. */
  cargosCorregedoria: string[];
  /** Categoria onde os canais temporários nascem. */
  categoriaId: string | null;
  /** Canal que recebe o transcript de cada ticket fechado. */
  logCanalId: string | null;
  /** Nome com que as respostas da equipe aparecem (nunca o nome real de quem atendeu). */
  nomeExibicao: string;
  painel: { canalId: string; mensagemId: string } | null;
  atualizadoEm: number;
  atualizadoPor: string | null;
}

export interface Anexo {
  /** Nome do arquivo salvo em data/corregedoria/<ticketId>/ */
  arquivo: string;
  nome: string;
  tipo: string;
  bytes: number;
}

export type Papel = "denunciante" | "corregedoria" | "sistema";

export interface EventoTicket {
  id: string;
  tipo: "abertura" | "mensagem" | "sistema";
  papel: Papel;
  /** Autor REAL (só a equipe vê; para quem abriu, a corregedoria aparece só pelo nome de exibição). */
  autor: { id: string; nome: string; avatar?: string | null } | null;
  conteudo: string;
  anexos: Anexo[];
  em: number;
}

export type StatusTicket = "aberto" | "fechado";

export interface Ticket {
  id: string;
  numero: number;
  userId: string;
  username: string;
  avatar: string | null;
  /** Insígnia (sigla da patente) e nome no momento da abertura. */
  insignia: string | null;
  nome: string;
  tipo: TipoTicket;
  motivo: string;
  assunto: string;
  descricao: string;
  provas: Anexo[];
  canalId: string | null;
  /** Mensagem do painel (botões) dentro do canal do ticket. */
  painelMensagemId: string | null;
  /** Segredo: nunca sai para o navegador. */
  webhook: { id: string; token: string } | null;
  /** Chave secreta do link do transcript (abre sem login; impossível de adivinhar). */
  chave: string;
  status: StatusTicket;
  assumidoPor: { id: string; nome: string } | null;
  abertoEm: number;
  fechadoEm: number | null;
  fechadoPor: { id: string; nome: string } | null;
  eventos: EventoTicket[];
}

interface Dados {
  versao: 1;
  config: CorregedoriaConfig;
  tickets: Ticket[];
}

export const DEFAULT_CORREGEDORIA: CorregedoriaConfig = {
  tipos: [
    { id: "denuncia-oficial", nome: "Denúncia contra oficial", descricao: "Conduta irregular de um policial ou oficial.", emoji: "⚖️" },
    { id: "assuntos-internos", nome: "Assuntos internos", descricao: "Questões internas da corporação.", emoji: "🛡️" },
    { id: "outros", nome: "Outros", descricao: "Qualquer outro assunto para a corregedoria.", emoji: "📁" },
  ],
  cargosCorregedoria: [],
  categoriaId: null,
  logCanalId: null,
  nomeExibicao: "Corregedoria PMERJ",
  painel: null,
  atualizadoEm: 0,
  atualizadoPor: null,
};

let chavesNovas = false;

const db = jsonFile<Dados>(
  "corregedoria",
  () => ({ versao: 1, config: structuredClone(DEFAULT_CORREGEDORIA), tickets: [] }),
  (raw) => ({
    versao: 1,
    config: { ...structuredClone(DEFAULT_CORREGEDORIA), ...raw.config },
    // Tickets antigos ganham a chave do link na primeira leitura (e ela é salva logo abaixo).
    tickets: (Array.isArray(raw.tickets) ? raw.tickets : []).map((t) => {
      if (t.chave) return t;
      chavesNovas = true;
      return { ...t, chave: randomBytes(24).toString("base64url") };
    }),
  }),
);

if (chavesNovas) void db.save();

export const corregStore = {
  config: () => db.get().config,
  async saveConfig(c: CorregedoriaConfig) {
    db.get().config = c;
    await db.save();
  },
  tickets: () => db.get().tickets,
  byId: (id: string) => db.get().tickets.find((t) => t.id === id),
  byCanal: (canalId: string) => db.get().tickets.find((t) => t.canalId === canalId && t.status === "aberto"),
  doUsuario: (userId: string) => db.get().tickets.filter((t) => t.userId === userId),
  abertoDe: (userId: string) => db.get().tickets.find((t) => t.userId === userId && t.status === "aberto"),
  proximoNumero: () => db.get().tickets.reduce((m, t) => Math.max(m, t.numero), 0) + 1,
  async add(t: Ticket) {
    db.get().tickets.push(t);
    await db.save();
  },
  salvar: () => db.save(),
};
