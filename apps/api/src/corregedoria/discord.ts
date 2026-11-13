import { emojiLogo } from "../branding/emoji.js";
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
import type { RawInteraction, RawMensagem } from "../discord/gateway.js";
import { brasao, cabecalho } from "../set/brasao.js";
import {
  abrirTicket,
  assumir,
  canalUrl,
  chamarOficial,
  ehCorregedor,
  falarComoCorregedoria,
  fecharTicket,
  guardarAnexos,
  identificacao,
  MAX_PROVAS,
  MENSAGEM_ERRO,
  type Quem,
} from "./service.js";
import { corregStore, type Ticket } from "./store.js";

/**
 * Corregedoria no Discord:
 *   painel (select de órgão) → confirmação (menu com o × para trocar) → modal (motivo, assunto, descrição, provas)
 *   → canal temporário com o painel do ticket (Assumir · Responder · Chamar oficial · Fechar).
 * Mensagens da equipe no canal são apagadas e reenviadas pelo webhook com o nome de exibição.
 */

const COR = 0x1e3a8a;
const nn = (n: number) => String(n).padStart(4, "0");
const paraEdicao = (b: MessageBody): MessageBody => ({ ...b, flags: FLAG_COMPONENTS_V2 });
const responder = (i: RawInteraction, type: number, data?: MessageBody) =>
  interactionCallback(i.id, i.token, data ? { type, data: type === 7 ? paraEdicao(data) : data } : { type });
const caixa = (cor: number, comps: unknown[], rodapeEfemero = true): MessageBody => ({
  flags: FLAG_EPHEMERAL | FLAG_COMPONENTS_V2,
  allowed_mentions: { parse: [] },
  components: [{ type: 17, accent_color: cor, components: [...comps, ...(rodapeEfemero ? [{ type: 10, content: "-# Só você vê esta mensagem." }] : [])] }],
});
const aviso = (texto: string, cor = 0xe10600) => caixa(cor, [{ type: 10, content: texto }]);
const erro = (codigo: string) => aviso(`❌ ${MENSAGEM_ERRO[codigo] ?? "Não foi possível concluir."}`);
const quemDe = (i: RawInteraction): Quem => ({ id: i.member!.user.id, nome: i.member!.user.global_name ?? i.member!.user.username });

/* ---------- Painel público ---------- */

/** Menu de assuntos. No passo de confirmação, o escolhido fica marcado e o × do próprio menu desmarca. */
function selectTipos(custom_id: string, selecionado?: string) {
  const limpavel = custom_id === "cg:tipoe";
  return {
    type: 1,
    components: [
      {
        type: 3,
        custom_id,
        placeholder: "Selecione o assunto…",
        ...(limpavel ? { min_values: 0, max_values: 1 } : {}),
        options: corregStore
          .config()
          .tipos.slice(0, 25)
          .map((t) => ({
            label: t.nome.slice(0, 100),
            value: t.id,
            description: t.descricao.slice(0, 100) || undefined,
            emoji: t.emoji ? { name: t.emoji } : undefined,
            ...(limpavel ? { default: t.id === selecionado } : {}),
          })),
      },
    ],
  };
}

export function painelPublico(): MessageBody {
  const emoji = emojiLogo();
  return {
    flags: FLAG_COMPONENTS_V2,
    allowed_mentions: { parse: [] },
    components: [
      {
        type: 17,
        accent_color: COR,
        components: [
          ...[
            cabecalho([
              "## 🛡️ Corregedoria",
              "Canal oficial para denúncias e assuntos internos da **Polícia Militar do Estado do Rio de Janeiro**. Seu atendimento é feito num canal privado, visível só para você e para a Corregedoria.",
            ]),
          ].flat(),
          { type: 14, divider: true, spacing: 1 },
          {
            type: 10,
            content: [
              "**Como abrir um ticket**",
              "1. Escolha o assunto no menu abaixo.",
              "2. Informe o motivo, o assunto e descreva o ocorrido.",
              "3. Envie as provas (imagens ou vídeos).",
              "",
              "-# Denúncias falsas estão sujeitas a punição.",
            ].join("\n"),
          },
          selectTipos("cg:tipo"),
          { type: 10, content: `-# ${emoji ? `${emoji} ` : ""}${corregStore.config().nomeExibicao}` },
        ],
      },
    ],
  };
}

