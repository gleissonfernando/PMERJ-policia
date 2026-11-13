import { randomUUID } from "node:crypto";
import { createTicketChannel, deleteChannel, deleteMessage, editMessage, guildUploadLimit, postMessage, type MessageBody } from "../discord/bot.js";
import { apagarMidias, arquivosMidia, coletarMidias, lotesMidia, MidiaError, type Upload } from "../doesp/media.js";
import { env } from "../env.js";
import { brasao } from "../set/brasao.js";
import { mensagemOcorrencia, modalPreso, modalRelato, painelPublico, painelRascunho, relatoCompleto } from "./mensagens.js";
import { LIMITES, numeroOcorrencia, ocorrenciaStore, RASCUNHO_TTL_MS, type Midia, type Ocorrencia, type Pessoa, type Rascunho } from "./store.js";

/**
 * Registro de Ocorrência:
 *  painel "Registrar ocorrência" → modal com o tipo → canal temporário do policial
 *  (relato no modal · participantes no select · evidências como mensagem) → Enviar
 *  → painel V2 completo com as fotos no canal das ocorrências; o canal temporário é apagado.
 */

export class OcorrenciaError extends Error {}

const PASTA = "ocorrencia" as const;
const ATRASO_FECHAR_MS = 8_000;
const INICIO_PROCESSO = Date.now();
const MAX_OCUPADO_MS = 20 * 60_000;

/* ---------- Permissões ---------- */

const temAlgum = (roles: string[], lista: string[]) => roles.some((r) => lista.includes(r));
const adminDiscord = (userId: string, roles: string[]) => env.PAINEL_ADMIN_IDS.includes(userId) || temAlgum(roles, env.PAINEL_ADMIN_ROLE_IDS);

export function acesso(userId: string, roles: string[], adminWeb = false) {
  const c = ocorrenciaStore.config();
  const admin = adminWeb || adminDiscord(userId, roles);
  return {
    podeConfigurar: admin,
    podeVer: admin || temAlgum(roles, c.cargosGestores),
    podeRegistrar: admin || c.cargosRegistrar.length === 0 || temAlgum(roles, c.cargosRegistrar),
  };
}

function limpar(v: unknown, max: number, rotulo: string | null) {
  const t = typeof v === "string" ? v.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "").trim().slice(0, max) : "";
  if (!t && rotulo) throw new OcorrenciaError(`Preencha: ${rotulo}.`);
  return t;
}

/* ---------- Painel público ---------- */

export async function publicarPainel(recriar: boolean) {
  const c = ocorrenciaStore.config();
  if (!c.painelCanalId) throw new OcorrenciaError("Escolha e salve o canal do painel antes de publicar.");
  const corpo = painelPublico(c.tipos);
  const editado = c.painelMensagemId && !recriar ? await editMessage(c.painelCanalId, c.painelMensagemId, corpo, brasao()) : false;
  if (editado) return ocorrenciaStore.saveConfig({ painelErro: null });
  const msg = await postMessage(c.painelCanalId, corpo, brasao());
  if (!msg) {
    await ocorrenciaStore.saveConfig({ painelErro: "o bot não pode enviar no canal" });
    throw new OcorrenciaError("Não foi possível publicar o painel: o bot não pode enviar no canal.");
  }
  if (recriar && c.painelMensagemId) await deleteMessage(c.painelCanalId, c.painelMensagemId);
  return ocorrenciaStore.saveConfig({ painelMensagemId: msg.id, painelErro: null });
}

