import { randomUUID } from "node:crypto";
import { emojiLogo } from "../branding/emoji.js";
import { nomeComInsignia } from "../disciplina/service.js";
import {
  createPrivateChannel,
  createTicketChannel,
  deleteChannel,
  editMessage,
  FLAG_COMPONENTS_V2,
  getMember,
  postMessage,
  sendDM,
  type MembroDiscord,
  type MessageBody,
} from "../discord/bot.js";
import { vozAtual, type RawMensagem, type VozEvento } from "../discord/gateway.js";
import { env } from "../env.js";
import { brasao, cabecalho } from "../set/brasao.js";
import { setStore } from "../set/store.js";
import { verificarHoras } from "../horas/service.js";
import { lembrarAssuncao } from "./lembrete.js";
import { pontoStore, type Ajuste, type MensagemFixa, type OrigemPonto, type Ponto, type Quem } from "./store.js";

/**
 * Bate-ponto (tudo por CARGO, conferido em todo passo):
 *  - Entrar/Sair de serviço pelo painel, ou entrar/sair dos canais de voz configurados
 *  - Fechou: abaixo do mínimo → descartado · senão → canal temporário só para os aprovadores
 *  - Aprovado → soma no total e no ranking (top 20, atualizado sozinho). Reprovado → não conta
 *  - /zerar ranking · /zerar horas [policial] · /ajuste ponto <policial> (canal temporário guiado)
 */

export type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: string };
const falha = (erro: string): { ok: false; erro: string } => ({ ok: false, erro });

export const COR = 0x1e40af;
export const COR_OK = 0x22c55e;
export const COR_ERRO = 0xe10600;
const COR_PENDENTE = 0xf59e0b;
export const RANKING_MAX = 20;
const LISTA_SERVICO_MAX = 40;
const HORA = 3_600_000;
const DIA = 24 * HORA;
/** Brasil sem horário de verão desde 2019: UTC−3 fixo. */
const OFFSET_BRT = 3 * HORA;

export const nn = (n: number) => String(n).padStart(4, "0");
export const ts = (ms: number, f = "f") => `<t:${Math.floor(ms / 1000)}:${f}>`;
export function fmtDur(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? (m ? `${h}h ${String(m).padStart(2, "0")}min` : `${h}h`) : `${m}min`;
}
export const duracao = (p: Ponto) => Math.max(0, (p.saida ?? Date.now()) - p.entrada);
export const canalUrl = (canalId: string) => `https://discord.com/channels/${env.DISCORD_GUILD_ID}/${canalId}`;
const ORIGEM: Record<OrigemPonto, string> = { botao: "🔘 Painel", voz: "🎙️ Canal de voz", ajuste: "🛠️ Ajuste" };
const rodape = (extra?: string) => {
  const e = emojiLogo();
  return { type: 10, content: `-# ${e ? `${e} ` : ""}Polícia Militar do Estado do Rio de Janeiro${extra ? ` · ${extra}` : ""}` };
};
const avatarUrl = (id: string, avatar: string | null) =>
  avatar ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=256` : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(id) >> 22n) % 6}.png`;

/* ---------- Permissões (por cargo) ---------- */

const tem = (lista: string[], roles: string[]) => lista.length > 0 && roles.some((r) => lista.includes(r));
/** Bate ponto quem tem um dos cargos escolhidos. Sem cargos escolhidos: quem tem o set APROVADO no Pedir Set. */
export const podeBater = (userId: string, roles: string[]) => {
  const cargos = pontoStore.config().cargosBater;
  return cargos.length ? tem(cargos, roles) : Boolean(setStore.atual(userId));
};
/** Aprova quem tem um cargo aprovador OU foi escolhido pelo nome. */
export const podeAprovar = (userId: string, roles: string[]) => tem(pontoStore.config().cargosAprovadores, roles) || pontoStore.config().usuariosAprovadores.includes(userId);
export const temAprovadores = () => pontoStore.config().cargosAprovadores.length > 0 || pontoStore.config().usuariosAprovadores.length > 0;
export const podeGerir = (roles: string[]) => tem(pontoStore.config().cargosGestao, roles);

/* ---------- Painéis fixos (V2) ---------- */

export type TipoPainel = "painel" | "painelServico" | "ranking";

