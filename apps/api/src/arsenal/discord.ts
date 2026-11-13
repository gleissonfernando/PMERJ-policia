import { editInteractionReply, FLAG_COMPONENTS_V2, FLAG_EPHEMERAL, interactionCallback, type MessageBody } from "../discord/bot.js";
import type { RawInteraction } from "../discord/gateway.js";
import { modalDevolver, modalPerda, modalRecuperar, modalRetirar } from "./mensagens.js";
import { acesso, ArsenalError, atualizarPainelPublicado, devolver, perdidasPara, recuperar, registrarPerda, retirar } from "./service.js";
import { arsenalStore, type Pessoa } from "./store.js";

/**
 * Retirada de Baú no Discord (custom_id "ars:…"):
 *   ars:acao (select do painel) → abre o formulário da opção escolhida
 *   ars:m-retirar | m-devolver | m-perda | m-recuperar → formulário enviado
 */

const COR = 0x1e3a8a;
const COR_ERRO = 0xef5350;

const caixa = (conteudo: string, cor = COR): MessageBody => ({
  flags: FLAG_EPHEMERAL | FLAG_COMPONENTS_V2,
  allowed_mentions: { parse: [] },
  components: [{ type: 17, accent_color: cor, components: [{ type: 10, content: conteudo.slice(0, 3900) }] }],
});
const responder = (i: RawInteraction, type: number, data?: MessageBody) => interactionCallback(i.id, i.token, data ? { type, data } : { type });

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

/** Redesenha o painel (o select volta a "Selecione uma opção" para todo mundo). Agrupado. */
let timer: NodeJS.Timeout | null = null;
function resetarSelect() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void atualizarPainelPublicado();
  }, 1_500);
  timer.unref();
}

/** Um envio por vez por pessoa (clique duplo não registra duas vezes). */
const ocupados = new Set<string>();

async function trabalhar(i: RawInteraction, userId: string, fn: () => Promise<string>) {
  if (ocupados.has(userId)) {
    await responder(i, 4, caixa("⏳ Aguarde: seu registro anterior ainda está sendo concluído.", COR_ERRO));
    return;
  }
  ocupados.add(userId);
  await responder(i, 5, { flags: FLAG_EPHEMERAL });
  try {
    await editInteractionReply(i.token, { ...caixa(await fn()), flags: FLAG_COMPONENTS_V2 });
  } catch (err) {
    if (!(err instanceof ArsenalError)) console.error(`[arsenal] falha (${i.data?.custom_id}):`, err);
    const msg = err instanceof ArsenalError ? err.message : "Não foi possível concluir agora. Tente novamente em instantes.";
    await editInteractionReply(i.token, { ...caixa(`❌ ${msg}`, COR_ERRO), flags: FLAG_COMPONENTS_V2 });
  } finally {
    ocupados.delete(userId);
  }
}

export async function handleArsenalInteraction(i: RawInteraction): Promise<boolean> {
  const customId = i.data?.custom_id ?? "";
  if (!customId.startsWith("ars:")) return false;
  const member = i.member;
  if (!member) {
    await responder(i, 4, caixa("Use dentro do servidor.", COR_ERRO));
    return true;
  }
  // ID e nome no servidor coletados automaticamente.
  const pessoa: Pessoa = { id: member.user.id, nome: (member.nick ?? member.user.global_name ?? member.user.username).slice(0, 80) };
  const ac = acesso(member.user.id, member.roles ?? []);
  const avisar = async (msg: string) => {
    await responder(i, 4, caixa(msg, COR_ERRO));
    return true;
  };

  if (customId === "ars:acao") resetarSelect();
  if (!ac.podeUsar) return avisar("🔒 Seu cargo não está autorizado a usar a Retirada de Baú.");

  if (customId === "ars:acao") {
    const opcao = i.data?.values?.[0];
    if (opcao === "retirar") {
      const armas = arsenalStore.config().armas;
      if (!armas.length) return avisar("Nenhuma arma cadastrada ainda (painel web → Retirada de Baú).");
      await responder(i, 9, modalRetirar(armas));
      return true;
    }
    if (opcao === "devolver" || opcao === "perda") {
      const comigo = arsenalStore.comPessoa(pessoa.id);
      if (!comigo.length) return avisar("Você não tem nenhuma arma retirada no seu nome.");
      await responder(i, 9, opcao === "devolver" ? modalDevolver(comigo) : modalPerda(comigo));
      return true;
    }
    if (opcao === "recuperar") {
      const lista = perdidasPara(pessoa.id, ac.gestao);
      if (!lista.length) return avisar(ac.gestao ? "Não há nenhuma arma perdida no momento." : "Você não tem nenhuma arma perdida para recuperar. Armas perdidas por outras pessoas são recuperadas pela gestão do baú.");
      await responder(i, 9, modalRecuperar(lista));
      return true;
    }
    return avisar("Opção desconhecida.");
  }

  const campos = camposModal(i.data?.components);
  switch (customId) {
    case "ars:m-retirar":
      await trabalhar(i, pessoa.id, () => retirar(pessoa, campos.arma ?? "", campos.serie));
      return true;
    case "ars:m-devolver":
      await trabalhar(i, pessoa.id, () => devolver(pessoa, campos.item ?? ""));
      return true;
    case "ars:m-perda":
      await trabalhar(i, pessoa.id, () => registrarPerda(pessoa, campos.item ?? "", campos.motivo));
      return true;
    case "ars:m-recuperar":
      await trabalhar(i, pessoa.id, () => recuperar(pessoa, campos.item ?? "", campos.motivo, { gestao: ac.gestao }));
      return true;
  }
  return avisar("Ação desconhecida.");
}
