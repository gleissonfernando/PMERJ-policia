import { jsonFile } from "../lib/jsonFile.js";

/**
 * Equipe do painel (documento "equipe" no banco): quem administra a dashboard além dos admins do .env.
 *   admin         = tudo, inclusive gerenciar a equipe
 *   total         = vê e configura todos os módulos (não mexe na equipe)
 *   personalizado = vê e configura SÓ os módulos marcados
 * O acesso vale pelo ID do Discord (não depende de cargo) e é conferido em toda requisição.
 */

export type Acesso = "admin" | "total" | "personalizado";

export interface Quem {
  id: string;
  nome: string;
}

export interface MembroEquipe {
  userId: string;
  nome: string;
  username: string;
  avatar: string | null;
  /** Função na equipe (texto livre): "Comando-Geral", "Moderador", "Instrutor-chefe"… */
  funcao: string;
  acesso: Acesso;
  /** Personalizado: ids dos módulos (mesmo nome da rota da API: "promocao", "ponto"…). */
  modulos: string[];
  /** Cargo do Discord entregue ao entrar na equipe (e retirado ao sair). */
  cargoDiscordId: string | null;
  /** O bot conseguiu dar o cargo? null = sem cargo. */
  cargoEntregue: boolean | null;
  adicionadoPor: Quem;
  em: number;
  atualizadoPor: Quem;
  atualizadoEm: number;
}

export interface RegistroEquipe {
  em: number;
  por: Quem;
  alvo: { id: string; nome: string };
  acao: "adicionou" | "alterou" | "removeu";
  resumo: string;
}

interface Dados {
  versao: 1;
  membros: MembroEquipe[];
  historico: RegistroEquipe[];
}

const db = jsonFile<Dados>(
  "equipe",
  () => ({ versao: 1, membros: [], historico: [] }),
  (raw) => ({ versao: 1, membros: Array.isArray(raw.membros) ? raw.membros : [], historico: Array.isArray(raw.historico) ? raw.historico : [] }),
);

export const equipeStore = {
  membros: () => db.get().membros,
  membro: (userId: string) => db.get().membros.find((m) => m.userId === userId),
  async salvarMembro(m: MembroEquipe, registro: RegistroEquipe) {
    const d = db.get();
    const i = d.membros.findIndex((x) => x.userId === m.userId);
    if (i >= 0) d.membros[i] = m;
    else d.membros.push(m);
    d.historico.push(registro);
    if (d.historico.length > 500) d.historico.splice(0, d.historico.length - 500);
    await db.save();
  },
  async removerMembro(userId: string, registro: RegistroEquipe) {
    const d = db.get();
    d.membros = d.membros.filter((x) => x.userId !== userId);
    d.historico.push(registro);
    if (d.historico.length > 500) d.historico.splice(0, d.historico.length - 500);
    await db.save();
  },
  historico: (n: number) => db.get().historico.slice(-n).reverse(),
};