/** Painel já publicado acompanha os tipos e a logo atuais. */
export async function atualizarPainelPublicado() {
  if (ocorrenciaStore.config().painelMensagemId) await publicarPainel(false).catch(() => null);
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

/** Redesenha o painel do canal temporário (posta de novo se foi apagado). Arquivos só são reenviados quando mudam. */
export async function redesenhar(d: Rascunho, fechando = false): Promise<void> {
  if (!d.canalId) return;
  let mostrar = fechando ? [] : await galeria(d);
  const chave = mostrar.map((m) => m.id).join(",");
  const corpo = (lista: Midia[]): MessageBody => painelRascunho(d, ocupado(d), fechando, lista.map((m) => m.name));

  if (d.painelMensagemId && !fechando && d.painelMidiaChave === chave && (await editMessage(d.canalId, d.painelMensagemId, corpo(mostrar)))) return;

  const arquivos = await arquivosMidia(d.id, mostrar, PASTA).catch(() => {
    mostrar = [];
    return [];
  });
  const chaveFinal = mostrar.map((m) => m.id).join(",");
  const anexos = [...brasao(), ...arquivos];
  const editado = d.painelMensagemId ? await editMessage(d.canalId, d.painelMensagemId, { ...corpo(mostrar), ...(anexos.length ? {} : { attachments: [] }) }, anexos.length ? anexos : undefined) : false;
  if (editado) {
    ocorrenciaStore.atualizarRascunho(d.id, { painelMidiaChave: chaveFinal }, null);
    return;
  }
  const msg = await postMessage(d.canalId, corpo(mostrar), anexos.length ? anexos : undefined);
  if (msg) ocorrenciaStore.atualizarRascunho(d.id, { painelMensagemId: msg.id, painelMidiaChave: chaveFinal }, null);
}

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "policial";

/** Tipo escolhido no modal → canal temporário (ou aponta o que já está aberto). */
export async function abrirRascunho(autor: Pessoa, tipoId: string) {
  const c = ocorrenciaStore.config();
  if (!c.destinoCanalId) throw new OcorrenciaError("O canal das ocorrências ainda não foi configurado (painel web → Ocorrência).");
  const tipo = c.tipos.find((t) => t.id === tipoId);
  if (!tipo) throw new OcorrenciaError("Este tipo de ocorrência não existe mais. Abra o formulário de novo.");

  let existente = ocorrenciaStore.abertoDe(autor.id);
  if (existente && Date.now() - existente.criadoEm >= RASCUNHO_TTL_MS) {
    await expirar(existente);
    existente = undefined;
  }
  if (existente?.canalId) {
    await redesenhar(existente).catch(() => null);
    return `➡️ Você já tem um registro aberto: <#${existente.canalId}>. Envie ou cancele antes de abrir outro.`;
  }

  const d = existente ?? ocorrenciaStore.criarRascunho(autor, tipo);
  const canal = await createTicketChannel({
    nome: `🚨・ocorrencia-${slug(autor.nome)}`,
    topico: `${tipo.nome} · ${autor.nome} · ref ${d.id.slice(0, 8)}`,
    categoriaId: c.categoriaId,
    cargos: c.cargosGestores,
    usuarioId: autor.id,
    motivo: "Registro de ocorrência",
  });
  if (!canal) {
    ocorrenciaStore.atualizarRascunho(d.id, { status: "CANCELLED", aviso: "Canal não criado" }, null);
    throw new OcorrenciaError("Não foi possível criar o canal: o bot precisa de Gerenciar Canais (e acesso à categoria escolhida).");
  }
  const salvo = ocorrenciaStore.atualizarRascunho(d.id, { canalId: canal }) ?? d;
  await redesenhar(salvo);
  console.info(`[ocorrencia] canal aberto (${tipo.nome}) para discord:${autor.id}`);
  return `✅ Canal criado: <#${canal}>. Preencha o relato, marque os participantes, mande as fotos e toque em **Enviar**.`;
}

/** O rascunho de um botão do canal temporário: aberto e de quem clicou. */
export function meuRascunho(id: string, userId: string) {
  const d = ocorrenciaStore.rascunho(id);
  if (!d) throw new OcorrenciaError("Este registro não foi encontrado.");
  if (d.status === "SENDING") throw new OcorrenciaError("Este registro está sendo enviado. Aguarde.");
  if (d.status !== "OPEN") throw new OcorrenciaError("Este registro já foi encerrado.");
  if (d.autor.id !== userId) throw new OcorrenciaError(`Só quem abriu (${d.autor.nome}) pode preencher e enviar.`);
  return d;
}

export const formularioRelato = (id: string, userId: string) => modalRelato(meuRascunho(id, userId));

export async function salvarRelato(id: string, userId: string, campos: Record<string, unknown>) {
  meuRascunho(id, userId);
  const relato = {
    local: limpar(campos.local, LIMITES.local, "o local"),
    quando: limpar(campos.quando, LIMITES.quando, "a data e o horário"),
    relato: limpar(campos.relato, LIMITES.relato, "o que houve"),
    apreensoes: limpar(campos.apreensoes, LIMITES.apreensoes, null) || undefined,
    desfecho: limpar(campos.desfecho, LIMITES.desfecho, null) || undefined,
  };
  const atual = ocorrenciaStore.atualizarRascunho(id, { relato, aviso: "💾 Relato salvo." });
  if (!atual) throw new OcorrenciaError("Este registro já foi encerrado.");
  await redesenhar(atual).catch(() => null);
  return "✅ Relato salvo.";
}

/* ---------- Presos ---------- */

export async function definirHouvePreso(id: string, userId: string, valor: string) {
  meuRascunho(id, userId);
  const houvePreso = valor === "sim" ? true : valor === "nao" ? false : null;
  if (houvePreso === null) throw new OcorrenciaError("Escolha Sim ou Não.");
  const atual = ocorrenciaStore.atualizarRascunho(id, {
    houvePreso,
    // "Não" apaga a lista (não vai preso nenhum no registro).
    ...(houvePreso ? {} : { presos: [] }),
    aviso: houvePreso ? "🔗 Houve preso: toque em **Adicionar preso** e informe nome e RG." : "✖️ Marcado: não houve presos.",
  });
  if (atual) await redesenhar(atual).catch(() => null);
}

export const formularioPreso = (id: string, userId: string) => {
  const d = meuRascunho(id, userId);
  if (d.presos.length >= LIMITES.presos) throw new OcorrenciaError(`No máximo ${LIMITES.presos} presos por ocorrência.`);
  return modalPreso(d);
};

export async function adicionarPreso(id: string, userId: string, campos: Record<string, unknown>) {
  const d = meuRascunho(id, userId);
  if (d.presos.length >= LIMITES.presos) throw new OcorrenciaError(`No máximo ${LIMITES.presos} presos por ocorrência.`);
  const nome = limpar(campos.nome, LIMITES.presoNome, "o nome do preso");
  const rg = limpar(campos.rg, LIMITES.presoRg, "o RG (ID na cidade)").replace(/\s+/g, "");
  const discord = typeof campos.discord === "string" && /^\d{17,20}$/.test(campos.discord) ? campos.discord : null;
  if (d.presos.some((x) => x.rg.toLowerCase() === rg.toLowerCase())) throw new OcorrenciaError(`O RG ${rg} já está na lista.`);
  const atual = ocorrenciaStore.atualizarRascunho(id, { houvePreso: true, presos: [...d.presos, { id: randomUUID(), nome, rg, discordId: discord }], aviso: `🔗 ${nome} adicionado(a) aos presos.` });
  if (!atual) throw new OcorrenciaError("Este registro já foi encerrado.");
  await redesenhar(atual).catch(() => null);
  return `✅ Preso adicionado: **${nome}** · RG ${rg}`;
}

export async function removerPreso(id: string, userId: string, presoId: string) {
  const d = meuRascunho(id, userId);
  const atual = ocorrenciaStore.atualizarRascunho(id, { presos: d.presos.filter((x) => x.id !== presoId), aviso: "🗑️ Preso removido da lista." });
  if (atual) await redesenhar(atual).catch(() => null);
}

/** Select de participantes (ids já sem bots). Quem abriu não precisa se marcar: já é o responsável. */
export async function definirParticipantes(id: string, userId: string, ids: string[]) {
  const d = meuRascunho(id, userId);
  const participantes = [...new Set(ids)].filter((x) => x !== d.autor.id).slice(0, LIMITES.participantes);
  const atual = ocorrenciaStore.atualizarRascunho(id, { participantes, aviso: participantes.length ? `👥 ${participantes.length} participante(s) marcado(s).` : "👥 Participantes removidos." });
  if (atual) await redesenhar(atual).catch(() => null);
}

/** Fotos mandadas como mensagem no canal temporário (só as de quem abriu contam). */
export async function salvarEvidencias(canalId: string, userId: string, uploads: Upload[]): Promise<{ ignorado: true } | { mensagem: string }> {
  const d = ocorrenciaStore.rascunhoDoCanal(canalId);
  if (!d || d.autor.id !== userId || !uploads.length) return { ignorado: true };
  if (ocupado(d)) throw new OcorrenciaError("Ainda estou processando o envio anterior. Aguarde terminar para mandar outro.");

  const marcado = ocorrenciaStore.atualizarRascunho(d.id, { ocupadoDesde: Date.now(), aviso: "⏳ Recebendo as evidências... o botão **Enviar** libera quando terminar." });
  if (!marcado) throw new OcorrenciaError("Este registro já foi encerrado.");
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
      const x = ocorrenciaStore.atualizarRascunho(d.id, { aviso: "⏳ Comprimindo o vídeo... pode levar alguns minutos." });
      if (x) await redesenhar(x);
    },
  }).catch(async (err: unknown) => {
    const msg = err instanceof MidiaError ? err.message : "Falha ao receber as evidências. Tente de novo.";
    const livre = ocorrenciaStore.atualizarRascunho(d.id, { ocupadoDesde: null, aviso: `⚠️ ${msg}` });
    if (livre) await redesenhar(livre).catch(() => null);
    if (!(err instanceof MidiaError)) console.error("[ocorrencia] falha ao receber evidências:", err);
    throw new OcorrenciaError(msg);
  });

  const ultimo = ocorrenciaStore.rascunho(d.id) ?? d;
  const pronto = ocorrenciaStore.atualizarRascunho(d.id, { midias: [...ultimo.midias, ...coletado.media], ocupadoDesde: null, aviso: `💾 ${coletado.media.length} evidência(s) adicionada(s).` });
  if (!pronto) {
    // Encerrado enquanto baixava: os arquivos não são usados.
    await apagarMidias(d.id, coletado.media.map((m) => m.id), PASTA);
    throw new OcorrenciaError("Este registro já foi encerrado; as fotos não foram usadas.");
  }
  await redesenhar(pronto).catch(() => null);
  return { mensagem: `✅ ${coletado.media.length} evidência(s) adicionada(s).` };
}

