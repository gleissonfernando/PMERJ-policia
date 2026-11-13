import { jsonFile } from "../lib/jsonFile.js";

/**
 * apps/api/data/ponto.json — bate-ponto do efetivo:
 *  - ponto aberto pelo painel (Entrar/Sair de serviço) ou ao entrar num canal de voz configurado
 *  - ao fechar: abaixo do mínimo é descartado; senão abre um canal temporário de aprovação
 *  - SÓ horas aprovadas contam (total + ranking) · /zerar ranking e /zerar horas · /ajuste ponto
 */

export interface Quem {
  id: string;
  nome: string;
}

export interface MensagemFixa {
  canalId: string;
  mensagemId: string;
}

export interface PontoConfig {
  /** Quem bate ponto: quem tem um destes cargos. Vazio = quem tem o set aprovado no Pedir Set. */
  cargosBater: string[];
  /** Aprovam ou reprovam as horas nos canais temporários. */
  cargosAprovadores: string[];
  /** Pessoas escolhidas uma a uma que também aprovam (além dos cargos). */
  usuariosAprovadores: string[];
  /** Usam /zerar ranking, /zerar horas e /ajuste ponto. */
  cargosGestao: string[];
  /** Entrar num destes canais de voz bate o ponto; sair de todos fecha. */
  canaisVoz: string[];
  /** Ponto mais curto que isto é descartado (não vai para aprovação). */
  minimoMinutos: number;
  /** Categoria dos canais temporários (aprovação e ajuste). */
  categoriaId: string | null;
  /** Registro de aprovações, reprovações, zeramentos e ajustes. */
  canalLogId: string | null;
  painel: MensagemFixa | null;
  painelServico: MensagemFixa | null;
  ranking: MensagemFixa | null;
  /** DM ao fechar o ponto lembrando da assunção de serviço (botões para os painéis de assunção). */
  lembreteAssuncao: boolean;
  inatividade: InatividadeConfig;
  atualizadoEm: number;
  atualizadoPor: string | null;
}

export interface InatividadeConfig {
  ativo: boolean;
  /** Dias sem bater ponto até abrir o caso. */
  dias: number;
  /** revisao = canal com relatório e botões Exonerar/Cancelar · automatico = exonera direto. */
  modo: "revisao" | "automatico";
  /** Quem tem um destes cargos nunca entra na conta (licença, férias…). */
  cargosAusencia: string[];
  /** Veem o canal e decidem. Vazio = gestão do ponto. */
  cargosDecisao: string[];
  /** Log das exonerações por inatividade. Vazio = log do ponto. */
  canalLogId: string | null;
  /** Ligado em: ninguém é cobrado por dias anteriores a isto. */
  ativadoEm: number;
}

export type StatusCaso = "aberto" | "exonerado" | "cancelado" | "resolvido";

/** Caso de inatividade (5 dias sem ponto): canal temporário com o relatório. */
export interface CasoInatividade {
  id: string;
  numero: number;
  userId: string;
  username: string;
  avatar: string | null;
  nome: string;
  abertoEm: number;
  /** Desde quando está sem ponto (último ponto, entrada no servidor ou ativação). */
  semPontoDesde: number;
  canal: MensagemFixa | null;
  status: StatusCaso;
  decisao: { por: Quem; em: number; motivo: string } | null;
}

export type OrigemPonto = "botao" | "voz" | "ajuste";
export type StatusPonto = "aberto" | "pendente" | "aprovado" | "reprovado" | "descartado";

export interface Ponto {
  id: string;
  numero: number;
  userId: string;
  username: string;
  avatar: string | null;
  /** Insígnia + nome quando o ponto abriu. */
  nome: string;
  origem: OrigemPonto;
  entrada: number;
  saida: number | null;
  status: StatusPonto;
  /** Canal temporário de aprovação (enquanto pendente). */
  aprovacao: MensagemFixa | null;
  decisao: { por: Quem; em: number; motivo: string | null } | null;
  ajuste: { por: Quem; em: number; entradaAntes: number; saidaAntes: number | null } | null;
  /** Ponto fechado sem chegar ao mínimo, pelo bot (saiu do servidor) etc. */
  observacao: string | null;
}

