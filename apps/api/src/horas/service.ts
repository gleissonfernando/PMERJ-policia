import { randomUUID } from "node:crypto";
import { emojiLogo } from "../branding/emoji.js";
import { cursoStore } from "../curso/store.js";
import { editMessage, FLAG_COMPONENTS_V2, getMember, postMessage, type MessageBody } from "../discord/bot.js";
import { membrosDoServidor } from "../discord/gateway.js";
import { pontoStore } from "../ponto/store.js";
import { patenteAtual, patentePelaSigla } from "../promocao/service.js";
import { historicoPatente } from "../promocao/store.js";
import { setStore } from "../set/store.js";
import type { Patente } from "../set/types.js";
import { horasStore, type Alerta, type PatenteResumo, type RegraHoras } from "./store.js";

/**
 * Sistema de Horas — quem bate as horas exigidas para a próxima patente ganha um ALERTA
 * (mensagem V2) no canal configurado. Cada pessoa que for batendo as horas gera o seu.
 *   - horas comprovadas = horas APROVADAS no Bate-ponto (total, ou só depois da última promoção)
 *   - patente atual = cargo de patente → set → sigla no apelido (igual ao /promoção)
 *   - cursos exigidos são conferidos sozinhos; os demais requisitos ficam listados para o Comando
 *   - promovido (ou mudou de patente) → o alerta é atualizado; na patente nova, conta a próxima regra
 * Confere quando horas são aprovadas, quando cargos mudam, ao salvar a configuração e a cada 30 min.
 */

const HORA = 3_600_000;
const COR_APTO = 0xf1c40f;
const COR_PROMOVIDO = 0x22c55e;
const COR_ENCERRADO = 0x4b5563;

const resumo = (p: Patente): PatenteResumo => ({ id: p.id, nome: p.nome, prefixo: p.prefixo });
const ts = (ms: number, f = "f") => `<t:${Math.floor(ms / 1000)}:${f}>`;
const avatarUrl = (id: string, avatar: string | null) =>
  avatar ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=256` : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(id) >> 22n) % 6}.png`;

export function fmtHoras(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? (m ? `${h}h ${String(m).padStart(2, "0")}min` : `${h}h`) : `${m}min`;
}

/* ---------- Cálculo ---------- */

/** Horas comprovadas (aprovadas) que valem para a regra. */
export function horasComprovadas(userId: string): number {
  if (horasStore.config().contagem === "total") return pontoStore.horasDe(userId)?.totalMs ?? 0;
  const desde = Math.max(historicoPatente(userId).ultimaPromocao?.em ?? 0, pontoStore.horasDesde());
  return pontoStore
    .doPolicial(userId)
    .filter((p) => p.status === "aprovado" && p.entrada >= desde && p.saida !== null)
    .reduce((t, p) => t + Math.max(0, p.saida! - p.entrada), 0);
}

const patenteDe = (userId: string, roles: string[], apelido: string | null) => patenteAtual(userId, roles) ?? patentePelaSigla(apelido);

export interface Progresso {
  patente: PatenteResumo | null;
  regra: RegraHoras | null;
  para: PatenteResumo | null;
  horasMs: number;
  exigidoMs: number;
  cursos: Array<{ id: string; sigla: string; nome: string; ok: boolean }>;
  requisitos: string[];
  /** Bateu as horas da próxima promoção. */
  apto: boolean;
}

export function progresso(userId: string, roles: string[], apelido: string | null): Progresso {
  const patentes = setStore.config().patentes;
  const p = patenteDe(userId, roles, apelido);
  const regra = p ? (horasStore.config().regras.find((r) => r.dePatenteId === p.id) ?? null) : null;
  const para = regra ? patentes.find((x) => x.id === regra.paraPatenteId) : undefined;
  const horasMs = horasComprovadas(userId);
  const concluidos = new Set(cursoStore.doPolicial(userId).filter((x) => x.status === "concluido").map((x) => x.cursoId));
  const cursos = (regra?.cursos ?? []).map((id) => {
    const c = cursoStore.curso(id);
    return { id, sigla: c?.sigla ?? "?", nome: c?.nome ?? "Curso removido", ok: concluidos.has(id) };
  });
  const exigidoMs = (regra?.horas ?? 0) * HORA;
  return {
    patente: p ? resumo(p) : null,
    regra,
    para: para ? resumo(para) : null,
    horasMs,
    exigidoMs,
    cursos,
    requisitos: regra?.requisitos ?? [],
    apto: Boolean(regra && para && horasMs >= exigidoMs),
  };
}

