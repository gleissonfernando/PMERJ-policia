import { addReaction, deleteMessage, editInteractionReply, FLAG_COMPONENTS_V2, FLAG_EPHEMERAL, interactionCallback, removeOwnReaction, replyMessage, type MessageBody } from "../discord/bot.js";
import type { RawInteraction, RawMensagem } from "../discord/gateway.js";
import { comoMandarEvidencias, modalTipo } from "./mensagens.js";
import {
  abrirRascunho,
  acesso,
  adicionarPreso,
  definirHouvePreso,
  formularioPreso,
  removerPreso,
  cancelarRascunho,
  definirParticipantes,
  enviarRascunho,
  fecharVencidos,
  formularioRelato,
  limparEvidencias,
  meuRascunho,
  OcorrenciaError,
  salvarEvidencias,
  salvarRelato,
} from "./service.js";
import { ocorrenciaStore, type Pessoa } from "./store.js";

/**
 * Ocorrência no Discord (custom_id "oc:…"):
 *   oc:new → modal com o tipo · oc:new-modal → abre o canal temporário
 *   oc:d-fill|d-modal|d-part|d-evid|d-clear|d-send|d-cancel:<rascunho> → canal temporário (só quem abriu)
 * Fotos: mandadas como mensagem no canal temporário; o bot coleta e apaga a mensagem.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COR_ERRO = 0xef5350;

const caixa = (conteudo: string, cor = 0xe10600): MessageBody => ({
  flags: FLAG_EPHEMERAL | FLAG_COMPONENTS_V2,
  allowed_mentions: { parse: [] },
  components: [{ type: 17, accent_color: cor, components: [{ type: 10, content: conteudo.slice(0, 3900) }] }],
});

const responder = (i: RawInteraction, type: number, data?: MessageBody) => interactionCallback(i.id, i.token, data ? { type, data } : { type });
const concluir = (i: RawInteraction, conteudo: string, erro = false) => editInteractionReply(i.token, { ...caixa(conteudo, erro ? COR_ERRO : 0xe10600), flags: FLAG_COMPONENTS_V2 });
const mensagemErro = (err: unknown) => (err instanceof OcorrenciaError ? err.message : "Não foi possível concluir agora. Tente novamente em instantes.");

/** Valores do formulário: textos (value) e selects (values[0]). */
function camposModal(components: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (n: unknown) => {
    if (!n || typeof n !== "object") return;
    const x = n as { custom_id?: string; value?: string; values?: string[]; component?: unknown; components?: unknown[] };
    if (x.custom_id && typeof x.value === "string") out[x.custom_id] = x.value;
    if (x.custom_id && Array.isArray(x.values) && typeof x.values[0] === "string") out[x.custom_id] = x.values[0];
    if (x.component) walk(x.component);
    if (Array.isArray(x.components)) x.components.forEach(walk);
  };
  if (Array.isArray(components)) components.forEach(walk);
  return out;
}

/** Limite simples por pessoa e ação (por minuto). */
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

/** Resposta adiada e efêmera (criar canal e enviar fotos passam de 3 s). */
async function trabalhar(i: RawInteraction, fn: () => Promise<string>) {
  await responder(i, 5, { flags: FLAG_EPHEMERAL });
  try {
    await concluir(i, await fn());
  } catch (err) {
    if (!(err instanceof OcorrenciaError)) console.error(`[ocorrencia] falha (${i.data?.custom_id}):`, err);
    await concluir(i, `❌ ${mensagemErro(err)}`, true);
  }
}

