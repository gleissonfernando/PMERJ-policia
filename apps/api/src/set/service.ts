import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  addRole,
  botAtivo,
  createPrivateChannel,
  deleteChannel,
  editMessage,
  kickMember,
  postMessage,
  removeRole,
  sendDM,
  sendLog,
  setNickname,
} from "../discord/bot.js";
import { infoServidor } from "../discord/gateway.js";
import { APELIDO_MAX, montarApelido } from "./apelido.js";
import { brasao } from "./brasao.js";
import { dmResultado, mensagemPedido } from "./mensagens.js";
import { setStore } from "./store.js";
import type { OrigemSet, SetRegistro } from "./types.js";

/**
 * Regra única do "Pedir Set", usada pelo site (rotas) e pelo Discord (gateway).
 *   modo automático → aplica na hora (apelido + cargos)
 *   modo aprovação  → o bot abre um canal temporário visível SÓ para os cargos aprovadores;
 *                     aprovado = cargos + apelido · reprovado = DM com o motivo + expulsão.
 *                     O canal é apagado logo depois da decisão.
 */

/** Tempo para quem decidiu ver o resultado antes do canal sumir. */
const APAGAR_CANAL_EM_MS = 15_000;

const clean = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim();

/** Letras (com acento), espaço, ponto, hífen e apóstrofo. Nada de @, #, `, : (bloqueados pelo Discord / markdown). */
export const nomeSchema = z
  .string()
  .transform(clean)
  .pipe(
    z
      .string()
      .min(2, "nome_curto")
      .max(24, "nome_longo")
      .regex(/^\p{L}[\p{L}\p{M} .'-]*$/u, "nome_invalido"),
  );

export const gameIdSchema = z.string().trim().regex(/^\d{1,7}$/, "id_invalido");
export const itemId = z.string().regex(/^[a-z0-9-]{1,40}$/);

export const pedidoSchema = z.object({
  nome: nomeSchema,
  gameId: gameIdSchema,
  patenteId: itemId,
  orgaoId: itemId.nullish(),
});

/** Primeiro código de erro conhecido (nunca devolve texto livre). */
export function issueCode(err: z.ZodError): string {
  const msg = err.issues[0]?.message ?? "";
  return /^[a-z_]+$/.test(msg) ? msg : "dados_invalidos";
}

export interface Solicitante {
  id: string;
  username: string;
  avatar: string | null;
}

export interface Aprovador {
  id: string;
  username: string;
  /** Cargos ATUAIS no servidor (do clique no Discord ou lidos na hora pelo bot). */
  roles: string[];
}

export type Resultado = { ok: true; registro: SetRegistro } | { ok: false; erro: string; registro?: SetRegistro };

/* ---------- Quem aprova: só os cargos configurados ---------- */

export function podeAprovar(a: Pick<Aprovador, "roles">): boolean {
  const cargos = setStore.config().cargosAprovadores;
  return a.roles.some((r) => cargos.includes(r));
}

/* ---------- Pedido ---------- */

type Dados = Pick<SetRegistro, "nome" | "gameId" | "patente" | "orgao" | "apelido">;

function validar(input: unknown): { ok: true; dados: Dados } | { ok: false; erro: string } {
  const parsed = pedidoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, erro: issueCode(parsed.error) };
  const body = parsed.data;
  const cfg = setStore.config();

  const patente = cfg.patentes.find((p) => p.id === body.patenteId);
  if (!patente) return { ok: false, erro: "patente_invalida" };
  const orgao = cfg.campos.orgao ? cfg.orgaos.find((o) => o.id === body.orgaoId) : undefined;
  if (cfg.campos.orgao && !orgao) return { ok: false, erro: "orgao_invalido" };

  const apelido = montarApelido(cfg.formato, { prefixo: patente.prefixo, nome: body.nome, id: body.gameId, orgao: orgao?.sigla });
  if (apelido.length > APELIDO_MAX) return { ok: false, erro: "apelido_longo" };
  return { ok: true, dados: { nome: body.nome, gameId: body.gameId, patente: { ...patente }, orgao: orgao ? { ...orgao } : null, apelido } };
}

const motivoAuditoria = (r: SetRegistro) => `Pedir Set ${r.decididoPor ? `por ${r.decididoPor.username}` : `via ${r.origem}`} (${r.userId})`;

async function aplicarApelido(r: SetRegistro): Promise<void> {
  if (!setStore.config().alterarApelido || !botAtivo) {
    r.statusApelido = "desligado";
    return;
  }
  r.statusApelido = (await setNickname(r.userId, r.apelido, motivoAuditoria(r))) ? "aplicado" : "falhou";
}

/** Entrega os cargos fixos + o da patente e tira os cargos das outras patentes. */
async function aplicarCargos(r: SetRegistro): Promise<void> {
  const cfg = setStore.config();
  const patenteAtual = cfg.patentes.find((p) => p.id === r.patente.id)?.cargoId ?? null;
  const dar = [...new Set([...cfg.cargosAoAprovar, ...(patenteAtual ? [patenteAtual] : [])])];
  const tirar = cfg.patentes.map((p) => p.cargoId).filter((c): c is string => Boolean(c) && !dar.includes(c!));
  if (!botAtivo || (dar.length === 0 && tirar.length === 0)) {
    r.statusCargos = "nao_se_aplica";
    return;
  }
  const motivo = motivoAuditoria(r);
  const resultados = await Promise.all([...dar.map((c) => addRole(r.userId, c, motivo)), ...tirar.map((c) => removeRole(r.userId, c, motivo))]);
  r.statusCargos = resultados.every(Boolean) ? "feito" : "falhou";
}

function logDecisao(r: SetRegistro) {
  const cfg = setStore.config();
  const aprovado = r.status === "aprovado";
  void sendLog(cfg.logCanalId, {
    title: aprovado ? "🪪 Set aprovado" : "🪪 Set reprovado",
    color: aprovado && r.statusApelido !== "falhou" ? 0x22c55e : 0xe10600,
    footer: "PMERJ · Pedir Set",
    fields: [
      { name: "Policial", value: `<@${r.userId}> (@${r.username})`, inline: true },
      { name: "Apelido", value: r.apelido, inline: true },
      { name: "Patente", value: r.patente.nome, inline: true },
      ...(r.orgao ? [{ name: "Órgão", value: `${r.orgao.sigla} — ${r.orgao.nome}`, inline: true }] : []),
      { name: aprovado ? "Aprovado por" : "Reprovado por", value: r.decididoPor ? `<@${r.decididoPor.id}>` : "Automático", inline: true },
      ...(r.motivo ? [{ name: "Motivo", value: r.motivo }] : []),
      ...(r.statusExpulsao === "feito" ? [{ name: "Expulsão", value: "Membro expulso do servidor." }] : []),
      ...(r.statusExpulsao === "falhou" ? [{ name: "⚠️ Expulsão", value: "O Discord recusou a expulsão." }] : []),
      ...(aprovado && r.statusApelido === "falhou" ? [{ name: "⚠️ Apelido", value: "O Discord recusou a troca do apelido." }] : []),
      ...(aprovado && r.statusCargos === "falhou" ? [{ name: "⚠️ Cargos", value: "Algum cargo não pôde ser entregue." }] : []),
    ],
  });
}

const opcoesMensagem = (apagaEm?: number) => ({ expulsar: setStore.config().expulsarAoReprovar, apagaEm });

/** Mantém a mensagem do canal temporário igual ao estado do pedido. */
async function sincronizarMensagem(r: SetRegistro, apagaEm?: number): Promise<void> {
  if (r.mensagem) await editMessage(r.mensagem.canalId, r.mensagem.mensagemId, mensagemPedido(r, opcoesMensagem(apagaEm)), brasao());
}

/** Apaga o canal temporário (na hora ou depois de `emMs`). */
function apagarCanal(r: SetRegistro, emMs = 0) {
  const canal = r.mensagem?.canalId;
  if (!canal) return;
  setTimeout(() => {
    void deleteChannel(canal, `Pedido de set de ${r.username} encerrado`).then(async (ok) => {
      if (ok && r.mensagem?.canalId === canal) {
        r.mensagem = null;
        await setStore.update();
      }
    });
  }, emMs).unref();
}

/** Nome do canal: set-<usuário>, só com caracteres aceitos pelo Discord. */
const nomeCanal = (username: string) =>
  `set-${username
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "membro"}`;

/** Abre o canal temporário do pedido e publica a mensagem com os botões. */
async function abrirCanalDoPedido(r: SetRegistro): Promise<void> {
  const cfg = setStore.config();
  const canalId = await createPrivateChannel({
    nome: nomeCanal(r.username),
    topico: `Pedido de set de @${r.username} (${r.userId}). Some depois da análise.`,
    categoriaId: cfg.aprovacaoCategoriaId,
    cargos: cfg.cargosAprovadores,
    motivo: `Pedido de set de ${r.username}`,
  });
  if (!canalId) {
    console.warn(`[set] não foi possível abrir o canal do pedido de discord:${r.userId}; ele segue na aba Aprovações do site.`);
    return;
  }
  const msg = await postMessage(canalId, mensagemPedido(r, opcoesMensagem()), brasao());
  if (msg) r.mensagem = { canalId, mensagemId: msg.id };
  else void deleteChannel(canalId, "Falha ao publicar o pedido");
}

/**
 * Recebe um pedido. No modo automático, aplica na hora. No modo aprovação, cria o
 * pedido (ou atualiza o pendente do mesmo policial) num canal temporário dos aprovadores.
 */
export async function solicitarSet(quem: Solicitante, input: unknown, origem: OrigemSet): Promise<Resultado> {
  const v = validar(input);
  if (!v.ok) return v;
  const cfg = setStore.config();
  const agora = Date.now();

  const novo = (status: SetRegistro["status"]): SetRegistro => ({
    id: randomUUID(),
    userId: quem.id,
    username: quem.username,
    avatar: quem.avatar,
    ...v.dados,
    status,
    statusApelido: "desligado",
    origem,
    em: agora,
    decididoPor: null,
    decididoEm: status === "aprovado" ? agora : null,
    motivo: null,
    mensagem: null,
  });

  if (cfg.modo === "automatico") {
    const r = novo("aprovado");
    await aplicarApelido(r);
    await aplicarCargos(r);
    await setStore.add(r);
    console.info(`[set] discord:${quem.id} → "${r.apelido}" (${origem}, automático, apelido ${r.statusApelido}, cargos ${r.statusCargos})`);
    logDecisao(r);
    return { ok: true, registro: r };
  }

  // Modo aprovação: um pedido pendente por policial — pedir de novo atualiza o mesmo.
  const existente = setStore.pendente(quem.id);
  if (existente) {
    Object.assign(existente, { ...v.dados, username: quem.username, avatar: quem.avatar, origem, em: agora });
    if (!existente.mensagem) await abrirCanalDoPedido(existente);
    else await sincronizarMensagem(existente);
    await setStore.update();
    console.info(`[set] pedido atualizado discord:${quem.id} → "${existente.apelido}"`);
    return { ok: true, registro: existente };
  }

  const r = novo("pendente");
  await abrirCanalDoPedido(r);
  await setStore.add(r);
  console.info(`[set] novo pedido discord:${quem.id} → "${r.apelido}" (${origem})`);
  return { ok: true, registro: r };
}

/** Confere se o aprovador pode decidir este pedido, sem alterar nada. */
export function checarDecisao(id: string, a: Aprovador): Resultado {
  const r = setStore.byId(id);
  if (!r) return { ok: false, erro: "nao_encontrado" };
  if (r.status !== "pendente") return { ok: false, erro: "ja_decidido", registro: r };
  if (!podeAprovar(a)) return { ok: false, erro: "nao_aprovador", registro: r };
  if (r.userId === a.id) return { ok: false, erro: "proprio_pedido", registro: r };
  return { ok: true, registro: r };
}

/**
 * Aprova (cargos + apelido) ou reprova (DM com o motivo e, se configurado, expulsão).
 * A DM da reprovação vai ANTES da expulsão: depois o bot não alcança mais a pessoa.
 */
export async function decidirSet(id: string, a: Aprovador, decisao: "aprovar" | "reprovar", motivo?: string | null): Promise<Resultado> {
  const check = checarDecisao(id, a);
  if (!check.ok) return check;
  const r = check.registro;
  const cfg = setStore.config();
  const servidor = infoServidor()?.nome ?? "PMERJ";

  // Marca na hora: um segundo clique simultâneo já vê "ja_decidido".
  r.status = decisao === "aprovar" ? "aprovado" : "reprovado";
  r.decididoPor = { id: a.id, username: a.username };
  r.decididoEm = Date.now();
  r.motivo = decisao === "reprovar" ? motivo?.trim().slice(0, 400) || null : null;
  await setStore.update();

  if (decisao === "aprovar") {
    await aplicarCargos(r);
    await aplicarApelido(r);
    void sendDM(r.userId, dmResultado(r, servidor, false), brasao());
  } else if (cfg.expulsarAoReprovar && botAtivo) {
    await sendDM(r.userId, dmResultado(r, servidor, true), brasao());
    r.statusExpulsao = (await kickMember(r.userId, `Set reprovado por ${a.username}${r.motivo ? `: ${r.motivo}` : ""}`.slice(0, 400)))
      ? "feito"
      : "falhou";
  } else {
    r.statusExpulsao = "nao_se_aplica";
    void sendDM(r.userId, dmResultado(r, servidor, false), brasao());
  }

  await setStore.update();
  await sincronizarMensagem(r, Date.now() + APAGAR_CANAL_EM_MS);
  apagarCanal(r, APAGAR_CANAL_EM_MS);
  logDecisao(r);
  console.info(`[set] pedido ${r.status} discord:${r.userId} por discord:${a.id}${r.statusExpulsao === "feito" ? " (expulso)" : ""}`);
  return { ok: true, registro: r };
}

/** Encerra o pendente sem decisão (o próprio policial desistiu ou saiu do servidor). */
async function encerrarPendente(userId: string, motivo: string): Promise<Resultado> {
  const r = setStore.pendente(userId);
  if (!r) return { ok: false, erro: "sem_pendente" };
  r.status = "cancelado";
  r.decididoEm = Date.now();
  r.motivo = motivo;
  await setStore.update();
  apagarCanal(r);
  return { ok: true, registro: r };
}

export const cancelarPedido = (userId: string) => encerrarPendente(userId, "Cancelado pelo próprio policial.");

/** Quem sai do servidor com pedido pendente: o pedido some junto com o canal. */
export async function aoMembroSair(userId: string): Promise<void> {
  const r = await encerrarPendente(userId, "Saiu do servidor antes da análise.");
  if (r.ok) console.info(`[set] pedido de discord:${userId} cancelado: saiu do servidor`);
}

/** Na inicialização: apaga canais de pedidos já decididos que ficaram para trás (API reiniciada no meio). */
export function limparCanaisEncerrados(): void {
  for (const r of setStore.recentes(500)) {
    if (r.status !== "pendente" && r.mensagem) apagarCanal(r);
  }
}

export const MENSAGEM_ERRO: Record<string, string> = {
  nome_curto: "O nome precisa ter pelo menos 2 letras.",
  nome_longo: "O nome pode ter no máximo 24 caracteres.",
  nome_invalido: "Use apenas letras, espaços, ponto, hífen ou apóstrofo no nome.",
  id_invalido: "O ID deve ter apenas números (até 7 dígitos).",
  patente_invalida: "Selecione uma patente válida.",
  orgao_invalido: "Selecione o órgão.",
  apelido_longo: "O apelido final passa de 32 caracteres, limite do Discord. Encurte o nome.",
  nao_encontrado: "Pedido não encontrado.",
  ja_decidido: "Este pedido já foi analisado.",
  nao_aprovador: "Só os cargos aprovadores configurados no painel podem aprovar ou reprovar sets.",
  proprio_pedido: "Você não pode aprovar ou reprovar o seu próprio pedido.",
  dados_invalidos: "Dados inválidos. Confira e tente de novo.",
};
