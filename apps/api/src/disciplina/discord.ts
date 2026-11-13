import { emojiLogo } from "../branding/emoji.js";
import { corregStore } from "../corregedoria/store.js";
import { guardarAnexosSimples } from "./anexos.js";
import { deleteMessage, editInteractionReply, editMessage, FLAG_COMPONENTS_V2, FLAG_EPHEMERAL, getMember, interactionCallback, postMessage, type MessageBody } from "../discord/bot.js";
import type { RawInteraction, RawMensagem } from "../discord/gateway.js";
import { prever, promover, MENSAGEM_ERRO as ERRO_PROMOCAO } from "../promocao/service.js";
import { brasao, cabecalho } from "../set/brasao.js";
import { setStore } from "../set/store.js";
import {
  abrirReuniao,
  aplicarAdvertencia,
  canalUrl,
  chamarNovamente,
  exonerar,
  falarNaReuniao,
  fecharReuniao,
  iniciarReuniao,
  MENSAGEM_ERRO,
  nivelAtual,
  podeGerir,
  removerAdvertencia,
  type Quem,
} from "./service.js";
import { disciplinaStore } from "./store.js";

/**
 * Gestão disciplinar no Discord.
 *  Painel (só gestão): 📅 Chamar para reunião · ⚠️ Advertência · 🚫 Exoneração
 *  Fluxo efêmero: pessoa → [nível / patente] (menus com o × do Discord para desmarcar) → motivo opcional → confirmar.
 *  Reunião: canal temporário com Iniciar · Painel de gerenciamento · Chamar · Fechar.
 */

type Acao = "reuniao" | "advertencia" | "remover" | "rebaixamento" | "exoneracao";

const COR = 0x1e3a8a;
const TITULO: Record<Acao, string> = {
  reuniao: "### 📅 Chamar para reunião",
  advertencia: "### ⚠️ Advertência",
  remover: "### ✅ Remover advertência",
  rebaixamento: "### 📉 Rebaixamento",
  exoneracao: "### 🚫 Exoneração",
};
const CONFIRMAR: Record<Acao, { label: string; style: number }> = {
  reuniao: { label: "Abrir reunião", style: 1 },
  advertencia: { label: "Aplicar advertência", style: 4 },
  remover: { label: "Remover advertência", style: 3 },
  rebaixamento: { label: "Rebaixar", style: 4 },
  exoneracao: { label: "Exonerar e expulsar", style: 4 },
};

interface Rascunho {
  acao: Acao;
  alvoId: string | null;
  /** Dentro de uma reunião: a pessoa é fixa (o convocado). */
  reuniaoId: string | null;
  nivelId: string | null;
  patenteId: string | null;
  motivo: string | null;
  expira: number;
}
const rascunhos = new Map<string, Rascunho>();
function novo(userId: string, acao: Acao, alvoId: string | null = null, reuniaoId: string | null = null): Rascunho {
  for (const [k, v] of rascunhos) if (v.expira < Date.now()) rascunhos.delete(k);
  if (rascunhos.size >= 200) rascunhos.delete(rascunhos.keys().next().value!);
  const r: Rascunho = { acao, alvoId, reuniaoId, nivelId: null, patenteId: null, motivo: null, expira: Date.now() + 15 * 60_000 };
  rascunhos.set(userId, r);
  return r;
}

const quemDe = (i: RawInteraction): Quem => ({ id: i.member!.user.id, nome: i.member!.user.global_name ?? i.member!.user.username });
const paraEdicao = (b: MessageBody): MessageBody => ({ ...b, flags: FLAG_COMPONENTS_V2 });
const responder = (i: RawInteraction, type: number, data?: MessageBody) =>
  interactionCallback(i.id, i.token, data ? { type, data: type === 7 ? paraEdicao(data) : data } : { type });
const caixa = (cor: number, comps: unknown[]): MessageBody => ({
  flags: FLAG_EPHEMERAL | FLAG_COMPONENTS_V2,
  allowed_mentions: { parse: [] },
  components: [{ type: 17, accent_color: cor, components: [...comps, { type: 10, content: "-# Só você vê esta mensagem." }] }],
});
const aviso = (texto: string, cor = 0xe10600) => caixa(cor, [{ type: 10, content: texto }]);

/* ---------- Painel público (da gestão) ---------- */