function painelPonto(): MessageBody {
  const cfg = pontoStore.config();
  const abertos = pontoStore.abertos().length;
  const regras = [
    cfg.canaisVoz.length ? `🎙️ Entrar em ${cfg.canaisVoz.slice(0, 5).map((c) => `<#${c}>`).join(" · ")} também bate o ponto — e sair fecha.` : null,
    cfg.minimoMinutos > 0 ? `⏳ Pontos com menos de **${fmtDur(cfg.minimoMinutos * 60_000)}** são descartados.` : null,
    cfg.cargosBater.length ? `🪪 Bate ponto quem tem: ${cfg.cargosBater.slice(0, 6).map((c) => `<@&${c}>`).join(" ")}` : "🪪 Só quem tem o **set aprovado** bate ponto.",
    "✅ As horas só contam depois de **aprovadas** pela equipe.",
  ].filter(Boolean);
  return {
    flags: FLAG_COMPONENTS_V2,
    allowed_mentions: { parse: [] },
    components: [
      {
        type: 17,
        accent_color: COR,
        components: [
          ...[cabecalho(["## ⏱️ Bate-ponto", "Começou o turno? **Entre em serviço.** Terminou? **Saia de serviço** — suas horas vão para aprovação."])].flat(),
          { type: 14, divider: true, spacing: 1 },
          { type: 10, content: regras.join("\n") },
          { type: 10, content: `-# ${abertos ? `🟢 ${abertos} ${abertos === 1 ? "policial" : "policiais"} em serviço agora` : "⚪ Ninguém em serviço agora"}` },
          {
            type: 1,
            components: [
              { type: 2, style: 3, label: "Entrar em serviço", emoji: { name: "🟢" }, custom_id: "pt:entrar" },
              { type: 2, style: 4, label: "Sair de serviço", emoji: { name: "🔴" }, custom_id: "pt:sair" },
              { type: 2, style: 2, label: "Minhas horas", emoji: { name: "📊" }, custom_id: "pt:minhas" },
            ],
          },
          rodape(),
        ],
      },
    ],
  };
}

function painelServico(): MessageBody {
  const abertos = [...pontoStore.abertos()].sort((a, b) => a.entrada - b.entrada);
  const linhas = abertos.slice(0, LISTA_SERVICO_MAX).map((p) => `${p.origem === "voz" ? "🎙️" : "🟢"} <@${p.userId}> · desde ${ts(p.entrada, "t")} · ${ts(p.entrada, "R")}`);
  if (abertos.length > LISTA_SERVICO_MAX) linhas.push(`-# … e mais ${abertos.length - LISTA_SERVICO_MAX}`);
  return {
    flags: FLAG_COMPONENTS_V2,
    allowed_mentions: { parse: [] },
    components: [
      {
        type: 17,
        accent_color: abertos.length ? COR_OK : 0x4b5563,
        components: [
          ...[cabecalho(["## 🚓 Efetivo em serviço", abertos.length ? `**${abertos.length}** ${abertos.length === 1 ? "policial com ponto batido" : "policiais com ponto batido"}` : "Nenhum policial em serviço no momento."])].flat(),
          { type: 14, divider: true, spacing: 1 },
          { type: 10, content: linhas.length ? linhas.join("\n") : "_Quando alguém entrar em serviço, aparece aqui._" },
          { type: 14, divider: false, spacing: 1 },
          rodape(`🟢 painel · 🎙️ canal de voz · atualizado ${ts(Date.now(), "R")}`),
        ],
      },
    ],
  };
}

const MEDALHA = ["🥇", "🥈", "🥉"];
export function rankingAtual() {
  return Object.values(pontoStore.horas())
    .filter((h) => h.rankingMs > 0)
    .sort((a, b) => b.rankingMs - a.rankingMs)
    .slice(0, RANKING_MAX);
}

