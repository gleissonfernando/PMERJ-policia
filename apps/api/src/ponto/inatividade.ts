import { randomUUID } from "node:crypto";
import { emojiLogo } from "../branding/emoji.js";
import { exonerar, nomeComInsignia } from "../disciplina/service.js";
import { createPrivateChannel, deleteChannel, editMessage, FLAG_COMPONENTS_V2, FLAG_EPHEMERAL, getMember, interactionCallback, postMessage, type MessageBody } from "../discord/bot.js";
import { membrosDoServidor, type MembroCargos, type RawInteraction } from "../discord/gateway.js";
import { env } from "../env.js";
import { duracao, fmtDur, podeBater } from "./service.js";
import { pontoStore, type CasoInatividade, type Quem } from "./store.js";

/**
 * Inatividade — X dias (padrão 5) sem bater ponto:
 *   - revisão (padrão): abre um canal temporário só para quem decide, com o RELATÓRIO DE PONTO
 *     (quantas vezes bateu ponto desde que entrou, último ponto, horas) e os botões Exonerar / Cancelar
 *   - automático: exonera direto
 * Exonerar = DM com o motivo, expulsão, registro disciplinar (/perfil) e log com o motivo.
 * Nunca entra na conta quem tem um CARGO DE AUSÊNCIA, quem está em serviço agora ou quem não bate ponto.
 * A contagem começa no que for mais recente: último ponto, entrada no servidor, ativação da regra
 * ou o último caso cancelado. Bateu ponto (ou ganhou ausência) com o caso aberto → o caso se encerra sozinho.
 */

const DIA = 86_400_000;
const COR = 0xb45309;
const COR_EXO = 0xe10600;
const COR_CANCELADO = 0x4b5563;
const INTERVALO = 30 * 60_000;
const MAX_POR_RODADA = 10;
const SISTEMA: Quem = { id: "sistema", nome: "Sistema (inatividade)" };
const P = "in:";

const nn = (n: number) => String(n).padStart(4, "0");
const ts = (ms: number, f = "f") => `<t:${Math.floor(ms / 1000)}:${f}>`;
const avatarUrl = (id: string, avatar: string | null) =>
  avatar ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=256` : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(id) >> 22n) % 6}.png`;
const rodape = (extra?: string) => {
  const e = emojiLogo();
  return { type: 10, content: `-# ${e ? `${e} ` : ""}PMERJ · Bate-ponto${extra ? ` · ${extra}` : ""}` };
};

const cfg = () => pontoStore.config().inatividade;
const tem = (lista: string[], roles: string[]) => lista.length > 0 && roles.some((r) => lista.includes(r));
export const temAusencia = (roles: string[]) => tem(cfg().cargosAusencia, roles);
const decisores = () => (cfg().cargosDecisao.length ? cfg().cargosDecisao : pontoStore.config().cargosGestao);
export const podeDecidirInatividade = (roles: string[]) => tem(decisores(), roles);

/** Pontos que contam como "bateu ponto" (descartado abaixo do mínimo e reprovado não contam). */
const valido = (s: string) => s === "aberto" || s === "pendente" || s === "aprovado";

/** Desde quando a pessoa está sem bater ponto (o marco mais recente). */
function semPontoDesde(userId: string, entrouEm: number | null): number {
  const ultimoPonto = pontoStore
    .doPolicial(userId)
    .filter((p) => valido(p.status))
    .reduce((m, p) => Math.max(m, p.entrada), 0);
  const ultimoCaso = pontoStore.ultimoCaso(userId);
  const casoEncerrado = ultimoCaso && ultimoCaso.status !== "aberto" ? (ultimoCaso.decisao?.em ?? ultimoCaso.abertoEm) : 0;
  return Math.max(ultimoPonto, entrouEm ?? 0, cfg().ativadoEm, casoEncerrado);
}

/** Bateu ponto depois de um instante? */
const bateuDepois = (userId: string, desde: number) => pontoStore.doPolicial(userId).some((p) => valido(p.status) && p.entrada > desde);