/* ---------- Alerta (Components V2) ---------- */

function mensagemAlerta(a: Alerta, primeira: boolean): MessageBody {
  const cfg = horasStore.config();
  const e = emojiLogo();
  const cor = a.status === "apto" ? COR_APTO : a.status === "promovido" ? COR_PROMOVIDO : COR_ENCERRADO;
  const titulo = a.status === "apto" ? "## 🎖️ Apto para promoção" : a.status === "promovido" ? "## ✅ Promovido" : "## ~~🎖️ Apto para promoção~~";
  const cursos = a.cursos ?? [];
  const requisitos = a.requisitos ?? [];
  const mencoes = primeira && a.status === "apto" && cfg.cargosMencionar.length ? cfg.cargosMencionar.map((c) => `<@&${c}>`).join(" ") : null;
  return {
    flags: FLAG_COMPONENTS_V2,
    // Só a primeira publicação notifica (os cargos do Comando). Edições nunca notificam.
    allowed_mentions: mencoes ? { parse: [], roles: cfg.cargosMencionar } : { parse: [] },
    components: [
      {
        type: 17,
        accent_color: cor,
        components: [
          ...(mencoes ? [{ type: 10, content: `🔔 ${mencoes}` }] : []),
          {
            type: 9,
            components: [
              { type: 10, content: titulo },
              { type: 10, content: `<@${a.userId}> · **${a.nome}**` },
              { type: 10, content: `### ${a.de.prefixo} → ${a.para.prefixo}\n-# ${a.de.nome} → ${a.para.nome}` },
            ],
            accessory: { type: 11, media: { url: avatarUrl(a.userId, a.avatar) }, description: `Avatar de ${a.username}`.slice(0, 1024) },
          },
          { type: 14, divider: true, spacing: 1 },
          {
            type: 10,
            content: [
              `⏱️ **Horas comprovadas:** **${fmtHoras(a.horasMs)}** de ${a.horasExigidas}h ✅`,
              ...cursos.map((c) => `${c.ok ? "✅" : "❌"} **Curso ${c.sigla}** · ${c.ok ? "concluído" : "pendente"}`),
              ...requisitos.map((r) => `▫️ ${r} · _conferir_`),
            ].join("\n"),
          },
          ...(a.status === "apto" && (cursos.some((c) => !c.ok) || requisitos.length)
            ? [{ type: 10, content: "-# Horas cumpridas. Os itens ❌ e ▫️ precisam ser conferidos antes da promoção (/promoção)." }]
            : []),
          ...(a.status === "promovido" ? [{ type: 10, content: `🎉 Promovido(a) a **${a.para.prefixo}** · ${ts(a.atualizadoEm, "f")}` }] : []),
          ...(a.status === "encerrado" ? [{ type: 10, content: `-# Alerta encerrado: a patente mudou sem ser para ${a.para.prefixo} · ${ts(a.atualizadoEm, "f")}` }] : []),
          { type: 10, content: `-# ${e ? `${e} ` : ""}PMERJ · Sistema de Horas · alerta #${String(a.numero).padStart(4, "0")} · ${ts(a.em, "f")}` },
        ],
      },
    ],
  };
}

/* ---------- Verificação ---------- */

interface Pessoa {
  id: string;
  username: string;
  avatar: string | null;
  nome: string;
  roles: string[];
  bot: boolean;
}

async function pessoa(userId: string): Promise<Pessoa | null> {
  const cache = membrosDoServidor()?.find((m) => m.id === userId);
  if (cache) return { id: cache.id, username: cache.username, avatar: cache.avatar, nome: cache.nome, roles: cache.roles, bot: cache.bot };
  const m = await getMember(userId);
  return m ? { id: m.user.id, username: m.user.username, avatar: m.user.avatar, nome: m.nick ?? m.user.global_name ?? m.user.username, roles: m.roles, bot: Boolean(m.user.bot) } : null;
}

