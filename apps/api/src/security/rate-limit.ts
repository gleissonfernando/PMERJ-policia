import type { Context, MiddlewareHandler } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import { env } from "../env.js";

/** IP do cliente. Só confia em X-Forwarded-For se TRUST_PROXY=true. */
export function clientIp(c: Context): string {
  if (env.TRUST_PROXY) {
    const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) return forwarded;
  }
  return getConnInfo(c).remote.address ?? "desconhecido";
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Limitador por IP em janela fixa (memória).
 * Quando houver mais de uma instância da API, trocar por Redis.
 */
export function rateLimit(opts: { name: string; limit: number; windowMs: number }): MiddlewareHandler {
  const buckets = new Map<string, Bucket>();

  setInterval(() => {
    const now = Date.now();
    for (const [key, b] of buckets) if (b.resetAt <= now) buckets.delete(key);
  }, opts.windowMs).unref();

  return async (c, next) => {
    const key = clientIp(c);
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + opts.windowMs };
      buckets.set(key, bucket);
    }
    bucket.count++;

    const remaining = Math.max(0, opts.limit - bucket.count);
    c.header("RateLimit-Limit", String(opts.limit));
    c.header("RateLimit-Remaining", String(remaining));

    if (bucket.count > opts.limit) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      c.header("Retry-After", String(retryAfter));
      console.warn(`[rate-limit:${opts.name}] bloqueado ${key}`);
      return c.json({ error: "muitas_requisicoes" }, 429);
    }
    await next();
  };
}
