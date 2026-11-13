import { jsonFile } from "../lib/jsonFile.js";

/**
 * Documento "hierarquia" (MongoDB, coleção dados) — painel da Hierarquia.
 * A administração monta os níveis (cada um é um cargo do Discord, na ordem que quiser).
 * Quem tem o cargo aparece no painel; perdeu o cargo, sai; trocou, muda de nível.
 * Quem tem vários cargos da lista aparece só no MAIS ALTO (o primeiro da lista).
 */

export const LIMITES = { niveis: 50, titulo: 80, tituloNivel: 60, rodape: 100 };

export interface Nivel {
  id: string;
  cargoId: string;
  /** Vazio = nome atual do cargo no Discord. */
  titulo: string;
  emoji: string;
}

export interface HierarquiaConfig {
  canalId: string | null;
  /** Mensagens do painel (vira mais de uma quando o efetivo não cabe numa só). */
  mensagemIds: string[];
  titulo: string;
  cor: number;
  rodape: string;
  /** Mostra "Vago" nos níveis sem ninguém (desligado = o nível some do painel). */
  mostrarVagos: boolean;
  /**
   * patentes = os níveis vêm do Pedir Set (cada patente com cargo, da mais alta para a mais baixa) e
   * `niveis` vira a lista de níveis EXTRAS acima delas (ex.: Comando) · manual = só `niveis`.
   */
  origem: "patentes" | "manual";
  /** Emoji opcional de cada patente no painel (patenteId → emoji). */
  emojisPatentes: Record<string, string>;
  niveis: Nivel[];
  erro: string | null;
  /** Última vez que o painel foi redesenhado no Discord. */
  publicadoEm: number | null;
  atualizadoEm: number;
  atualizadoPor: string | null;
}

interface Dados {
  versao: 1;
  config: HierarquiaConfig;
}

export const DEFAULT_HIERARQUIA: HierarquiaConfig = {
  canalId: null,
  mensagemIds: [],
  titulo: "Hierarquia",
  cor: 0x2b7fff,
  rodape: "Atualizado automaticamente conforme os cargos",
  mostrarVagos: true,
  origem: "patentes",
  emojisPatentes: {},
  niveis: [],
  erro: null,
  publicadoEm: null,
  atualizadoEm: 0,
  atualizadoPor: null,
};

const db = jsonFile<Dados>(
  "hierarquia",
  () => ({ versao: 1, config: structuredClone(DEFAULT_HIERARQUIA) }),
  (raw) => ({
    versao: 1,
    // Quem já tinha níveis montados à mão continua no modo manual.
    config: { ...structuredClone(DEFAULT_HIERARQUIA), ...raw.config, origem: raw.config?.origem ?? (raw.config?.niveis?.length ? "manual" : "patentes") },
  }),
);

export const hierarquiaStore = {
  config: () => db.get().config,
  async saveConfig(patch: Partial<HierarquiaConfig>) {
    const d = db.get();
    d.config = { ...d.config, ...patch };
    await db.save();
    return d.config;
  },
};
