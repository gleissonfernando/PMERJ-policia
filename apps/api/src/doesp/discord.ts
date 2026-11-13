import { addReaction, deleteMessage, editInteractionReply, FLAG_COMPONENTS_V2, FLAG_EPHEMERAL, interactionCallback, listMessages, removeOwnReaction, replyMessage, type MessageBody } from "../discord/bot.js";
import type { RawInteraction, RawMensagem } from "../discord/gateway.js";
import { comoAnexar, modalDesignar, modalIndeferir, modalResultado } from "./mensagens.js";
import {
  abrirRascunho,
  acesso,
  buscar,
  cancelarRascunho,
  designar,
  despachar,
  DoespError,
  encaminharResultados,
  enviarRascunho,
  fecharRascunhosVencidos,
  formularioRascunho,
  indeferir,
  limparMidias,
  salvarMidiasDaMensagem,
  salvarPreenchimento,
} from "./service.js";
import { doespStore, type Pessoa } from "./store.js";

/**
 * DOESP no Discord (custom_id "req:…", igual ao sistema do BOPE):
 *   req:new                       → painel: abre o canal temporário
 *   req:d-edit|d-modal|d-send|d-clear|d-cancel:<rascunho>  → canal temporário (só quem abriu)
 *   req:dispatch|refuse|assign|result(-modal):<id>          → botões do requerimento (cargo de cada etapa)
 * Fotos/vídeos: mandados como mensagem no canal temporário; o bot coleta e apaga a mensagem.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NEGADO = {
  request: "Só os Chefes de Seção (P/2) podem abrir requerimentos.",
  dispatch: "Só o Comandante pode despachar ou indeferir este requerimento.",
  execute: "Só o Comando pode designar os Agentes de Inteligência e encaminhar os resultados.",
};

const caixa = (conteudo: string, cor = 0x2b7fff): MessageBody => ({
  flags: FLAG_EPHEMERAL | FLAG_COMPONENTS_V2,
  allowed_mentions: { parse: [] },
  components: [{ type: 17, accent_color: cor, components: [{ type: 10, content: conteudo.slice(0, 3900) }] }],
});
const COR_ERRO = 0xef5350;

const responder = (i: RawInteraction, type: number, data?: MessageBody) => interactionCallback(i.id, i.token, data ? { type, data } : { type });
const adiar = (i: RawInteraction) => responder(i, 5, { flags: FLAG_EPHEMERAL });
const concluir = (i: RawInteraction, conteudo: string, erro = false) => editInteractionReply(i.token, { ...caixa(conteudo, erro ? COR_ERRO : 0x2b7fff), flags: FLAG_COMPONENTS_V2 });

/** Valores do formulário enviado (formato novo com Label e o antigo com Action Row). */
function camposModal(components: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (n: unknown) => {
    if (!n || typeof n !== "object") return;
    const x = n as { custom_id?: string; value?: string; component?: unknown; components?: unknown[] };
    if (x.custom_id && typeof x.value === "string") out[x.custom_id] = x.value;
    if (x.component) walk(x.component);
    if (Array.isArray(x.components)) x.components.forEach(walk);
  };
  if (Array.isArray(components)) components.forEach(walk);
  return out;
}

/** Limite simples: 5 aberturas por minuto por pessoa. */
const tentativas = new Map<string, number[]>();
function consumir(chave: string, max: number) {
  const agora = Date.now();
  const lista = (tentativas.get(chave) ?? []).filter((t) => agora - t < 60_000);
  if (lista.length >= max) return false;
  lista.push(agora);
  tentativas.set(chave, lista);
  if (tentativas.size > 1_000) tentativas.delete(tentativas.keys().next().value!);
  return true;
}

/** Executa com resposta adiada (pode passar de 3 s: criar canal, enviar vídeos). */
async function trabalhar(i: RawInteraction, fn: () => Promise<string>) {
  await adiar(i);
  try {
    await concluir(i, await fn());
  } catch (err) {
    if (!(err instanceof DoespError)) console.error(`[doesp] falha (${i.data?.custom_id}):`, err);
    await concluir(i, `❌ ${err instanceof DoespError ? err.message : "Não foi possível concluir agora. Tente novamente em instantes."}`, true);
  }
}

