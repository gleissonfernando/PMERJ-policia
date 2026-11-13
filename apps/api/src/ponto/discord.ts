import { editInteractionReply, FLAG_COMPONENTS_V2, FLAG_EPHEMERAL, interactionCallback, upsertGuildCommand, type MembroDiscord, type MessageBody } from "../discord/bot.js";
import type { RawInteraction } from "../discord/gateway.js";
import {
  canalUrl,
  cancelarAjuste,
  confirmarAjuste,
  COR,
  COR_ERRO,
  COR_OK,
  decidir,
  duracao,
  entrarServico,
  fmtDur,
  MENSAGEM_ERRO,
  nn,
  podeAprovar,
  podeGerir,
  refazerAjuste,
  resumoPolicial,
  sairServico,
  pedirAjuste,
  ts,
  zerarHoras,
  zerarRanking,
} from "./service.js";
import { pontoStore, type Quem, type StatusPonto } from "./store.js";

/**
 * Bate-ponto no Discord (custom_id "pt:…"):
 *   pt:entrar · pt:sair · pt:minhas           → painel público
 *   pt:ap:ok|no|motivo:<ponto>               → canal de aprovação
 *   pt:aj:ok|refazer|cancelar:<ajuste>       → canal do ajuste
 *   pt:zr:ok · pt:zh:ok[:<user>]             → confirmações de /zerar
 * Comandos: /zerar ranking · /zerar horas [policial] · /ajuste ponto <policial> (escondidos; cargo conferido sempre).
 */

const COMANDO_ZERAR = {
  name: "zerar",
  type: 1,
  description: "Zerar o ranking ou as horas do bate-ponto",
  contexts: [0],
  // "0" = escondido para quem não é admin. Libere os cargos em Integrações; o bot confere o cargo em todo passo.
  default_member_permissions: "0",
  options: [
    { type: 1, name: "ranking", description: "Zera o ranking de horas (o total de cada policial continua)" },
    {
      type: 1,
      name: "horas",
      description: "Zera as horas aprovadas de um policial — ou de todos",
      options: [{ type: 6, name: "policial", description: "Deixe vazio para zerar as horas de TODOS", required: false }],
    },
  ],
};

const COMANDO_AJUSTE = {
  name: "ajuste",
  type: 1,
  description: "Ajustes do bate-ponto",
  contexts: [0],
  default_member_permissions: "0",
  options: [
    {
      type: 1,
      name: "ponto",
      description: "Pede ao policial (DM + canal temporário) que informe a entrada e a saída do serviço",
      options: [{ type: 6, name: "policial", description: "Quem vai ajustar o ponto", required: true }],
    },
  ],
};

export const registrarComandosPonto = () => Promise.all([upsertGuildCommand(COMANDO_ZERAR), upsertGuildCommand(COMANDO_AJUSTE)]).then((r) => r.every(Boolean));

const quemDe = (i: RawInteraction): Quem => ({ id: i.member!.user.id, nome: i.member!.user.global_name ?? i.member!.user.username });
const paraEdicao = (b: MessageBody): MessageBody => ({ ...b, flags: FLAG_COMPONENTS_V2 });
const responder = (i: RawInteraction, type: number, data?: MessageBody) =>
  interactionCallback(i.id, i.token, data ? { type, data: type === 7 ? paraEdicao(data) : data } : { type });
const caixa = (cor: number, comps: unknown[]): MessageBody => ({
  flags: FLAG_EPHEMERAL | FLAG_COMPONENTS_V2,
  allowed_mentions: { parse: [] },
  components: [{ type: 17, accent_color: cor, components: [...comps, { type: 10, content: "-# Só você vê esta mensagem." }] }],
});
const aviso = (texto: string, cor = COR_ERRO) => caixa(cor, [{ type: 10, content: texto }]);
/** Mensagem comum do canal (sem o rodapé de efêmera). */
const noCanal = (texto: string, cor = COR): MessageBody => ({ flags: FLAG_COMPONENTS_V2, allowed_mentions: { parse: [] }, components: [{ type: 17, accent_color: cor, components: [{ type: 10, content: texto }] }] });
const limpar = (s: string | undefined, max: number) => (s ?? "").replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "").trim().slice(0, max) || null;