export async function publicarPainel(canalId: string) {
  const atual = corregStore.config().painel;
  const body = painelPublico();
  if (atual?.canalId === canalId && (await editMessage(canalId, atual.mensagemId, body, brasao()))) return atual;
  const msg = await postMessage(canalId, body, brasao());
  return msg ? { canalId, mensagemId: msg.id } : null;
}

export async function atualizarPainelPublicado(): Promise<void> {
  const p = corregStore.config().painel;
  if (p) await editMessage(p.canalId, p.mensagemId, painelPublico(), brasao());
}

/* ---------- Passo 2: confirmação com ✖️ ---------- */

function confirmacao(i: RawInteraction, tipoId: string): MessageBody {
  const tipo = corregStore.config().tipos.find((t) => t.id === tipoId);
  const u = i.member!.user;
  const id = identificacao(u.id, i.member!.nick ?? null, u.global_name ?? u.username);
  // Sem assunto (limpou no × do menu): só o menu para escolher de novo.
  if (!tipo) return caixa(COR, [{ type: 10, content: "### 🛡️ Novo ticket na Corregedoria\nEscolha o assunto:" }, selectTipos("cg:tipoe")]);
  return caixa(COR, [
    { type: 10, content: "### 🛡️ Novo ticket na Corregedoria" },
    selectTipos("cg:tipoe", tipo.id),
    { type: 10, content: `**Órgão:** ${tipo.emoji} ${tipo.nome}\n**Você:** ${id.insignia ? `**${id.insignia}** ` : ""}${id.nome}` },
    { type: 1, components: [{ type: 2, style: 1, label: "Continuar", emoji: { name: "📝" }, custom_id: `cg:continuar:${tipo.id}` }] },
  ]);
}

/* ---------- Passo 3: modal ---------- */

function modalTicket(i: RawInteraction, tipoId: string): MessageBody | null {
  const tipo = corregStore.config().tipos.find((t) => t.id === tipoId);
  if (!tipo) return null;
  const u = i.member!.user;
  const id = identificacao(u.id, i.member!.nick ?? null, u.global_name ?? u.username);
  const texto = (custom_id: string, style: number, min: number, max: number, placeholder: string) => ({ type: 4, custom_id, style, required: true, min_length: min, max_length: max, placeholder });
  return {
    custom_id: `cg:enviar:${tipo.id}`,
    title: "🛡️ Corregedoria · Novo ticket",
    // Máximo de 5 componentes no modal.
    components: [
      { type: 10, content: `**Órgão:** ${tipo.emoji} ${tipo.nome} · **Você:** ${id.insignia ? `${id.insignia} ` : ""}${id.nome}` },
      { type: 18, label: "Motivo", description: "Por que você está abrindo este ticket?", component: texto("motivo", 1, 3, 150, "Ex.: abuso de autoridade") },
      { type: 18, label: "Assunto", description: "Título curto do caso.", component: texto("assunto", 1, 3, 100, "Ex.: abordagem na praça XV") },
      { type: 18, label: "Descrição", description: "Conte o que aconteceu: quando, onde, quem.", component: texto("descricao", 2, 20, 2000, "Descreva com o máximo de detalhes…") },
      {
        type: 18,
        label: "Provas (imagens ou vídeos)",
        description: `Até ${MAX_PROVAS} arquivos, 10 MB cada. PNG, JPG, GIF, MP4, MOV…`,
        component: { type: 19, custom_id: "provas", min_values: 0, max_values: MAX_PROVAS, required: false },
      },
    ],
  };
}