export interface Horas {
  userId: string;
  username: string;
  avatar: string | null;
  nome: string;
  /** Horas aprovadas desde o último /zerar horas. */
  totalMs: number;
  /** Horas aprovadas desde o último /zerar ranking (é o que o ranking mostra). */
  rankingMs: number;
  pontos: number;
  atualizadoEm: number;
}

export type EtapaAjuste = "entrada" | "saida" | "confirmar";

export interface Ajuste {
  id: string;
  numero: number;
  userId: string;
  /** Ponto que será corrigido (aberto ou pendente). Sem ponto = cria um novo. */
  pontoId: string | null;
  /** Dia de referência (meia-noite de Brasília, em ms UTC). */
  dia: number;
  canalId: string | null;
  etapa: EtapaAjuste;
  entrada: number | null;
  saida: number | null;
  painelMensagemId: string | null;
  pedidoPor: Quem;
  status: "aberto" | "concluido" | "cancelado";
  criadoEm: number;
}

interface Dados {
  versao: 1;
  config: PontoConfig;
  pontos: Ponto[];
  horas: Record<string, Horas>;
  ajustes: Ajuste[];
  casos: CasoInatividade[];
  seqCaso: number;
  rankingDesde: number;
  horasDesde: number;
  seqPonto: number;
  seqAjuste: number;
}

export const DEFAULT_PONTO: PontoConfig = {
  cargosBater: [],
  cargosAprovadores: [],
  usuariosAprovadores: [],
  cargosGestao: [],
  canaisVoz: [],
  minimoMinutos: 30,
  categoriaId: null,
  canalLogId: null,
  painel: null,
  painelServico: null,
  ranking: null,
  lembreteAssuncao: true,
  inatividade: { ativo: false, dias: 5, modo: "revisao", cargosAusencia: [], cargosDecisao: [], canalLogId: null, ativadoEm: 0 },
  atualizadoEm: 0,
  atualizadoPor: null,
};

const LIMITE_PONTOS = 20_000;

const db = jsonFile<Dados>(
  "ponto",
  () => ({ versao: 1, config: structuredClone(DEFAULT_PONTO), pontos: [], horas: {}, ajustes: [], casos: [], seqCaso: 0, rankingDesde: Date.now(), horasDesde: Date.now(), seqPonto: 0, seqAjuste: 0 }),
  (raw) => ({
    versao: 1,
    config: (({ cargosPonto: _antigo, ...c }: Partial<PontoConfig> & { cargosPonto?: unknown }) => ({ ...structuredClone(DEFAULT_PONTO), ...c, inatividade: { ...DEFAULT_PONTO.inatividade, ...c.inatividade } }))(raw.config ?? {}),
    pontos: Array.isArray(raw.pontos) ? raw.pontos : [],
    horas: raw.horas && typeof raw.horas === "object" ? raw.horas : {},
    ajustes: Array.isArray(raw.ajustes) ? raw.ajustes : [],
    casos: Array.isArray(raw.casos) ? raw.casos : [],
    seqCaso: raw.seqCaso ?? 0,
    rankingDesde: raw.rankingDesde ?? Date.now(),
    horasDesde: raw.horasDesde ?? Date.now(),
    seqPonto: raw.seqPonto ?? 0,
    seqAjuste: raw.seqAjuste ?? 0,
  }),
);