const STATUS: Record<StatusPonto, string> = { aberto: "🟢 em serviço", pendente: "⏳ aguardando aprovação", aprovado: "✅ aprovado", reprovado: "✖️ reprovado", descartado: "⚪ descartado" };

function minhasHoras(userId: string): MessageBody {
  const r = resumoPolicial(userId);
  const linhas = r.recentes.map((p) => `\`#${nn(p.numero)}\` ${ts(p.entrada, "d")} · ${fmtDur(duracao(p))} · ${STATUS[p.status]}`);
  return caixa(COR, [
    { type: 10, content: "### 📊 Minhas horas" },
    { type: 10, content: r.aberto ? `🟢 **Em serviço** desde ${ts(r.aberto.entrada, "t")} (${ts(r.aberto.entrada, "R")})` : "⚪ **Fora de serviço**" },
    { type: 10, content: `**Total aprovado:** ${fmtDur(r.totalMs)}\n**No ranking:** ${fmtDur(r.rankingMs)}${r.posicao ? ` · **${r.posicao}º lugar**` : ""}${r.pendentes ? `\n**Aguardando aprovação:** ${r.pendentes}` : ""}` },
    ...(linhas.length ? [{ type: 14, divider: true, spacing: 1 }, { type: 10, content: `**Últimos pontos**\n${linhas.join("\n")}` }] : []),
  ]);
}

/** Opções de subcomando: data.options[0] = { name, options: [...] }. */
function subcomando(i: RawInteraction): { nome: string; opcoes: Record<string, string> } {
  const sub = (i.data?.options?.[0] ?? {}) as { name?: string; options?: Array<{ name: string; value?: unknown }> };
  return { nome: sub.name ?? "", opcoes: Object.fromEntries((sub.options ?? []).map((o) => [o.name, String(o.value ?? "")])) };
}

async function handleComando(i: RawInteraction): Promise<void> {
  const member = i.member!;
  if (!podeGerir(member.roles ?? [])) {
    await responder(i, 4, aviso(`🔒 ${MENSAGEM_ERRO.sem_permissao_gestao}`));
    return;
  }
  const { nome, opcoes } = subcomando(i);

  if (i.data?.name === "zerar" && nome === "ranking") {
    await responder(i, 4, caixa(COR_ERRO, [
      { type: 10, content: "### 🔄 Zerar o ranking?\nO ranking volta do zero e a mensagem do ranking é atualizada.\n-# O **total de horas** de cada policial continua." },
      { type: 1, components: [{ type: 2, style: 4, label: "Zerar ranking", custom_id: "pt:zr:ok" }] },
    ]));
    return;
  }
  if (i.data?.name === "zerar" && nome === "horas") {
    const alvo = opcoes.policial || null;
    await responder(i, 4, caixa(COR_ERRO, [
      { type: 10, content: alvo ? `### 🔄 Zerar as horas de <@${alvo}>?\nTotal e ranking dessa pessoa voltam a zero.` : "### 🔄 Zerar as horas de TODOS?\nTotal e ranking de **todos os policiais** voltam a zero. Não dá para desfazer." },
      { type: 1, components: [{ type: 2, style: 4, label: alvo ? "Zerar horas" : "Zerar horas de todos", custom_id: alvo ? `pt:zh:ok:${alvo}` : "pt:zh:ok" }] },
    ]));
    return;
  }
  if (i.data?.name === "ajuste" && nome === "ponto") {
    const alvo = opcoes.policial;
    if (!alvo) return void (await responder(i, 4, aviso("Escolha o policial.")));
    await responder(i, 5, { flags: FLAG_EPHEMERAL });
    const res = await pedirAjuste(alvo, quemDe(i));
    if (!res.ok) {
      const ja = res.erro === "ja_tem_ajuste" ? pontoStore.ajusteAberto(alvo) : undefined;
      await editInteractionReply(i.token, paraEdicao(caixa(COR_ERRO, [
        { type: 10, content: `❌ ${MENSAGEM_ERRO[res.erro] ?? "Não foi possível abrir o ajuste."}` },
        ...(ja?.canalId ? [{ type: 1, components: [{ type: 2, style: 5, label: "Ir para o ajuste", url: canalUrl(ja.canalId) }] }] : []),
      ])));
      return;
    }
    const { ajuste, dm } = res.valor;
    await editInteractionReply(i.token, paraEdicao(caixa(COR_OK, [
      { type: 10, content: `### 🛠️ Ajuste #${nn(ajuste.numero)} aberto\n<@${alvo}> recebeu ${dm ? "uma DM e " : ""}um canal para informar a entrada e a saída.${dm ? "" : "\n⚠️ A DM não chegou (a pessoa bloqueia mensagens diretas)."}` },
      { type: 1, components: [{ type: 2, style: 5, label: "Ir para o ajuste", url: canalUrl(ajuste.canalId!) }] },
    ])));
    return;
  }
  await responder(i, 4, aviso("Comando desconhecido."));
}

