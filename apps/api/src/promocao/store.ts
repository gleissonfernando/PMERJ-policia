import { jsonFile } from "../lib/jsonFile.js";

/**
 * apps/api/data/promocao.json — configuração e histórico das promoções.
 * As PATENTES (sigla + cargo) são as mesmas do Pedir Set: uma lista só para o sistema todo.
 */

export interface PromocaoConfig {
  /** SÓ quem tem um destes cargos usa /promoção (conferido a cada passo). */
  cargosPromover: string[];
  /** Canal onde sai o anúncio da promoção. */
  canalAnuncioId: string | null;
  /** SÓ quem tem um destes cargos usa /rebaixamento (e o rebaixamento da corregedoria segue as mesmas regras). */
  cargosRebaixar: string[];
  /** Canal onde sai o anúncio de rebaixamento. */
  canalRebaixamentoId: string | null;
  /** Texto pequeno no rodapé do anúncio. */
  rodape: string;
  atualizadoEm: number;
  atualizadoPor: string | null;
}

export type StatusAcao = "feito" | "falhou" | "nao_se_aplica";

export interface PatenteFoto {
  id: string;
  nome: string;
  prefixo: string;
  cargoId: string | null;
}

export interface Promocao {
  id: string;
  userId: string;
  username: string;
  avatar: string | null;
  de: PatenteFoto | null;
  para: PatenteFoto;
  /** promocao = /promoção · rebaixamento = /rebaixamento ou corregedoria. */
  modo: "promocao" | "rebaixamento";
  motivo: string | null;
  /** true = subiu na hierarquia; false = rebaixamento/ajuste. */
  subiu: boolean;
  apelidoAntes: string | null;
  apelidoNovo: string | null;
  statusApelido: StatusAcao;
  statusCargos: StatusAcao;
  por: { id: string; nome: string };
  em: number;
  anuncio: { canalId: string; mensagemId: string } | null;
}

interface PromocaoData {
  versao: 1;
  config: PromocaoConfig;
  registros: Promocao[];
}

export const DEFAULT_PROMOCAO: PromocaoConfig = {
  cargosPromover: [],
  canalAnuncioId: null,
  cargosRebaixar: [],
  canalRebaixamentoId: null,
  rodape: "O Comando ama você! ❤️",
  atualizadoEm: 0,
  atualizadoPor: null,
};

const HISTORY_LIMIT = 3_000;

const db = jsonFile<PromocaoData>(
  "promocao",
  () => ({ versao: 1, config: structuredClone(DEFAULT_PROMOCAO), registros: [] }),
  (raw) => ({
    versao: 1,
    config: { ...structuredClone(DEFAULT_PROMOCAO), ...raw.config },
    registros: (Array.isArray(raw.registros) ? raw.registros : []).map((r) => ({ ...r, modo: r.modo ?? "promocao", motivo: r.motivo ?? null })),
  }),
);

export const promocaoStore = {
  config: () => db.get().config,
  async saveConfig(c: PromocaoConfig) {
    db.get().config = c;
    await db.save();
  },
  recentes: (limit: number) => db.get().registros.slice(-limit).reverse(),
  contar: (desde: number) => db.get().registros.filter((r) => r.em >= desde).length,
  async add(r: Promocao) {
    const d = db.get();
    d.registros.push(r);
    if (d.registros.length > HISTORY_LIMIT) d.registros.splice(0, d.registros.length - HISTORY_LIMIT);
    await db.save();
  },
  salvar: () => db.save(),
};

/** Para o /perfil: última promoção e rebaixamentos de um policial. */
export const historicoPatente = (userId: string) => {
  const meus = promocaoStore.recentes(3_000).filter((r) => r.userId === userId);
  return {
    ultimaPromocao: meus.find((r) => r.modo === "promocao" && r.subiu) ?? null,
    rebaixamentos: meus.filter((r) => r.modo === "rebaixamento"),
  };
};
