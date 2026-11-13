import { createHash, randomBytes } from "node:crypto";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { env, isProd } from "../env.js";

export type LoginContext = "painel" | "civil";

export interface SessionUser {
  id: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
}

export interface Session {
  user: SessionUser;
  context: LoginContext;
  /** true se o usuário está no servidor oficial da PMERJ (ou se a checagem está desligada em dev). */
  guildMember: boolean;
  roles: string[];
  createdAt: number;
  expiresAt: number;
}

/**
 * Cookie de sessão:
 *  - httpOnly → JavaScript do navegador não lê (protege contra roubo via XSS)
 *  - Secure + prefixo __Host- em produção → só HTTPS, sem subdomínio, path fixo
 *  - SameSite=Lax → não é enviado em POSTs de outros sites (CSRF)
 */
export const SESSION_COOKIE = isProd ? "__Host-pmerj_sid" : "pmerj_sid";

/**
 * O token só existe no cookie do usuário. No servidor guardamos o HASH dele:
 * se o armazenamento vazar, os tokens não podem ser reutilizados.
 * Store em memória por enquanto — trocar por Postgres/Redis junto com o banco.
 */
const store = new Map<string, Session>();

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

setInterval(() => {
  const now = Date.now();
  for (const [key, s] of store) if (s.expiresAt <= now) store.delete(key);
}, 60_000).unref();

export function createSession(c: Context, data: Omit<Session, "createdAt" | "expiresAt">): void {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  const ttlMs = env.SESSION_TTL_HOURS * 3_600_000;
  store.set(hash(token), { ...data, createdAt: now, expiresAt: now + ttlMs });

  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "Lax",
    path: "/",
    maxAge: Math.floor(ttlMs / 1000),
  });
}

export function getSession(c: Context): Session | null {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token || token.length > 128) return null;
  const session = store.get(hash(token));
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    store.delete(hash(token));
    return null;
  }
  return session;
}

export function destroySession(c: Context): void {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) store.delete(hash(token));
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: isProd });
}