function painelRanking(): MessageBody {
  const lista = rankingAtual();
  const linhas = lista.map((h, i) => `${MEDALHA[i] ?? `\`${String(i + 1).padStart(2, "0")}\``} <@${h.userId}> — **${fmtDur(h.rankingMs)}**`);
  return {
    flags: FLAG_COMPONENTS_V2,
    allowed_mentions: { parse: [] },
    components: [
      {
        type: 17,
        accent_color: 0xf1c40f,
        components: [
          ...[cabecalho(["## 🏆 Ranking de horas", `Top ${RANKING_MAX} em horas **aprovadas** desde ${ts(pontoStore.rankingDesde(), "D")}.`])].flat(),
          { type: 14, divider: true, spacing: 1 },
          { type: 10, content: linhas.length ? linhas.join("\n") : "_Nenhuma hora aprovada ainda neste período._" },
          { type: 14, divider: false, spacing: 1 },
          rodape(`atualizado ${ts(Date.now(), "R")}`),
        ],
      },
    ],
  };
}

const MONTAR: Record<TipoPainel, () => MessageBody> = { painel: painelPonto, painelServico, ranking: painelRanking };

export async function publicar(tipo: TipoPainel, canalId: string): Promise<MensagemFixa | null> {
  const atual = pontoStore.config()[tipo];
  const body = MONTAR[tipo]();
  if (atual?.canalId === canalId && (await editMessage(canalId, atual.mensagemId, body, brasao()))) return atual;
  const msg = await postMessage(canalId, body, brasao());
  if (!msg) return null;
  const novo = { canalId, mensagemId: msg.id };
  await pontoStore.saveConfig({ ...pontoStore.config(), [tipo]: novo });
  return novo;
}

/** Atualiza a mensagem já publicada — agrupado: várias mudanças seguidas viram uma edição só. */
const timers = new Map<TipoPainel, NodeJS.Timeout>();
export function atualizar(...tipos: TipoPainel[]) {
  for (const tipo of tipos) {
    if (timers.has(tipo)) continue;
    timers.set(
      tipo,
      setTimeout(() => {
        timers.delete(tipo);
        const p = pontoStore.config()[tipo];
        if (p) void editMessage(p.canalId, p.mensagemId, MONTAR[tipo](), brasao());
      }, 2_000),
    );
  }
}
export const atualizarTodos = () => atualizar("painel", "painelServico", "ranking");
/** Redesenha os 3 painéis já publicados agora (ex.: logo nova), esperando cada edição. */
export async function atualizarTodosAgora() {
  for (const tipo of ["painel", "painelServico", "ranking"] as const) {
    const p = pontoStore.config()[tipo];
    if (p) await editMessage(p.canalId, p.mensagemId, MONTAR[tipo](), brasao());
  }
}

/* ---------- Log ---------- */

async function log(cor: number, titulo: string, linhas: string[]) {
  const canal = pontoStore.config().canalLogId;
  if (!canal) return;
  await postMessage(canal, {
    flags: FLAG_COMPONENTS_V2,
    allowed_mentions: { parse: [] },
    components: [{ type: 17, accent_color: cor, components: [{ type: 10, content: `### ${titulo}\n${linhas.join("\n")}` }, rodape(ts(Date.now(), "f"))] }],
  });
}

const caixaDM = (cor: number, texto: string, extra: unknown[] = []): MessageBody => ({
  flags: FLAG_COMPONENTS_V2,
  allowed_mentions: { parse: [] },
  components: [{ type: 17, accent_color: cor, components: [{ type: 10, content: texto }, ...extra, rodape()] }],
});

/* ---------- Entrar / sair de serviço ---------- */

export async function entrarServico(m: MembroDiscord, origem: OrigemPonto): Promise<Resultado<Ponto>> {
  if (m.user.bot) return falha("alvo_bot");
  if (!podeBater(m.user.id, m.roles)) return falha("sem_permissao_ponto");
  const ja = pontoStore.aberto(m.user.id);
  if (ja) return falha("ja_em_servico");
  const p = pontoStore.novoPonto({
    id: randomUUID(),
    userId: m.user.id,
    username: m.user.username,
    avatar: m.user.avatar,
    nome: nomeComInsignia(m),
    origem,
    entrada: Date.now(),
    saida: null,
    status: "aberto",
    aprovacao: null,
    decisao: null,
    ajuste: null,
    observacao: null,
  });
  await pontoStore.salvar();
  atualizar("painel", "painelServico");
  console.info(`[ponto] #${nn(p.numero)} aberto por discord:${m.user.id} (${origem})`);
  return { ok: true, valor: p };
}

export type Fechamento = { ponto: Ponto; tipo: "descartado" | "pendente"; canalId: string | null };

/** Fecha o ponto: abaixo do mínimo é descartado; senão vai para aprovação. */
export async function fecharPonto(p: Ponto, saida = Date.now(), observacao: string | null = null): Promise<Fechamento> {
  p.saida = Math.max(saida, p.entrada);
  if (observacao) p.observacao = observacao;
  const min = pontoStore.config().minimoMinutos * 60_000;
  if (duracao(p) < min) {
    p.status = "descartado";
    p.observacao ??= `Abaixo do mínimo (${fmtDur(min)})`;
    await pontoStore.salvar();
    atualizar("painel", "painelServico");
    console.info(`[ponto] #${nn(p.numero)} descartado (${fmtDur(duracao(p))})`);
    return { ponto: p, tipo: "descartado", canalId: null };
  }
  p.status = "pendente";
  await pontoStore.salvar();
  atualizar("painel", "painelServico");
  const canalId = await abrirAprovacao(p);
  console.info(`[ponto] #${nn(p.numero)} fechado (${fmtDur(duracao(p))}) → aprovação`);
  return { ponto: p, tipo: "pendente", canalId };
}

export async function sairServico(userId: string): Promise<Resultado<Fechamento>> {
  const p = pontoStore.aberto(userId);
  if (!p) return falha("fora_de_servico");
  p.status = "pendente"; // trava na hora: dois cliques seguidos não fecham duas vezes
  const r = await fecharPonto(p);
  void lembrarAssuncao(userId); // DM: lembrete da assunção de serviço
  return { ok: true, valor: r };
}

/* ---------- Aprovação (canal temporário só para os aprovadores) ---------- */

