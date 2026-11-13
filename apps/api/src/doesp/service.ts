import { addReaction, createTicketChannel, deleteChannel, deleteMessage, editMessage, guildUploadLimit, postMessage, type MessageBody } from "../discord/bot.js";
import { env } from "../env.js";
import { brasao } from "../set/brasao.js";
import { apagarMidias, arquivosMidia, coletarMidias, lotesMidia, MidiaError, type Upload } from "./media.js";
import { faltando, mensagemMidia, mensagemRequerimento, modalPreencher, painelRascunho, painelRequerimento } from "./mensagens.js";
import { doespStore, DRAFT_TTL_MS, LIMITES, numeroRequerimento, type Midia, type Pessoa, type Rascunho, type Requerimento, type StatusRequerimento } from "./store.js";

/**
 * Requerimento ao Comando (DOESP) — mesmo fluxo do sistema do BOPE:
 *  painel "Novo requerimento" → canal temporário (Preencher · fotos/vídeos como mensagem · Enviar)
 *  → canal dos requerimentos (marca o Comandante) → Despachar ✅ / Indeferir
 *  → Designar DOESP (1ª Cia) → Encaminhar resultados à P/2
 *  → canal dos resultados: painéis V2 com as imagens/vídeos anexados na abertura.
 */

export class DoespError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/* ---------- Permissões (por cargo, conferidas a cada clique) ---------- */

export interface Acesso {
  canConfigure: boolean;
  canManage: boolean;
  canRequest: boolean;
  canDispatch: boolean;
  canExecute: boolean;
}

const temAlgum = (roles: string[], lista: string[]) => roles.some((r) => lista.includes(r));
/** Administradores do painel (PAINEL_ADMIN_IDS / PAINEL_ADMIN_ROLE_IDS) fazem todas as etapas. */
export const adminDiscord = (userId: string, roles: string[]) => env.PAINEL_ADMIN_IDS.includes(userId) || temAlgum(roles, env.PAINEL_ADMIN_ROLE_IDS);

export function acesso(userId: string, roles: string[], adminWeb = false): Acesso {
  const c = doespStore.config();
  const admin = adminWeb || adminDiscord(userId, roles);
  return {
    canConfigure: admin,
    canManage: admin || temAlgum(roles, c.managerRoleIds),
    canRequest: admin || temAlgum(roles, c.requesterRoleIds),
    canDispatch: admin || temAlgum(roles, c.commanderRoleIds),
    canExecute: admin || temAlgum(roles, c.companyRoleIds),
  };
}

/* ---------- Helpers ---------- */

const urlMensagem = (r: Requerimento) => (r.channelId && r.messageId ? `https://discord.com/channels/${env.DISCORD_GUILD_ID}/${r.channelId}/${r.messageId}` : null);

function limpar(v: unknown, max: number, rotulo: string) {
  const t = typeof v === "string" ? v.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "").trim().slice(0, max) : "";
  if (!t) throw new DoespError(`Preencha: ${rotulo}.`);
  return t;
}

export function buscar(id: string) {
  const r = doespStore.get(id);
  if (!r) throw new DoespError("Este requerimento não foi encontrado nos registros.", 404);
  return r;
}

const MSG_ESTADO: Record<StatusRequerimento, string> = {
  AGUARDANDO: "Este requerimento ainda aguarda o despacho do Comandante.",
  DEFERIDO: "Este requerimento já foi despachado e aguarda a designação dos Agentes de Inteligência.",
  EM_EXECUCAO: "Os Agentes de Inteligência já foram designados; falta encaminhar os resultados à P/2.",
  CONCLUIDO: "Este requerimento já foi concluído.",
  INDEFERIDO: "Este requerimento foi indeferido.",
};

async function atualizarMensagem(r: Requerimento) {
  if (r.channelId && r.messageId) await editMessage(r.channelId, r.messageId, mensagemRequerimento(r, doespStore.config().commanderRoleIds));
}