export function painelGestao(): MessageBody {
  const emoji = emojiLogo();
  return {
    flags: FLAG_COMPONENTS_V2,
    allowed_mentions: { parse: [] },
    components: [
      {
        type: 17,
        accent_color: COR,
        components: [
          ...[cabecalho(["## ⚖️ Corregedoria · Gestão disciplinar", "Convocações, advertências e exonerações. Somente cargos autorizados."])].flat(),
          { type: 14, divider: true, spacing: 1 },
          {
            type: 1,
            components: [
              { type: 2, style: 1, label: "Chamar para reunião", emoji: { name: "📅" }, custom_id: "dc:fluxo:reuniao" },
              { type: 2, style: 2, label: "Advertência", emoji: { name: "⚠️" }, custom_id: "dc:fluxo:advertencia" },
              { type: 2, style: 4, label: "Exoneração", emoji: { name: "🚫" }, custom_id: "dc:fluxo:exoneracao" },
            ],
          },
          { type: 10, content: `-# ${emoji ? `${emoji} ` : ""}${corregStore.config().nomeExibicao}` },
        ],
      },
    ],
  };
}

export async function publicarPainel(canalId: string) {
  const atual = disciplinaStore.config().painel;
  const body = painelGestao();
  if (atual?.canalId === canalId && (await editMessage(canalId, atual.mensagemId, body, brasao()))) return atual;
  const msg = await postMessage(canalId, body, brasao());
  return msg ? { canalId, mensagemId: msg.id } : null;
}

export async function atualizarPainelPublicado() {
  const p = disciplinaStore.config().painel;
  if (p) await editMessage(p.canalId, p.mensagemId, painelGestao(), brasao());
}

/* ---------- Fluxo efêmero ---------- */

async function fluxo(r: Rascunho, avisoTxt?: string): Promise<MessageBody> {
  const comps: unknown[] = [{ type: 10, content: TITULO[r.acao] }];
  const cfg = disciplinaStore.config();

  // Menus com o × do próprio Discord (min_values 0 + escolha marcada). Limpou → volta ao passo anterior.
  const membro = r.alvoId ? await getMember(r.alvoId) : null;
  if (r.alvoId && !membro) {
    comps.push({ type: 10, content: "⚠️ Essa pessoa não está mais no servidor." });
    r.alvoId = null;
  }
  if (r.reuniaoId && r.alvoId) {
    comps.push({ type: 10, content: `**Pessoa:** <@${r.alvoId}>` }); // na reunião a pessoa é fixa (o convocado)
  } else {
    comps.push({
      type: 1,
      components: [{ type: 5, custom_id: "dc:pessoa", placeholder: "Selecione a pessoa…", min_values: 0, max_values: 1, ...(r.alvoId ? { default_values: [{ id: r.alvoId, type: "user" }] } : {}) }],
    });
  }
  if (!r.alvoId || !membro) {
    comps.push({ type: 10, content: `**Motivo:** ${r.motivo ?? "_opcional_"}` }, { type: 1, components: [{ type: 2, style: 2, label: r.motivo ? "Editar motivo" : "Adicionar motivo", emoji: { name: "✏️" }, custom_id: "dc:motivo" }] });
    if (avisoTxt) comps.push({ type: 10, content: `⚠️ ${avisoTxt}` });
    return caixa(COR, comps);
  }

  const nivel = nivelAtual(membro.roles);
  if (r.acao === "advertencia" || r.acao === "remover") comps.push({ type: 10, content: `-# Advertência atual: ${nivel?.nome ?? "nenhuma"}` });

  let pronto = true;
  if (r.acao === "advertencia") {
    const sel = cfg.niveis.find((n) => n.id === r.nivelId);
    if (!sel) pronto = false;
    comps.push({
      type: 1,
      components: [
        {
          type: 3,
          custom_id: "dc:nivel",
          placeholder: "Selecione o nível da advertência…",
          min_values: 0,
          max_values: 1,
          options: cfg.niveis.slice(0, 25).map((n) => ({
            label: n.nome.slice(0, 100),
            value: n.id,
            description: n.cargoId ? (n.id === nivel?.id ? "Nível atual" : undefined) : "Sem cargo configurado",
            default: n.id === sel?.id,
          })),
        },
      ],
    });
  }

  if (r.acao === "rebaixamento") {
    const patentes = setStore.config().patentes;
    const atual = prever(membro, patentes[0]!).de;
    const idx = atual ? patentes.findIndex((p) => p.id === atual.id) : -1;
    const abaixo = patentes.filter((_, i) => i < idx);
    const sel = abaixo.find((p) => p.id === r.patenteId);
    comps.push({ type: 10, content: `-# Patente atual: ${atual ? `**${atual.prefixo}** · ${atual.nome}` : "não identificada"}` });
    if (idx < 0 || abaixo.length === 0) {
      pronto = false;
      comps.push({ type: 10, content: idx < 0 ? "⚠️ Não foi possível identificar a patente atual." : "⚠️ Não há patente abaixo da atual." });
    } else {
      if (!sel) pronto = false;
      comps.push({
        type: 1,
        components: [
          {
            type: 3,
            custom_id: "dc:patente",
            placeholder: "Selecione a nova patente…",
            min_values: 0,
            max_values: 1,
            options: abaixo.slice(-25).map((p) => ({ label: `${p.prefixo} · ${p.nome}`.slice(0, 100), value: p.id, default: p.id === sel?.id })),
          },
        ],
      });
      if (sel) {
        const prev = prever(membro, sel);
        comps.push({ type: 10, content: `-# Apelido: ${prev.apelidoAntes ?? "—"} → ${prev.apelidoNovo ?? "não muda"}` });
      }
    }
  }

  if (r.acao === "remover" && !nivel) {
    pronto = false;
    comps.push({ type: 10, content: "_Essa pessoa não tem advertência._" });
  }
  if (r.acao === "exoneracao") comps.push({ type: 10, content: "⚠️ A pessoa recebe o motivo por DM e é **expulsa do servidor**." });

  comps.push({ type: 10, content: `**Motivo:** ${r.motivo ?? "_opcional_"}` });
  comps.push({
    type: 1,
    components: [
      { type: 2, style: CONFIRMAR[r.acao].style, label: CONFIRMAR[r.acao].label, custom_id: "dc:ok", disabled: !pronto },
      { type: 2, style: 2, label: r.motivo ? "Editar motivo" : "Adicionar motivo", emoji: { name: "✏️" }, custom_id: "dc:motivo" },
    ],
  });
  if (avisoTxt) comps.push({ type: 10, content: `⚠️ ${avisoTxt}` });
  return caixa(r.acao === "exoneracao" ? 0xe10600 : COR, comps);
}

