import { randomUUID } from "node:crypto";
import {
  deleteMessage,
  editInteractionReply,
  editMessage,
  FLAG_COMPONENTS_V2,
  FLAG_EPHEMERAL,
  interactionCallback,
  postMessage,
  type MessageBody,
} from "../discord/bot.js";
import type { RawInteraction } from "../discord/gateway.js";
import { env } from "../env.js";
import { brasao } from "../set/brasao.js";
import { customEditar, formulario, painelMensagem, PREFIXO, resultadoMensagem, SETOR_MAX, tituloAssuncao, VIATURA_MAX, type Preenchido } from "./mensagem.js";
import { assuncaoStore } from "./store.js";
import type { Assuncao, PolicialRegistro } from "./types.js";

/**
 * Assunção de Serviço no Discord:
 *
 *   botão "Assumir serviço" do painel → formulário (setor, viatura, comandante, motopol, demais)
 *     → algo errado? aviso efêmero + "Corrigir" (formulário volta preenchido)
 *     → resultado publicado no canal configurado + link efêmero para quem enviou
 *
 * Segurança: o cargo é conferido no clique E no envio, com os cargos atuais vindos do Discord.
 */

const COR_ERRO = 0xe10600;
const COR_AVISO = 0xf59e0b;
const COR_OK = 0x22c55e;

/* ---------- Último preenchimento (para "Corrigir" voltar preenchido; 15 min) ---------- */

const TTL = 15 * 60_000;
const rascunhos = new Map<string, Preenchido & { expira: number }>();
const chave = (userId: string, assuncaoId: string) => `${userId}:${assuncaoId}`;

function guardar(userId: string, assuncaoId: string, p: Preenchido) {
  const agora = Date.now();
  for (const [k, r] of rascunhos) if (r.expira < agora) rascunhos.delete(k);
  if (rascunhos.size >= 200) rascunhos.delete(rascunhos.keys().next().value!);
  rascunhos.set(chave(userId, assuncaoId), { ...p, expira: agora + TTL });
}

/** Evita registro duplicado (clique duplo): um envio a cada 15s por pessoa. */
const ultimoEnvio = new Map<string, number>();
const enviando = new Set<string>();
const INTERVALO_MS = 15_000;

/* ---------- Permissão ---------- */