function painelAprovacao(p: Ponto): MessageBody {
  const h = pontoStore.horasDe(p.userId);
  const cab = [
    { type: 10, content: `## ⏱️ Aprovação de horas · #${nn(p.numero)}` },
    { type: 10, content: `**Policial:** <@${p.userId}> · ${p.nome}\n**Origem:** ${ORIGEM[p.origem]}` },
  ];
  return {
    flags: FLAG_COMPONENTS_V2,
    allowed_mentions: { parse: [] },
    components: [
      {
        type: 17,
        accent_color: COR_PENDENTE,
        components: [
          { type: 9, components: cab, accessory: { type: 11, media: { url: avatarUrl(p.userId, p.avatar) }, description: `Avatar de ${p.username}`.slice(0, 1024) } },
          { type: 14, divider: true, spacing: 1 },
          { type: 10, content: `🟢 **Entrada:** ${ts(p.entrada)}\n🔴 **Saída:** ${ts(p.saida ?? Date.now())}\n⏱️ **Total:** **${fmtDur(duracao(p))}**` },
          ...(p.ajuste ? [{ type: 10, content: `-# 🛠️ Horários ajustados pelo policial a pedido de ${p.ajuste.por.nome}` }] : []),
          { type: 10, content: `-# Já aprovado: ${fmtDur(h?.totalMs ?? 0)} no total · ${fmtDur(h?.rankingMs ?? 0)} no ranking` },
          {
            type: 1,
            components: [
              { type: 2, style: 3, label: "Aprovar horas", emoji: { name: "✅" }, custom_id: `pt:ap:ok:${p.id}` },
              { type: 2, style: 4, label: "Reprovar", emoji: { name: "✖️" }, custom_id: `pt:ap:no:${p.id}` },
            ],
          },
          rodape("🔒 somente aprovadores"),
        ],
      },
    ],
  };
}

async function abrirAprovacao(p: Ponto): Promise<string | null> {
  const cfg = pontoStore.config();
  if (!temAprovadores()) return null;
  const canal = await createPrivateChannel({
    nome: `⏱️・ponto-${nn(p.numero)}`,
    topico: `Aprovação de horas · ${p.nome} · ${fmtDur(duracao(p))}`,
    categoriaId: cfg.categoriaId,
    cargos: cfg.cargosAprovadores,
    usuarios: cfg.usuariosAprovadores,
    motivo: `Aprovação do ponto #${nn(p.numero)}`,
  });
  if (!canal) return null;
  const msg = await postMessage(canal, painelAprovacao(p));
  p.aprovacao = { canalId: canal, mensagemId: msg?.id ?? "" };
  await pontoStore.salvar();
  return canal;
}

async function apagarAprovacao(p: Ponto, texto: string) {
  const a = p.aprovacao;
  if (!a) return;
  await postMessage(a.canalId, { content: `${texto}\nEste canal será apagado em 5 segundos.`, allowed_mentions: { parse: [] } });
  setTimeout(() => void deleteChannel(a.canalId, `Ponto #${nn(p.numero)} decidido`), 5_000);
}

export async function decidir(p: Ponto, aprovar: boolean, por: Quem, motivo: string | null): Promise<Resultado<Ponto>> {
  if (p.status !== "pendente" || p.saida === null) return falha("ja_decidido");
  if (p.userId === por.id) return falha("proprio_ponto");
  p.status = aprovar ? "aprovado" : "reprovado"; // síncrono: dois aprovadores ao mesmo tempo não somam duas vezes
  p.decisao = { por, em: Date.now(), motivo };
  const dur = duracao(p);
  if (aprovar) pontoStore.somar(p, dur);
  await pontoStore.salvar();
  if (aprovar) {
    atualizar("ranking");
    void verificarHoras(p.userId); // Sistema de Horas: bateu as horas da próxima patente → alerta
  }

  await apagarAprovacao(p, aprovar ? `✅ **${fmtDur(dur)}** aprovadas por ${por.nome}.` : `✖️ Ponto reprovado por ${por.nome}.`);
  const h = pontoStore.horasDe(p.userId);
  await sendDM(
    p.userId,
    caixaDM(
      aprovar ? COR_OK : COR_ERRO,
      aprovar
        ? `### ✅ Suas horas foram aprovadas\nPonto **#${nn(p.numero)}** · ${ts(p.entrada, "f")} → ${ts(p.saida, "t")}\n**+${fmtDur(dur)}** · total aprovado: **${fmtDur(h?.totalMs ?? 0)}**`
        : `### ✖️ Seu ponto foi reprovado\nPonto **#${nn(p.numero)}** · ${ts(p.entrada, "f")} → ${ts(p.saida, "t")} (${fmtDur(dur)})\n${motivo ? `**Motivo:** ${motivo}` : "Nenhum motivo foi informado."}\n-# Essas horas não contam.`,
    ),
  );
  await log(aprovar ? COR_OK : COR_ERRO, aprovar ? "✅ Horas aprovadas" : "✖️ Ponto reprovado", [
    `**Policial:** <@${p.userId}> · ${p.nome}`,
    `**Ponto:** #${nn(p.numero)} · ${ts(p.entrada, "f")} → ${ts(p.saida, "t")} · **${fmtDur(dur)}**`,
    `**Por:** <@${por.id}>${motivo ? `\n**Motivo:** ${motivo}` : ""}`,
  ]);
  console.info(`[ponto] #${nn(p.numero)} ${p.status} por discord:${por.id}`);
  return { ok: true, valor: p };
}

