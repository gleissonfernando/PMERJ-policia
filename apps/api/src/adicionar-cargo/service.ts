import { randomUUID } from "node:crypto";
import { emojiLogo } from "../branding/emoji.js";
import { addRole, avatarDoMembro, botAtivo, FLAG_COMPONENTS_V2, getMember, posicaoDoBot, postMessage, rolesDetalhados, type CargoDetalhado, type MembroDiscord } from "../discord/bot.js";
import { env } from "../env.js";
import { setStore } from "../set/store.js";
import { adicionarCargoStore, type CargoDado, type Quem, type RegistroCargo } from "./store.js";

/**
 * /adicionar-cargo — quem tem um dos cargos liberados dá cargos a um membro.
 *
 * Travas (sempre com os dados ATUAIS do Discord, no momento de confirmar):
 *   - nunca @everyone nem cargos de bot/integração/impulso
 *   - nunca acima do cargo do bot (o Discord recusaria)
 *   - com lista de "cargos que podem ser dados": só esses
 *   - SEM lista (qualquer cargo): só abaixo do seu cargo mais alto, sem permissões de
 *     administração e sem cargos de patente (patente é pelo /promoção)
 */

export const MAX_CARGOS_POR_VEZ = 5;

/** Permissões que um cargo "livre" não pode ter (dariam poder de administração). */
const PERIGOSAS =
  (1n << 1n) | // expulsar
  (1n << 2n) | // banir
  (1n << 3n) | // administrador
  (1n << 4n) | // gerenciar canais
  (1n << 5n) | // gerenciar servidor
  (1n << 28n) | // gerenciar cargos
  (1n << 29n) | // gerenciar webhooks
  (1n << 40n); // castigar membros

export function podeUsar(roles: string[]): boolean {
  const lista = adicionarCargoStore.config().cargosUsar;
  return lista.length > 0 && roles.some((r) => lista.includes(r));
}

export type MotivoBloqueio = "cargo_inexistente" | "cargo_gerenciado" | "cargo_nao_permitido" | "cargo_acima_do_bot" | "cargo_acima_de_voce" | "cargo_perigoso" | "cargo_patente";

export const MOTIVO_TEXTO: Record<MotivoBloqueio, string> = {
  cargo_inexistente: "cargo não existe mais",
  cargo_gerenciado: "cargo de bot/integração",
  cargo_nao_permitido: "fora da lista de cargos liberados",
  cargo_acima_do_bot: "acima do cargo do bot",
  cargo_acima_de_voce: "igual ou acima do seu cargo mais alto",
  cargo_perigoso: "tem permissões de administração",
  cargo_patente: "é cargo de patente (use /promoção)",
};

/** Tudo o que a conferência precisa, lido uma vez por passo. */
export interface Contexto {
  cargos: Map<string, CargoDetalhado>;
  posBot: number;
  posExecutor: number;
  permitidos: string[];
  patentes: Set<string>;
}

export async function contexto(rolesExecutor: string[], fresco = false): Promise<Contexto> {
  const lista = await rolesDetalhados(fresco);
  const cargos = new Map(lista.map((c) => [c.id, c]));
  return {
    cargos,
    posBot: await posicaoDoBot(),
    posExecutor: Math.max(0, ...rolesExecutor.map((r) => cargos.get(r)?.posicao ?? 0)),
    permitidos: adicionarCargoStore.config().cargosPermitidos,
    patentes: new Set(setStore.config().patentes.map((p) => p.cargoId).filter((c): c is string => Boolean(c))),
  };
}

export function bloqueio(cargoId: string, ctx: Contexto): MotivoBloqueio | null {
  const c = ctx.cargos.get(cargoId);
  if (!c) return "cargo_inexistente";
  if (c.id === env.DISCORD_GUILD_ID || c.gerenciado) return "cargo_gerenciado";
  if (ctx.permitidos.length > 0 && !ctx.permitidos.includes(c.id)) return "cargo_nao_permitido";
  if (ctx.posBot >= 0 && c.posicao >= ctx.posBot) return "cargo_acima_do_bot";
  if (ctx.permitidos.length === 0) {
    // Lista escolhida pela administração dispensa estas travas; "qualquer cargo" não.
    if (c.posicao >= ctx.posExecutor) return "cargo_acima_de_voce";
    if ((c.permissoes & PERIGOSAS) !== 0n) return "cargo_perigoso";
    if (ctx.patentes.has(c.id)) return "cargo_patente";
  }
  return null;
}

export const nomeDoMembro = (m: MembroDiscord) => m.nick ?? m.user.global_name ?? m.user.username;

/* ---------- Mensagem de registro (Components V2) ---------- */

