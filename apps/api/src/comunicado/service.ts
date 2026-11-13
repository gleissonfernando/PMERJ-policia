import { createTicketChannel, deleteChannel, deleteMessage, editMessage, guildUploadLimit, postMessage, type MessageBody } from "../discord/bot.js";
import { apagarMidias, arquivosMidia, coletarMidias, lotesMidia, MidiaError, type Upload } from "../doesp/media.js";
import { env } from "../env.js";
import { brasao } from "../set/brasao.js";
import { dadosOk, detalhesOk, mensagemComunicado, modalDados, modalDetalhes, painelPublico, painelRascunho } from "./mensagens.js";
import { comunicadoStore, LIMITES, numeroComunicado, RASCUNHO_TTL_MS, type Campos, type Comunicado, type Midia, type Pessoa, type Rascunho } from "./store.js";

/**
 * Comunicados de Operação:
 *  painel "Gerar comunicado" → canal temporário de quem tem permissão
 *  (dados em 2 formulários · canal de destino · cargos a mencionar · fotos/vídeos como mensagem · prévia)
 *  → Publicar: painel V2 no canal escolhido; o canal temporário é apagado.
 */

export class ComunicadoError extends Error {}

const PASTA = "comunicado" as const;
const ATRASO_FECHAR_MS = 8_000;
const INICIO_PROCESSO = Date.now();
const MAX_OCUPADO_MS = 20 * 60_000;

/* ---------- Permissões ---------- */

const temAlgum = (roles: string[], lista: string[]) => roles.some((r) => lista.includes(r));
const adminDiscord = (userId: string, roles: string[]) => env.PAINEL_ADMIN_IDS.includes(userId) || temAlgum(roles, env.PAINEL_ADMIN_ROLE_IDS);

export function acesso(userId: string, roles: string[], adminWeb = false) {
  const c = comunicadoStore.config();
  const admin = adminWeb || adminDiscord(userId, roles);
  return {
    podeConfigurar: admin,
    podeVer: admin || temAlgum(roles, c.cargosGestores) || temAlgum(roles, c.cargosPublicar),
    podePublicar: admin || temAlgum(roles, c.cargosPublicar),
  };
}

function limpar(v: unknown, max: number, rotulo: string) {
  const t = typeof v === "string" ? v.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "").trim().slice(0, max) : "";
  if (!t) throw new ComunicadoError(`Preencha: ${rotulo}.`);
  return t;
}

/* ---------- Painel público ---------- */

export async function publicarPainel(recriar: boolean) {
  const c = comunicadoStore.config();
  if (!c.painelCanalId) throw new ComunicadoError("Escolha e salve o canal do painel antes de publicar.");
  const corpo = painelPublico();
  const editado = c.painelMensagemId && !recriar ? await editMessage(c.painelCanalId, c.painelMensagemId, corpo, brasao()) : false;
  if (editado) return comunicadoStore.saveConfig({ painelErro: null });
  const msg = await postMessage(c.painelCanalId, corpo, brasao());
  if (!msg) {
    await comunicadoStore.saveConfig({ painelErro: "o bot não pode enviar no canal" });
    throw new ComunicadoError("Não foi possível publicar o painel: o bot não pode enviar no canal.");
  }
  if (recriar && c.painelMensagemId) await deleteMessage(c.painelCanalId, c.painelMensagemId);
  return comunicadoStore.saveConfig({ painelMensagemId: msg.id, painelErro: null });
}

export async function atualizarPainelPublicado() {
  if (comunicadoStore.config().painelMensagemId) await publicarPainel(false).catch(() => null);
}

/* ---------- Painel do canal temporário ---------- */

const ocupado = (d: Pick<Rascunho, "ocupadoDesde">) => typeof d.ocupadoDesde === "number" && d.ocupadoDesde >= INICIO_PROCESSO && Date.now() - d.ocupadoDesde < MAX_OCUPADO_MS;

async function galeria(d: Rascunho): Promise<Midia[]> {
  if (!d.midias.length) return [];
  try {
    const limite = await guildUploadLimit();
    return lotesMidia(d.midias.filter((m) => m.size <= limite), limite)[0] ?? [];
  } catch {
    return [];
  }
}