/* ---------- Zerar ---------- */

export async function zerarRanking(por: Quem) {
  pontoStore.zerarRanking();
  await pontoStore.salvar();
  atualizar("ranking");
  await log(COR_ERRO, "🔄 Ranking zerado", [`**Por:** <@${por.id}>`, "-# O total de horas de cada policial continua."]);
  console.info(`[ponto] ranking zerado por discord:${por.id}`);
}

export async function zerarHoras(por: Quem, userId?: string) {
  pontoStore.zerarHoras(userId);
  await pontoStore.salvar();
  atualizar("ranking");
  await log(COR_ERRO, "🔄 Horas zeradas", [userId ? `**Policial:** <@${userId}>` : "**Todos os policiais** (horas e ranking)", `**Por:** <@${por.id}>`]);
  console.info(`[ponto] horas zeradas (${userId ? `discord:${userId}` : "todos"}) por discord:${por.id}`);
}

/* ---------- Ajuste de ponto (canal temporário guiado) ---------- */

/** Meia-noite (Brasília) do dia de `ms`, em ms UTC. */
const diaBRT = (ms: number) => Math.floor((ms - OFFSET_BRT) / DIA) * DIA + OFFSET_BRT;
const fmtBRT = (ms: number) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(ms);

/** "19:30", "19h30", "19h", "Entrada 19:30", "11/11 19:30" → instante (Brasília) no dia de referência. */
export function lerHorario(texto: string, dia: number): number | null {
  const s = texto.toLowerCase().normalize("NFC");
  const data = /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/.exec(s);
  const semData = data ? s.replace(data[0], " ") : s;
  const h = /(?:^|[^\d])(\d{1,2})\s*(?:[:h.]\s*(\d{2})|h)(?!\d)/.exec(semData) ?? /^\s*(?:hora de (?:entrada|sa[ií]da)|entrada|sa[ií]da)?\s*:?\s*(\d{1,2})()\s*$/.exec(semData);
  if (!h) return null;
  const hora = Number(h[1]);
  const min = Number(h[2] || 0);
  if (hora > 23 || min > 59) return null;
  let base = dia;
  if (data) {
    const ref = new Date(dia - OFFSET_BRT);
    const ano = data[3] ? (data[3].length === 2 ? 2000 + Number(data[3]) : Number(data[3])) : ref.getUTCFullYear();
    const d = Number(data[1]);
    const m = Number(data[2]);
    if (d < 1 || d > 31 || m < 1 || m > 12) return null;
    base = Date.UTC(ano, m - 1, d) + OFFSET_BRT;
    if (new Date(base - OFFSET_BRT).getUTCDate() !== d) return null;
  }
  return base + hora * HORA + min * 60_000;
}

function painelAjusteInicio(a: Ajuste, alvo: Ponto | undefined): MessageBody {
  const sobre = alvo
    ? `Ponto **#${nn(alvo.numero)}** · entrada registrada ${ts(alvo.entrada, "f")}${alvo.saida ? ` · saída ${ts(alvo.saida, "t")}` : " · **ainda aberto**"}`
    : `Nenhum ponto aberto ou pendente — o ajuste cria um ponto novo do dia **${fmtBRT(a.dia).slice(0, 5)}**.`;
  return {
    flags: FLAG_COMPONENTS_V2,
    allowed_mentions: { parse: [], users: [a.userId] },
    components: [
      {
        type: 17,
        accent_color: COR,
        components: [
          ...[cabecalho([`## 🛠️ Ajuste de ponto · #${nn(a.numero)}`, `<@${a.userId}>, a gestão (${a.pedidoPor.nome}) pediu que você informe seu horário de **entrada** e **saída** de serviço.`])].flat(),
          { type: 14, divider: true, spacing: 1 },
          { type: 10, content: `${sobre}\n\n**Como fazer** — uma mensagem por vez, neste canal (horário de Brasília):` },
          { type: 10, content: "**1.** Hora de entrada\n```\nEntrada 19:30\n```\n**2.** Hora de saída\n```\nSaída 23:45\n```\n-# Também vale só `19:30`, `19h30` ou com o dia: `11/11 19:30`. Saída antes da entrada = virou o dia." },
          { type: 10, content: "Depois aparece um resumo para você **confirmar**. As horas ainda passam pela aprovação." },
          { type: 1, components: [{ type: 2, style: 2, label: "Cancelar ajuste", emoji: { name: "🗑️" }, custom_id: `pt:aj:cancelar:${a.id}` }] },
          rodape("o canal é apagado ao concluir"),
        ],
      },
    ],
  };
}