export async function handleOcorrenciaInteraction(i: RawInteraction): Promise<boolean> {
  const customId = i.data?.custom_id ?? "";
  if (!customId.startsWith("oc:")) return false;
  const member = i.member;
  if (!member) {
    await responder(i, 4, caixa("Use dentro do servidor.", COR_ERRO));
    return true;
  }
  const ator: Pessoa = { id: member.user.id, nome: (member.nick ?? member.user.global_name ?? member.user.username).slice(0, 80), avatar: member.user.avatar ?? null };
  const [, acao = "", id = ""] = customId.split(":");
  const falhar = (msg: string) => responder(i, 4, caixa(`❌ ${msg}`, COR_ERRO));

  try {
    if (acao === "new" || acao === "new-modal") {
      const c = ocorrenciaStore.config();
      if (!acesso(member.user.id, member.roles ?? []).podeRegistrar) { await falhar("Seu cargo não está autorizado a registrar ocorrências."); return true; }
      if (!c.destinoCanalId) { await falhar("O canal das ocorrências ainda não foi configurado (painel web → Ocorrência)."); return true; }
      if (acao === "new") {
        if (!c.tipos.length) { await falhar("Nenhum tipo de ocorrência cadastrado (painel web → Ocorrência)."); return true; }
        const aberto = ocorrenciaStore.abertoDe(member.user.id);
        if (aberto?.canalId && aberto.status === "OPEN") { await responder(i, 4, caixa(`➡️ Você já tem um registro aberto: <#${aberto.canalId}>. Envie ou cancele antes de abrir outro.`)); return true; }
        await responder(i, 9, modalTipo(c.tipos));
        return true;
      }
      if (!consumir(`${member.user.id}:new`, 5)) { await falhar("Muitos registros seguidos. Aguarde um minuto."); return true; }
      const tipo = camposModal(i.data?.components).tipo ?? "";
      await trabalhar(i, () => abrirRascunho(ator, tipo));
      return true;
    }

    if (!UUID.test(id)) { await falhar("Registro inválido."); return true; }

    switch (acao) {
      case "d-fill":
        await responder(i, 9, formularioRelato(id, member.user.id));
        return true;
      case "d-modal":
        await trabalhar(i, () => salvarRelato(id, member.user.id, camposModal(i.data?.components)));
        return true;
      case "d-part": {
        meuRascunho(id, member.user.id); // erro de dono antes de reconhecer o clique
        const usuarios = i.data?.resolved?.users ?? {};
        const ids = (i.data?.values ?? []).filter((u) => /^\d{17,20}$/.test(u) && !usuarios[u]?.bot);
        await responder(i, 6); // o painel é redesenhado pelo bot
        await definirParticipantes(id, member.user.id, ids); // bots ficam de fora
        return true;
      }
      case "d-preso":
        meuRascunho(id, member.user.id);
        await responder(i, 6);
        await definirHouvePreso(id, member.user.id, i.data?.values?.[0] ?? "");
        return true;
      case "d-padd":
        await responder(i, 9, formularioPreso(id, member.user.id));
        return true;
      case "d-pmodal":
        await trabalhar(i, () => adicionarPreso(id, member.user.id, camposModal(i.data?.components)));
        return true;
      case "d-prem":
        meuRascunho(id, member.user.id);
        await responder(i, 6);
        await removerPreso(id, member.user.id, i.data?.values?.[0] ?? "");
        return true;
      case "d-evid":
        meuRascunho(id, member.user.id);
        await responder(i, 4, caixa(comoMandarEvidencias()));
        return true;
      case "d-clear":
        await trabalhar(i, () => limparEvidencias(id, member.user.id));
        return true;
      case "d-send":
        if (!consumir(`${member.user.id}:send`, 5)) { await falhar("Muitos envios seguidos. Aguarde um minuto."); return true; }
        await trabalhar(i, () => enviarRascunho(id, member.user.id));
        return true;
      case "d-cancel":
        await trabalhar(i, () => cancelarRascunho(id, member.user.id));
        return true;
    }
    await falhar("Ação desconhecida.");
    return true;
  } catch (err) {
    if (!(err instanceof OcorrenciaError)) console.error(`[ocorrencia] falha (${customId}):`, err);
    await falhar(mensagemErro(err));
    return true;
  }
}

/* ---------- Fotos mandadas no canal temporário ---------- */

const filas = new Map<string, Promise<void>>();
function enfileirar(m: RawMensagem) {
  const anterior = filas.get(m.channel_id) ?? Promise.resolve();
  const proxima = anterior.then(() => processar(m)).catch(() => undefined);
  filas.set(m.channel_id, proxima);
  void proxima.finally(() => filas.get(m.channel_id) === proxima && filas.delete(m.channel_id));
}

async function processar(m: RawMensagem) {
  await addReaction(m.channel_id, m.id, "⏳");
  let res: Awaited<ReturnType<typeof salvarEvidencias>> | { erro: string };
  try {
    res = await salvarEvidencias(m.channel_id, m.author.id, m.attachments.map((a) => ({ url: a.url, size: a.size })));
  } catch (err) {
    if (!(err instanceof OcorrenciaError)) console.error("[ocorrencia] falha ao receber evidências:", err);
    res = { erro: mensagemErro(err) };
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

export async function aoMensagemNaOcorrencia(m: RawMensagem): Promise<void> {
  if (m.webhook_id || m.author.bot || !m.attachments.length) return;
  const d = ocorrenciaStore.rascunhoDoCanal(m.channel_id);
  if (!d || d.autor.id !== m.author.id) return;
  enfileirar(m);
}

let rotina: NodeJS.Timeout | null = null;
/** Apaga os canais temporários encerrados e expira os abandonados (a cada 30 s). */
export function iniciarRotinaOcorrencia() {
  if (rotina) return;
  rotina = setInterval(() => void fecharVencidos().catch((err) => console.warn("[ocorrencia] rotina:", err)), 30_000);
  rotina.unref();
}