/* ---------- Relatório (Components V2) ---------- */

function relatorio(caso: CasoInatividade, entrouEm: number | null, extra?: { texto: string; cor: number }): MessageBody {
  const todos = pontoStore.doPolicial(caso.userId);
  const desdeEntrada = entrouEm ? todos.filter((p) => p.entrada >= entrouEm) : todos;
  const conta = (s: string) => desdeEntrada.filter((p) => p.status === s).length;
  const ultimo = [...todos].filter((p) => valido(p.status)).sort((a, b) => b.entrada - a.entrada)[0];
  const h = pontoStore.horasDe(caso.userId);
  const aprovadoMs = desdeEntrada.filter((p) => p.status === "aprovado").reduce((t, p) => t + duracao(p), 0);
  const aberto = caso.status === "aberto";
  const dias = Math.floor((Date.now() - caso.semPontoDesde) / DIA);

  return {
    flags: FLAG_COMPONENTS_V2,
    allowed_mentions: { parse: [] },
    components: [
      {
        type: 17,
        accent_color: extra?.cor ?? COR,
        components: [
          {
            type: 9,
            components: [
              { type: 10, content: `## 📉 Relatório de ponto · inatividade #${nn(caso.numero)}` },
              { type: 10, content: `**Policial:** <@${caso.userId}> · ${caso.nome}` },
              { type: 10, content: `**Sem bater ponto há ${dias} ${dias === 1 ? "dia" : "dias"}** (desde ${ts(caso.semPontoDesde, "D")})` },
            ],
            accessory: { type: 11, media: { url: avatarUrl(caso.userId, caso.avatar) }, description: `Avatar de ${caso.username}`.slice(0, 1024) },
          },
          { type: 14, divider: true, spacing: 1 },
          {
            type: 10,
            content: [
              `📅 **No servidor desde:** ${entrouEm ? `${ts(entrouEm, "D")} (${ts(entrouEm, "R")})` : "_não informado_"}`,
              `⏱️ **Pontos batidos desde que entrou:** **${desdeEntrada.length}**`,
              `-# ✅ ${conta("aprovado")} aprovados · ⏳ ${conta("pendente")} pendentes · ✖️ ${conta("reprovado")} reprovados · 🗑️ ${conta("descartado")} descartados`,
              `🕘 **Último ponto:** ${ultimo ? `${ts(ultimo.entrada, "f")} (${ts(ultimo.entrada, "R")})` : "**nunca bateu ponto**"}`,
              `🏅 **Horas aprovadas:** ${fmtDur(aprovadoMs)} desde que entrou · ${fmtDur(h?.totalMs ?? 0)} no total atual`,
            ].join("\n"),
          },
          ...(extra ? [{ type: 14, divider: true, spacing: 1 }, { type: 10, content: extra.texto }] : []),
          ...(aberto
            ? [
                { type: 10, content: `-# Exonerar: DM com o motivo, expulsão do servidor e registro. Cargo de ausência impede a exoneração.` },
                {
                  type: 1,
                  components: [
                    { type: 2, style: 4, label: "Exoneração", emoji: { name: "🚫" }, custom_id: `${P}exo:${caso.id}` },
                    { type: 2, style: 2, label: "Cancelar", emoji: { name: "✖️" }, custom_id: `${P}can:${caso.id}` },
                  ],
                },
              ]
            : []),
          rodape(`aberto ${ts(caso.abertoEm, "f")}`),
        ],
      },
    ],
  };
}

/* ---------- Exonerar / cancelar / encerrar ---------- */

const motivoExoneracao = (caso: CasoInatividade) =>
  `Falta de comparecimento: nenhum ponto batido em ${Math.max(cfg().dias, Math.floor((Date.now() - caso.semPontoDesde) / DIA))} dias (desde ${new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(caso.semPontoDesde)}).`;