function painelConfirmar(a: Ajuste, aviso?: string): MessageBody {
  return {
    flags: FLAG_COMPONENTS_V2,
    allowed_mentions: { parse: [] },
    components: [
      {
        type: 17,
        accent_color: COR_PENDENTE,
        components: [
          { type: 10, content: `### ✔️ Os horários estão certos?\n🟢 **Entrada:** ${fmtBRT(a.entrada!)}\n🔴 **Saída:** ${fmtBRT(a.saida!)}\n⏱️ **Total:** **${fmtDur(a.saida! - a.entrada!)}**\n-# Horário de Brasília.` },
          ...(aviso ? [{ type: 10, content: `⚠️ ${aviso}` }] : []),
          {
            type: 1,
            components: [
              { type: 2, style: 3, label: "Confirmar", emoji: { name: "✅" }, custom_id: `pt:aj:ok:${a.id}` },
              { type: 2, style: 2, label: "Corrigir", emoji: { name: "↩️" }, custom_id: `pt:aj:refazer:${a.id}` },
            ],
          },
        ],
      },
    ],
  };
}

const passo = (texto: string, cor = COR): MessageBody => ({
  flags: FLAG_COMPONENTS_V2,
  allowed_mentions: { parse: [] },
  components: [{ type: 17, accent_color: cor, components: [{ type: 10, content: texto }] }],
});

/** Ponto que o ajuste corrige: o aberto; senão o pendente mais recente. */
const pontoDoAjuste = (userId: string) =>
  pontoStore.aberto(userId) ?? [...pontoStore.doPolicial(userId)].reverse().find((p) => p.status === "pendente");

export async function pedirAjuste(alvoId: string, por: Quem): Promise<Resultado<{ ajuste: Ajuste; dm: boolean }>> {
  const m = await getMember(alvoId);
  if (!m) return falha("membro_nao_encontrado");
  if (m.user.bot) return falha("alvo_bot");
  const ja = pontoStore.ajusteAberto(alvoId);
  if (ja) return falha("ja_tem_ajuste");
  const cfg = pontoStore.config();
  const alvo = pontoDoAjuste(alvoId);
  const a = pontoStore.novoAjuste({
    id: randomUUID(),
    userId: alvoId,
    pontoId: alvo?.id ?? null,
    dia: diaBRT(alvo?.entrada ?? Date.now()),
    canalId: null,
    etapa: "entrada",
    entrada: null,
    saida: null,
    painelMensagemId: null,
    pedidoPor: por,
    status: "aberto",
    criadoEm: Date.now(),
  });
  const canal = await createTicketChannel({
    nome: `🛠️・ajuste-${nn(a.numero)}`,
    topico: `Ajuste de ponto · ${nomeComInsignia(m)}`,
    categoriaId: cfg.categoriaId,
    cargos: cfg.cargosGestao,
    usuarioId: alvoId,
    motivo: `Ajuste de ponto #${nn(a.numero)}`,
  });
  if (!canal) {
    a.status = "cancelado";
    await pontoStore.salvar();
    return falha("falha_canal");
  }
  a.canalId = canal;
  const msg = await postMessage(canal, painelAjusteInicio(a, alvo), brasao());
  a.painelMensagemId = msg?.id ?? null;
  await pontoStore.salvar();
  const dm = await sendDM(
    alvoId,
    caixaDM(COR, `### 🛠️ Ajuste de ponto\nA gestão pediu para você ajustar o **horário de entrada e de saída** do seu serviço.\nAbra o canal abaixo e siga o exemplo — leva menos de um minuto.`, [
      { type: 1, components: [{ type: 2, style: 5, label: "Ir para o ajuste", emoji: { name: "🛠️" }, url: canalUrl(canal) }] },
    ]),
  );
  console.info(`[ponto] ajuste #${nn(a.numero)} para discord:${alvoId} pedido por discord:${por.id}`);
  return { ok: true, valor: { ajuste: a, dm } };
}