/** Painel de gerenciamento dentro da reunião. */
function menuGestao(reuniaoId: string, userId: string): MessageBody {
  return caixa(COR, [
    { type: 10, content: `### ⚖️ Painel de gerenciamento da corregedoria\nMedidas para <@${userId}>:` },
    {
      type: 1,
      components: [
        { type: 2, style: 2, label: "Advertência", emoji: { name: "⚠️" }, custom_id: `dc:g:advertencia:${reuniaoId}` },
        { type: 2, style: 2, label: "Remover advertência", emoji: { name: "✅" }, custom_id: `dc:g:remover:${reuniaoId}` },
      ],
    },
    {
      type: 1,
      components: [
        { type: 2, style: 2, label: "Rebaixamento", emoji: { name: "📉" }, custom_id: `dc:g:rebaixamento:${reuniaoId}` },
        { type: 2, style: 4, label: "Exoneração", emoji: { name: "🚫" }, custom_id: `dc:g:exoneracao:${reuniaoId}` },
      ],
    },
  ]);
}

/** Executa a medida escolhida. Devolve a mensagem de resultado. */
async function executar(r: Rascunho, por: Quem): Promise<{ ok: boolean; texto: string; reuniaoNota?: string; link?: string }> {
  const alvo = r.alvoId!;
  if (r.acao === "reuniao") {
    const res = await abrirReuniao(alvo, r.motivo, por);
    if (!res.ok) return { ok: false, texto: MENSAGEM_ERRO[res.erro] ?? "Não foi possível abrir a reunião." };
    return { ok: true, texto: `📅 Reunião **#${String(res.valor.reuniao.numero).padStart(4, "0")}** aberta com <@${alvo}>.${res.valor.dm ? " A pessoa foi avisada por DM." : " ⚠️ A DM não chegou (bloqueada)."}`, link: canalUrl(res.valor.reuniao) };
  }
  if (r.acao === "advertencia") {
    const res = await aplicarAdvertencia(alvo, r.nivelId!, r.motivo, por);
    if (!res.ok) return { ok: false, texto: MENSAGEM_ERRO[res.erro] ?? "Não foi possível." };
    return { ok: true, texto: `⚠️ **${res.valor.nivel?.nome}** aplicada a <@${alvo}>.`, reuniaoNota: `⚖️ Medida aplicada: **${res.valor.nivel?.nome}**.` };
  }
  if (r.acao === "remover") {
    const res = await removerAdvertencia(alvo, r.motivo, por);
    if (!res.ok) return { ok: false, texto: MENSAGEM_ERRO[res.erro] ?? "Não foi possível." };
    return { ok: true, texto: `✅ Advertência removida de <@${alvo}>.`, reuniaoNota: "⚖️ Sua advertência foi removida." };
  }
  if (r.acao === "rebaixamento") {
    const res = await promover(alvo, r.patenteId!, por, { modo: "rebaixamento", motivo: r.motivo });
    if (!res.ok) return { ok: false, texto: ERRO_PROMOCAO[res.erro] ?? "Não foi possível rebaixar." };
    return { ok: true, texto: `📉 <@${alvo}> rebaixado(a): ${res.registro.de?.prefixo ?? "—"} → **${res.registro.para.prefixo}**.`, reuniaoNota: `⚖️ Medida aplicada: **rebaixamento para ${res.registro.para.nome}**.` };
  }
  const res = await exonerar(alvo, r.motivo, por);
  if (!res.ok) return { ok: false, texto: MENSAGEM_ERRO[res.erro] ?? "Não foi possível exonerar." };
  return { ok: true, texto: `🚫 <@${alvo}> foi exonerado(a) e expulso(a) do servidor.`, reuniaoNota: "⚖️ Medida aplicada: **exoneração**." };
}