export async function limparEvidencias(id: string, userId: string) {
  const d = meuRascunho(id, userId);
  await apagarMidias(d.id, d.midias.map((m) => m.id), PASTA);
  const atual = ocorrenciaStore.atualizarRascunho(id, { midias: [], aviso: "🧹 Evidências removidas." });
  if (atual) await redesenhar(atual).catch(() => null);
  return "🧹 Evidências removidas.";
}

/* ---------- Envio ---------- */

/** Publica a ocorrência (uma mensagem por leva de fotos que cabe no limite do servidor). Desfaz se falhar no meio. */
async function publicar(o: Ocorrencia): Promise<string[]> {
  const lotes = o.midias.length ? lotesMidia(o.midias, await guildUploadLimit()) : [[]];
  const postados: string[] = [];
  for (const [i, lote] of lotes.entries()) {
    const anexos = [...(i === 0 ? brasao() : []), ...(lote.length ? await arquivosMidia(o.id, lote, PASTA) : [])];
    const msg = await postMessage(o.canalId, mensagemOcorrencia(o, lote.map((m) => m.name), i + 1, lotes.length), anexos.length ? anexos : undefined);
    if (!msg) {
      for (const id of postados) await deleteMessage(o.canalId, id);
      throw new OcorrenciaError("O bot não pode enviar no canal das ocorrências (precisa de Enviar mensagens e Anexar arquivos).");
    }
    postados.push(msg.id);
  }
  return postados;
}