export async function redesenhar(d: Rascunho, fechando = false): Promise<void> {
  if (!d.canalId) return;
  let mostrar = fechando ? [] : await galeria(d);
  const chave = mostrar.map((m) => m.id).join(",");
  const proximo = numeroComunicado(comunicadoStore.proximoNumero());
  const corpo = (lista: Midia[]): MessageBody => painelRascunho(d, ocupado(d), fechando, lista.map((m) => m.name), proximo);

  if (d.painelMensagemId && !fechando && d.painelMidiaChave === chave && (await editMessage(d.canalId, d.painelMensagemId, corpo(mostrar)))) return;

  const arquivos = await arquivosMidia(d.id, mostrar, PASTA).catch(() => {
    mostrar = [];
    return [];
  });
  const chaveFinal = mostrar.map((m) => m.id).join(",");
  const anexos = [...brasao(), ...arquivos];
  const editado = d.painelMensagemId ? await editMessage(d.canalId, d.painelMensagemId, { ...corpo(mostrar), ...(anexos.length ? {} : { attachments: [] }) }, anexos.length ? anexos : undefined) : false;
  if (editado) {
    comunicadoStore.atualizarRascunho(d.id, { painelMidiaChave: chaveFinal }, null);
    return;
  }
  const msg = await postMessage(d.canalId, corpo(mostrar), anexos.length ? anexos : undefined);
  if (msg) comunicadoStore.atualizarRascunho(d.id, { painelMensagemId: msg.id, painelMidiaChave: chaveFinal }, null);
}

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "policial";

export async function abrirRascunho(autor: Pessoa) {
  const c = comunicadoStore.config();
  let existente = comunicadoStore.abertoDe(autor.id);
  if (existente && Date.now() - existente.criadoEm >= RASCUNHO_TTL_MS) {
    await expirar(existente);
    existente = undefined;
  }
  if (existente?.canalId) {
    await redesenhar(existente).catch(() => null);
    return `➡️ Você já tem um comunicado em preparo: <#${existente.canalId}>. Publique ou cancele antes de abrir outro.`;
  }

  const d = existente ?? comunicadoStore.criarRascunho(autor);
  const canal = await createTicketChannel({
    nome: `📢・comunicado-${slug(autor.nome)}`,
    topico: `Comunicado de operação · ${autor.nome} · ref ${d.id.slice(0, 8)}`,
    categoriaId: c.categoriaId,
    cargos: c.cargosGestores,
    usuarioId: autor.id,
    motivo: "Comunicado de operação",
  });
  if (!canal) {
    comunicadoStore.atualizarRascunho(d.id, { status: "CANCELLED", aviso: "Canal não criado" }, null);
    throw new ComunicadoError("Não foi possível criar o canal: o bot precisa de Gerenciar Canais (e acesso à categoria escolhida).");
  }
  const salvo = comunicadoStore.atualizarRascunho(d.id, { canalId: canal }) ?? d;
  await redesenhar(salvo);
  console.info(`[comunicado] canal aberto para discord:${autor.id}`);
  return `✅ Canal criado: <#${canal}>. Preencha os dados, escolha o canal, confira a prévia e toque em **Publicar**.`;
}

export function meuRascunho(id: string, userId: string) {
  const d = comunicadoStore.rascunho(id);
  if (!d) throw new ComunicadoError("Este comunicado não foi encontrado.");
  if (d.status === "SENDING") throw new ComunicadoError("Este comunicado está sendo publicado. Aguarde.");
  if (d.status !== "OPEN") throw new ComunicadoError("Este comunicado já foi encerrado.");
  if (d.autor.id !== userId) throw new ComunicadoError(`Só quem abriu (${d.autor.nome}) pode preencher e publicar.`);
  return d;
}

export const formularioDados = (id: string, userId: string) => modalDados(meuRascunho(id, userId));
export const formularioDetalhes = (id: string, userId: string) => modalDetalhes(meuRascunho(id, userId));

async function salvar(id: string, patch: Partial<Rascunho>, aviso: string) {
  const atual = comunicadoStore.atualizarRascunho(id, { ...patch, aviso });
  if (!atual) throw new ComunicadoError("Este comunicado já foi encerrado.");
  await redesenhar(atual).catch(() => null);
}

export async function salvarDados(id: string, userId: string, campos: Record<string, unknown>) {
  const d = meuRascunho(id, userId);
  const novos: Campos = {
    ...d.campos,
    operacao: limpar(campos.operacao, LIMITES.operacao, "a operação"),
    data: limpar(campos.data, LIMITES.data, "a data"),
    horaApresentacao: limpar(campos.horaApresentacao, LIMITES.hora, "o horário de apresentação"),
    horaInicio: limpar(campos.horaInicio, LIMITES.hora, "o horário previsto para início"),
    localApresentacao: limpar(campos.localApresentacao, LIMITES.local, "o local de apresentação"),
  };
  await salvar(id, { campos: novos }, "💾 Dados da operação salvos.");
  return "✅ Dados da operação salvos. Confira a prévia no canal.";
}

export async function salvarDetalhes(id: string, userId: string, campos: Record<string, unknown>) {
  const d = meuRascunho(id, userId);
  const novos: Campos = {
    ...d.campos,
    localOperacao: limpar(campos.localOperacao, LIMITES.local, "o local da operação"),
    efetivo: limpar(campos.efetivo, LIMITES.efetivo, "o efetivo"),
    objetivos: limpar(campos.objetivos, LIMITES.objetivos, "os objetivos"),
    emprego: limpar(campos.emprego, LIMITES.emprego, "o emprego operacional"),
  };
  await salvar(id, { campos: novos }, "💾 Objetivos e emprego salvos.");
  return "✅ Objetivos e emprego salvos. Confira a prévia no canal.";
}

