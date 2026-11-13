import { addReaction, deleteMessage, editInteractionReply, FLAG_COMPONENTS_V2, FLAG_EPHEMERAL, interactionCallback, removeOwnReaction, replyMessage, type MessageBody } from "../discord/bot.js";
import type { RawInteraction, RawMensagem } from "../discord/gateway.js";
import { comoMandarMidia } from "./mensagens.js";
import {
  abrirRascunho,
  acesso,
  cancelarRascunho,
  ComunicadoError,
  definirDestino,
  definirMencoes,
  fecharVencidos,
  formularioDados,
  formularioDetalhes,
  limparMidias,
  meuRascunho,
  publicarComunicado,
  salvarDados,
  salvarDetalhes,
  salvarMidias,
} from "./service.js";
import { comunicadoStore, type Pessoa } from "./store.js";

/**
 * Comunicados no Discord (custom_id "com:…"):
 *   com:new → abre o canal temporário
 *   com:d-dados|d-dados-modal|d-det|d-det-modal|d-canal|d-cargos|d-midia|d-clear|d-send|d-cancel:<rascunho>
 * Fotos/vídeos: mandados como mensagem no canal temporário; o bot coleta e apaga a mensagem.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COR_ERRO = 0xef5350;
const PERM_VER = 1n << 10n;
const PERM_ENVIAR = 1n << 11n;

const caixa = (conteudo: string, cor = 0xe11d48): MessageBody => ({
  flags: FLAG_EPHEMERAL | FLAG_COMPONENTS_V2,
  allowed_mentions: { parse: [] },
  components: [{ type: 17, accent_color: cor, components: [{ type: 10, content: conteudo.slice(0, 3900) }] }],
});
const responder = (i: RawInteraction, type: number, data?: MessageBody) => interactionCallback(i.id, i.token, data ? { type, data } : { type });
const concluir = (i: RawInteraction, conteudo: string, erro = false) => editInteractionReply(i.token, { ...caixa(conteudo, erro ? COR_ERRO : 0xe11d48), flags: FLAG_COMPONENTS_V2 });
const mensagemErro = (err: unknown) => (err instanceof ComunicadoError ? err.message : "Não foi possível concluir agora. Tente novamente em instantes.");

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

async function trabalhar(i: RawInteraction, fn: () => Promise<string>) {
  await responder(i, 5, { flags: FLAG_EPHEMERAL });
  try {
    await concluir(i, await fn());
  } catch (err) {
    if (!(err instanceof ComunicadoError)) console.error(`[comunicado] falha (${i.data?.custom_id}):`, err);
    await concluir(i, `❌ ${mensagemErro(err)}`, true);
  }
}

export async function handleComunicadoInteraction(i: RawInteraction): Promise<boolean> {
  const customId = i.data?.custom_id ?? "";
  if (!customId.startsWith("com:")) return false;
  const member = i.member;
  if (!member) {
    await responder(i, 4, caixa("Use dentro do servidor.", COR_ERRO));
    return true;
  }
  const ator: Pessoa = { id: member.user.id, nome: (member.nick ?? member.user.global_name ?? member.user.username).slice(0, 80), avatar: member.user.avatar ?? null };
  const [, acao = "", id = ""] = customId.split(":");
  const falhar = async (msg: string) => {
    await responder(i, 4, caixa(`❌ ${msg}`, COR_ERRO));
    return true;
  };

  try {
    // Permissão conferida em todo clique (o cargo pode ter sido tirado no meio).
    if (!acesso(member.user.id, member.roles ?? []).podePublicar) return falhar("Seu cargo não está autorizado a gerar comunicados de operação.");

    if (acao === "new") {
      if (!consumir(`${member.user.id}:new`, 5)) return falhar("Muitas tentativas seguidas. Aguarde um minuto.");
      await trabalhar(i, () => abrirRascunho(ator));
      return true;
    }

    if (!UUID.test(id)) return falhar("Comunicado inválido.");

    switch (acao) {
      case "d-dados":
        await responder(i, 9, formularioDados(id, member.user.id));
        return true;
      case "d-det":
        await responder(i, 9, formularioDetalhes(id, member.user.id));
        return true;
      case "d-dados-modal":
        await trabalhar(i, () => salvarDados(id, member.user.id, camposModal(i.data?.components)));
        return true;
      case "d-det-modal":
        await trabalhar(i, () => salvarDetalhes(id, member.user.id, camposModal(i.data?.components)));
        return true;
      case "d-canal": {
        meuRascunho(id, member.user.id);
        const canalId = i.data?.values?.[0] ?? null;
        if (canalId) {
          // Permissões de QUEM escolheu naquele canal (o Discord manda junto no select).
          const perms = BigInt(i.data?.resolved?.channels?.[canalId]?.permissions ?? "0");
          if ((perms & PERM_VER) === 0n || (perms & PERM_ENVIAR) === 0n) return falhar(`Você não pode enviar mensagens em <#${canalId}>. Escolha um canal onde você tem acesso.`);
        }
        await responder(i, 6);
        await definirDestino(id, member.user.id, canalId);
        return true;
      }
      case "d-cargos": {
        meuRascunho(id, member.user.id);
        const cargos = (i.data?.values ?? []).filter((r) => /^\d{17,20}$/.test(r));
        await responder(i, 6);
        await definirMencoes(id, member.user.id, cargos);
        return true;
      }
      case "d-midia":
        meuRascunho(id, member.user.id);
        await responder(i, 4, caixa(comoMandarMidia()));
        return true;
      case "d-clear":
        await trabalhar(i, () => limparMidias(id, member.user.id));
        return true;
      case "d-send":
        if (!consumir(`${member.user.id}:send`, 5)) return falhar("Muitas tentativas seguidas. Aguarde um minuto.");
        await trabalhar(i, () => publicarComunicado(id, member.user.id));
        return true;
      case "d-cancel":
        await trabalhar(i, () => cancelarRascunho(id, member.user.id));
        return true;
    }
    return falhar("Ação desconhecida.");
  } catch (err) {
    if (!(err instanceof ComunicadoError)) console.error(`[comunicado] falha (${customId}):`, err);
    return falhar(mensagemErro(err));
  }
}

/* ---------- Fotos e vídeos mandados no canal temporário ---------- */