async function logExoneracao(caso: CasoInatividade, por: Quem, motivo: string) {
  const canal = cfg().canalLogId ?? pontoStore.config().canalLogId;
  if (!canal) return;
  await postMessage(canal, {
    flags: FLAG_COMPONENTS_V2,
    allowed_mentions: { parse: [] },
    components: [
      {
        type: 17,
        accent_color: COR_EXO,
        components: [
          {
            type: 9,
            components: [
              { type: 10, content: "### 🚫 Exoneração por inatividade" },
              { type: 10, content: `**Policial:** <@${caso.userId}> · ${caso.nome} (\`${caso.userId}\`)` },
              { type: 10, content: `**Motivo:** ${motivo}` },
            ],
            accessory: { type: 11, media: { url: avatarUrl(caso.userId, caso.avatar) }, description: `Avatar de ${caso.username}`.slice(0, 1024) },
          },
          { type: 10, content: `-# ${por.id === SISTEMA.id ? "Exoneração automática" : `Decidido por <@${por.id}>`} · caso #${nn(caso.numero)} · ${ts(Date.now(), "f")}` },
        ],
      },
    ],
  });
}

/** Atualiza o painel do canal e apaga o canal pouco depois. */
async function encerrarCanal(caso: CasoInatividade, entrouEm: number | null, texto: string, cor: number) {
  const c = caso.canal;
  if (!c) return;
  await editMessage(c.canalId, c.mensagemId, relatorio(caso, entrouEm, { texto: `${texto}\n-# Este canal será apagado em 15 segundos.`, cor }));
  setTimeout(() => void deleteChannel(c.canalId, `Inatividade #${nn(caso.numero)} encerrada`), 15_000);
}

export type ResultadoCaso = { ok: true; texto: string } | { ok: false; erro: string };

export async function exonerarCaso(caso: CasoInatividade, por: Quem): Promise<ResultadoCaso> {
  if (caso.status !== "aberto") return { ok: false, erro: "Este caso já foi decidido." };
  const m = await getMember(caso.userId);
  const entrouEm = membrosDoServidor()?.find((x) => x.id === caso.userId)?.entrouEm ?? null;
  // Conferência final com os dados de AGORA.
  if (!m) return encerrarSemExonerar(caso, entrouEm, "🚪 A pessoa não está mais no servidor. Caso encerrado.", por);
  if (temAusencia(m.roles)) return encerrarSemExonerar(caso, entrouEm, "🛡️ A pessoa está com **cargo de ausência**: não pode ser exonerada. Caso encerrado.", por);
  if (bateuDepois(caso.userId, caso.semPontoDesde)) return encerrarSemExonerar(caso, entrouEm, "⏱️ A pessoa **bateu ponto** depois que o caso abriu. Caso encerrado.", por);

  caso.status = "exonerado"; // trava: dois cliques não exoneram duas vezes
  const motivo = motivoExoneracao(caso);
  caso.decisao = { por, em: Date.now(), motivo };
  await pontoStore.salvar();
  // Disciplina: DM com o motivo ANTES, expulsão, registro (aparece no /perfil) e anúncio de exoneração.
  const r = await exonerar(caso.userId, motivo, por.id === SISTEMA.id ? SISTEMA : por);
  if (!r.ok) {
    caso.status = "aberto";
    caso.decisao = null;
    await pontoStore.salvar();
    const erro = r.erro === "expulsao_recusada" ? "O Discord recusou expulsar (o cargo do bot precisa estar acima do cargo da pessoa)." : r.erro === "propria_pessoa" ? "Você não pode exonerar a si mesmo." : "Não foi possível exonerar.";
    return { ok: false, erro };
  }
  await logExoneracao(caso, por, motivo);
  await encerrarCanal(caso, entrouEm, `🚫 **Exonerado(a)** ${por.id === SISTEMA.id ? "automaticamente" : `por <@${por.id}>`}.\n**Motivo:** ${motivo}`, COR_EXO);
  console.info(`[ponto] inatividade #${nn(caso.numero)}: discord:${caso.userId} exonerado por ${por.id}`);
  return { ok: true, texto: "Exonerado(a)." };
}