export const pontoStore = {
  config: () => db.get().config,
  async saveConfig(c: PontoConfig) {
    db.get().config = c;
    await db.save();
  },

  pontos: () => db.get().pontos,
  ponto: (id: string) => db.get().pontos.find((p) => p.id === id),
  aberto: (userId: string) => db.get().pontos.find((p) => p.userId === userId && p.status === "aberto"),
  abertos: () => db.get().pontos.filter((p) => p.status === "aberto"),
  pendentes: () => db.get().pontos.filter((p) => p.status === "pendente"),
  pontoPorCanal: (canalId: string) => db.get().pontos.find((p) => p.status === "pendente" && p.aprovacao?.canalId === canalId),
  doPolicial: (userId: string) => db.get().pontos.filter((p) => p.userId === userId),
  /** Cria o ponto já na memória (síncrono: dois cliques seguidos não abrem dois). */
  novoPonto(p: Omit<Ponto, "numero">): Ponto {
    const d = db.get();
    const ponto = { ...p, numero: ++d.seqPonto };
    d.pontos.push(ponto);
    if (d.pontos.length > LIMITE_PONTOS) {
      // Mantém sempre os abertos e pendentes; corta os mais antigos já decididos.
      const corte = d.pontos.length - LIMITE_PONTOS;
      let removidos = 0;
      d.pontos = d.pontos.filter((x) => removidos >= corte || x.status === "aberto" || x.status === "pendente" || !++removidos);
    }
    return ponto;
  },

  horas: () => db.get().horas,
  horasDe: (userId: string) => db.get().horas[userId],
  /** Soma horas APROVADAS (total e ranking). */
  somar(p: Ponto, ms: number) {
    const d = db.get();
    const h = (d.horas[p.userId] ??= { userId: p.userId, username: p.username, avatar: p.avatar, nome: p.nome, totalMs: 0, rankingMs: 0, pontos: 0, atualizadoEm: 0 });
    h.username = p.username;
    h.avatar = p.avatar;
    h.nome = p.nome;
    h.totalMs += ms;
    h.rankingMs += ms;
    h.pontos += 1;
    h.atualizadoEm = Date.now();
  },
  zerarRanking() {
    const d = db.get();
    for (const h of Object.values(d.horas)) h.rankingMs = 0;
    d.rankingDesde = Date.now();
  },
  /** Sem userId: zera todo mundo (horas e ranking). */
  zerarHoras(userId?: string) {
    const d = db.get();
    if (userId) {
      const h = d.horas[userId];
      if (h) h.totalMs = h.rankingMs = h.pontos = 0;
      return;
    }
    d.horas = {};
    d.horasDesde = d.rankingDesde = Date.now();
  },
  rankingDesde: () => db.get().rankingDesde,
  horasDesde: () => db.get().horasDesde,

  ajustes: () => db.get().ajustes,
  ajuste: (id: string) => db.get().ajustes.find((a) => a.id === id),
  ajustePorCanal: (canalId: string) => db.get().ajustes.find((a) => a.status === "aberto" && a.canalId === canalId),
  ajusteAberto: (userId: string) => db.get().ajustes.find((a) => a.status === "aberto" && a.userId === userId),
  novoAjuste(a: Omit<Ajuste, "numero">): Ajuste {
    const d = db.get();
    const ajuste = { ...a, numero: ++d.seqAjuste };
    d.ajustes.push(ajuste);
    if (d.ajustes.length > 2_000) d.ajustes.splice(0, d.ajustes.length - 2_000);
    return ajuste;
  },

  casos: () => db.get().casos,
  caso: (id: string) => db.get().casos.find((c) => c.id === id),
  casoAberto: (userId: string) => db.get().casos.find((c) => c.userId === userId && c.status === "aberto"),
  /** Último caso já decidido (cancelado conta como novo começo da contagem). */
  ultimoCaso: (userId: string) => db.get().casos.filter((c) => c.userId === userId).at(-1),
  novoCaso(c: Omit<CasoInatividade, "numero">): CasoInatividade {
    const d = db.get();
    const caso = { ...c, numero: ++d.seqCaso };
    d.casos.push(caso);
    if (d.casos.length > 2_000) d.casos.splice(0, d.casos.length - 2_000);
    return caso;
  },

  salvar: () => db.save(),
};
