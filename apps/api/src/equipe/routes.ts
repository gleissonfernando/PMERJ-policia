import { Hono, type MiddlewareHandler } from "hono";
import { z } from "zod";
import { gerenciaEquipe, isAdminEnv, requirePainel, type PainelEnv } from "../auth/guards.js";
import type { Session } from "../auth/sessions.js";
import { addRole, botAtivo, getMember, listRoles, removeRole, rolesDetalhados } from "../discord/bot.js";
import { membrosDoServidor } from "../discord/gateway.js";
import { env } from "../env.js";
import { rateLimit } from "../security/rate-limit.js";
import { IDS_MODULOS, MODULOS } from "./modulos.js";
import { equipeStore, type Acesso, type MembroEquipe, type Quem } from "./store.js";

/**
 * Painel → Equipe. Só quem gerencia a equipe (admins do .env e Administradores da equipe) mexe aqui.
 * Travas: ninguém altera o próprio acesso; bots não entram; o cargo do Discord não pode ter
 * permissão de administrador nem ficar acima do cargo do bot.
 */

const snowflake = z.string().regex(/^\d{17,20}$/, "id_invalido");
const membroBody = z.object({
  userId: snowflake,
  funcao: z
    .string()
    .transform((s) => s.normalize("NFC").replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1, "funcao_vazia").max(40, "funcao_longa").refine((s) => !/@(everyone|here)|<@[&!]?\d+>/i.test(s), "mencao_proibida")),
  acesso: z.enum(["admin", "total", "personalizado"]),
  modulos: z
    .array(z.string())
    .max(40)
    .transform((l) => [...new Set(l)].filter((m) => IDS_MODULOS.has(m))),
  cargoDiscordId: snowflake.nullable(),
});

const quemDa = (s: Session): Quem => ({ id: s.user.id, nome: s.user.globalName ?? s.user.username });
const ROTULO: Record<Acesso, string> = { admin: "Administrador", total: "Acesso total", personalizado: "Personalizado" };
const ADMINISTRADOR = 1n << 3n;

const requireGerencia: MiddlewareHandler<PainelEnv> = async (c, next) => {
  if (!gerenciaEquipe(c.get("session"))) return c.json({ error: "proibido" }, 403);
  await next();
};

