import { emojiLogo } from "../branding/emoji.js";
import { FLAG_COMPONENTS_V2, postMessage, type MessageBody } from "../discord/bot.js";
import { brasao, cabecalho } from "../set/brasao.js";
import { caber, linhaPreso, md } from "./mensagens.js";
import { numeroOcorrencia, ocorrenciaStore, type Ocorrencia } from "./store.js";

/**
 * Resumo semanal das APREENSÕES — toda segunda-feira (a partir das 09:00 de Brasília) no canal de
 * logs escolhido: as ocorrências da semana anterior (segunda 00:00 → segunda 00:00) com material
 * apreendido (campo "Apreensões" preenchido ou tipo "apreensão"), mais os presos da semana.
 * Se o bot estiver fora do ar na segunda, manda assim que voltar (uma vez por semana).
 */

const OFFSET_BRT = 3 * 3_600_000; // Brasil sem horário de verão: UTC−3
const DIA = 86_400_000;
const HORA_ENVIO = 9;
const COR = 0x0ea5e9;
const LIMITE_BLOCO = 3_300; // texto por mensagem (o Discord aceita 4000 somando tudo)

const fmtData = (ms: number) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(ms);
const unix = (ms: number) => Math.floor(ms / 1000);

/** Segunda-feira 00:00 (Brasília) da semana de `ms`, em ms UTC. */
export function segundaDaSemana(ms: number): number {
  const local = ms - OFFSET_BRT; // relógio de Brasília lido com getUTC*
  const d = new Date(local);
  const diasDesdeSegunda = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diasDesdeSegunda) + OFFSET_BRT;
}
const chave = (segunda: number) => new Date(segunda - OFFSET_BRT).toISOString().slice(0, 10);

export const ehApreensao = (o: Ocorrencia) => Boolean(o.apreensoes?.trim()) || o.tipo.id === "apreensao";

export function dadosResumo(desde: number, ate: number) {
  const semana = ocorrenciaStore.registros().filter((o) => o.em >= desde && o.em < ate);
  const apreensoes = semana.filter(ehApreensao);
  const comPreso = semana.filter((o) => o.houvePreso && o.presos.length);
  return { semana, apreensoes, comPreso, presos: comPreso.reduce((t, o) => t + o.presos.length, 0) };
}