export async function enviarRascunho(id: string, userId: string) {
  const atual = meuRascunho(id, userId);
  if (!relatoCompleto(atual)) throw new OcorrenciaError("Preencha o relato antes de enviar.");
  if (atual.houvePreso === null) throw new OcorrenciaError("Responda se houve preso (Sim ou Não) antes de enviar.");
  if (atual.houvePreso && !atual.presos.length) throw new OcorrenciaError("Você marcou que houve preso: adicione o nome e o RG de cada um.");
  if (ocupado(atual)) throw new OcorrenciaError("Aguarde: as evidências ainda estão sendo processadas.");
  const destino = ocorrenciaStore.config().destinoCanalId;
  if (!destino) throw new OcorrenciaError("O canal das ocorrências não está configurado (painel web → Ocorrência).");

  const d = ocorrenciaStore.atualizarRascunho(id, { status: "SENDING", aviso: null }); // dois cliques nunca enviam duas vezes
  if (!d) throw new OcorrenciaError("Este registro já está sendo enviado.");

  const v = d.relato;
  const o = ocorrenciaStore.criarRegistro({
    id: d.id,
    tipo: d.tipo,
    autor: d.autor,
    participantes: d.participantes,
    local: v.local!,
    quando: v.quando!,
    relato: v.relato!,
    apreensoes: v.apreensoes ?? null,
    desfecho: v.desfecho ?? null,
    houvePreso: Boolean(d.houvePreso),
    presos: d.houvePreso ? d.presos : [],
    midias: d.midias,
    canalId: destino,
  });

  try {
    const ids = await publicar(o);
    ocorrenciaStore.atualizarRegistro(o.id, { mensagemIds: ids });
  } catch (err) {
    ocorrenciaStore.descartarRegistro(o.id);
    const msg = err instanceof OcorrenciaError || err instanceof MidiaError ? err.message : "Falha ao enviar. Tente de novo.";
    const reaberto = ocorrenciaStore.atualizarRascunho(id, { status: "OPEN", aviso: `⚠️ ${msg}` }, ["SENDING"]);
    if (reaberto) await redesenhar(reaberto).catch(() => null);
    if (!(err instanceof OcorrenciaError || err instanceof MidiaError)) console.error("[ocorrencia] falha ao enviar:", err);
    throw new OcorrenciaError(msg);
  }

  const aviso = `✅ **Ocorrência ${numeroOcorrencia(o)}** enviada em <#${destino}>.\n-# Este canal será apagado em alguns segundos.`;
  const enviado = ocorrenciaStore.atualizarRascunho(id, { status: "SENT", aviso, fecharEm: Date.now() + ATRASO_FECHAR_MS }, ["SENDING"]);
  if (enviado) await redesenhar(enviado, true).catch(() => null);
  console.info(`[ocorrencia] ${numeroOcorrencia(o)} (${o.tipo.nome}) enviada por discord:${userId}`);
  return aviso.split("\n-#")[0]!;
}