/** Canal escolhido no select (já conferido: a pessoa e o bot podem enviar nele). null = limpou. */
export async function definirDestino(id: string, userId: string, canalId: string | null) {
  meuRascunho(id, userId);
  await salvar(id, { destinoCanalId: canalId }, canalId ? `📍 Será publicado em <#${canalId}>.` : "📍 Canal de publicação removido.");
}

export async function definirMencoes(id: string, userId: string, cargos: string[]) {
  meuRascunho(id, userId);
  const lista = [...new Set(cargos)].slice(0, LIMITES.mencoes);
  await salvar(id, { cargosMencao: lista }, lista.length ? `🔔 ${lista.length} cargo(s) serão mencionados.` : "🔔 Nenhum cargo será mencionado.");
}

export async function salvarMidias(canalId: string, userId: string, uploads: Upload[]): Promise<{ ignorado: true } | { mensagem: string }> {
  const d = comunicadoStore.rascunhoDoCanal(canalId);
  if (!d || d.autor.id !== userId || !uploads.length) return { ignorado: true };
  if (ocupado(d)) throw new ComunicadoError("Ainda estou processando o envio anterior. Aguarde terminar para mandar outro.");

  const marcado = comunicadoStore.atualizarRascunho(d.id, { ocupadoDesde: Date.now(), aviso: "⏳ Recebendo as mídias... o botão **Publicar** libera quando terminar." });
  if (!marcado) throw new ComunicadoError("Este comunicado já foi encerrado.");
  await redesenhar(marcado).catch(() => null);

  const coletado = await coletarMidias({
    donoId: d.id,
    uploads: uploads.slice(0, 10),
    links: [],
    limite: await guildUploadLimit(),
    files: d.midias.length,
    linkCount: 0,
    pasta: PASTA,
    aoComprimir: async () => {
      const x = comunicadoStore.atualizarRascunho(d.id, { aviso: "⏳ Comprimindo o vídeo... pode levar alguns minutos." });
      if (x) await redesenhar(x);
    },
  }).catch(async (err: unknown) => {
    const msg = err instanceof MidiaError ? err.message : "Falha ao receber as mídias. Tente de novo.";
    const livre = comunicadoStore.atualizarRascunho(d.id, { ocupadoDesde: null, aviso: `⚠️ ${msg}` });
    if (livre) await redesenhar(livre).catch(() => null);
    if (!(err instanceof MidiaError)) console.error("[comunicado] falha ao receber mídias:", err);
    throw new ComunicadoError(msg);
  });

  const ultimo = comunicadoStore.rascunho(d.id) ?? d;
  const pronto = comunicadoStore.atualizarRascunho(d.id, { midias: [...ultimo.midias, ...coletado.media], ocupadoDesde: null, aviso: `💾 ${coletado.media.length} mídia(s) adicionada(s).` });
  if (!pronto) {
    await apagarMidias(d.id, coletado.media.map((m) => m.id), PASTA);
    throw new ComunicadoError("Este comunicado já foi encerrado; as mídias não foram usadas.");
  }
  await redesenhar(pronto).catch(() => null);
  return { mensagem: `✅ ${coletado.media.length} mídia(s) adicionada(s).` };
}

export async function limparMidias(id: string, userId: string) {
  const d = meuRascunho(id, userId);
  await apagarMidias(d.id, d.midias.map((m) => m.id), PASTA);
  await salvar(id, { midias: [] }, "🧹 Mídias removidas.");
  return "🧹 Mídias removidas.";
}

/* ---------- Publicação ---------- */

async function enviarMensagens(c: Comunicado): Promise<string[]> {
  const lotes = c.midias.length ? lotesMidia(c.midias, await guildUploadLimit()) : [[]];
  const postados: string[] = [];
  for (const [i, lote] of lotes.entries()) {
    const anexos = [...(i === 0 ? brasao() : []), ...(lote.length ? await arquivosMidia(c.id, lote, PASTA) : [])];
    const msg = await postMessage(c.destinoCanalId, mensagemComunicado(c, lote.map((m) => m.name), i + 1, lotes.length), anexos.length ? anexos : undefined);
    if (!msg) {
      for (const id of postados) await deleteMessage(c.destinoCanalId, id);
      throw new ComunicadoError("O bot não pode enviar no canal escolhido (precisa de Ver canal, Enviar mensagens e Anexar arquivos). Escolha outro canal ou ajuste as permissões.");
    }
    postados.push(msg.id);
  }
  return postados;
}