/* ---------- Interações ---------- */

export async function handleDisciplinaInteraction(i: RawInteraction): Promise<boolean> {
  const id = i.data?.custom_id ?? "";
  if (!id.startsWith("dc:")) return false;
  const member = i.member;
  if (!member) {
    await responder(i, 4, aviso("Use dentro do servidor."));
    return true;
  }
  const partes = id.split(":");
  const acao = partes[1] ?? "";
  const doPainel = acao === "fluxo" || ["iniciar", "gestao", "chamar", "fechar"].includes(acao);

  // TUDO é por cargo: só a gestão da corregedoria clica aqui (conferido em todo passo).
  if (!podeGerir(member.roles ?? [])) {
    rascunhos.delete(member.user.id);
    await responder(i, doPainel ? 4 : 7, aviso(`🔒 ${MENSAGEM_ERRO.sem_permissao}`));
    return true;
  }

  /* Painel principal → começa um fluxo */
  if (acao === "fluxo") {
    const tipo = partes[2] as Acao;
    if (!["reuniao", "advertencia", "exoneracao"].includes(tipo)) return false;
    await responder(i, 4, await fluxo(novo(member.user.id, tipo)));
    return true;
  }

  /* Botões do painel da reunião */
  if (["iniciar", "gestao", "chamar", "fechar", "fecharok"].includes(acao) || acao === "g") {
    const reuniao = disciplinaStore.reuniao(partes[acao === "g" ? 3 : 2] ?? "");
    if (!reuniao || reuniao.status === "encerrada") {
      await responder(i, 4, aviso(`❌ ${MENSAGEM_ERRO.reuniao_encerrada}`));
      return true;
    }
    if (acao === "iniciar") {
      await responder(i, 5, { flags: FLAG_EPHEMERAL });
      const res = await iniciarReuniao(reuniao);
      await editInteractionReply(i.token, paraEdicao(res.ok ? aviso("▶️ Reunião iniciada.", 0x22c55e) : aviso(`❌ ${MENSAGEM_ERRO[res.erro]}`)));
      return true;
    }
    if (acao === "gestao") {
      await responder(i, 4, menuGestao(reuniao.id, reuniao.userId));
      return true;
    }
    if (acao === "g") {
      const tipo = partes[2] as Acao;
      if (!["advertencia", "remover", "rebaixamento", "exoneracao"].includes(tipo)) return false;
      await responder(i, 7, await fluxo(novo(member.user.id, tipo, reuniao.userId, reuniao.id)));
      return true;
    }
    if (acao === "chamar") {
      await responder(i, 5, { flags: FLAG_EPHEMERAL });
      const res = await chamarNovamente(reuniao);
      await editInteractionReply(i.token, paraEdicao(res.ok ? aviso("🔔 A pessoa foi chamada por DM.", 0x22c55e) : aviso(`❌ ${MENSAGEM_ERRO[res.erro]}`)));
      return true;
    }
    if (acao === "fechar") {
      await responder(i, 4, caixa(0xe10600, [
        { type: 10, content: `### 🔒 Fechar o canal da reunião?\nO canal é apagado (sem transcript).` },
        { type: 1, components: [{ type: 2, style: 4, label: "Fechar canal", custom_id: `dc:fecharok:${reuniao.id}` }] },
      ]));
      return true;
    }
    // fecharok
    await responder(i, 7, aviso("🔒 Fechando…", 0x4b5563));
    await fecharReuniao(reuniao);
    return true;
  }

  /* Passos do fluxo efêmero */
  const r = rascunhos.get(member.user.id);
  if (!r) {
    await responder(i, 7, aviso("Essa ação expirou. Comece de novo pelo painel."));
    return true;
  }
  r.expira = Date.now() + 15 * 60_000;

  if (acao === "pessoa" && !r.reuniaoId) {
    // × no menu (lista vazia) = desmarcou.
    const alvo = i.data?.values?.[0] ?? null;
    if (alvo === member.user.id) {
      await responder(i, 7, await fluxo(r, MENSAGEM_ERRO.propria_pessoa));
      return true;
    }
    r.alvoId = alvo;
    r.nivelId = r.patenteId = null;
  } else if (acao === "nivel") r.nivelId = i.data?.values?.[0] ?? null;
  else if (acao === "patente") r.patenteId = i.data?.values?.[0] ?? null;
  else if (acao === "motivo" && i.type === 3) {
    await responder(i, 9, {
      custom_id: "dc:motivook",
      title: "Motivo (opcional)",
      components: [{ type: 18, label: "Motivo", component: { type: 4, custom_id: "motivo", style: 2, required: false, max_length: 500, placeholder: "Deixe em branco se não quiser informar", ...(r.motivo ? { value: r.motivo } : {}) } }],
    });
    return true;
  } else if (acao === "motivook" && i.type === 5) {
    const comps = (i.data?.components ?? []) as Array<{ component?: { value?: string } }>;
    r.motivo = (comps[0]?.component?.value ?? "").replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "").trim().slice(0, 500) || null;
  } else if (acao === "ok") {
    if (!r.alvoId) {
      await responder(i, 7, await fluxo(r, "Selecione a pessoa."));
      return true;
    }
    await responder(i, 6);
    const res = await executar(r, quemDe(i));
    if (!res.ok) {
      await editInteractionReply(i.token, paraEdicao(await fluxo(r, res.texto)));
      return true;
    }
    const reuniao = r.reuniaoId ? disciplinaStore.reuniao(r.reuniaoId) : undefined;
    if (reuniao && res.reuniaoNota) await falarNaReuniao(reuniao, res.reuniaoNota);
    rascunhos.delete(member.user.id);
    await editInteractionReply(
      i.token,
      paraEdicao(caixa(0x22c55e, [{ type: 10, content: `### ✅ Feito\n${res.texto}` }, ...(res.link ? [{ type: 1, components: [{ type: 2, style: 5, label: "Ir para a reunião", url: res.link }] }] : [])])),
    );
    return true;
  }
  await responder(i, 7, await fluxo(r));
  return true;
}

/* ---------- Mensagens no canal da reunião (sem transcript) ---------- */

/** Mensagem da gestão no canal da reunião: apagada e reenviada como a corregedoria. */
export async function aoMensagemNaReuniao(m: RawMensagem): Promise<void> {
  if (m.webhook_id || m.author.bot) return;
  const r = disciplinaStore.reuniaoPorCanal(m.channel_id);
  if (!r || m.author.id === r.userId) return;
  if (!podeGerir(m.member?.roles ?? [])) return;
  const arquivos = await guardarAnexosSimples(m.attachments); // baixa antes de apagar (o link deixa de valer)
  await deleteMessage(m.channel_id, m.id);
  await falarNaReuniao(r, m.content, arquivos);
}