async function encerrarSemExonerar(caso: CasoInatividade, entrouEm: number | null, texto: string, por: Quem): Promise<ResultadoCaso> {
  caso.status = "resolvido";
  caso.decisao = { por, em: Date.now(), motivo: texto };
  await pontoStore.salvar();
  await encerrarCanal(caso, entrouEm, texto, COR_CANCELADO);
  return { ok: true, texto };
}

export async function cancelarCaso(caso: CasoInatividade, por: Quem): Promise<ResultadoCaso> {
  if (caso.status !== "aberto") return { ok: false, erro: "Este caso já foi decidido." };
  caso.status = "cancelado";
  caso.decisao = { por, em: Date.now(), motivo: "Cancelado" };
  await pontoStore.salvar();
  const entrouEm = membrosDoServidor()?.find((x) => x.id === caso.userId)?.entrouEm ?? null;
  await encerrarCanal(caso, entrouEm, `✖️ **Cancelado** por <@${por.id}>. A contagem de ${cfg().dias} dias recomeça agora.`, COR_CANCELADO);
  console.info(`[ponto] inatividade #${nn(caso.numero)} cancelada por discord:${por.id}`);
  return { ok: true, texto: "Cancelado." };
}

/* ---------- Abrir caso ---------- */

async function abrirCaso(m: MembroCargos, desde: number): Promise<void> {
  const membro = await getMember(m.id);
  if (!membro || temAusencia(membro.roles)) return;
  const caso = pontoStore.novoCaso({
    id: randomUUID(),
    userId: m.id,
    username: m.username,
    avatar: m.avatar,
    nome: nomeComInsignia(membro),
    abertoEm: Date.now(),
    semPontoDesde: desde,
    canal: null,
    status: "aberto",
    decisao: null,
  });
  await pontoStore.salvar();
  console.info(`[ponto] inatividade #${nn(caso.numero)} aberta para discord:${m.id}`);

  if (cfg().modo === "automatico") {
    await exonerarCaso(caso, SISTEMA);
    return;
  }
  const canal = await createPrivateChannel({
    nome: `📉・inatividade-${nn(caso.numero)}`,
    topico: `Relatório de ponto · ${caso.nome} · ${cfg().dias}+ dias sem bater ponto`,
    categoriaId: pontoStore.config().categoriaId,
    cargos: decisores(),
    motivo: `Inatividade #${nn(caso.numero)} (${cfg().dias} dias sem ponto)`,
  });
  if (!canal) {
    // Sem canal não há como decidir: desfaz para tentar de novo na próxima rodada.
    caso.status = "resolvido";
    caso.decisao = { por: SISTEMA, em: caso.semPontoDesde, motivo: "Falha ao criar o canal" };
    await pontoStore.salvar();
    console.warn(`[ponto] inatividade #${nn(caso.numero)}: não foi possível criar o canal (permissões do bot / categoria).`);
    return;
  }
  const msg = await postMessage(canal, relatorio(caso, m.entrouEm));
  caso.canal = { canalId: canal, mensagemId: msg?.id ?? "" };
  await pontoStore.salvar();
}

/* ---------- Rotina ---------- */

let rodando = false;