export async function handleDoespInteraction(i: RawInteraction): Promise<boolean> {
  const customId = i.data?.custom_id ?? "";
  if (!customId.startsWith("req:")) return false;
  const member = i.member;
  if (!member) {
    await responder(i, 4, caixa("Use dentro do servidor.", COR_ERRO));
    return true;
  }
  const roles = member.roles ?? [];
  const ac = acesso(member.user.id, roles);
  const ator: Pessoa = { id: member.user.id, name: (member.nick ?? member.user.global_name ?? member.user.username).slice(0, 80) };
  const [, acao = "", id = "", parte = ""] = customId.split(":");
  const campos = i.type === 5 ? camposModal(i.data?.components) : {};
  const falhar = (msg: string) => responder(i, 4, caixa(`❌ ${msg}`, COR_ERRO));

  try {
    // Botão do painel: abre o canal temporário do novo requerimento.
    if (acao === "new") {
      if (!ac.canRequest) { await falhar(NEGADO.request); return true; }
      if (!doespStore.config().requestsChannelId) { await falhar("O canal dos requerimentos ainda não foi configurado (painel web → DOESP)."); return true; }
      if (!consumir(`${member.user.id}:new`, 5)) { await falhar("Muitos requerimentos seguidos. Aguarde um minuto."); return true; }
      await trabalhar(i, () => abrirRascunho(ator));
      return true;
    }

    if (!UUID.test(id)) { await falhar("Requerimento inválido."); return true; }

    // Canal temporário: só quem abriu (conferido no serviço).
    if (acao.startsWith("d-")) {
      if (acao === "d-edit" && parte === "media") { await responder(i, 4, caixa(comoAnexar())); return true; }
      if (acao === "d-edit") { await responder(i, 9, formularioRascunho(id, member.user.id)); return true; }
      if (acao === "d-modal") { await trabalhar(i, () => salvarPreenchimento(id, member.user.id, campos)); return true; }
      if (acao === "d-clear") { await trabalhar(i, () => limparMidias(id, member.user.id)); return true; }
      if (acao === "d-send") { await trabalhar(i, () => enviarRascunho(id, member.user.id)); return true; }
      if (acao === "d-cancel") { await trabalhar(i, () => cancelarRascunho(id, member.user.id)); return true; }
      { await falhar("Ação desconhecida."); return true; }
    }

    // Botões do requerimento: o cargo certo para cada etapa.
    const precisa = { dispatch: "canDispatch", refuse: "canDispatch", "refuse-modal": "canDispatch", assign: "canExecute", "assign-modal": "canExecute", result: "canExecute", "result-modal": "canExecute" } as const;
    const porta = precisa[acao as keyof typeof precisa];
    if (!porta) { await falhar("Ação desconhecida."); return true; }
    if (!ac[porta]) { await falhar(porta === "canDispatch" ? NEGADO.dispatch : NEGADO.execute); return true; }

    const r = buscar(id);
    switch (acao) {
      case "dispatch":
        await trabalhar(i, () => despachar(id, ator));
        return true;
      case "refuse":
        if (r.status !== "AGUARDANDO") { await falhar("Este requerimento não aguarda mais despacho."); return true; }
        await responder(i, 9, modalIndeferir(r));
        return true;
      case "refuse-modal":
        await trabalhar(i, () => indeferir(id, ator, campos.reason));
        return true;
      case "assign":
        if (r.status !== "DEFERIDO") { await falhar(r.status === "AGUARDANDO" ? "O Comandante ainda não despachou este requerimento." : "Os Agentes de Inteligência já foram designados."); return true; }
        await responder(i, 9, modalDesignar(r));
        return true;
      case "assign-modal":
        await trabalhar(i, () => designar(id, ator, campos));
        return true;
      case "result":
        if (r.status !== "EM_EXECUCAO") { await falhar(r.status === "CONCLUIDO" ? "Os resultados deste requerimento já foram encaminhados." : "Designe os Agentes de Inteligência antes de encaminhar os resultados."); return true; }
        await responder(i, 9, modalResultado(r));
        return true;
      case "result-modal":
        if (!consumir(`${member.user.id}:result`, 5)) { await falhar("Muitos envios seguidos. Aguarde um minuto."); return true; }
        await trabalhar(i, () => encaminharResultados(id, ator, campos));
        return true;
    }
    return false;
  } catch (err) {
    if (!(err instanceof DoespError)) console.error(`[doesp] falha (${customId}):`, err);
    await falhar(err instanceof DoespError ? err.message : "Não foi possível concluir agora. Tente novamente em instantes.");
    return true;
  }
}