const filas = new Map<string, Promise<void>>();

/** Confere uma pessoa (uma por vez por pessoa: eventos seguidos não duplicam alerta). */
export function verificarHoras(userId: string): Promise<void> {
  const anterior = filas.get(userId) ?? Promise.resolve();
  const atual = anterior.then(() => verificar(userId)).catch((err: unknown) => console.warn("[horas] falha ao verificar:", err instanceof Error ? err.message : err));
  filas.set(userId, atual);
  void atual.finally(() => filas.get(userId) === atual && filas.delete(userId));
  return atual;
}

async function verificar(userId: string): Promise<void> {
  const cfg = horasStore.config();
  const p = await pessoa(userId);
  const abertos = horasStore.abertos(userId);
  if (!p || p.bot) {
    // Saiu do servidor: encerra os alertas abertos.
    for (const a of abertos) await mudarStatus(a, "encerrado");
    return;
  }
  const prog = progresso(userId, p.roles, p.nome);
  const patentes = setStore.config().patentes;
  const idx = (id: string) => patentes.findIndex((x) => x.id === id);

  // Alertas de uma patente que a pessoa não tem mais: promovido (subiu) ou encerrado.
  for (const a of abertos) {
    if (prog.patente?.id === a.de.id) continue;
    const subiu = prog.patente ? idx(prog.patente.id) >= idx(a.para.id) : false;
    await mudarStatus(a, subiu ? "promovido" : "encerrado");
  }

  if (!cfg.ativo || !prog.apto || !prog.regra || !prog.patente || !prog.para) return;
  const existente = horasStore.abertos(userId).find((a) => a.regraId === prog.regra!.id && a.de.id === prog.patente!.id);
  if (existente) {
    // Alerta criado quando ainda não havia canal: publica agora que há.
    if (!existente.mensagem && cfg.canalAlertaId) {
      const msg = await postMessage(cfg.canalAlertaId, mensagemAlerta(existente, true));
      if (msg) {
        existente.mensagem = { canalId: cfg.canalAlertaId, mensagemId: msg.id };
        await horasStore.salvar();
      }
    }
    return;
  }

  const alerta = horasStore.novoAlerta({
    id: randomUUID(),
    userId,
    username: p.username,
    avatar: p.avatar,
    nome: p.nome,
    regraId: prog.regra.id,
    de: prog.patente,
    para: prog.para,
    horasMs: prog.horasMs,
    horasExigidas: prog.regra.horas,
    cursos: prog.cursos,
    requisitos: [...prog.requisitos],
    em: Date.now(),
    status: "apto",
    atualizadoEm: Date.now(),
    mensagem: null,
  });
  await horasStore.salvar();
  if (cfg.canalAlertaId) {
    const msg = await postMessage(cfg.canalAlertaId, mensagemAlerta(alerta, true));
    if (msg) {
      alerta.mensagem = { canalId: cfg.canalAlertaId, mensagemId: msg.id };
      await horasStore.salvar();
    }
  }
  console.info(`[horas] alerta #${alerta.numero}: discord:${userId} apto ${alerta.de.prefixo} → ${alerta.para.prefixo} (${fmtHoras(alerta.horasMs)})`);
}

async function mudarStatus(a: Alerta, status: "promovido" | "encerrado") {
  a.status = status;
  a.atualizadoEm = Date.now();
  await horasStore.salvar();
  if (a.mensagem) await editMessage(a.mensagem.canalId, a.mensagem.mensagemId, mensagemAlerta(a, false));
}

let varrendo = false;

/** Todos: quem tem horas aprovadas ou alerta aberto. */
export async function verificarTodos(): Promise<void> {
  if (varrendo) return;
  varrendo = true;
  try {
    const ids = new Set([...Object.keys(pontoStore.horas()), ...horasStore.alertas().filter((a) => a.status === "apto").map((a) => a.userId)]);
    for (const id of ids) await verificarHoras(id);
  } finally {
    varrendo = false;
  }
}

export function iniciarRotinaHoras(): void {
  setTimeout(() => void verificarTodos(), 2 * 60_000).unref(); // depois da lista de membros carregar
  setInterval(() => void verificarTodos(), 30 * 60_000).unref();
}
