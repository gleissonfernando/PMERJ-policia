import { cursoStore } from "../curso/store.js";
import { jsonFile } from "../lib/jsonFile.js";
import { setStore } from "../set/store.js";

/**
 * Sistema de Horas (documento "horas" no banco): requisitos de cada promoção
 * (patente atual → próxima) e os alertas de "apto para promoção" publicados no Discord.
 */

export interface RegraHoras {
  id: string;
  dePatenteId: string;
  paraPatenteId: string;
  /** Horas comprovadas (aprovadas no Bate-ponto) exigidas. */
  horas: number;
  /** Cursos exigidos (conferidos sozinhos: concluído no sistema de Cursos). */
  cursos: string[];
  /** Outros requisitos, conferidos pelo Comando (aparecem no alerta como lista). */
  requisitos: string[];
}

export interface HorasConfig {
  ativo: boolean;
  /** Canal onde sai cada alerta de "apto para promoção". */
  canalAlertaId: string | null;
  /** Cargos notificados em cada alerta novo (ex.: Comando). */
  cargosMencionar: string[];
  /** total = horas aprovadas desde o último /zerar horas · promocao = só as aprovadas depois da última promoção. */
  contagem: "total" | "promocao";
  regras: RegraHoras[];
  atualizadoEm: number;
  atualizadoPor: string | null;
}

export interface PatenteResumo {
  id: string;
  nome: string;
  prefixo: string;
}

export type StatusAlerta = "apto" | "promovido" | "encerrado";

export interface Alerta {
  id: string;
  numero: number;
  userId: string;
  username: string;
  avatar: string | null;
  nome: string;
  regraId: string;
  de: PatenteResumo;
  para: PatenteResumo;
  /** Horas comprovadas no momento do alerta. */
  horasMs: number;
  horasExigidas: number;
  /** Retrato dos requisitos no momento do alerta. */
  cursos: Array<{ id: string; sigla: string; nome: string; ok: boolean }>;
  requisitos: string[];
  em: number;
  status: StatusAlerta;
  atualizadoEm: number;
  mensagem: { canalId: string; mensagemId: string } | null;
}

interface Dados {
  versao: 1;
  config: HorasConfig;
  alertas: Alerta[];
  seq: number;
}

/** Requisitos informados pelo Comando (2026-11-13). Siglas de curso viram curso se existirem no cadastro. */
const SEMENTE: Array<[string, string, number, string[], string[]]> = [
  ["sd", "cb", 10, [], []],
  ["cb", "3sgt", 35, ["CFS", "EAT"], ["Capacidade de liderança", "Avaliação favorável do Comando"]],
  ["3sgt", "2sgt", 55, [], ["1 qualificação operacional", "Mínimo de 15h de instrução como Instrutor ou Monitor"]],
  ["2sgt", "1sgt", 70, ["CAP"], ["1 qualificação operacional", "Mínimo de 24h de instrução"]],
  ["1sgt", "st", 100, ["CAP"], ["2 qualificações operacionais distintas", "Experiência em comando/supervisão", "Mínimo de 34h de instrução"]],
];

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[º°ª]/g, "").replace(/\s+/g, "").toLowerCase();

function regrasIniciais(): RegraHoras[] {
  const patentes = setStore.config().patentes;
  const acha = (id: string) => patentes.find((p) => p.id === id) ?? patentes.find((p) => norm(p.prefixo) === norm(id) || (id === "st" && norm(p.prefixo) === "subten"));
  const cursos = cursoStore.dados().cursos;
  const regras: RegraHoras[] = [];
  for (const [de, para, horas, siglas, requisitos] of SEMENTE) {
    const pd = acha(de);
    const pp = acha(para);
    if (!pd || !pp) continue;
    const ids: string[] = [];
    const semCadastro: string[] = [];
    for (const s of siglas) {
      const c = cursos.find((x) => norm(x.sigla) === norm(s));
      if (c) ids.push(c.id);
      else semCadastro.push(`Curso ${s}`);
    }
    regras.push({ id: `${pd.id}-${pp.id}`, dePatenteId: pd.id, paraPatenteId: pp.id, horas, cursos: ids, requisitos: [...semCadastro, ...requisitos] });
  }
  return regras;
}

const padrao = (): HorasConfig => ({
  ativo: true,
  canalAlertaId: null,
  cargosMencionar: [],
  contagem: "total",
  regras: regrasIniciais(),
  atualizadoEm: 0,
  atualizadoPor: null,
});

const db = jsonFile<Dados>(
  "horas",
  () => ({ versao: 1, config: padrao(), alertas: [], seq: 0 }),
  (raw) => ({
    versao: 1,
    config: { ...padrao(), ...raw.config },
    alertas: Array.isArray(raw.alertas) ? raw.alertas : [],
    seq: raw.seq ?? 0,
  }),
);

export const horasStore = {
  config: () => db.get().config,
  async saveConfig(c: HorasConfig) {
    db.get().config = c;
    await db.save();
  },
  alertas: () => db.get().alertas,
  abertos: (userId: string) => db.get().alertas.filter((a) => a.userId === userId && a.status === "apto"),
  novoAlerta(a: Omit<Alerta, "numero">): Alerta {
    const d = db.get();
    const alerta = { ...a, numero: ++d.seq };
    d.alertas.push(alerta);
    if (d.alertas.length > 3_000) d.alertas.splice(0, d.alertas.length - 3_000);
    return alerta;
  },
  salvar: () => db.save(),
};