export async function verificarInatividade(): Promise<void> {
  const c = cfg();
  const membros = membrosDoServidor();
  if (rodando || !membros) return;
  rodando = true;
  try {
    const porId = new Map(membros.map((m) => [m.id, m]));

    // Casos abertos que se resolveram sozinhos: saiu, ganhou ausência ou bateu ponto.
    for (const caso of pontoStore.casos().filter((x) => x.status === "aberto")) {
      const m = porId.get(caso.userId);
      const motivo = !m
        ? "🚪 A pessoa saiu do servidor. Caso encerrado."
        : temAusencia(m.roles)
          ? "🛡️ A pessoa recebeu **cargo de ausência**. Caso encerrado."
          : bateuDepois(caso.userId, caso.semPontoDesde)
            ? "⏱️ A pessoa **bateu ponto**. Caso encerrado."
            : null;
      if (motivo) await encerrarSemExonerar(caso, m?.entrouEm ?? null, motivo, SISTEMA);
    }

    if (!c.ativo) return;
    const limite = c.dias * DIA;
    let abertos = 0;
    for (const m of membros) {
      if (abertos >= MAX_POR_RODADA) break;
      if (m.bot || !podeBater(m.id, m.roles) || temAusencia(m.roles)) continue;
      if (pontoStore.aberto(m.id) || pontoStore.casoAberto(m.id)) continue;
      const desde = semPontoDesde(m.id, m.entrouEm);
      if (Date.now() - desde < limite) continue;
      await abrirCaso(m, desde);
      abertos++;
    }
  } catch (err) {
    console.warn("[ponto] falha na verificação de inatividade:", err instanceof Error ? err.message : err);
  } finally {
    rodando = false;
  }
}

export function iniciarRotinaInatividade(): void {
  setTimeout(() => void verificarInatividade(), 3 * 60_000).unref(); // espera a lista de membros carregar
  setInterval(() => void verificarInatividade(), INTERVALO).unref();
}

/** Para a tela: casos abertos e os últimos decididos. */
export function resumoInatividade() {
  const casos = [...pontoStore.casos()].reverse();
  const publico = (x: CasoInatividade) => ({ ...x, canalId: x.canal?.canalId ?? null, canalUrl: x.canal ? `https://discord.com/channels/${env.DISCORD_GUILD_ID}/${x.canal.canalId}` : null });
  return { abertos: casos.filter((x) => x.status === "aberto").map(publico), recentes: casos.filter((x) => x.status !== "aberto").slice(0, 30).map(publico) };
}

/* ---------- Botões ---------- */

const efemera = (texto: string, cor = COR_EXO): MessageBody => ({
  flags: FLAG_EPHEMERAL | FLAG_COMPONENTS_V2,
  allowed_mentions: { parse: [] },
  components: [{ type: 17, accent_color: cor, components: [{ type: 10, content: texto }] }],
});

export async function handleInatividadeInteraction(i: RawInteraction): Promise<boolean> {
  const id = i.data?.custom_id ?? "";
  if (i.type !== 3 || !id.startsWith(P)) return false;
  const [, acao, casoId = ""] = id.split(":");
  const member = i.member;
  if (!member) {
    await interactionCallback(i.id, i.token, { type: 4, data: efemera("Use dentro do servidor.") });
    return true;
  }
  if (!podeDecidirInatividade(member.roles ?? [])) {
    await interactionCallback(i.id, i.token, { type: 4, data: efemera("🔒 Somente quem decide a inatividade (cargos configurados no Bate-ponto) pode fazer isso.") });
    return true;
  }
  const caso = pontoStore.caso(casoId);
  if (!caso || caso.status !== "aberto") {
    await interactionCallback(i.id, i.token, { type: 4, data: efemera("Este caso já foi decidido.", COR_CANCELADO) });
    return true;
  }
  // Expulsar + DM + logs passam de 3 s: confirma o clique já e atualiza o painel depois.
  await interactionCallback(i.id, i.token, { type: 6 });
  const por: Quem = { id: member.user.id, nome: member.user.global_name ?? member.user.username };
  const r = acao === "exo" ? await exonerarCaso(caso, por) : await cancelarCaso(caso, por);
  if (!r.ok) {
    const entrouEm = membrosDoServidor()?.find((x) => x.id === caso.userId)?.entrouEm ?? null;
    if (caso.canal) await editMessage(caso.canal.canalId, caso.canal.mensagemId, relatorio(caso, entrouEm, { texto: `⚠️ ${r.erro}`, cor: COR }));
  }
  return true;
}