/** Mensagens do policial no canal do ajuste: entrada → saída → painel de confirmação. */
export async function aoMensagemNoAjuste(m: RawMensagem): Promise<void> {
  if (m.webhook_id || m.author.bot) return;
  const a = pontoStore.ajustePorCanal(m.channel_id);
  if (!a || m.author.id !== a.userId || a.etapa === "confirmar") return;
  const t = lerHorario(m.content, a.dia);
  const agora = Date.now();
  if (a.etapa === "entrada") {
    if (t === null) return void postMessage(m.channel_id, passo("❌ Não entendi o horário. Envie a **hora de entrada**, por exemplo:\n```\nEntrada 19:30\n```", COR_ERRO));
    if (t > agora) return void postMessage(m.channel_id, passo(`❌ A entrada (${fmtBRT(t)}) está no futuro. Confira o horário.`, COR_ERRO));
    a.entrada = t;
    a.etapa = "saida";
    await pontoStore.salvar();
    await postMessage(m.channel_id, passo(`🟢 **Entrada:** ${fmtBRT(t)}\nAgora envie a **hora de saída**, por exemplo:\n\`\`\`\nSaída 23:45\n\`\`\``, COR_OK));
    return;
  }
  // saída
  if (t === null) return void postMessage(m.channel_id, passo("❌ Não entendi o horário. Envie a **hora de saída**, por exemplo:\n```\nSaída 23:45\n```", COR_ERRO));
  let saida = t;
  if (saida <= a.entrada!) saida += DIA; // passou da meia-noite
  if (saida - a.entrada! > DIA) return void postMessage(m.channel_id, passo("❌ O serviço passou de 24 horas. Confira a saída.", COR_ERRO));
  if (saida > agora + 5 * 60_000) return void postMessage(m.channel_id, passo(`❌ A saída (${fmtBRT(saida)}) está no futuro. Confira o horário.`, COR_ERRO));
  a.saida = saida;
  a.etapa = "confirmar";
  await pontoStore.salvar();
  await postMessage(m.channel_id, painelConfirmar(a));
}

export function refazerAjuste(a: Ajuste) {
  a.etapa = "entrada";
  a.entrada = a.saida = null;
  return pontoStore.salvar();
}

export async function confirmarAjuste(a: Ajuste): Promise<Resultado<Fechamento | Ponto>> {
  if (a.status !== "aberto" || a.etapa !== "confirmar" || a.entrada === null || a.saida === null) return falha("ajuste_encerrado");
  a.status = "concluido"; // trava na hora
  const quem = { por: a.pedidoPor, em: Date.now() };
  let p = a.pontoId ? pontoStore.ponto(a.pontoId) : undefined;
  let resultado: Fechamento | Ponto;

  if (p && p.status === "aberto") {
    p.ajuste = { ...quem, entradaAntes: p.entrada, saidaAntes: null };
    p.entrada = a.entrada;
    p.status = "pendente";
    resultado = await fecharPonto(p, a.saida);
  } else if (p && p.status === "pendente") {
    p.ajuste = { ...quem, entradaAntes: p.entrada, saidaAntes: p.saida };
    p.entrada = a.entrada;
    p.saida = a.saida;
    await pontoStore.salvar();
    if (p.aprovacao?.mensagemId) await editMessage(p.aprovacao.canalId, p.aprovacao.mensagemId, painelAprovacao(p));
    else await abrirAprovacao(p);
    resultado = p;
  } else {
    const m = await getMember(a.userId);
    p = pontoStore.novoPonto({
      id: randomUUID(),
      userId: a.userId,
      username: m?.user.username ?? "desconhecido",
      avatar: m?.user.avatar ?? null,
      nome: m ? nomeComInsignia(m) : "Policial",
      origem: "ajuste",
      entrada: a.entrada,
      saida: null,
      status: "pendente",
      aprovacao: null,
      decisao: null,
      ajuste: { ...quem, entradaAntes: a.entrada, saidaAntes: null },
      observacao: null,
    });
    resultado = await fecharPonto(p, a.saida);
  }
  a.pontoId = p.id;
  await pontoStore.salvar();
  await log(COR, "🛠️ Ponto ajustado", [
    `**Policial:** <@${a.userId}> · ponto #${nn(p.numero)}`,
    `**Novo horário:** ${fmtBRT(a.entrada)} → ${fmtBRT(a.saida)} · **${fmtDur(a.saida - a.entrada)}**`,
    `**Pedido por:** <@${a.pedidoPor.id}>`,
  ]);
  await encerrarCanalAjuste(a, `✅ Ponto ajustado: **${fmtBRT(a.entrada)} → ${fmtBRT(a.saida)}** (${fmtDur(a.saida - a.entrada)}).${p.status === "descartado" ? " Ficou abaixo do mínimo e foi descartado." : " Enviado para aprovação."}`);
  return { ok: true, valor: resultado };
}

export async function cancelarAjuste(a: Ajuste, por: Quem): Promise<void> {
  if (a.status !== "aberto") return;
  a.status = "cancelado";
  await pontoStore.salvar();
  await encerrarCanalAjuste(a, `🗑️ Ajuste cancelado por ${por.nome}.`);
}

async function encerrarCanalAjuste(a: Ajuste, texto: string) {
  const canal = a.canalId;
  if (!canal) return;
  await postMessage(canal, passo(`${texto}\n-# Este canal será apagado em 5 segundos.`, COR_OK));
  setTimeout(() => void deleteChannel(canal, `Ajuste de ponto #${nn(a.numero)} encerrado`), 5_000);
}

