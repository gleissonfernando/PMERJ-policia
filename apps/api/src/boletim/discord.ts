import { deleteMessage, postMessage, sendDM } from "../discord/bot.js";
import type { RawMensagem } from "../discord/gateway.js";
import { env } from "../env.js";
import { brasao } from "../set/brasao.js";
import { explicacao, lerMensagem, painelBoletim } from "./mensagem.js";
import { boletimStore, numeroBoletim } from "./store.js";

/**
 * Boletim Interno no Discord:
 *  mensagem no canal configurado → o bot apaga e publica o painel V2 (equipe + relatório, numerado).
 *  Mensagem fora do formato → o bot apaga e explica SÓ para a pessoa (DM com o texto dela para corrigir).
 *  Se a DM estiver fechada, o aviso sai no canal marcando a pessoa e some sozinho em 25 s.
 *
 * Mensagens de usuário comuns não podem ser efêmeras (isso só existe em interações), por isso a DM.
 */

const AVISO_CANAL_MS = 25_000;
/** Tipos de mensagem que contam: normal (0) e resposta (19). Fixar, criar tópico etc. são ignorados. */
const TIPOS_TEXTO = new Set([0, 19]);

const temAlgum = (roles: string[], lista: string[]) => roles.some((r) => lista.includes(r));
const podeEnviar = (userId: string, roles: string[], permitidos: string[]) =>
  permitidos.length === 0 || env.PAINEL_ADMIN_IDS.includes(userId) || temAlgum(roles, env.PAINEL_ADMIN_ROLE_IDS) || temAlgum(roles, permitidos);

/** No máximo uma explicação a cada 10 s por pessoa (a mensagem errada é apagada mesmo assim). */
const ultimaExplicacao = new Map<string, number>();
function podeExplicar(userId: string) {
  const agora = Date.now();
  if (agora - (ultimaExplicacao.get(userId) ?? 0) < 10_000) return false;
  ultimaExplicacao.set(userId, agora);
  if (ultimaExplicacao.size > 1_000) ultimaExplicacao.delete(ultimaExplicacao.keys().next().value!);
  return true;
}

async function explicar(m: RawMensagem, motivo: string) {
  if (!podeExplicar(m.author.id)) return;
  if (await sendDM(m.author.id, explicacao({ canalId: m.channel_id, motivo, original: m.content }))) return;
  // DM fechada: aviso rápido no canal, marcando só a pessoa.
  const aviso = await postMessage(m.channel_id, explicacao({ canalId: m.channel_id, motivo, mencionar: m.author.id }));
  if (aviso) setTimeout(() => void deleteMessage(m.channel_id, aviso.id), AVISO_CANAL_MS).unref();
}

let avisouPermissao = false;
async function apagar(m: RawMensagem) {
  if (await deleteMessage(m.channel_id, m.id)) return true;
  if (!avisouPermissao) console.warn(`[boletim] não consegui apagar mensagens no canal ${m.channel_id}: dê ao bot "Gerenciar mensagens" nesse canal.`);
  avisouPermissao = true;
  return false;
}

async function processar(m: RawMensagem) {
  const cfg = boletimStore.config();
  if (!podeEnviar(m.author.id, m.member?.roles ?? [], cfg.cargosPermitidos)) {
    await apagar(m);
    await explicar(m, "Seu cargo não está autorizado a enviar boletins neste canal.");
    return;
  }

  const leitura = lerMensagem(m.content ?? "", m.attachments.length);
  if (!leitura.ok) {
    await apagar(m);
    await explicar(m, leitura.motivo);
    return;
  }

  const nome = (m.member?.nick ?? m.author.global_name ?? m.author.username).slice(0, 80);
  const b = boletimStore.criar({ equipe: leitura.equipe, relatorio: leitura.relatorio, autor: { id: m.author.id, nome, avatar: m.author.avatar ?? null }, canalId: m.channel_id });
  const msg = await postMessage(m.channel_id, painelBoletim(b, cfg), brasao());
  if (!msg) {
    // Painel não saiu: a mensagem original fica (nada se perde) e o número é liberado.
    boletimStore.descartar(b.id);
    console.warn(`[boletim] não foi possível publicar o boletim no canal ${m.channel_id} (o bot precisa enviar mensagens e anexar arquivos).`);
    return;
  }
  boletimStore.atualizar(b.id, { mensagemId: msg.id });
  await apagar(m);
  console.info(`[boletim] ${numeroBoletim(b)} (${b.equipe}) publicado por discord:${m.author.id}`);
}

/** Uma mensagem por vez, na ordem de chegada (a numeração segue a ordem do canal). */
let fila: Promise<void> = Promise.resolve();

export async function aoMensagemNoBoletim(m: RawMensagem): Promise<void> {
  const canal = boletimStore.config().canalId;
  if (!canal || m.channel_id !== canal || m.webhook_id || m.author.bot) return;
  const tipo = (m as RawMensagem & { type?: number }).type ?? 0;
  if (!TIPOS_TEXTO.has(tipo)) return;
  fila = fila.then(() => processar(m)).catch((err: unknown) => console.error("[boletim] falha ao processar mensagem:", err));
}