/* ---------- Fotos e vídeos mandados no canal temporário ---------- */

const filas = new Map<string, Promise<void>>();
/** Uma mensagem por vez por canal (na ordem em que chegaram). */
function enfileirar(m: RawMensagem) {
  const anterior = filas.get(m.channel_id) ?? Promise.resolve();
  const proxima = anterior.then(() => processar(m)).catch(() => undefined);
  filas.set(m.channel_id, proxima);
  void proxima.finally(() => filas.get(m.channel_id) === proxima && filas.delete(m.channel_id));
}

async function processar(m: RawMensagem) {
  await addReaction(m.channel_id, m.id, "⏳");
  let res: Awaited<ReturnType<typeof salvarMidiasDaMensagem>> | { erro: string };
  try {
    res = await salvarMidiasDaMensagem(
      m.channel_id,
      m.author.id,
      m.attachments.map((a) => ({ url: a.url, size: a.size })),
      m.content ?? "",
    );
  } catch (err) {
    if (!(err instanceof DoespError)) console.error("[doesp] falha ao receber mídias:", err);
    res = { erro: err instanceof DoespError ? err.message : "Não foi possível receber agora. Tente de novo." };
  }
  await removeOwnReaction(m.channel_id, m.id, "⏳");
  if ("ignorado" in res) return;
  if ("mensagem" in res) {
    if (!(await deleteMessage(m.channel_id, m.id))) await addReaction(m.channel_id, m.id, "✅");
    return;
  }
  await addReaction(m.channel_id, m.id, "❌");
  await replyMessage(m.channel_id, m.id, res.erro);
}

export async function aoMensagemNoRascunho(m: RawMensagem): Promise<void> {
  if (m.webhook_id || m.author.bot) return;
  const d = doespStore.draftByChannel(m.channel_id);
  if (!d || d.author.id !== m.author.id) return;
  if (!m.attachments.length && !/https?:\/\//i.test(m.content ?? "")) return;
  enfileirar(m);
}

/** Depois de um restart: mensagens que ficaram com ⏳ do bot foram cortadas no meio — processa de novo. */
export async function retomarMidias(): Promise<void> {
  for (const d of doespStore.drafts().filter((x) => x.status === "OPEN" && x.channelId)) {
    const msgs = await listMessages(d.channelId!, 50);
    const pendentes = msgs.filter((x) => !x.author.bot && x.reactions?.some((r) => r.emoji.name === "⏳" && r.me)).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    for (const x of pendentes) {
      console.info(`[doesp] retomando mídia interrompida no canal ${d.channelId}.`);
      enfileirar({ id: x.id, channel_id: d.channelId!, content: x.content, author: { id: x.author.id, username: "", bot: x.author.bot }, attachments: x.attachments });
    }
  }
}

let rotina: NodeJS.Timeout | null = null;
/** Apaga os canais temporários enviados/cancelados e expira os abandonados (a cada 30 s). */
export function iniciarRotinaDoesp() {
  if (rotina) return;
  rotina = setInterval(() => void fecharRascunhosVencidos().catch((err) => console.warn("[doesp] rotina:", err)), 30_000);
  rotina.unref();
}