export function podeUsar(a: Assuncao, roles: string[]): boolean {
  return a.cargosPermitidos.length > 0 && roles.some((r) => a.cargosPermitidos.includes(r));
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

const botaoCorrigir = (id: string) => ({ type: 2, style: 1, custom_id: customEditar(id), label: "Corrigir e reenviar", emoji: { name: "✏️" } });

const responder = (i: RawInteraction, type: number, data?: MessageBody) => interactionCallback(i.id, i.token, data ? { type, data } : { type });

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
    .replace(/[`*_~|>#\\]/g, "") // sem markdown nem cabeçalhos no resultado
    .replace(/@(everyone|here)/gi, "@​$1")
    .replace(/<[@#&!:a-z0-9_]+>/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/* ---------- Tratamento das interações ---------- */

export async function handleAssuncaoInteraction(i: RawInteraction): Promise<boolean> {
  const customId = i.data?.custom_id ?? "";
  if (!customId.startsWith(PREFIXO)) return false;
  const [, acao, id] = customId.split(":");
  const a = id ? assuncaoStore.buscar(id) : undefined;
  const member = i.member;

  if (!a) {
    await responder(i, 4, aviso(COR_ERRO, ["### Assunção indisponível", "Esta assunção de serviço foi removida do painel."]));
    return true;
  }
  if (!member) {
    await responder(i, 4, aviso(COR_ERRO, ["Use o painel dentro do servidor."]));
    return true;
  }
  if (!podeUsar(a, member.roles ?? [])) {
    await responder(
      i,
      4,
      aviso(COR_ERRO, [
        "### 🔒 Sem permissão",
        a.cargosPermitidos.length === 0
          ? "Nenhum cargo foi autorizado nesta assunção ainda. Peça à administração para configurar em **Painel → Assunção de Serviço**."
          : `Só os cargos autorizados podem registrar **${tituloAssuncao(a)}**.`,
      ]),
    );
    return true;
  }
  if (!a.ativa) {
    await responder(i, 4, aviso(COR_AVISO, ["### 🔒 Assunção fechada", `**${tituloAssuncao(a)}** não está recebendo registros agora.`]));
    return true;
  }

  const userId = member.user.id;

  // Abrir o formulário: do painel (vazio) ou "Corrigir" (volta preenchido).
  if (i.type === 3 && (acao === "abrir" || acao === "editar")) {
    const r = acao === "editar" ? rascunhos.get(chave(userId, a.id)) : undefined;
    await responder(i, 9, formulario(a, r));
    return true;
  }

  if (i.type !== 5 || acao !== "enviar") return false;

  const { textos, valores } = lerFormulario(i.data?.components);
  const p: Preenchido = {
    setor: limpar(a.setores.length ? (valores.setor?.[0] ?? "") : (textos.setor ?? ""), SETOR_MAX),
    viatura: limpar(textos.viatura ?? "", VIATURA_MAX),
    comandanteId: valores.comandante?.[0] ?? null,
    motopolId: valores.motopol?.[0] ?? null,
    demaisIds: [...new Set(valores.demais ?? [])],
  };
  guardar(userId, a.id, p);

  const erro = validar(a, p, i);
  if (erro) {
    await responder(i, 4, aviso(COR_AVISO, ["### ⚠️ Confira a guarnição", ...erro], [botaoCorrigir(a.id)]));
    return true;
  }
  if (a.setores.length && !a.setores.includes(p.setor)) {
    await responder(i, 4, aviso(COR_AVISO, ["### ⚠️ Setor inválido", "Escolha um setor da lista."], [botaoCorrigir(a.id)]));
    return true;
  }
  if (!a.canalResultadoId) {
    await responder(i, 4, aviso(COR_ERRO, ["### ❌ Canal não configurado", "A administração ainda não escolheu o canal de resultado desta assunção. Seus dados ficaram salvos por 15 minutos."], [botaoCorrigir(a.id)]));
    return true;
  }
  const espera = (ultimoEnvio.get(userId) ?? 0) + INTERVALO_MS - Date.now();
  if (espera > 0 || enviando.has(userId)) {
    await responder(i, 4, aviso(COR_AVISO, [`### ⏳ Aguarde ${Math.max(1, Math.ceil(espera / 1000))}s`, "Você acabou de registrar uma assunção."], [botaoCorrigir(a.id)]));
    return true;
  }

  // Publicar com a logo pode passar dos 3s: confirma já (efêmero) e edita depois.
  enviando.add(userId);
  await responder(i, 5, { flags: FLAG_EPHEMERAL });
  try {
    const em = Date.now();
    const canalId = a.canalResultadoId;
    const dados = { setor: p.setor, viatura: p.viatura, comandanteId: p.comandanteId!, motopolId: p.motopolId!, demaisIds: p.demaisIds, autorId: userId, em };
    const msg = await postMessage(canalId, resultadoMensagem(a, dados), brasao());
    if (!msg) {
      await editInteractionReply(
        i.token,
        aviso(COR_ERRO, ["### ❌ O Discord recusou o registro", `Confira se o bot pode **ver**, **enviar mensagens** e **anexar arquivos** em <#${canalId}>.`, "-# Seus dados ficaram salvos por 15 minutos."], [botaoCorrigir(a.id)]),
      );
      return true;
    }
    ultimoEnvio.set(userId, em);
    rascunhos.delete(chave(userId, a.id));

    const nome = (uid: string): PolicialRegistro => {
      const u = i.data?.resolved?.users?.[uid];
      const m = i.data?.resolved?.members?.[uid];
      return { id: uid, nome: m?.nick || u?.global_name || u?.username || uid };
    };
    await assuncaoStore.add({
      id: randomUUID(),
      assuncaoId: a.id,
      assuncaoNome: a.nome,
      autor: { id: userId, username: member.nick || member.user.global_name || member.user.username, avatar: member.user.avatar ?? null },
      setor: p.setor,
      viatura: p.viatura,
      comandante: nome(dados.comandanteId),
      motopol: nome(dados.motopolId),
      demais: p.demaisIds.map(nome),
      canalId,
      mensagemId: msg.id,
      em,
    });
    console.info(`[assuncao] ${a.nome} registrada em ${canalId} por discord:${userId}`);

    const link = `https://discord.com/channels/${env.DISCORD_GUILD_ID}/${canalId}/${msg.id}`;
    await editInteractionReply(
      i.token,
      aviso(COR_OK, ["### ✅ Serviço assumido", `**${tituloAssuncao(a)}** registrada em <#${canalId}> com **${2 + p.demaisIds.length} policiais**.`], [
        { type: 2, style: 5, label: "Ver registro", emoji: { name: "🔗" }, url: link },
      ]),
    );
  } finally {
    enviando.delete(userId);
  }
  return true;
}

/** Regras da guarnição. Devolve as linhas do aviso ou null se estiver tudo certo. */
function validar(a: Assuncao, p: Preenchido, i: RawInteraction): string[] | null {
  const c = a.campos;
  if (!p.setor || !p.viatura) return [`Preencha **${c.setor.label}** e **${c.viatura.label}**.`];
  if (!p.comandanteId || !p.motopolId) return [`Escolha o **${c.comandante.label}** e o **${c.motopol.label}**.`];
  if (p.comandanteId === p.motopolId) return ["O comandante e o motopol precisam ser **policiais diferentes**."];
  if (p.demaisIds.includes(p.comandanteId) || p.demaisIds.includes(p.motopolId)) {
    return ["Quem já é comandante ou motopol **não entra** em demais integrantes."];
  }
  if (p.demaisIds.length > a.maxDemais) return [`No máximo **${a.maxDemais}** demais integrantes.`];

  const users = i.data?.resolved?.users ?? {};
  const todos = [p.comandanteId, p.motopolId, ...p.demaisIds];
  if (todos.some((id) => users[id]?.bot)) return ["Bots não podem fazer parte da guarnição."];

  if (a.cargosComandante.length) {
    const roles = i.data?.resolved?.members?.[p.comandanteId]?.roles;
    // Sem os dados do membro (saiu do servidor?) também recusa.
    if (!roles || !roles.some((r) => a.cargosComandante.includes(r))) {
      return [
        `<@${p.comandanteId}> não pode ser comandante.`,
        `Cargos aceitos: ${a.cargosComandante.map((r) => `<@&${r}>`).join(" ")}`,
      ];
    }
  }
  return null;
}

/* ---------- Painel fixo ---------- */

/** Publica (ou atualiza no lugar) o painel de uma assunção. */
export async function publicarPainel(a: Assuncao, canalId: string) {
  const body = painelMensagem(a);
  if (a.painel?.canalId === canalId && (await editMessage(canalId, a.painel.mensagemId, body, brasao()))) return a.painel;
  const msg = await postMessage(canalId, body, brasao());
  if (!msg) return null;
  // Mudou de canal: some com o painel antigo para não ficarem dois botões.
  if (a.painel && a.painel.canalId !== canalId) void deleteMessage(a.painel.canalId, a.painel.mensagemId);
  return { canalId, mensagemId: msg.id };
}

/** Mantém todos os painéis publicados em dia (cargos, nome, cor, logo). Silencioso. */
export async function atualizarPaineisPublicados(): Promise<void> {
  for (const a of assuncaoStore.lista()) {
    if (a.painel) await editMessage(a.painel.canalId, a.painel.mensagemId, painelMensagem(a), brasao());
  }
}

/** Assunção removida no painel: o botão dela sai do Discord. */
export function removerPainel(a: Assuncao): void {
  if (a.painel) void deleteMessage(a.painel.canalId, a.painel.mensagemId);
}