/** As mensagens do resumo (várias, se não couber numa só). */
export function mensagensResumo(desde: number, ate: number, titulo = "📦 Resumo semanal de apreensões"): MessageBody[] {
  const { semana, apreensoes, comPreso, presos } = dadosResumo(desde, ate);
  const e = emojiLogo();
  const porTipo = new Map<string, number>();
  for (const o of semana) porTipo.set(`${o.tipo.emoji ? `${o.tipo.emoji} ` : ""}${o.tipo.nome}`, (porTipo.get(`${o.tipo.emoji ? `${o.tipo.emoji} ` : ""}${o.tipo.nome}`) ?? 0) + 1);

  const blocos: string[] = [];
  if (apreensoes.length === 0) blocos.push("### 📦 Apreensões\n_Nenhuma apreensão registrada nesta semana._");
  else {
    blocos.push(`### 📦 Apreensões · ${apreensoes.length}`);
    for (const o of apreensoes) {
      blocos.push(
        [
          `**${numeroOcorrencia(o)}** · ${o.tipo.emoji ? `${o.tipo.emoji} ` : ""}${md(o.tipo.nome)} · <t:${unix(o.em)}:d> · <@${o.autor.id}>`,
          `-# 📍 ${md(caber(o.local, 80))}`,
          o.apreensoes?.trim() ? `> ${md(caber(o.apreensoes.trim(), 350)).replace(/\n/g, "\n> ")}` : "> _material não descrito_",
        ].join("\n"),
      );
    }
  }
  if (comPreso.length) {
    blocos.push(`### 🔗 Presos · ${presos}`);
    for (const o of comPreso) blocos.push(`**${numeroOcorrencia(o)}** · <t:${unix(o.em)}:d>\n${o.presos.map(linhaPreso).join("\n")}`);
  }

  // Divide em mensagens que caibam no limite do Discord.
  const partes: string[][] = [[]];
  let tamanho = 0;
  for (const b of blocos) {
    if (partes.at(-1)!.length && tamanho + b.length > LIMITE_BLOCO) {
      partes.push([]);
      tamanho = 0;
    }
    partes.at(-1)!.push(b);
    tamanho += b.length + 1;
  }

  const topo = cabecalho([
    "-# POLÍCIA MILITAR DO ESTADO DO RIO DE JANEIRO",
    `## ${titulo}`,
    `-# ${fmtData(desde)} a ${fmtData(ate - 1)} · 7 dias`,
  ]);
  const totais = [
    `**📋 Ocorrências:** ${semana.length}  ·  **📦 Com apreensão:** ${apreensoes.length}  ·  **🔗 Presos:** ${presos}`,
    porTipo.size ? `-# ${[...porTipo.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}: ${n}`).join(" · ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return partes.map((textos, i) => ({
    flags: FLAG_COMPONENTS_V2,
    allowed_mentions: { parse: [] },
    components: [
      {
        type: 17,
        accent_color: COR,
        components: [
          ...(i === 0 ? [...[topo].flat(), { type: 14, divider: true, spacing: 1 }, { type: 10, content: totais }, { type: 14, divider: true, spacing: 1 }] : [{ type: 10, content: `-# ${titulo} · continuação (${i + 1}/${partes.length})` }]),
          { type: 10, content: textos.join("\n\n") },
          ...(i === partes.length - 1 ? [{ type: 10, content: `-# ${e ? `${e} ` : ""}Registro de Ocorrência · PMERJ · gerado <t:${unix(Date.now())}:f>` }] : []),
        ],
      },
    ],
  }));
}

/** Publica o resumo de um período no canal de logs. Devolve quantas mensagens saíram (0 = falhou / sem canal). */
export async function publicarResumo(desde: number, ate: number, titulo?: string): Promise<number> {
  const canal = ocorrenciaStore.config().canalResumoId;
  if (!canal) return 0;
  let n = 0;
  for (const [i, m] of mensagensResumo(desde, ate, titulo).entries()) {
    if (!(await postMessage(canal, m, i === 0 ? brasao() : undefined))) break;
    n++;
  }
  return n;
}

/** Roda a cada 10 min: segunda depois das 09:00 (ou o primeiro momento depois disso) manda o resumo da semana anterior. */
async function conferir(): Promise<void> {
  const c = ocorrenciaStore.config();
  if (!c.canalResumoId) return;
  const agora = Date.now();
  const segunda = segundaDaSemana(agora);
  if (agora < segunda + HORA_ENVIO * 3_600_000) return;
  const k = chave(segunda);
  if (c.ultimoResumo === k) return;
  await ocorrenciaStore.saveConfig({ ultimoResumo: k }); // marca antes: nunca manda duas vezes
  const n = await publicarResumo(segunda - 7 * DIA, segunda);
  if (n === 0) await ocorrenciaStore.saveConfig({ ultimoResumo: c.ultimoResumo }); // falhou: tenta de novo na próxima rodada
  else console.info(`[ocorrencia] resumo semanal de ${k} publicado (${n} mensagem(ns))`);
}

/** Ao escolher o canal pela primeira vez, a contagem começa na próxima segunda (não manda a semana passada na hora). */
export const semanaAtual = () => chave(segundaDaSemana(Date.now()));

export function iniciarResumoSemanal(): void {
  setTimeout(() => void conferir().catch((err: unknown) => console.warn("[ocorrencia] resumo semanal:", err)), 60_000).unref();
  setInterval(() => void conferir().catch((err: unknown) => console.warn("[ocorrencia] resumo semanal:", err)), 10 * 60_000).unref();
}
