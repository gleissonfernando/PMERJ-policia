import { AsyncLocalStorage } from "node:async_hooks";
import type { MiddlewareHandler } from "hono";
import { env, isProd } from "../env.js";
import { equipeStore } from "../equipe/store.js";
import { getSession, type Session } from "./sessions.js";

/**
 * Quem administra o painel:
 *   - os admins do .env (PAINEL_ADMIN_IDS / PAINEL_ADMIN_ROLE_IDS) — sempre tudo, não dá para tirar pelo site
 *   - a Equipe (Painel → Equipe): Administrador e Acesso total = tudo; Personalizado = só os módulos marcados
 *
 * Em desenvolvimento, sem nenhum admin configurado, todo mundo administra
 * (para dar para testar). Em produção, sem admin configurado, ninguém administra (exceto a Equipe).
 */
const noAdminsConfigured = env.PAINEL_ADMIN_IDS.length === 0 && env.PAINEL_ADMIN_ROLE_IDS.length === 0;
if (noAdminsConfigured) {
  console.warn(
    isProd
      ? "[PMERJ] Nenhum admin configurado (PAINEL_ADMIN_IDS / PAINEL_ADMIN_ROLE_IDS): só a Equipe do painel administra."
      : "[PMERJ] Nenhum admin configurado: em DEV todos os usuários do painel são admin.",
  );
}

/**
 * Módulo da requisição atual (/api/<modulo>/…), guardado pelo index.ts. Assim `isAdmin(session)`
 * responde "é admin DESTE módulo?" sem cada rota precisar informar.
 */
const contexto = new AsyncLocalStorage<{ modulo: string }>();
export const noModulo = <T>(modulo: string, fn: () => T): T => contexto.run({ modulo }, fn);

/** Admin do .env (dono do sistema): sempre tudo. */
export function isAdminEnv(session: Session): boolean {
  if (noAdminsConfigured) return !isProd;
  return env.PAINEL_ADMIN_IDS.includes(session.user.id) || session.roles.some((role) => env.PAINEL_ADMIN_ROLE_IDS.includes(role));
}

/** Pode gerenciar a Equipe (adicionar, trocar acesso, remover). */
export function gerenciaEquipe(session: Session): boolean {
  return isAdminEnv(session) || equipeStore.membro(session.user.id)?.acesso === "admin";
}

/** Administra TODOS os módulos (admin do .env, Administrador ou Acesso total). */
export function isAdminTotal(session: Session): boolean {
  if (isAdminEnv(session)) return true;
  const m = equipeStore.membro(session.user.id);
  return m?.acesso === "admin" || m?.acesso === "total";
}

/** Módulos que a pessoa administra ("todos" ou a lista do acesso personalizado). */
export function modulosAdmin(session: Session): "todos" | string[] {
  if (isAdminTotal(session)) return "todos";
  const m = equipeStore.membro(session.user.id);
  return m?.acesso === "personalizado" ? [...m.modulos] : [];
}

/** Admin do módulo da requisição atual (ou de tudo, fora de um módulo, só quem é total). */
export function isAdmin(session: Session, modulo?: string): boolean {
  if (isAdminTotal(session)) return true;
  const m = equipeStore.membro(session.user.id);
  if (m?.acesso !== "personalizado") return false;
  const atual = modulo ?? contexto.getStore()?.modulo;
  return Boolean(atual && m.modulos.includes(atual));
}

type Env = { Variables: { session: Session } };

/** Exige sessão do painel militar e membro do servidor oficial. */
export const requirePainel: MiddlewareHandler<Env> = async (c, next) => {
  const session = getSession(c);
  if (!session) return c.json({ error: "nao_autenticado" }, 401);
  if (session.context !== "painel" || !session.guildMember) return c.json({ error: "proibido" }, 403);
  c.set("session", session);
  await next();
};

export const requireAdmin: MiddlewareHandler<Env> = async (c, next) => {
  if (!isAdmin(c.get("session"))) return c.json({ error: "proibido" }, 403);
  await next();
};

export type PainelEnv = Env;
