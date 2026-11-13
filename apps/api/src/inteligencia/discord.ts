import { randomUUID } from "node:crypto";
import {
  deleteMessage,
  editInteractionReply,
  editMessage,
  FLAG_COMPONENTS_V2,
  FLAG_EPHEMERAL,
  interactionCallback,
  postMessage,
  type Arquivo,
  type MessageBody,
} from "../discord/bot.js";
import type { RawInteraction } from "../discord/gateway.js";
import { env } from "../env.js";
import { baixarImagemDiscord } from "../lib/imagemDiscord.js";
import { brasao } from "../set/brasao.js";
import { C, formulario, lerLinks, LINK_TEXTO_MAX, OBJETO_MAX, painelMensagem, PREFIXO, resultadoMensagem, tituloIntel, type Preenchido } from "./mensagem.js";
import { inteligenciaStore, MAX_FOTOS, MAX_LINKS } from "./store.js";
import type { InteligenciaConfig, PolicialRegistro } from "./types.js";

/**
 * Assunção de Serviço Inteligência no Discord:
 *
 *   botão "Assumir serviço" → formulário (quantidade, policiais, objeto, fotos, link)
 *     → confirma na hora (efêmero) → baixa as fotos → confere tudo
 *     → algo errado? aviso + "Corrigir" (formulário volta preenchido; fotos já enviadas ficam guardadas)
 *     → resultado no canal configurado + link para quem enviou
 *
 * Segurança: cargo conferido no clique E no envio, com os cargos atuais vindos do Discord.
 */

const COR_ERRO = 0xe10600;
const COR_AVISO = 0xf59e0b;
const COR_OK = 0x22c55e;
/** Por foto; o total da mensagem fica abaixo do limite de envio do Discord. */
const FOTO_MAX_BYTES = 8 * 1024 * 1024;
const TOTAL_MAX_BYTES = 24 * 1024 * 1024;

/* ---------- Rascunho por pessoa (15 min = validade do token da interação) ---------- */

interface Rascunho extends Preenchido {
  fotos: Arquivo[];
  expira: number;
}
const TTL = 15 * 60_000;
const MAX_RASCUNHOS = 50; // as fotos ficam em memória até publicar
const rascunhos = new Map<string, Rascunho>();

function rascunho(userId: string): Rascunho {
  const agora = Date.now();
  for (const [k, r] of rascunhos) if (r.expira < agora) rascunhos.delete(k);
  let r = rascunhos.get(userId);
  if (!r) {
    if (rascunhos.size >= MAX_RASCUNHOS) rascunhos.delete(rascunhos.keys().next().value!);
    r = { quantidade: null, policiaisIds: [], objeto: "", linkTexto: "", fotosGuardadas: 0, fotos: [], expira: 0 };
    rascunhos.set(userId, r);
  }
  r.expira = agora + TTL;
  return r;
}

const ultimoEnvio = new Map<string, number>();
const enviando = new Set<string>();
const INTERVALO_MS = 15_000;

/* ---------- Permissão ---------- */

export function podeUsar(roles: string[]): boolean {
  const permitidos = inteligenciaStore.config().cargosPermitidos;
  return permitidos.length > 0 && roles.some((r) => permitidos.includes(r));
}

/* ---------- Respostas ---------- */

function aviso(cor: number, linhas: string[], botoes: unknown[] = []): MessageBody {
  return {
    flags: FLAG_EPHEMERAL | FLAG_COMPONENTS_V2,
    allowed_mentions: { parse: [] },
    components: [
      {
        type: 17,
        accent_color: cor,
        components: [{ type: 10, content: linhas.join("\n") }, ...(botoes.length ? [{ type: 1, components: botoes }] : []), { type: 10, content: "-# Só você vê esta mensagem." }],
      },
    ],
  };
}

const BOTAO_CORRIGIR = { type: 2, style: 1, custom_id: C.editar, label: "Corrigir e reenviar", emoji: { name: "✏️" } };
const responder = (i: RawInteraction, type: number, data?: MessageBody) => interactionCallback(i.id, i.token, data ? { type, data } : { type });
/** Editar a resposta não aceita a flag de efêmera: mantém só a de V2. */
const editar = (i: RawInteraction, body: MessageBody) => editInteractionReply(i.token, { ...body, flags: FLAG_COMPONENTS_V2 });

/* ---------- Leitura do formulário ---------- */

function lerFormulario(components: unknown): { textos: Record<string, string>; valores: Record<string, string[]> } {
  const textos: Record<string, string> = {};
  const valores: Record<string, string[]> = {};
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const n = node as { custom_id?: string; value?: string; values?: string[]; component?: unknown; components?: unknown[] };
    if (n.custom_id && typeof n.value === "string") textos[n.custom_id] = n.value;
    if (n.custom_id && Array.isArray(n.values)) valores[n.custom_id] = n.values.filter((v) => typeof v === "string");
    if (n.component) walk(n.component);
    if (Array.isArray(n.components)) n.components.forEach(walk);
  };
  if (Array.isArray(components)) components.forEach(walk);
  return { textos, valores };
}