export async function publicarComunicado(id: string, userId: string) {
  const atual = meuRascunho(id, userId);
  if (!dadosOk(atual.campos)) throw new ComunicadoError("Preencha os dados da operação antes de publicar.");
  if (!detalhesOk(atual.campos)) throw new ComunicadoError("Preencha os objetivos e o emprego antes de publicar.");
  if (!atual.destinoCanalId) throw new ComunicadoError("Escolha o canal onde o comunicado será publicado.");
  if (ocupado(atual)) throw new ComunicadoError("Aguarde: as mídias ainda estão sendo processadas.");

  const d = comunicadoStore.atualizarRascunho(id, { status: "SENDING", aviso: null });
  if (!d) throw new ComunicadoError("Este comunicado já está sendo publicado.");

  const c = comunicadoStore.criarRegistro({
    id: d.id,
    campos: d.campos as Required<Campos>,
    autor: d.autor,
    destinoCanalId: d.destinoCanalId!,
    cargosMencao: d.cargosMencao,
    midias: d.midias,
  });

  try {
    comunicadoStore.atualizarRegistro(c.id, { mensagemIds: await enviarMensagens(c) });
  } catch (err) {
    comunicadoStore.descartarRegistro(c.id);
    const msg = err instanceof ComunicadoError || err instanceof MidiaError ? err.message : "Falha ao publicar. Tente de novo.";
    const reaberto = comunicadoStore.atualizarRascunho(id, { status: "OPEN", aviso: `⚠️ ${msg}` }, ["SENDING"]);
    if (reaberto) await redesenhar(reaberto).catch(() => null);
    if (!(err instanceof ComunicadoError || err instanceof MidiaError)) console.error("[comunicado] falha ao publicar:", err);
    throw new ComunicadoError(msg);
  }

  const aviso = `✅ **Comunicado de Operação ${numeroComunicado(c)}** publicado em <#${c.destinoCanalId}>.\n-# Este canal será apagado em alguns segundos.`;
  const enviado = comunicadoStore.atualizarRascunho(id, { status: "SENT", aviso, fecharEm: Date.now() + ATRASO_FECHAR_MS }, ["SENDING"]);
  if (enviado) await redesenhar(enviado, true).catch(() => null);
  console.info(`[comunicado] ${numeroComunicado(c)} publicado em ${c.destinoCanalId} por discord:${userId}`);
  return aviso.split("\n-#")[0]!;
}

export async function cancelarRascunho(id: string, userId: string) {
  const d = meuRascunho(id, userId);
  const cancelado = comunicadoStore.atualizarRascunho(id, { status: "CANCELLED", aviso: "🗑️ Comunicado cancelado.\n-# Este canal será apagado em alguns segundos.", fecharEm: Date.now() + ATRASO_FECHAR_MS });
  if (!cancelado) throw new ComunicadoError("Este comunicado já foi encerrado.");
  await apagarMidias(d.id, undefined, PASTA);
  await redesenhar(cancelado, true).catch(() => null);
  return "🗑️ Comunicado cancelado.";
}

async function expirar(d: Rascunho) {
  if (comunicadoStore.atualizarRascunho(d.id, { status: "CANCELLED", aviso: "Cancelado automaticamente: aberto há mais de 6 horas.", fecharEm: Date.now() })) await apagarMidias(d.id, undefined, PASTA);
}

/** Rotina (a cada 30 s): apaga canais encerrados, expira os abandonados e destrava envios cortados por restart. */
export async function fecharVencidos() {
  const agora = Date.now();
  for (const d of comunicadoStore.rascunhos().filter((x) => x.status === "SENDING" && x.atualizadoEm <= agora - 5 * 60_000)) {
    if (comunicadoStore.registro(d.id)?.mensagemIds.length) {
      comunicadoStore.atualizarRascunho(d.id, { status: "SENT", fecharEm: agora }, ["SENDING"]);
      continue;
    }
    comunicadoStore.descartarRegistro(d.id);
    const reaberto = comunicadoStore.atualizarRascunho(d.id, { status: "OPEN", aviso: "⚠️ A publicação foi interrompida. Toque em **Publicar** de novo." }, ["SENDING"]);
    if (reaberto) await redesenhar(reaberto).catch(() => null);
  }
  for (const d of comunicadoStore.rascunhos().filter((x) => x.status === "OPEN" && x.criadoEm <= agora - RASCUNHO_TTL_MS)) await expirar(d);
  for (const d of comunicadoStore.rascunhos().filter((x) => x.fecharEm !== null && x.fecharEm <= agora).slice(0, 25)) {
    if (d.canalId && !(await deleteChannel(d.canalId, d.status === "SENT" ? "Comunicado publicado" : "Comunicado cancelado"))) continue;
    comunicadoStore.atualizarRascunho(d.id, { fecharEm: null }, null);
  }
}
