import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { requireAdmin, requirePainel, type PainelEnv } from "../auth/guards.js";
import { rateLimit } from "../security/rate-limit.js";
import { atualizarTodosPaineis, LOGO_MAX_BYTES, logoAtual, restaurarPadrao, salvarLogo } from "./logo.js";

export const brandingRoutes = new Hono<PainelEnv>();

const info = () => {
  const l = logoAtual();
  return {
    versao: l?.versao ?? "nenhuma",
    personalizada: l?.personalizada ?? false,
    tipo: l?.tipo ?? null,
    bytes: l?.dados.length ?? 0,
    atualizadoEm: l?.atualizadoEm ?? null,
    atualizadoPor: l?.atualizadoPor ?? null,
    limiteBytes: LOGO_MAX_BYTES,
  };
};

/** Público: o site mostra a logo até na tela de login. */
brandingRoutes.get("/", (c) => c.json(info()));

brandingRoutes.get("/logo", (c) => {
  const l = logoAtual();
  if (!l) return c.json({ error: "nao_encontrado" }, 404);
  const etag = `"${l.versao}"`;
  c.header("ETag", etag);
  // Com ?v=<versao> o navegador pode guardar; sem, revalida sempre.
  c.header("Cache-Control", c.req.query("v") === l.versao ? "public, max-age=31536000, immutable" : "no-cache");
  if (c.req.header("If-None-Match") === etag) return c.body(null, 304);
  c.header("Content-Type", l.tipo);
  c.header("Content-Disposition", 'inline; filename="logo"');
  return c.body(new Uint8Array(l.dados));
});

/* ---------- Admin ---------- */

const uploadLimiter = rateLimit({ name: "branding", limit: 10, windowMs: 60_000 });

/** Corpo = a imagem crua (PNG, JPG ou WebP, até 2 MB). SVG não é aceito (pode carregar script). */
brandingRoutes.put(
  "/logo",
  uploadLimiter,
  requirePainel,
  requireAdmin,
  bodyLimit({ maxSize: LOGO_MAX_BYTES, onError: (c) => c.json({ error: "arquivo_grande" }, 413) }),
  async (c) => {
    const session = c.get("session");
    const dados = Buffer.from(await c.req.arrayBuffer());
    const r = await salvarLogo(dados, session.user.id);
    if (!r.ok) return c.json({ error: r.erro }, 422);
    console.info(`[branding] logo alterada por discord:${session.user.id}`);
    return c.json(info());
  },
);

brandingRoutes.delete("/logo", uploadLimiter, requirePainel, requireAdmin, (c) => {
  restaurarPadrao();
  console.info(`[branding] logo restaurada para o padrão por discord:${c.get("session").user.id}`);
  return c.json(info());
});

/** Botão "Atualizar todos os painéis": emoji do rodapé + todos os painéis publicados com a logo atual. */
const paineisLimiter = rateLimit({ name: "branding-paineis", limit: 3, windowMs: 60_000 });
brandingRoutes.post("/paineis", paineisLimiter, requirePainel, requireAdmin, async (c) => {
  console.info(`[branding] atualização de todos os painéis pedida por discord:${c.get("session").user.id}`);
  return c.json({ relatorio: await atualizarTodosPaineis(true) });
});