/* ---------- Canais de voz (ponto automático) ---------- */

async function fecharPorVoz(p: Ponto, observacao: string) {
  p.status = "pendente"; // trava
  const r = await fecharPonto(p, Date.now(), observacao);
  await sendDM(
    p.userId,
    caixaDM(
      r.tipo === "pendente" ? COR_PENDENTE : 0x4b5563,
      r.tipo === "pendente"
        ? `### ⏱️ Ponto encerrado\nVocê saiu do canal de serviço. **${fmtDur(duracao(p))}** foram enviadas para aprovação (ponto #${nn(p.numero)}).`
        : `### ⏱️ Ponto descartado\nVocê saiu do canal de serviço com **${fmtDur(duracao(p))}** — abaixo do mínimo de ${fmtDur(pontoStore.config().minimoMinutos * 60_000)}.`,
    ),
  );
  await lembrarAssuncao(p.userId);
}

export async function aoMudarVoz(v: VozEvento): Promise<void> {
  if (v.bot) return;
  const canais = pontoStore.config().canaisVoz;
  if (canais.length === 0) return;
  const entrou = Boolean(v.para && canais.includes(v.para));
  const estava = Boolean(v.de && canais.includes(v.de));
  if (entrou && !estava) {
    if (!podeBater(v.userId, v.roles) || pontoStore.aberto(v.userId)) return;
    const m = await getMember(v.userId);
    if (m && !pontoStore.aberto(v.userId)) await entrarServico(m, "voz");
  } else if (estava && !entrou) {
    const p = pontoStore.aberto(v.userId);
    if (p?.origem === "voz") await fecharPorVoz(p, "Saiu do canal de voz");
  }
}

/** Bot (re)conectado: confere quem está nos canais agora (pode ter mudado com o bot fora do ar). */
export async function conferirVoz(): Promise<void> {
  const canais = pontoStore.config().canaisVoz;
  const agora = vozAtual();
  for (const p of pontoStore.abertos()) {
    if (p.origem !== "voz") continue;
    const v = agora.get(p.userId);
    if (!v || !canais.includes(v.canalId)) await fecharPorVoz(p, "Fora do canal de voz quando o bot reconectou");
  }
  for (const [userId, v] of agora) {
    if (v.bot || !canais.includes(v.canalId) || !podeBater(userId, v.roles) || pontoStore.aberto(userId)) continue;
    const m = await getMember(userId);
    if (m && !pontoStore.aberto(userId)) await entrarServico(m, "voz");
  }
  atualizarTodos();
}

/** Saiu do servidor com ponto aberto: descartado (não vai para aprovação). */
export async function aoMembroSairPonto(userId: string): Promise<void> {
  const p = pontoStore.aberto(userId);
  if (!p) return;
  p.saida = Date.now();
  p.status = "descartado";
  p.observacao = "Saiu do servidor com o ponto aberto";
  await pontoStore.salvar();
  atualizar("painel", "painelServico");
}

/* ---------- "Minhas horas" ---------- */

export function resumoPolicial(userId: string) {
  const h = pontoStore.horasDe(userId);
  const posicao = rankingAtual().findIndex((x) => x.userId === userId);
  const meus = pontoStore.doPolicial(userId);
  return {
    aberto: pontoStore.aberto(userId) ?? null,
    totalMs: h?.totalMs ?? 0,
    rankingMs: h?.rankingMs ?? 0,
    posicao: posicao >= 0 ? posicao + 1 : null,
    pendentes: meus.filter((p) => p.status === "pendente").length,
    recentes: [...meus].reverse().slice(0, 5),
  };
}

export const MENSAGEM_ERRO: Record<string, string> = {
  get sem_permissao_ponto() {
    return pontoStore.config().cargosBater.length
      ? "Seu cargo não está liberado para bater ponto. Fale com a administração."
      : "Só quem tem o set aprovado bate ponto. Peça o seu no painel **Pedir Set**.";
  },
  sem_permissao_aprovar: "Somente os aprovadores (cargos ou pessoas escolhidas) podem decidir as horas.",
  sem_permissao_gestao: "Somente a gestão do ponto pode usar este comando.",
  ja_em_servico: "Você já está em serviço.",
  fora_de_servico: "Você não está em serviço.",
  alvo_bot: "Não é possível fazer isso com um bot.",
  ja_decidido: "Este ponto já foi decidido.",
  proprio_ponto: "Você não pode aprovar ou reprovar o próprio ponto.",
  membro_nao_encontrado: "Essa pessoa não está mais no servidor.",
  ja_tem_ajuste: "Essa pessoa já tem um ajuste de ponto aberto.",
  falha_canal: "Não foi possível criar o canal temporário (confira as permissões do bot).",
  ajuste_encerrado: "Este ajuste já foi encerrado.",
};
