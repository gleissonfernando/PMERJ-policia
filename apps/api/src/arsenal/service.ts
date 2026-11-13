import { deleteMessage, editMessage, postMessage } from "../discord/bot.js";
import { env } from "../env.js";
import { brasao } from "../set/brasao.js";
import { mensagemMovimento, painelPublico } from "./mensagens.js";
import { arsenalStore, chaveItem, LIMITES, normalizarSerie, type Item, type Movimento, type Pessoa } from "./store.js";

/**
 * Retirada de Baú — regras (conferidas a cada ação, no Discord e no site):
 *  - a mesma série nunca fica com duas pessoas; série perdida não pode ser retirada;
 *  - só quem está com a arma devolve ou registra a perda;
 *  - recupera quem perdeu ou a gestão;
 *  - retiradas/devoluções saem no canal das retiradas; perdas/recuperações no canal das perdas.
 */

export class ArsenalError extends Error {}

const temAlgum = (roles: string[], lista: string[]) => roles.some((r) => lista.includes(r));
const adminDiscord = (userId: string, roles: string[]) => env.PAINEL_ADMIN_IDS.includes(userId) || temAlgum(roles, env.PAINEL_ADMIN_ROLE_IDS);

export function acesso(userId: string, roles: string[], adminWeb = false) {
  const c = arsenalStore.config();
  const admin = adminWeb || adminDiscord(userId, roles);
  const gestao = admin || temAlgum(roles, c.cargosGestao);
  return {
    podeConfigurar: admin,
    gestao,
    podeUsar: gestao || c.cargosUsar.length === 0 || temAlgum(roles, c.cargosUsar),
  };
}

const ts = (ms: number) => `<t:${Math.floor(ms / 1000)}:f>`;

/* ---------- Painel ---------- */

export async function publicarPainel(recriar: boolean) {
  const c = arsenalStore.config();
  if (!c.painelCanalId) throw new ArsenalError("Escolha e salve o canal do painel antes de publicar.");
  const corpo = painelPublico(c.armas);
  const editado = c.painelMensagemId && !recriar ? await editMessage(c.painelCanalId, c.painelMensagemId, corpo, brasao()) : false;
  if (editado) return arsenalStore.saveConfig({ painelErro: null });
  const msg = await postMessage(c.painelCanalId, corpo, brasao());
  if (!msg) {
    await arsenalStore.saveConfig({ painelErro: "o bot não pode enviar no canal" });
    throw new ArsenalError("Não foi possível publicar o painel: o bot não pode enviar no canal.");
  }
  if (recriar && c.painelMensagemId) await deleteMessage(c.painelCanalId, c.painelMensagemId);
  return arsenalStore.saveConfig({ painelMensagemId: msg.id, painelErro: null });
}

export async function atualizarPainelPublicado() {
  if (arsenalStore.config().painelMensagemId) await publicarPainel(false).catch(() => null);
}

/* ---------- Publicação do movimento ---------- */

async function publicarMovimento(m: Movimento): Promise<string | null> {
  const c = arsenalStore.config();
  const canal = m.tipo === "retirada" || m.tipo === "devolucao" ? c.canalRetiradasId : c.canalPerdasId;
  if (!canal) return "⚠️ O canal de registro ainda não foi configurado (painel web → Retirada de Baú); ficou salvo só no sistema.";
  const arma = c.armas.find((a) => m.chave.startsWith(`${a.id}:`));
  const msg = await postMessage(canal, mensagemMovimento(m, arma), brasao());
  if (!msg) return `⚠️ Ficou salvo no sistema, mas o bot não conseguiu publicar em <#${canal}> (confira as permissões).`;
  arsenalStore.marcarPublicado(m.id, canal, msg.id);
  return null;
}

const confirmar = async (m: Movimento, texto: string) => {
  const aviso = await publicarMovimento(m);
  return aviso ? `${texto}\n${aviso}` : texto;
};

/* ---------- Ações ---------- */