export function mensagemRegistro(r: RegistroCargo) {
  const emoji = emojiLogo();
  const dados = r.cargos.filter((c) => c.ok);
  const falhos = r.cargos.filter((c) => !c.ok);
  return {
    flags: FLAG_COMPONENTS_V2,
    // Registro: ninguém é notificado (nem o membro, nem os cargos).
    allowed_mentions: { parse: [] },
    components: [
      {
        type: 17,
        accent_color: dados.length ? 0x22c55e : 0xb45309,
        components: [
          {
            type: 9,
            components: [
              { type: 10, content: `### ➕ Cargo adicionado` },
              { type: 10, content: `<@${r.userId}> recebeu ${dados.length ? dados.map((c) => `<@&${c.id}>`).join(", ") : "_nenhum cargo_"}` },
              {
                type: 10,
                content: [`-# por <@${r.por.id}> · <t:${Math.floor(r.em / 1000)}:f>`, ...(falhos.length ? [`-# ⚠️ O Discord recusou: ${falhos.map((c) => c.nome).join(", ")}`] : [])].join("\n"),
              },
            ],
            accessory: { type: 11, media: { url: avatarDoMembro(r.userId, null, r.avatar, 256) }, description: `Avatar de ${r.nome}`.slice(0, 1024) },
          },
          { type: 10, content: `-# ${emoji ? `${emoji} ` : ""}PMERJ · Registro de cargos` },
        ],
      },
    ],
  };
}

/* ---------- Dar os cargos ---------- */

export type Resultado = { ok: true; registro: RegistroCargo; jaTinha: string[] } | { ok: false; erro: string; detalhe?: string };

export async function adicionarCargos(alvoId: string, cargoIds: string[], por: Quem, rolesExecutor: string[]): Promise<Resultado> {
  if (!botAtivo) return { ok: false, erro: "bot_desligado" };
  if (!podeUsar(rolesExecutor)) return { ok: false, erro: "sem_permissao" };
  const ids = [...new Set(cargoIds)].slice(0, MAX_CARGOS_POR_VEZ);
  if (ids.length === 0) return { ok: false, erro: "sem_cargo" };
  if (alvoId === por.id) return { ok: false, erro: "auto" };

  const membro = await getMember(alvoId);
  if (!membro) return { ok: false, erro: "membro_nao_encontrado" };
  if (membro.user.bot) return { ok: false, erro: "alvo_bot" };

  // Dados frescos: um cargo pode ter mudado de posição/permissões desde que o painel abriu.
  const ctx = await contexto(rolesExecutor, true);
  for (const id of ids) {
    const b = bloqueio(id, ctx);
    if (b) return { ok: false, erro: "cargo_bloqueado", detalhe: `${ctx.cargos.get(id)?.nome ?? "Cargo"}: ${MOTIVO_TEXTO[b]}` };
  }
  const jaTinha = ids.filter((id) => membro.roles.includes(id));
  const novos = ids.filter((id) => !membro.roles.includes(id));
  if (novos.length === 0) return { ok: false, erro: "ja_tem" };

  const motivo = `/adicionar-cargo por ${por.nome}`.slice(0, 400);
  const cargos: CargoDado[] = [];
  for (const id of novos) {
    const c = ctx.cargos.get(id)!;
    cargos.push({ id, nome: c.nome, cor: c.cor, ok: await addRole(alvoId, id, motivo) });
  }

  const registro: RegistroCargo = {
    id: randomUUID(),
    userId: alvoId,
    username: membro.user.username,
    nome: nomeDoMembro(membro),
    avatar: membro.user.avatar,
    cargos,
    por,
    em: Date.now(),
    mensagem: null,
  };
  const canal = adicionarCargoStore.config().canalLogId;
  if (canal) {
    const msg = await postMessage(canal, mensagemRegistro(registro));
    if (msg) registro.mensagem = { canalId: canal, mensagemId: msg.id };
  }
  await adicionarCargoStore.add(registro);
  console.info(`[adicionar-cargo] discord:${alvoId} recebeu ${cargos.map((c) => `${c.id}${c.ok ? "" : "(falhou)"}`).join(",")} por discord:${por.id}`);
  return { ok: true, registro, jaTinha };
}

export const MENSAGEM_ERRO: Record<string, string> = {
  sem_permissao: "Seu cargo não pode adicionar cargos.",
  bot_desligado: "O bot não está configurado no servidor.",
  sem_cargo: "Escolha pelo menos um cargo.",
  auto: "Você não pode dar cargo a si mesmo.",
  membro_nao_encontrado: "Esse membro não está mais no servidor.",
  alvo_bot: "Não é possível dar cargos a bots por aqui.",
  cargo_bloqueado: "Um dos cargos não pode ser dado.",
  ja_tem: "O membro já tem todos os cargos escolhidos.",
};