const limpar = (s: string, max: number) =>
  s
    .normalize("NFC")
    .replace(/[`*_~|>#\\]/g, "")
    .replace(/@(everyone|here)/gi, "@​$1")
    .replace(/<[@#&!:a-z0-9_]+>/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/* ---------- Tratamento das interações ---------- */

export async function handleInteligenciaInteraction(i: RawInteraction): Promise<boolean> {
  const customId = i.data?.custom_id ?? "";
  if (!customId.startsWith(PREFIXO)) return false;
  const cfg = inteligenciaStore.config();
  const member = i.member;

  if (!member) {
    await responder(i, 4, aviso(COR_ERRO, ["Use o painel dentro do servidor."]));
    return true;
  }
  if (!podeUsar(member.roles ?? [])) {
    rascunhos.delete(member.user.id);
    await responder(
      i,
      4,
      aviso(COR_ERRO, [
        "### 🔒 Sem permissão",
        cfg.cargosPermitidos.length === 0
          ? "Nenhum cargo foi autorizado ainda. Peça à administração para configurar em **Painel → Assunção Inteligência**."
          : `Só os cargos autorizados podem registrar **${tituloIntel(cfg)}**.`,
      ]),
    );
    return true;
  }
  if (!cfg.ativa) {
    await responder(i, 4, aviso(COR_AVISO, ["### 🔒 Assunção fechada", `**${tituloIntel(cfg)}** não está recebendo registros agora.`]));
    return true;
  }

  const userId = member.user.id;

  if (i.type === 3 && customId === C.abrir) {
    rascunhos.delete(userId);
    await responder(i, 9, formulario(cfg));
    return true;
  }
  if (i.type === 3 && customId === C.editar) {
    const r = rascunhos.get(userId);
    await responder(i, 9, formulario(cfg, r ? { ...r, fotosGuardadas: r.fotos.length } : undefined));
    return true;
  }
  if (i.type !== 5 || customId !== C.enviar) return false;

  if (enviando.has(userId)) {
    await responder(i, 4, aviso(COR_AVISO, ["### ⏳ Aguarde", "Seu registro anterior ainda está sendo publicado."]));
    return true;
  }

  // Baixar fotos e publicar pode passar dos 3s: confirma já (efêmero) e edita depois.
  enviando.add(userId);
  await responder(i, 5, { flags: FLAG_EPHEMERAL });
  try {
    await editar(i, await processar(i, cfg, userId));
  } finally {
    enviando.delete(userId);
  }
  return true;
}

async function processar(i: RawInteraction, cfg: InteligenciaConfig, userId: string): Promise<MessageBody> {
  const member = i.member!;
  const { textos, valores } = lerFormulario(i.data?.components);
  const r = rascunho(userId);
  const quantidade = Number(valores.quantidade?.[0]);
  r.quantidade = Number.isInteger(quantidade) && quantidade >= 1 ? quantidade : null;
  r.policiaisIds = [...new Set(valores.policiais ?? [])];
  r.objeto = limpar(cfg.objetos.length ? (valores.objeto?.[0] ?? "") : (textos.objeto ?? ""), OBJETO_MAX);
  r.linkTexto = (textos.link ?? "").slice(0, LINK_TEXTO_MAX).trim();

  // Fotos novas substituem as guardadas; sem fotos novas, mantém as do envio anterior.
  const anexoIds = (valores.fotos ?? []).slice(0, MAX_FOTOS);
  if (anexoIds.length) {
    const novas: Arquivo[] = [];
    for (const [n, id] of anexoIds.entries()) {
      const att = i.data?.resolved?.attachments?.[id];
      if (!att) continue;
      const img = await baixarImagemDiscord(att, `foto-${n + 1}`, FOTO_MAX_BYTES, "inteligencia");
      if (!img.ok) return aviso(COR_AVISO, ["### ⚠️ Problema com as fotos", img.erro, "-# O resto do formulário ficou salvo."], [BOTAO_CORRIGIR]);
      novas.push(img.arquivo);
    }
    if (novas.reduce((s, f) => s + f.dados.length, 0) > TOTAL_MAX_BYTES) {
      return aviso(COR_AVISO, ["### ⚠️ Fotos grandes demais", "Juntas, as fotos passam de 24 MB. Envie menos fotos ou mande por link."], [BOTAO_CORRIGIR]);
    }
    r.fotos = novas;
  }

  const c = cfg.campos;
  const erro = (linhas: string[]) => aviso(COR_AVISO, ["### ⚠️ Confira o formulário", ...linhas], [BOTAO_CORRIGIR]);
  if (!r.quantidade) return erro([`Escolha a **${c.quantidade.label}**.`]);
  if (r.policiaisIds.length === 0) return erro([`Selecione os **${c.policiais.label}**.`]);
  if (r.policiaisIds.length !== r.quantidade) {
    return erro([`Você marcou **${r.quantidade}** na quantidade, mas selecionou **${r.policiaisIds.length}** ${r.policiaisIds.length === 1 ? "policial" : "policiais"}.`, "Os dois precisam bater."]);
  }
  if (r.policiaisIds.length > cfg.maxPoliciais) return erro([`No máximo **${cfg.maxPoliciais}** policiais.`]);
  if (r.policiaisIds.some((id) => i.data?.resolved?.users?.[id]?.bot)) return erro(["Bots não podem fazer parte da equipe."]);
  if (!r.objeto) return erro([`Informe o **${c.objeto.label}**.`]);
  if (cfg.objetos.length && !cfg.objetos.includes(r.objeto)) return erro(["Escolha uma comunidade/organização da lista."]);

  const { links, invalido } = lerLinks(r.linkTexto, MAX_LINKS);
  if (invalido) return erro([`“${invalido}” não é um link válido. Use links começando com https://, um por linha.`]);
  if (cfg.exigirFoto && r.fotos.length === 0 && links.length === 0) return erro(["Mande pelo menos **uma foto**: por upload ou por link."]);

  if (!cfg.canalResultadoId) {
    return aviso(COR_ERRO, ["### ❌ Canal não configurado", "A administração ainda não escolheu o canal de resultado. Seus dados ficaram salvos por 15 minutos."], [BOTAO_CORRIGIR]);
  }
  const espera = (ultimoEnvio.get(userId) ?? 0) + INTERVALO_MS - Date.now();
  if (espera > 0) return aviso(COR_AVISO, [`### ⏳ Aguarde ${Math.ceil(espera / 1000)}s`, "Você acabou de registrar uma assunção."], [BOTAO_CORRIGIR]);

  const em = Date.now();
  const canalId = cfg.canalResultadoId;
  const body = resultadoMensagem(cfg, { objeto: r.objeto, policiaisIds: r.policiaisIds, fotos: r.fotos.map((f) => f.nome), links, autorId: userId, em });
  const msg = await postMessage(canalId, body, [...brasao(), ...r.fotos]);
  if (!msg) {
    return aviso(
      COR_ERRO,
      ["### ❌ O Discord recusou o registro", `Confira se o bot pode **ver**, **enviar mensagens** e **anexar arquivos** em <#${canalId}>. Links de imagem quebrados também podem causar isso.`, "-# Seus dados ficaram salvos por 15 minutos."],
      [BOTAO_CORRIGIR],
    );
  }

  ultimoEnvio.set(userId, em);
  const fotosEnviadas = r.fotos.length;
  rascunhos.delete(userId);
  const nome = (uid: string): PolicialRegistro => {
    const u = i.data?.resolved?.users?.[uid];
    const m = i.data?.resolved?.members?.[uid];
    return { id: uid, nome: m?.nick || u?.global_name || u?.username || uid };
  };
  await inteligenciaStore.add({
    id: randomUUID(),
    autor: { id: userId, username: member.nick || member.user.global_name || member.user.username, avatar: member.user.avatar ?? null },
    objeto: r.objeto,
    policiais: r.policiaisIds.map(nome),
    fotosEnviadas,
    links,
    canalId,
    mensagemId: msg.id,
    em,
  });
  console.info(`[inteligencia] assunção registrada em ${canalId} por discord:${userId}`);

  const link = `https://discord.com/channels/${env.DISCORD_GUILD_ID}/${canalId}/${msg.id}`;
  return aviso(COR_OK, ["### ✅ Serviço assumido", `**${tituloIntel(cfg)}** registrada em <#${canalId}>.`], [{ type: 2, style: 5, label: "Ver registro", emoji: { name: "🔗" }, url: link }]);
}

/* ---------- Painel fixo ---------- */

export async function publicarPainel(canalId: string) {
  const cfg = inteligenciaStore.config();
  const body = painelMensagem(cfg);
  if (cfg.painel?.canalId === canalId && (await editMessage(canalId, cfg.painel.mensagemId, body, brasao()))) return cfg.painel;
  const msg = await postMessage(canalId, body, brasao());
  if (!msg) return null;
  if (cfg.painel && cfg.painel.canalId !== canalId) void deleteMessage(cfg.painel.canalId, cfg.painel.mensagemId);
  return { canalId, mensagemId: msg.id };
}

export async function atualizarPainelPublicado(): Promise<void> {
  const cfg = inteligenciaStore.config();
  if (cfg.painel) await editMessage(cfg.painel.canalId, cfg.painel.mensagemId, painelMensagem(cfg), brasao());
}
