import { jsonFile } from "../lib/jsonFile.js";

/**
 * apps/api/data/disciplina.json — gestão disciplinar da corregedoria:
 * reuniões (canal temporário, sem transcript), advertências por nível (cargo) e exonerações.
 * Rebaixamentos ficam no histórico de Promoções (mesmas patentes e regras).
 */

export interface NivelAdvertencia {
  id: string;
  nome: string;
  /** Cargo que marca este nível. Aplicar um nível tira os cargos dos outros níveis. */
  cargoId: string | null;
}

export interface DisciplinaConfig {
  /** SÓ quem tem um destes cargos usa o painel, abre reuniões e aplica medidas. */
  cargosGestao: string[];
  /** Categoria dos canais de reunião. */
  categoriaId: string | null;
  niveis: NivelAdvertencia[];
  canalAdvertenciaId: string | null;
  canalExoneracaoId: string | null;
  painel: { canalId: string; mensagemId: string } | null;
  atualizadoEm: number;
  atualizadoPor: string | null;
}

export type TipoRegistro = "advertencia" | "advertencia_removida" | "exoneracao";

export interface RegistroDisciplinar {
  id: string;
  tipo: TipoRegistro;
  userId: string;
  username: string;
  avatar: string | null;
  /** Insígnia + nome no momento da medida. */
  nome: string;
  nivel: { id: string; nome: string } | null;
  motivo: string | null;
  por: { id: string; nome: string };
  em: number;
  /** Cargo trocado / expulsão feita pelo bot. */
  ok: boolean;
}

export type StatusReuniao = "aguardando" | "iniciada" | "encerrada";

export interface Reuniao {
  id: string;
  numero: number;
  userId: string;
  username: string;
  avatar: string | null;
  nome: string;
  motivo: string | null;
  canalId: string | null;
  painelMensagemId: string | null;
  /** Segredo: nunca sai para o navegador. */
  webhook: { id: string; token: string } | null;
  status: StatusReuniao;
  abertaPor: { id: string; nome: string };
  criadaEm: number;
  iniciadaEm: number | null;
  encerradaEm: number | null;
}

interface Dados {
  versao: 1;
  config: DisciplinaConfig;
  registros: RegistroDisciplinar[];
  reunioes: Reuniao[];
}

export const DEFAULT_DISCIPLINA: DisciplinaConfig = {
  cargosGestao: [],
  categoriaId: null,
  niveis: [
    { id: "adv-1", nome: "Advertência I", cargoId: null },
    { id: "adv-2", nome: "Advertência II", cargoId: null },
    { id: "adv-3", nome: "Advertência III", cargoId: null },
  ],
  canalAdvertenciaId: null,
  canalExoneracaoId: null,
  painel: null,
  atualizadoEm: 0,
  atualizadoPor: null,
};

const LIMITE = 5_000;

const db = jsonFile<Dados>(
  "disciplina",
  () => ({ versao: 1, config: structuredClone(DEFAULT_DISCIPLINA), registros: [], reunioes: [] }),
  (raw) => ({
    versao: 1,
    config: { ...structuredClone(DEFAULT_DISCIPLINA), ...raw.config },
    registros: Array.isArray(raw.registros) ? raw.registros : [],
    reunioes: Array.isArray(raw.reunioes) ? raw.reunioes : [],
  }),
);

export const disciplinaStore = {
  config: () => db.get().config,
  async saveConfig(c: DisciplinaConfig) {
    db.get().config = c;
    await db.save();
  },
  registros: () => db.get().registros,
  doPolicial: (userId: string) => db.get().registros.filter((r) => r.userId === userId),
  async addRegistro(r: RegistroDisciplinar) {
    const d = db.get();
    d.registros.push(r);
    if (d.registros.length > LIMITE) d.registros.splice(0, d.registros.length - LIMITE);
    await db.save();
  },
  reunioes: () => db.get().reunioes,
  reuniao: (id: string) => db.get().reunioes.find((r) => r.id === id),
  reuniaoPorCanal: (canalId: string) => db.get().reunioes.find((r) => r.canalId === canalId && r.status !== "encerrada"),
  proximaReuniao: () => db.get().reunioes.reduce((m, r) => Math.max(m, r.numero), 0) + 1,
  async addReuniao(r: Reuniao) {
    const d = db.get();
    d.reunioes.push(r);
    if (d.reunioes.length > 1_000) d.reunioes.splice(0, d.reunioes.length - 1_000);
    await db.save();
  },
  salvar: () => db.save(),
};