function lerModal(components: unknown): { textos: Record<string, string>; arquivos: Record<string, string[]> } {
  const textos: Record<string, string> = {};
  const arquivos: Record<string, string[]> = {};
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const n = node as { type?: number; custom_id?: string; value?: string; values?: string[]; component?: unknown; components?: unknown[] };
    if (n.custom_id && typeof n.value === "string") textos[n.custom_id] = n.value;
    if (n.custom_id && n.type === 19 && Array.isArray(n.values)) arquivos[n.custom_id] = n.values;
    if (n.component) walk(n.component);
    if (Array.isArray(n.components)) n.components.forEach(walk);
  };
  if (Array.isArray(components)) components.forEach(walk);
  return { textos, arquivos };
}
const limpar = (s: string | undefined, max: number, linhas = false) =>
  (s ?? "")
    .normalize("NFC")
    .replace(linhas ? /[\u0000-\u0009\u000B-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, linhas ? "" : " ")
    .trim()
    .slice(0, max);

function modalResposta(t: Ticket): MessageBody {
  return {
    custom_id: `cg:resp:${t.id}`,
    title: `💬 Responder · Ticket #${nn(t.numero)}`,
    components: [
      { type: 10, content: `A mensagem sai como **${corregStore.config().nomeExibicao}**. Ninguém vê quem escreveu — nem o indicador de "digitando".` },
      { type: 18, label: "Mensagem", component: { type: 4, custom_id: "texto", style: 2, required: true, min_length: 1, max_length: 2000, placeholder: "Escreva a resposta…" } },
      { type: 18, label: "Anexos (opcional)", component: { type: 19, custom_id: "anexos", min_values: 0, max_values: 5, required: false } },
    ],
  };
}

/* ---------- Interações ---------- */

export async function handleCorregedoriaInteraction(i: RawInteraction): Promise<boolean> {
  const id = i.data?.custom_id ?? "";
  if (!id.startsWith("cg:")) return false;
  const member = i.member;
  if (!member) {
    await responder(i, 4, aviso("Use dentro do servidor."));
    return true;
  }
  const [, acao = "", alvo = ""] = id.split(":");

  /* --- Quem quer abrir um ticket --- */

  if (i.type === 3 && (acao === "tipo" || acao === "tipoe")) {
    const aberto = corregStore.abertoDe(member.user.id);
    if (aberto?.canalId) {
      await responder(i, acao === "tipo" ? 4 : 7, caixa(COR, [
        { type: 10, content: `Você já tem um ticket aberto (**#${nn(aberto.numero)}**).` },
        { type: 1, components: [{ type: 2, style: 5, label: "Ir para o ticket", url: canalUrl(aberto) }] },
      ]));
      return true;
    }
    await responder(i, acao === "tipo" ? 4 : 7, confirmacao(i, i.data?.values?.[0] ?? ""));
    return true;
  }
  if (i.type === 3 && acao === "limpar") {
    await responder(i, 7, caixa(COR, [{ type: 10, content: "### 🛡️ Novo ticket na Corregedoria\nEscolha o assunto:" }, selectTipos("cg:tipoe")]));
    return true;
  }
  if (i.type === 3 && acao === "continuar") {
    const modal = modalTicket(i, alvo);
    await responder(i, modal ? 9 : 7, modal ?? erro("tipo_invalido"));
    return true;
  }
  if (i.type === 5 && acao === "enviar") {
    const tipo = corregStore.config().tipos.find((t) => t.id === alvo);
    if (!tipo) {
      await responder(i, 4, erro("tipo_invalido"));
      return true;
    }
    const { textos, arquivos } = lerModal(i.data?.components);
    const anexos = (arquivos.provas ?? []).map((a) => i.data?.resolved?.attachments?.[a]).filter((a): a is NonNullable<typeof a> => Boolean(a));
    // Baixar provas e criar o canal leva mais de 3s: confirma já, responde depois.
    await responder(i, 5, { flags: FLAG_EPHEMERAL });
    const r = await abrirTicket({
      usuario: { id: member.user.id, username: member.user.username, avatar: member.user.avatar ?? null, apelido: member.nick ?? null },
      tipo,
      motivo: limpar(textos.motivo, 150),
      assunto: limpar(textos.assunto, 100),
      descricao: limpar(textos.descricao, 2000, true),
      provas: anexos,
    });
    await editInteractionReply(
      i.token,
      paraEdicao(
        r.ok
          ? caixa(0x22c55e, [
              { type: 10, content: [`### ✅ Ticket #${nn(r.valor.ticket.numero)} aberto`, "A Corregedoria vai te atender no canal privado.", ...r.valor.avisos.map((a) => `⚠️ ${a}`)].join("\n") },
              { type: 1, components: [{ type: 2, style: 5, label: "Ir para o ticket", emoji: { name: "🛡️" }, url: canalUrl(r.valor.ticket) }] },
            ])
          : erro(r.erro),
      ),
    );
    return true;
  }

  /* --- Equipe da corregedoria (cargo conferido em todo clique) --- */

  const t = corregStore.byId(alvo);
  if (!t) {
    await responder(i, 4, erro("ticket_fechado"));
    return true;
  }
  if (!ehCorregedor(member.roles ?? [])) {
    await responder(i, 4, erro("sem_permissao"));
    return true;
  }
  const outroAssumiu = t.assumidoPor && t.assumidoPor.id !== member.user.id;

  if (i.type === 3 && acao === "assumir") {
    await responder(i, 5, { flags: FLAG_EPHEMERAL });
    const r = await assumir(t, quemDe(i));
    await editInteractionReply(i.token, paraEdicao(r.ok ? aviso("🛡️ Você assumiu o ticket. Só você e o policial escrevem aqui agora — suas mensagens saem como a Corregedoria.", 0x22c55e) : erro(r.erro)));
    return true;
  }
  if (i.type === 3 && acao === "responder") {
    if (outroAssumiu) {
      await responder(i, 4, erro("nao_assumiu"));
      return true;
    }
    await responder(i, 9, modalResposta(t));
    return true;
  }
  if (i.type === 5 && acao === "resp") {
    if (outroAssumiu) {
      await responder(i, 4, erro("nao_assumiu"));
      return true;
    }
    await responder(i, 5, { flags: FLAG_EPHEMERAL });
    const { textos, arquivos } = lerModal(i.data?.components);
    const atts = (arquivos.anexos ?? []).map((a) => i.data?.resolved?.attachments?.[a]).filter((a): a is NonNullable<typeof a> => Boolean(a));
    const g = await guardarAnexos(t, atts);
    const ok = await falarComoCorregedoria(t, limpar(textos.texto, 2000, true), g.arquivos, quemDe(i), g.anexos);
    await editInteractionReply(i.token, paraEdicao(ok ? aviso(["✅ Resposta enviada.", ...g.avisos.map((a) => `⚠️ ${a}`)].join("\n"), 0x22c55e) : aviso("❌ Não foi possível enviar.")));
    return true;
  }
  if (i.type === 3 && acao === "chamar") {
    await responder(i, 5, { flags: FLAG_EPHEMERAL });
    const r = await chamarOficial(t, quemDe(i));
    await editInteractionReply(i.token, paraEdicao(r.ok ? aviso("🔔 O policial foi chamado por mensagem direta.", 0x22c55e) : erro(r.erro)));
    return true;
  }
  if (i.type === 3 && acao === "fechar") {
    await responder(i, 4, caixa(0xe10600, [
      { type: 10, content: `### 🔒 Fechar o ticket #${nn(t.numero)}?\nO canal é apagado e o transcript vai para o policial e para o canal de log.` },
      { type: 1, components: [{ type: 2, style: 4, label: "Fechar ticket", custom_id: `cg:fecharok:${t.id}` }] },
    ]));
    return true;
  }
  if (i.type === 3 && acao === "fecharok") {
    await responder(i, 7, aviso("🔒 Fechando o ticket…", 0x4b5563));
    await fecharTicket(t, quemDe(i));
    return true;
  }
  return false;
}

/* ---------- Mensagens no canal do ticket ---------- */

/**
 * Quem abriu fala normalmente (a mensagem fica, e é registrada).
 * Quem é da corregedoria: a mensagem é apagada e reenviada pelo webhook com o nome de exibição.
 */
export async function aoMensagemNoTicket(m: RawMensagem): Promise<void> {
  if (m.webhook_id || m.author.bot) return;
  const t = corregStore.byCanal(m.channel_id);
  if (!t) return;
  const autor = { id: m.author.id, nome: m.author.global_name ?? m.author.username, avatar: m.author.avatar ?? null };

  if (m.author.id === t.userId) {
    const g = await guardarAnexos(t, m.attachments);
    t.eventos.push({ id: m.id, tipo: "mensagem", papel: "denunciante", autor, conteudo: m.content, anexos: g.anexos, em: Date.now() });
    await corregStore.salvar();
    return;
  }

  if (!ehCorregedor(m.member?.roles ?? [])) return;
  // Baixa os anexos ANTES de apagar (o link deixa de valer).
  const g = await guardarAnexos(t, m.attachments);
  await deleteMessage(m.channel_id, m.id);
  if (t.assumidoPor && t.assumidoPor.id !== m.author.id) return; // só quem assumiu responde
  await falarComoCorregedoria(t, m.content, g.arquivos, autor, g.anexos);
}