async function avisar(r: Requerimento, conteudo: string, usuarios: string[] = []) {
  if (!r.channelId) return;
  const link = urlMensagem(r);
  await postMessage(r.channelId, {
    flags: 1 << 15,
    allowed_mentions: { parse: [], users: usuarios },
    components: [{ type: 10, content: `${conteudo}${link ? `\n-# [Abrir o requerimento](${link})` : ""}` }],
  });
}

/* ---------- Painel público ---------- */

export async function publicarPainel(recriar: boolean) {
  const c = doespStore.config();
  if (!c.panelChannelId) throw new DoespError("Escolha e salve o canal do painel antes de publicar.");
  const corpo = painelRequerimento();
  const editado = c.panelMessageId && !recriar ? await editMessage(c.panelChannelId, c.panelMessageId, corpo, brasao()) : false;
  if (editado) return doespStore.updateConfig({ panelError: null });
  const msg = await postMessage(c.panelChannelId, corpo, brasao());
  if (!msg) {
    await doespStore.updateConfig({ panelError: "o bot não pode enviar no canal" });
    throw new DoespError("Não foi possível publicar o painel: o bot não pode enviar no canal.", 502);
  }
  if (recriar && c.panelMessageId) await deleteMessage(c.panelChannelId, c.panelMessageId);
  return doespStore.updateConfig({ panelMessageId: msg.id, panelError: null });
}

/* ---------- Resultados no canal dos resultados ---------- */

/**
 * Publica as imagens/vídeos no canal dos resultados (ou no dos requerimentos): painéis V2,
 * cada um dentro do limite de envio do servidor. Pode repetir após qualquer falha sem duplicar.
 */
export async function publicarResultados(req: Requerimento, retry = false): Promise<Requerimento> {
  const c = doespStore.config();
  const canal = req.resultChannelId ?? c.resultsChannelId ?? req.channelId;
  if (!canal) throw new DoespError("Configure o canal dos resultados (painel web → DOESP).");
  let r = doespStore.update(req.id, { mediaStatus: retry ? "RETRYING" : "PROCESSING", mediaError: null }) ?? req;

  try {
    const lotes: Midia[][] = lotesMidia(r.media, await guildUploadLimit());
    if (!lotes.length && r.requestLinks.length) lotes.push([]); // só links: um painel com os botões

    // Painéis anteriores são trocados, nunca duplicados.
    const canalAnterior = r.resultChannelId ?? canal;
    for (const id of new Set([...r.mediaMessageIds, ...(r.resultMessageId ? [r.resultMessageId] : [])])) await deleteMessage(canalAnterior, id);
    r = doespStore.update(r.id, { resultChannelId: canal, resultMessageId: null, mediaMessageIds: [] }) ?? r;

    const postados: string[] = [];
    for (const [i, lote] of lotes.entries()) {
      const msg = await postMessage(canal, mensagemMidia(r, lote.map((m) => m.name), i + 1, lotes.length, urlMensagem(r)), lote.length ? await arquivosMidia(r.id, lote) : undefined);
      if (!msg) throw new DoespError("o bot não pode enviar no canal dos resultados");
      postados.push(msg.id);
      doespStore.update(r.id, { resultMessageId: postados[0], mediaMessageIds: postados });
    }
    r = doespStore.update(r.id, { mediaStatus: "COMPLETED", mediaError: null, resultMessageId: postados[0] ?? null, mediaMessageIds: postados }) ?? r;
    await atualizarMensagem(r);
    return r;
  } catch (err) {
    const motivo = err instanceof MidiaError || err instanceof DoespError ? err.message : "falha no Discord";
    console.warn("[doesp] falha ao publicar os resultados:", err instanceof Error ? err.message : err);
    doespStore.update(r.id, { mediaStatus: "FAILED", mediaError: motivo });
    throw new DoespError(`Os resultados não foram publicados no canal: ${motivo}.`, 502);
  }
}

export async function republicarMidias(id: string) {
  const r = buscar(id);
  if (r.status !== "CONCLUIDO") throw new DoespError("Este requerimento ainda não tem resultados.");
  return publicarResultados(r, true);
}

/* ---------- Etapas do requerimento ---------- */

export async function despachar(id: string, por: Pessoa) {
  buscar(id);
  const r = doespStore.move(id, ["AGUARDANDO"], { status: "DEFERIDO", dispatchedBy: por, dispatchedAt: Date.now() });
  if (!r) throw new DoespError(MSG_ESTADO[buscar(id).status]);
  await atualizarMensagem(r);
  if (r.channelId && r.messageId) await addReaction(r.channelId, r.messageId, "✅");
  console.info(`[doesp] ${numeroRequerimento(r)} despachado por discord:${por.id}`);
  return `✅ ${numeroRequerimento(r)} despachado.`;
}

export async function indeferir(id: string, por: Pessoa, motivo: unknown) {
  const t = limpar(motivo, LIMITES.reason, "o motivo do indeferimento");
  const r = doespStore.move(id, ["AGUARDANDO"], { status: "INDEFERIDO", dispatchedBy: por, dispatchedAt: Date.now(), refusedReason: t });
  if (!r) throw new DoespError(MSG_ESTADO[buscar(id).status]);
  await atualizarMensagem(r);
  await avisar(r, `❌ **${numeroRequerimento(r)}** indeferido pelo Comandante. <@${r.requester.id}>`, [r.requester.id]);
  console.info(`[doesp] ${numeroRequerimento(r)} indeferido por discord:${por.id}`);
  return `❌ ${numeroRequerimento(r)} indeferido. O Chefe de Seção foi avisado.`;
}

export async function designar(id: string, por: Pessoa, campos: Record<string, unknown>) {
  const patch = {
    doesp: limpar(campos.doesp, LIMITES.doesp, "os Agentes de Inteligência designados"),
    team: limpar(campos.team, LIMITES.team, "o efetivo empregado"),
    assignedPeriod: limpar(campos.period, LIMITES.period, "o período de emprego"),
  };
  const r = doespStore.move(id, ["DEFERIDO"], { status: "EM_EXECUCAO", ...patch, assignedBy: por, assignedAt: Date.now() });
  if (!r) throw new DoespError(MSG_ESTADO[buscar(id).status]);
  await atualizarMensagem(r);
  console.info(`[doesp] ${numeroRequerimento(r)}: agentes designados por discord:${por.id}`);
  return `🎖️ Agentes de Inteligência designados para o ${numeroRequerimento(r)}.`;
}

/** "Encaminhar resultados à P/2" (só texto). As mídias da abertura saem no canal dos resultados. */
export async function encaminharResultados(id: string, por: Pessoa, campos: Record<string, unknown>) {
  const t = limpar(campos.result, LIMITES.result, "os resultados obtidos");
  const atual = buscar(id);
  if (atual.status !== "EM_EXECUCAO") throw new DoespError(MSG_ESTADO[atual.status]);
  const r = doespStore.move(id, ["EM_EXECUCAO"], { status: "CONCLUIDO", result: t, resultBy: por, resultAt: Date.now(), mediaStatus: "PENDING", mediaError: null });
  if (!r) throw new DoespError(MSG_ESTADO[buscar(id).status]);

  const anexos = r.media.length + r.requestLinks.length;
  const aviso = anexos
    ? await publicarResultados(r).then(
        () => null,
        async (err: unknown) => {
          await atualizarMensagem(r);
          return err instanceof Error ? err.message : "falha ao publicar";
        },
      )
    : (doespStore.update(r.id, { mediaStatus: "COMPLETED" }), await atualizarMensagem(r), null);

  await avisar(r, `🏁 Resultados do **${numeroRequerimento(r)}** encaminhados à P/2. <@${r.requester.id}>`, [r.requester.id]);
  console.info(`[doesp] ${numeroRequerimento(r)} concluído por discord:${por.id}`);
  return [
    `🏁 Resultados encaminhados. ${numeroRequerimento(r)} concluído.${anexos ? ` ${anexos} imagem(ns)/vídeo(s) publicados junto.` : ""}`,
    aviso ? `⚠️ ${aviso} Tudo ficou salvo: use "Publicar de novo" no painel web.` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/* ---------- Canal temporário (rascunho do novo requerimento) ---------- */

/** Quanto tempo o painel "enviado/cancelado" fica antes de o canal ser apagado. */
const ATRASO_FECHAR_MS = 8_000;
const INICIO_PROCESSO = Date.now();
const MAX_OCUPADO_MS = 20 * 60_000;

/** Um upload ainda está sendo processado: Enviar espera, para o vídeo nunca ficar para trás. */
export const ocupado = (d: Pick<Rascunho, "mediaBusyAt">) => typeof d.mediaBusyAt === "number" && d.mediaBusyAt >= INICIO_PROCESSO && Date.now() - d.mediaBusyAt < MAX_OCUPADO_MS;

/** As mídias mostradas no painel temporário (o primeiro lote que cabe no limite). */
async function galeria(d: Rascunho): Promise<Midia[]> {
  if (!d.media.length) return [];
  try {
    const limite = await guildUploadLimit();
    return lotesMidia(d.media.filter((m) => m.size <= limite), limite)[0] ?? [];
  } catch {
    return [];
  }
}

/**
 * Redesenha o painel do canal temporário com as mídias (posta de novo se foi apagado).
 * Os arquivos só são reenviados quando mudam; qualquer outra edição mantém os já anexados.
 */
export async function redesenhar(d: Rascunho, fechando = false): Promise<void> {
  if (!d.channelId) return;
  let mostrar = fechando ? [] : await galeria(d);
  const chave = mostrar.map((m) => m.id).join(",");
  const corpo = (nomes: Midia[]): MessageBody => painelRascunho(d, ocupado(d), fechando, nomes.map((m) => m.name));

  // Mesmos arquivos: só texto e botões mudam (editar sem anexos mantém os atuais).
  if (d.panelMessageId && !fechando && d.panelMediaKey === chave && (await editMessage(d.channelId, d.panelMessageId, corpo(mostrar)))) return;

  const arquivos = await arquivosMidia(d.id, mostrar).catch(() => {
    mostrar = [];
    return [];
  });
  const chaveFinal = mostrar.map((m) => m.id).join(",");
  // A logo (cabeçalho) vai junto das mídias; sem nenhum anexo, a lista vazia remove os antigos.
  const anexos = [...brasao(), ...arquivos];
  const editado = d.panelMessageId ? await editMessage(d.channelId, d.panelMessageId, { ...corpo(mostrar), ...(anexos.length ? {} : { attachments: [] }) }, anexos.length ? anexos : undefined) : false;
  if (editado) {
    doespStore.updateDraft(d.id, { panelMediaKey: chaveFinal }, null);
    return;
  }
  const msg = await postMessage(d.channelId, corpo(mostrar), anexos.length ? anexos : undefined);
  if (msg) doespStore.updateDraft(d.id, { panelMessageId: msg.id, panelMediaKey: chaveFinal }, null);
}

const linkCanal = (d: Rascunho) => `<#${d.channelId}>`;
const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "membro";

/** "Novo requerimento": abre o canal temporário do membro (ou aponta o que já está aberto). */
export async function abrirRascunho(autor: Pessoa) {
  const c = doespStore.config();
  if (!c.requestsChannelId) throw new DoespError("O canal dos requerimentos ainda não foi configurado (painel web → DOESP).");

  let existente = doespStore.openDraftOf(autor.id);
  if (existente && Date.now() - existente.createdAt >= DRAFT_TTL_MS) {
    await expirar(existente);
    existente = undefined;
  }
  if (existente?.channelId) {
    await redesenhar(existente).catch(() => null);
    return `➡️ Você já tem um preenchimento aberto: ${linkCanal(existente)}`;
  }

  const d = existente ?? doespStore.createDraft(autor);
  const canal = await createTicketChannel({
    nome: `📝・requerimento-${slug(autor.name)}`,
    topico: `Novo requerimento ao Comando · ${autor.name} · ref ${d.id.slice(0, 8)}`,
    categoriaId: c.draftCategoryId,
    cargos: c.managerRoleIds,
    usuarioId: autor.id,
    motivo: "Novo requerimento (DOESP)",
  });
  if (!canal) {
    doespStore.updateDraft(d.id, { status: "CANCELLED", notice: "Canal não criado" }, null);
    throw new DoespError("Não foi possível criar o canal: o bot precisa de Gerenciar Canais (e acesso à categoria escolhida).", 502);
  }
  const salvo = doespStore.updateDraft(d.id, { channelId: canal }) ?? d;
  await redesenhar(salvo);
  console.info(`[doesp] canal de requerimento aberto para discord:${autor.id}`);
  return `✅ Canal criado: ${linkCanal(salvo)}. Preencha tudo por lá e toque em **Enviar**.`;
}

/** O rascunho por trás de um botão do canal temporário: aberto e de quem clicou. */
export function meuRascunho(id: string, userId: string) {
  const d = doespStore.draft(id);
  if (!d) throw new DoespError("Este preenchimento não foi encontrado nos registros.", 404);
  if (d.status === "SENDING") throw new DoespError("Este preenchimento está sendo enviado. Aguarde.");
  if (d.status !== "OPEN") throw new DoespError("Este preenchimento já foi encerrado.");
  if (d.author.id !== userId) throw new DoespError(`Só quem abriu (${d.author.name}) pode preencher e enviar.`, 403);
  return d;
}

export const formularioRascunho = (id: string, userId: string) => modalPreencher(meuRascunho(id, userId));

export async function salvarPreenchimento(id: string, userId: string, campos: Record<string, unknown>) {
  const d = meuRascunho(id, userId);
  const fields = {
    ...d.fields,
    fact: limpar(campos.fact, LIMITES.fact, "o fato ou situação de interesse"),
    subject: limpar(campos.subject, LIMITES.subject, "o objeto do levantamento"),
    information: limpar(campos.information, LIMITES.information, "as informações a confirmar"),
    area: limpar(campos.area, LIMITES.area, "a área de interesse"),
    period: limpar(campos.period, LIMITES.period, "o período estimado"),
  };
  const atual = doespStore.updateDraft(id, { fields, notice: "💾 Informações salvas." });
  if (!atual) throw new DoespError("Este preenchimento já foi encerrado.");
  await redesenhar(atual).catch(() => null);
  return "✅ Informações salvas.";
}

/** Fotos/vídeos/links mandados como mensagem no canal temporário (só as do autor contam). */
export async function salvarMidiasDaMensagem(canalId: string, userId: string, uploads: Upload[], texto: string): Promise<{ ignorado: true } | { mensagem: string }> {
  const d = doespStore.draftByChannel(canalId);
  const links = [...new Set(texto.match(/https?:\/\/[^\s<>]+/gi) ?? [])].map((l) => l.replace(/[).,;!?]+$/, ""));
  if (!d || d.author.id !== userId || (!uploads.length && !links.length)) return { ignorado: true };
  if (ocupado(d)) throw new DoespError("Ainda estou processando o envio anterior. Aguarde terminar para mandar outro.");

  // Marcado como ocupado: Enviar fica travado até os arquivos entrarem.
  const marcado = doespStore.updateDraft(d.id, { mediaBusyAt: Date.now(), notice: "⏳ Recebendo as mídias... o botão **Enviar** libera quando terminar." });
  if (!marcado) throw new DoespError("Este preenchimento já foi encerrado.");
  await redesenhar(marcado).catch(() => null);

  const coletado = await coletarMidias({
    donoId: d.id,
    uploads: uploads.slice(0, 10),
    links,
    limite: await guildUploadLimit(),
    files: d.media.length,
    linkCount: d.links.length,
    aoComprimir: async () => {
      const x = doespStore.updateDraft(d.id, { notice: "⏳ Comprimindo o vídeo para caber no painel... pode levar alguns minutos. O botão **Enviar** libera quando terminar." });
      if (x) await redesenhar(x);
    },
  }).catch(async (err: unknown) => {
    const msg = err instanceof MidiaError ? err.message : "Falha ao receber as mídias. Tente de novo.";
    const livre = doespStore.updateDraft(d.id, { mediaBusyAt: null, notice: `⚠️ ${msg}` });
    if (livre) await redesenhar(livre).catch(() => null);
    if (!(err instanceof MidiaError)) console.error("[doesp] falha ao receber mídias:", err);
    throw new DoespError(msg);
  });

  const ultimo = doespStore.draft(d.id) ?? d;
  const resumo = `${coletado.media.length} arquivo(s) e ${coletado.links.length} link(s) adicionados.`;
  const pronto = doespStore.updateDraft(d.id, { media: [...ultimo.media, ...coletado.media], links: [...ultimo.links, ...coletado.links], mediaBusyAt: null, notice: `💾 ${resumo}` });
  if (!pronto) return { mensagem: await midiasTardias(d.id, coletado) };
  await redesenhar(pronto).catch(() => null);
  return { mensagem: `✅ ${resumo}` };
}

/**
 * Arquivos que terminaram depois de o rascunho fechar (ex.: enviado logo após o restart):
 * entram no requerimento em vez de se perder. Rascunho cancelado descarta.
 */
async function midiasTardias(id: string, coletado: { media: Midia[]; links: string[] }) {
  let d = doespStore.draft(id);
  for (let i = 0; d?.status === "SENDING" && i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1_500));
    d = doespStore.draft(id);
  }
  const req = d?.status === "SENT" ? doespStore.get(id) : undefined;
  if (!req) {
    await apagarMidias(id, coletado.media.map((m) => m.id));
    throw new DoespError("Este preenchimento já foi encerrado; as mídias não foram usadas.");
  }
  const r = doespStore.update(id, { media: [...req.media, ...coletado.media], requestLinks: [...req.requestLinks, ...coletado.links] })!;
  if (r.status === "CONCLUIDO") await publicarResultados(r, true).catch(() => null);
  return `✅ Mídias adicionadas ao **${numeroRequerimento(r)}**${r.status === "CONCLUIDO" ? " e publicadas nos resultados" : "; vão junto com os resultados"}.`;
}

export async function limparMidias(id: string, userId: string) {
  const d = meuRascunho(id, userId);
  await apagarMidias(d.id, d.media.map((m) => m.id));
  const atual = doespStore.updateDraft(id, { media: [], links: [], notice: "🧹 Mídias removidas." });
  if (atual) await redesenhar(atual).catch(() => null);
  return "🧹 Fotos, vídeos e links removidos.";
}

/** Rascunho preenchido → requerimento (mesmo id: os arquivos já estão no lugar) publicado no canal dos requerimentos. */
async function protocolar(d: Rascunho) {
  const c = doespStore.config();
  if (!c.requestsChannelId) throw new DoespError("O canal dos requerimentos ainda não foi configurado (painel web → DOESP).");
  const v = d.fields;
  const campos = {
    requester: d.author,
    fact: limpar(v.fact, LIMITES.fact, "o fato ou situação de interesse"),
    subject: limpar(v.subject, LIMITES.subject, "o objeto do levantamento"),
    information: limpar(v.information, LIMITES.information, "as informações a confirmar"),
    area: limpar(v.area, LIMITES.area, "a área de interesse"),
    period: limpar(v.period, LIMITES.period, "o período estimado"),
    media: d.media,
    requestLinks: d.links,
    mediaStatus: d.media.length ? ("PENDING" as const) : null,
  };
  const anterior = doespStore.get(d.id);
  const r = anterior
    ? (doespStore.update(d.id, { ...campos, status: "AGUARDANDO", refusedReason: null, channelId: null, messageId: null }) ?? anterior)
    : doespStore.create({ id: d.id, ...campos });
  const msg = await postMessage(c.requestsChannelId, mensagemRequerimento(r, c.commanderRoleIds));
  if (!msg) {
    doespStore.update(r.id, { status: "INDEFERIDO", refusedReason: "Não publicado: o bot não pode enviar no canal" });
    throw new DoespError("O requerimento não pôde ser publicado: o bot não pode enviar no canal. Tente enviar de novo.", 502);
  }
  console.info(`[doesp] ${numeroRequerimento(r)} aberto por discord:${d.author.id}`);
  return doespStore.update(r.id, { channelId: c.requestsChannelId, messageId: msg.id }) ?? r;
}

/** "Enviar": publica, fecha o painel e agenda a exclusão do canal. */
export async function enviarRascunho(id: string, userId: string) {
  const atual = meuRascunho(id, userId);
  const falta = faltando(atual);
  if (falta.length) throw new DoespError(`Falta preencher: ${falta.join(", ")}.`);
  if (ocupado(atual)) throw new DoespError("Aguarde: as mídias ainda estão sendo processadas. O botão Enviar libera quando terminar.");

  const d = doespStore.updateDraft(id, { status: "SENDING", notice: null }); // dois cliques nunca enviam duas vezes
  if (!d) throw new DoespError("Este preenchimento já está sendo enviado.");

  let r: Requerimento;
  try {
    r = await protocolar(d);
  } catch (err) {
    const msg = err instanceof DoespError ? err.message : "Falha ao enviar. Tente de novo.";
    const reaberto = doespStore.updateDraft(id, { status: "OPEN", notice: `⚠️ ${msg}` }, ["SENDING"]);
    if (reaberto) await redesenhar(reaberto).catch(() => null);
    if (!(err instanceof DoespError)) console.error("[doesp] falha ao enviar o preenchimento:", err);
    throw err instanceof DoespError ? err : new DoespError(msg, 502);
  }

  const aviso = `✅ **${numeroRequerimento(r)}** enviado ao Comandante em <#${r.channelId}>.\n-# Este canal será apagado em alguns segundos.`;
  const enviado = doespStore.updateDraft(id, { status: "SENT", notice: aviso, channelCloseAt: Date.now() + ATRASO_FECHAR_MS }, ["SENDING"]);
  if (enviado) await redesenhar(enviado, true).catch(() => null);
  return aviso.split("\n-#")[0]!;
}

/** "Cancelar": descarta o que foi digitado e enviado e apaga o canal. */
export async function cancelarRascunho(id: string, userId: string) {
  const d = meuRascunho(id, userId);
  const cancelado = doespStore.updateDraft(id, { status: "CANCELLED", notice: "🗑️ Preenchimento cancelado.\n-# Este canal será apagado em alguns segundos.", channelCloseAt: Date.now() + ATRASO_FECHAR_MS });
  if (!cancelado) throw new DoespError("Este preenchimento já foi encerrado.");
  await apagarMidias(d.id);
  await redesenhar(cancelado, true).catch(() => null);
  return "🗑️ Preenchimento cancelado.";
}

async function expirar(d: Rascunho) {
  if (doespStore.updateDraft(d.id, { status: "CANCELLED", notice: "Cancelado automaticamente: aberto há mais de 6 horas.", channelCloseAt: Date.now() })) await apagarMidias(d.id);
}

/** Rotina (a cada 30 s): apaga canais de rascunhos enviados/cancelados e expira os abandonados. Sobrevive a restarts. */
export async function fecharRascunhosVencidos() {
  const agora = Date.now();
  for (const d of doespStore.drafts().filter((x) => x.status === "OPEN" && x.createdAt <= agora - DRAFT_TTL_MS)) await expirar(d);
  for (const d of doespStore.drafts().filter((x) => x.channelCloseAt !== null && x.channelCloseAt <= agora).slice(0, 25)) {
    if (d.channelId && !(await deleteChannel(d.channelId, d.status === "SENT" ? "Requerimento enviado" : "Preenchimento cancelado"))) continue; // tenta de novo na próxima
    doespStore.updateDraft(d.id, { channelCloseAt: null }, null);
  }
}
