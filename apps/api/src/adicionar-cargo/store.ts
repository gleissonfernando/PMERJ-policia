import { jsonFile } from "../lib/jsonFile.js";

/**
 * Dados do /adicionar-cargo (documento "adicionar-cargo" no banco).
 *   - quem pode usar o comando
 *   - quais cargos podem ser dados (vazio = qualquer cargo, com as travas de segurança)
 *   - canal de registro
 *   - a última vez que a visibilidade do comando foi aplicada no Discord
 */

export interface Quem {
  id: string;
  nome: string;
}

export interface AdicionarCargoConfig {
  /** SÓ quem tem um destes cargos usa o /adicionar-cargo (conferido a cada passo). */
  cargosUsar: string[];
  /** Cargos que podem ser dados. Vazio = qualquer um abaixo do seu cargo mais alto (sem permissões de administração). */
  cargosPermitidos: string[];
  /** Canal onde sai o registro de cada cargo dado. */
  canalLogId: string | null;
  /** Cargos que VEEM o comando no Discord, na última vez em que foi aplicado (null = nunca). */
  visibilidade: { cargos: string[]; em: number; por: Quem } | null;
  atualizadoEm: number;
  atualizadoPor: string | null;
}

export interface CargoDado {
  id: string;
  nome: string;
  cor: number;
  /** false = o Discord recusou (cargo do bot abaixo, por exemplo). */
  ok: boolean;
}

export interface RegistroCargo {
  id: string;
  userId: string;
  username: string;
  /** Apelido no servidor (ou nome) no momento. */
  nome: string;
  avatar: string | null;
  cargos: CargoDado[];
  por: Quem;
  em: number;
  mensagem: { canalId: string; mensagemId: string } | null;
}

interface Dados {
  versao: 1;
  config: AdicionarCargoConfig;
  registros: RegistroCargo[];
}

export const PADRAO: AdicionarCargoConfig = {
  cargosUsar: [],
  cargosPermitidos: [],
  canalLogId: null,
  visibilidade: null,
  atualizadoEm: 0,
  atualizadoPor: null,
};

const LIMITE = 3_000;

const db = jsonFile<Dados>(
  "adicionar-cargo",
  () => ({ versao: 1, config: structuredClone(PADRAO), registros: [] }),
  (raw) => ({
    versao: 1,
    config: { ...structuredClone(PADRAO), ...raw.config },
    registros: Array.isArray(raw.registros) ? raw.registros : [],
  }),
);

export const adicionarCargoStore = {
  config: () => db.get().config,
  async saveConfig(c: AdicionarCargoConfig) {
    db.get().config = c;
    await db.save();
  },
  recentes: (limit: number) => db.get().registros.slice(-limit).reverse(),
  contar: (desde: number) => db.get().registros.filter((r) => r.em >= desde).length,
  async add(r: RegistroCargo) {
    const d = db.get();
    d.registros.push(r);
    if (d.registros.length > LIMITE) d.registros.splice(0, d.registros.length - LIMITE);
    await db.save();
  },
  salvar: () => db.save(),
};