export async function cancelarRascunho(id: string, userId: string) {
  const d = meuRascunho(id, userId);
  const cancelado = ocorrenciaStore.atualizarRascunho(id, { status: "CANCELLED", aviso: "🗑️ Registro cancelado.\n-# Este canal será apagado em alguns segundos.", fecharEm: Date.now() + ATRASO_FECHAR_MS });
  if (!cancelado) throw new OcorrenciaError("Este registro já foi encerrado.");
  await apagarMidias(d.id, undefined, PASTA);
  await redesenhar(cancelado, true).catch(() => null);
  return "🗑️ Registro cancelado.";
}

async function expirar(d: Rascunho) {
  if (ocorrenciaStore.atualizarRascunho(d.id, { status: "CANCELLED", aviso: "Cancelado automaticamente: aberto há mais de 6 horas.", fecharEm: Date.now() })) await apagarMidias(d.id, undefined, PASTA);
}

/** Rotina (a cada 30 s): apaga canais enviados/cancelados e expira os abandonados. Sobrevive a restarts. */
export async function fecharVencidos() {
  const agora = Date.now();
  // Envio cortado no meio (ex.: restart): volta a ficar aberto para enviar de novo.
  for (const d of ocorrenciaStore.rascunhos().filter((x) => x.status === "SENDING" && x.atualizadoEm <= agora - 5 * 60_000)) {
    if (ocorrenciaStore.registro(d.id)?.mensagemIds.length) {
      ocorrenciaStore.atualizarRascunho(d.id, { status: "SENT", fecharEm: agora }, ["SENDING"]);
      continue;
    }
    ocorrenciaStore.descartarRegistro(d.id);
    const reaberto = ocorrenciaStore.atualizarRascunho(d.id, { status: "OPEN", aviso: "⚠️ O envio foi interrompido. Toque em **Enviar** de novo." }, ["SENDING"]);
    if (reaberto) await redesenhar(reaberto).catch(() => null);
  }
  for (const d of ocorrenciaStore.rascunhos().filter((x) => x.status === "OPEN" && x.criadoEm <= agora - RASCUNHO_TTL_MS)) await expirar(d);
  for (const d of ocorrenciaStore.rascunhos().filter((x) => x.fecharEm !== null && x.fecharEm <= agora).slice(0, 25)) {
    if (d.canalId && !(await deleteChannel(d.canalId, d.status === "SENT" ? "Ocorrência enviada" : "Registro cancelado"))) continue;
    ocorrenciaStore.atualizarRascunho(d.id, { fecharEm: null }, null);
  }
}