const filas = new Map<string, Promise<void>>();
function enfileirar(m: RawMensagem) {
  const anterior = filas.get(m.channel_id) ?? Promise.resolve();
  const proxima = anterior.then(() => processar(m)).catch(() => undefined);
  filas.set(m.channel_id, proxima);
  void proxima.finally(() => filas.get(m.channel_id) === proxima && filas.delete(m.channel_id));
}

async function processar(m: RawMensagem) {
  await addReaction(m.channel_id, m.id, "⏳");
  let res: Awaited<ReturnType<typeof salvarMidias>> | { erro: string };
  try {
    res = await salvarMidias(m.channel_id, m.author.id, m.attachments.map((a) => ({ url: a.url, size: a.size })));
  } catch (err) {
    if (!(err instanceof ComunicadoError)) console.error("[comunicado] falha ao receber mídias:", err);
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

export async function aoMensagemNoComunicado(m: RawMensagem): Promise<void> {
  if (m.webhook_id || m.author.bot || !m.attachments.length) return;
  const d = comunicadoStore.rascunhoDoCanal(m.channel_id);
  if (!d || d.autor.id !== m.author.id) return;
  enfileirar(m);
}

let rotina: NodeJS.Timeout | null = null;
export function iniciarRotinaComunicado() {
  if (rotina) return;
  rotina = setInterval(() => void fecharVencidos().catch((err) => console.warn("[comunicado] rotina:", err)), 30_000);
  rotina.unref();
}