function estado(session: Session) {
  return {
    eu: session.user.id,
    souDono: isAdminEnv(session),
    modulos: MODULOS,
    membros: [...equipeStore.membros()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    historico: equipeStore.historico(40),
    /** Admins do .env (fixos): só a quantidade, para a tela explicar. */
    donos: env.PAINEL_ADMIN_IDS.length,
    botAtivo,
  };
}

export const equipeRoutes = new Hono<PainelEnv>();
const writeLimiter = rateLimit({ name: "equipe", limit: 20, windowMs: 60_000 });

equipeRoutes.use("*", requirePainel, requireGerencia);

equipeRoutes.get("/", async (c) => c.json({ ...estado(c.get("session")), cargos: await listRoles() }));

/** Busca membros do servidor pelo nome, usuário ou ID (sem bots, até 20). */
equipeRoutes.get("/buscar", async (c) => {
  const sem = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const q = sem(c.req.query("q") ?? "").trim().slice(0, 50);
  const membros = membrosDoServidor();
  if (!membros) {
    // Lista ainda carregando: pelo ID dá para achar direto no Discord.
    if (/^\d{17,20}$/.test(q)) {
      const m = await getMember(q);
      if (m && !m.user.bot) return c.json({ carregando: false, membros: [{ id: m.user.id, nome: m.nick ?? m.user.global_name ?? m.user.username, username: m.user.username, avatar: m.user.avatar }] });
    }
    return c.json({ carregando: true, membros: [] });
  }
  const achados = membros
    .filter((m) => !m.bot && (!q || sem(m.nome).includes(q) || sem(m.username).includes(q) || m.id === q))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
    .slice(0, 20)
    .map(({ id, nome, username, avatar }) => ({ id, nome, username, avatar }));
  return c.json({ carregando: false, membros: achados });
});

/** Adiciona ou altera um membro da equipe. */
equipeRoutes.put("/membros", writeLimiter, async (c) => {
  const session = c.get("session");
  const parsed = membroBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "";
    return c.json({ error: /^[a-z_]+$/.test(msg) ? msg : "dados_invalidos" }, 422);
  }
  const b = parsed.data;
  if (b.userId === session.user.id) return c.json({ error: "proprio_acesso" }, 409);
  if (b.acesso === "personalizado" && b.modulos.length === 0) return c.json({ error: "sem_modulos" }, 422);

  const m = await getMember(b.userId);
  if (!m) return c.json({ error: "membro_nao_encontrado" }, 404);
  if (m.user.bot) return c.json({ error: "alvo_bot" }, 422);

  // Cargo do Discord: nunca de administrador, nunca gerenciado, nunca acima do bot.
  if (b.cargoDiscordId) {
    const cargo = (await rolesDetalhados(true)).find((r) => r.id === b.cargoDiscordId);
    if (!cargo || cargo.gerenciado || cargo.id === env.DISCORD_GUILD_ID) return c.json({ error: "cargo_invalido" }, 422);
    if ((cargo.permissoes & ADMINISTRADOR) !== 0n && !isAdminEnv(session)) return c.json({ error: "cargo_administrador" }, 422);
  }

  const anterior = equipeStore.membro(b.userId);
  const quem = quemDa(session);
  const agora = Date.now();
  const nome = m.nick ?? m.user.global_name ?? m.user.username;

  // Troca de cargo do Discord: tira o antigo, dá o novo.
  let cargoEntregue: boolean | null = anterior?.cargoDiscordId === b.cargoDiscordId ? (anterior?.cargoEntregue ?? null) : null;
  if (anterior?.cargoDiscordId && anterior.cargoDiscordId !== b.cargoDiscordId) await removeRole(b.userId, anterior.cargoDiscordId, `Equipe do painel: cargo trocado por ${quem.nome}`);
  if (b.cargoDiscordId && (anterior?.cargoDiscordId !== b.cargoDiscordId || !m.roles.includes(b.cargoDiscordId))) {
    cargoEntregue = await addRole(b.userId, b.cargoDiscordId, `Equipe do painel (${b.funcao}) por ${quem.nome}`);
  }
  if (!b.cargoDiscordId) cargoEntregue = null;

  const membro: MembroEquipe = {
    userId: b.userId,
    nome,
    username: m.user.username,
    avatar: m.user.avatar,
    funcao: b.funcao,
    acesso: b.acesso,
    modulos: b.acesso === "personalizado" ? b.modulos : [],
    cargoDiscordId: b.cargoDiscordId,
    cargoEntregue,
    adicionadoPor: anterior?.adicionadoPor ?? quem,
    em: anterior?.em ?? agora,
    atualizadoPor: quem,
    atualizadoEm: agora,
  };
  const resumo = `${b.funcao} · ${ROTULO[b.acesso]}${b.acesso === "personalizado" ? ` (${membro.modulos.map((id) => MODULOS.find((x) => x.id === id)?.nome ?? id).join(", ")})` : ""}`;
  await equipeStore.salvarMembro(membro, { em: agora, por: quem, alvo: { id: b.userId, nome }, acao: anterior ? "alterou" : "adicionou", resumo });
  console.info(`[equipe] discord:${b.userId} ${anterior ? "alterado" : "adicionado"} (${b.acesso}) por discord:${session.user.id}`);
  return c.json({ ...estado(session), cargos: await listRoles(), cargoFalhou: b.cargoDiscordId ? cargoEntregue === false : false });
});

equipeRoutes.delete("/membros/:userId", writeLimiter, async (c) => {
  const session = c.get("session");
  const userId = c.req.param("userId");
  if (userId === session.user.id) return c.json({ error: "proprio_acesso" }, 409);
  const m = equipeStore.membro(userId);
  if (!m) return c.json({ error: "nao_encontrado" }, 404);
  const quem = quemDa(session);
  if (m.cargoDiscordId) await removeRole(userId, m.cargoDiscordId, `Saiu da equipe do painel (${quem.nome})`);
  await equipeStore.removerMembro(userId, { em: Date.now(), por: quem, alvo: { id: userId, nome: m.nome }, acao: "removeu", resumo: `${m.funcao} · ${ROTULO[m.acesso]}` });
  console.info(`[equipe] discord:${userId} removido por discord:${session.user.id}`);
  return c.json({ ...estado(session), cargos: await listRoles() });
});
