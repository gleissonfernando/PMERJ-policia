import { jsonFile } from "../lib/jsonFile.js";
import { DEFAULT_SET_CONFIG } from "./defaults.js";
import type { SetConfig, SetData, SetRegistro } from "./types.js";

/** apps/api/data/set.json — trocar por Postgres quando o banco entrar no projeto. */
const HISTORY_LIMIT = 5_000;

const db = jsonFile<SetData>(
  "set",
  () => ({ versao: 1, config: structuredClone(DEFAULT_SET_CONFIG), registros: [] }),
  (raw) => ({
    versao: 1,
    config: (() => {
      const c = { ...structuredClone(DEFAULT_SET_CONFIG), ...raw.config };
      // Correção ortográfica do órgão que vinha no padrão antigo (só esse texto exato).
      c.orgaos = c.orgaos.map((o) => (o.nome === "Batalhão da policia militar do estado do rio de janeiro" ? { ...o, nome: "Batalhão da Polícia Militar do Estado do Rio de Janeiro" } : o));
      return c;
    })(),
    // Registros antigos (antes da aprovação) eram sempre sets aplicados.
    registros: ((Array.isArray(raw.registros) ? raw.registros : []) as Array<Partial<SetRegistro>>).map(
      (r) => ({ status: "aprovado", decididoPor: null, decididoEm: r.em ?? null, motivo: null, mensagem: null, ...r }) as SetRegistro,
    ),
  }),
);

const ouvintesPatentes: Array<() => void> = [];
/** Avisado quando as patentes (ordem, sigla, nome ou cargo) mudam no Pedir Set. */
export const onPatentesMudaram = (fn: () => void) => void ouvintesPatentes.push(fn);

export const setStore = {
  config(): SetConfig {
    return db.get().config;
  },

  async saveConfig(config: SetConfig): Promise<void> {
    const antes = JSON.stringify(db.get().config.patentes);
    db.get().config = config;
    await db.save();
    // Patentes são a fonte única do sistema: quem depende delas (hierarquia, horas…) se atualiza.
    if (JSON.stringify(config.patentes) !== antes) for (const fn of ouvintesPatentes) setTimeout(fn, 0);
  },

  byId(id: string): SetRegistro | undefined {
    return db.get().registros.find((r) => r.id === id);
  },

  /** Set valendo do usuário (último aprovado). */
  atual(userId: string): SetRegistro | undefined {
    const regs = db.get().registros;
    for (let i = regs.length - 1; i >= 0; i--) {
      const r = regs[i]!;
      if (r.userId === userId && r.status === "aprovado") return r;
    }
    return undefined;
  },

  /** Último pedido do usuário, qualquer status (para mostrar pendente/reprovado). */
  ultimoPedido(userId: string): SetRegistro | undefined {
    const regs = db.get().registros;
    for (let i = regs.length - 1; i >= 0; i--) if (regs[i]!.userId === userId) return regs[i];
    return undefined;
  },

  pendente(userId: string): SetRegistro | undefined {
    return db.get().registros.find((r) => r.userId === userId && r.status === "pendente");
  },

  /** Pendentes, mais antigos primeiro (fila). */
  pendentes(): SetRegistro[] {
    return db.get().registros.filter((r) => r.status === "pendente").sort((a, b) => a.em - b.em);
  },

  /** Mais recentes primeiro. */
  recentes(limit: number): SetRegistro[] {
    return db.get().registros.slice(-limit).reverse();
  },

  async add(r: SetRegistro): Promise<void> {
    const d = db.get();
    d.registros.push(r);
    if (d.registros.length > HISTORY_LIMIT) {
      // Descarta os mais antigos já decididos; nunca um pendente.
      let excess = d.registros.length - HISTORY_LIMIT;
      d.registros = d.registros.filter((x) => (excess > 0 && x.status !== "pendente" ? (excess--, false) : true));
    }
    await db.save();
  },

  /** Persiste alterações feitas num registro já existente. */
  async update(): Promise<void> {
    await db.save();
  },
};