export async function retirar(pessoa: Pessoa, armaId: string, serieDigitada: unknown) {
  const c = arsenalStore.config();
  const arma = c.armas.find((a) => a.id === armaId);
  if (!arma) throw new ArsenalError("Essa arma não está mais cadastrada. Abra o formulário de novo.");
  const serie = typeof serieDigitada === "string" ? normalizarSerie(serieDigitada.replace(/[\u0000-\u001F\u007F]/g, "")) : "";
  if (!serie) throw new ArsenalError("Informe o prefixo/série da arma.");
  if (serie.length > LIMITES.serie) throw new ArsenalError(`O prefixo/série pode ter no máximo ${LIMITES.serie} caracteres.`);
  if (arsenalStore.comPessoa(pessoa.id).length >= LIMITES.porPessoa) throw new ArsenalError(`Você já está com ${LIMITES.porPessoa} armas. Devolva alguma antes de retirar outra.`);

  const chave = chaveItem(arma.id, serie);
  const atual = arsenalStore.item(chave);
  if (atual?.status === "retirada") {
    throw new ArsenalError(atual.pessoa?.id === pessoa.id ? "Essa arma já está no seu nome." : `A ${arma.nome} série \`${serie}\` está com **${atual.pessoa?.nome ?? "outra pessoa"}** desde ${ts(atual.desde)}. Ela precisa ser devolvida antes.`);
  }
  if (atual?.status === "perdida") throw new ArsenalError(`A ${arma.nome} série \`${serie}\` consta como **perdida** desde ${ts(atual.desde)}. Ela precisa ser recuperada antes de ser retirada.`);

  const m = arsenalStore.aplicar(
    { chave, armaId: arma.id, armaNome: arma.nome, serie, status: "retirada", pessoa, desde: 0 },
    { tipo: "retirada", pessoa, relacionado: null, motivo: null, web: false },
  );
  console.info(`[arsenal] ${arma.nome} ${serie} retirada por discord:${pessoa.id}`);
  return confirmar(m, `📦 **${arma.nome}** · série \`${serie}\` registrada no seu nome.`);
}

function exigirItem(chave: string, status: Item["status"]) {
  const item = arsenalStore.item(chave);
  if (!item || item.status !== status) {
    throw new ArsenalError(status === "retirada" ? "Essa arma não está mais retirada (já foi devolvida ou perdida)." : "Essa arma não consta mais como perdida.");
  }
  return item;
}

const limparMotivo = (v: unknown) => (typeof v === "string" ? v.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "").trim().slice(0, LIMITES.motivo) || null : null);

/** `gestao`: pelo site, a gestão dá baixa em arma de outra pessoa. */
export async function devolver(pessoa: Pessoa, chave: string, opts: { gestao?: boolean; web?: boolean } = {}) {
  const item = exigirItem(chave, "retirada");
  if (item.pessoa?.id !== pessoa.id && !opts.gestao) throw new ArsenalError("Só quem está com a arma pode devolvê-la.");
  const m = arsenalStore.aplicar(
    { ...item, status: "livre", pessoa: null },
    { tipo: "devolucao", pessoa: opts.gestao && item.pessoa ? item.pessoa : pessoa, relacionado: opts.gestao && item.pessoa?.id !== pessoa.id ? pessoa : null, motivo: null, web: Boolean(opts.web) },
  );
  console.info(`[arsenal] ${item.armaNome} ${item.serie} devolvida (por discord:${pessoa.id})`);
  return confirmar(m, `↩️ **${item.armaNome}** · série \`${item.serie}\` devolvida. Ela não está mais no seu nome.`);
}

export async function registrarPerda(pessoa: Pessoa, chave: string, motivo: unknown) {
  const item = exigirItem(chave, "retirada");
  if (item.pessoa?.id !== pessoa.id) throw new ArsenalError("Só quem está com a arma pode registrar a perda.");
  const m = arsenalStore.aplicar({ ...item, status: "perdida", pessoa }, { tipo: "perda", pessoa, relacionado: null, motivo: limparMotivo(motivo), web: false });
  console.info(`[arsenal] ${item.armaNome} ${item.serie} PERDIDA por discord:${pessoa.id}`);
  return confirmar(m, `⚠️ Perda da **${item.armaNome}** · série \`${item.serie}\` registrada. Quando for encontrada, use **Recuperar arma**.`);
}

export async function recuperar(pessoa: Pessoa, chave: string, motivo: unknown, opts: { gestao: boolean; web?: boolean }) {
  const item = exigirItem(chave, "perdida");
  if (!opts.gestao && item.pessoa?.id !== pessoa.id) throw new ArsenalError("Só quem perdeu a arma ou a gestão do baú pode registrar a recuperação.");
  const m = arsenalStore.aplicar({ ...item, status: "livre", pessoa: null }, { tipo: "recuperacao", pessoa, relacionado: item.pessoa, motivo: limparMotivo(motivo), web: Boolean(opts.web) });
  console.info(`[arsenal] ${item.armaNome} ${item.serie} recuperada por discord:${pessoa.id}`);
  return confirmar(m, `✅ **${item.armaNome}** · série \`${item.serie}\` recuperada. A série voltou para o sistema e pode ser retirada de novo.`);
}

/** Perdidas que esta pessoa pode recuperar (gestão: todas), mais recentes primeiro. */
export const perdidasPara = (userId: string, gestao: boolean) =>
  arsenalStore
    .perdidas()
    .filter((i) => gestao || i.pessoa?.id === userId)
    .sort((a, b) => b.desde - a.desde);