export async function handlePontoInteraction(i: RawInteraction): Promise<boolean> {
  const id = i.data?.custom_id ?? "";
  const comando = i.type === 2 && (i.data?.name === "zerar" || i.data?.name === "ajuste");
  if (!comando && !id.startsWith("pt:")) return false;
  const member = i.member;
  if (!member) {
    await responder(i, 4, aviso("Use dentro do servidor."));
    return true;
  }
  if (comando) {
    await handleComando(i);
    return true;
  }
  const partes = id.split(":");
  const roles = member.roles ?? [];

  /* Painel público */
  if (id === "pt:entrar") {
    const m: MembroDiscord = { nick: member.nick ?? null, roles, user: { ...member.user, global_name: member.user.global_name ?? null, avatar: member.user.avatar ?? null } };
    const res = await entrarServico(m, "botao");
    if (!res.ok) {
      const p = pontoStore.aberto(member.user.id);
      await responder(i, 4, aviso(res.erro === "ja_em_servico" && p ? `🟢 Você já está em serviço desde ${ts(p.entrada, "t")} (${ts(p.entrada, "R")}).` : `❌ ${MENSAGEM_ERRO[res.erro]}`, res.erro === "ja_em_servico" ? COR : COR_ERRO));
      return true;
    }
    await responder(i, 4, caixa(COR_OK, [{ type: 10, content: `### 🟢 Você entrou em serviço\nPonto **#${nn(res.valor.numero)}** batido ${ts(res.valor.entrada, "t")}. Bom serviço!\n-# Ao terminar, clique em **Sair de serviço**.` }]));
    return true;
  }
  if (id === "pt:sair") {
    if (!pontoStore.aberto(member.user.id)) {
      await responder(i, 4, aviso(`⚪ ${MENSAGEM_ERRO.fora_de_servico}`, COR));
      return true;
    }
    await responder(i, 5, { flags: FLAG_EPHEMERAL }); // criar o canal de aprovação pode passar de 3 s
    const res = await sairServico(member.user.id);
    if (!res.ok) {
      await editInteractionReply(i.token, paraEdicao(aviso(`⚪ ${MENSAGEM_ERRO[res.erro]}`, COR)));
      return true;
    }
    const { ponto, tipo } = res.valor;
    await editInteractionReply(
      i.token,
      paraEdicao(
        tipo === "pendente"
          ? caixa(COR_OK, [{ type: 10, content: `### 🔴 Você saiu de serviço\nPonto **#${nn(ponto.numero)}** · ${ts(ponto.entrada, "t")} → ${ts(ponto.saida!, "t")} · **${fmtDur(duracao(ponto))}**\n⏳ Enviado para **aprovação** — você recebe uma DM com o resultado.` }])
          : caixa(0x4b5563, [{ type: 10, content: `### 🔴 Você saiu de serviço\nPonto **#${nn(ponto.numero)}** com **${fmtDur(duracao(ponto))}** — abaixo do mínimo de ${fmtDur(pontoStore.config().minimoMinutos * 60_000)}, foi **descartado**.` }]),
      ),
    );
    return true;
  }
  if (id === "pt:minhas") {
    await responder(i, 4, minhasHoras(member.user.id));
    return true;
  }

  /* Aprovação */
  if (partes[1] === "ap") {
    if (!podeAprovar(member.user.id, roles)) { await responder(i, 4, aviso(`🔒 ${MENSAGEM_ERRO.sem_permissao_aprovar}`)); return true; }
    const p = pontoStore.ponto(partes[3] ?? "");
    if (!p || p.status !== "pendente") { await responder(i, 4, aviso(`❌ ${MENSAGEM_ERRO.ja_decidido}`)); return true; }
    if (p.userId === member.user.id) { await responder(i, 4, aviso(`❌ ${MENSAGEM_ERRO.proprio_ponto}`)); return true; }
    if (partes[2] === "no" && i.type === 3) {
      await responder(i, 9, {
        custom_id: `pt:ap:motivo:${p.id}`,
        title: `Reprovar ponto #${nn(p.numero)}`,
        components: [{ type: 18, label: "Motivo (opcional)", description: "O policial recebe o motivo por DM.", component: { type: 4, custom_id: "motivo", style: 2, required: false, max_length: 300, placeholder: "Ex.: não estava em patrulha" } }],
      });
      return true;
    }
    const aprovar = partes[2] === "ok";
    let motivo: string | null = null;
    if (partes[2] === "motivo" && i.type === 5) {
      const comps = (i.data?.components ?? []) as Array<{ component?: { value?: string } }>;
      motivo = limpar(comps[0]?.component?.value, 300);
    } else if (!aprovar) return false;
    await responder(i, 5, { flags: FLAG_EPHEMERAL });
    const res = await decidir(p, aprovar, quemDe(i), motivo);
    await editInteractionReply(i.token, paraEdicao(res.ok ? aviso(aprovar ? `✅ **${fmtDur(duracao(p))}** aprovadas para <@${p.userId}>.` : `✖️ Ponto de <@${p.userId}> reprovado.`, COR_OK) : aviso(`❌ ${MENSAGEM_ERRO[res.erro]}`)));
    return true;
  }

  /* Zerar (confirmações) */
  if (partes[1] === "zr" || partes[1] === "zh") {
    if (!podeGerir(roles)) { await responder(i, 7, aviso(`🔒 ${MENSAGEM_ERRO.sem_permissao_gestao}`)); return true; }
    if (partes[1] === "zr") {
      await zerarRanking(quemDe(i));
      await responder(i, 7, aviso("✅ Ranking zerado. A mensagem do ranking será atualizada em instantes.", COR_OK));
    } else {
      const alvo = partes[3];
      await zerarHoras(quemDe(i), alvo);
      await responder(i, 7, aviso(alvo ? `✅ Horas de <@${alvo}> zeradas.` : "✅ Horas de todos os policiais zeradas.", COR_OK));
    }
    return true;
  }

  /* Ajuste */
  if (partes[1] === "aj") {
    const a = pontoStore.ajuste(partes[3] ?? "");
    if (!a || a.status !== "aberto") { await responder(i, 4, aviso(`❌ ${MENSAGEM_ERRO.ajuste_encerrado}`)); return true; }
    if (partes[2] === "cancelar") {
      if (!podeGerir(roles)) { await responder(i, 4, aviso(`🔒 Só a gestão do ponto cancela o ajuste.`)); return true; }
      await responder(i, 6);
      await cancelarAjuste(a, quemDe(i));
      return true;
    }
    if (member.user.id !== a.userId) { await responder(i, 4, aviso("🔒 Só o policial do ajuste confirma os horários.")); return true; }
    if (partes[2] === "refazer") {
      await refazerAjuste(a);
      await responder(i, 7, noCanal("↩️ Tudo bem — envie de novo a **hora de entrada**, por exemplo:\n```\nEntrada 19:30\n```", COR));
      return true;
    }
    if (partes[2] === "ok") {
      await responder(i, 7, noCanal("⏳ Ajustando…"));
      const res = await confirmarAjuste(a);
      if (!res.ok) await editInteractionReply(i.token, noCanal(`❌ ${MENSAGEM_ERRO[res.erro]}`, COR_ERRO));
      return true;
    }
  }
  return false;
}
