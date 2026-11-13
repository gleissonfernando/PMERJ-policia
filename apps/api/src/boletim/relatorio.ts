import { adicionarCargoStore } from "../adicionar-cargo/store.js";
import { anuncioStore } from "../anuncio/store.js";
import { arsenalStore } from "../arsenal/store.js";
import { assuncaoStore } from "../assuncao/store.js";
import { emojiLogo } from "../branding/emoji.js";
import { comunicadoStore } from "../comunicado/store.js";
import { corregStore } from "../corregedoria/store.js";
import { cursoStore } from "../curso/store.js";
import { disciplinaStore } from "../disciplina/store.js";
import { FLAG_COMPONENTS_V2, postMessage, type MessageBody } from "../discord/bot.js";
import { doespStore } from "../doesp/store.js";
import { esStore } from "../entrada-saida/anuncio.js";
import { horasStore } from "../horas/store.js";
import { inteligenciaStore } from "../inteligencia/store.js";
import { numeroOcorrencia, ocorrenciaStore, type Ocorrencia } from "../ocorrencia/store.js";
import { pontoStore, type Ponto } from "../ponto/store.js";
import { promocaoStore } from "../promocao/store.js";
import { brasao, cabecalho } from "../set/brasao.js";
import { setStore } from "../set/store.js";
import { boletimStore, numeroBoletim, type RelatorioConfig } from "./store.js";

/**
 * BOLETIM INTERNO automático — a cada X horas (padrão 2h, alinhado ao relógio de Brasília) no modelo
 * oficial do batalhão:
 *   cabeçalho (PMERJ · unidade · Nº/ano · data) → RESUMO DO BATALHÃO (números do período)
 *   → PRINCIPAIS OCORRÊNCIAS → ATOS INTERNOS → OPERAÇÕES E EMPREGO DO EFETIVO (inclui o bate-ponto)
 *   → DETERMINAÇÕES DO COMANDO → ANEXO (o resto do sistema) → "Publique-se…" e assinatura.
 * Tudo vem dos módulos do sistema; textos fixos (unidade, resumo, determinações, assinatura) no site.
 * Painéis V2 dentro do limite do Discord; o que não couber vai em "continuação do relatório".
 */

const HORA = 3_600_000;
const OFFSET_BRT = 3 * HORA; // Brasil sem horário de verão: UTC−3
const MAX_JANELA = 24 * HORA;
const MAX_ITENS = 30;
const LIMITE_TEXTO = 3_400; // por mensagem (o Discord aceita 4000 somando todos os textos)
const LIMITE_BLOCO = 1_900;
const LIMITE_COMPONENTES = 34; // o Discord aceita 40 por mensagem
const COR = 0x1e3a8a;

const unix = (ms: number) => Math.floor(ms / 1000);
const t = (ms: number, f = "t") => `<t:${unix(ms)}:${f}>`;
const md = (v: string) => v.replace(/([\\*_`~|>#])/g, "\\$1");
const caber = (v: string, max: number) => (v.length > max ? `${v.slice(0, max - 1).trimEnd()}…` : v);
const umaLinha = (v: string) => v.replace(/\s+/g, " ").trim();
const dentro = (ms: number | null | undefined, desde: number, ate: number) => typeof ms === "number" && ms >= desde && ms < ate;
const fmtHora = (ms: number) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(ms);
const fmtData = (ms: number) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(ms);
const anoBR = (ms: number) => Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric" }).format(ms));
const lista = (itens: string[]) => (itens.length > MAX_ITENS ? [...itens.slice(0, MAX_ITENS), `-# … e mais ${itens.length - MAX_ITENS}`] : itens);
const ou = (itens: string[], vazio = "Nenhuma no período.") => (itens.length ? itens.join("; ") : vazio);

function fmtDur(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? (m ? `${h}h ${String(m).padStart(2, "0")}min` : `${h}h`) : `${m}min`;
}
const dur = (p: Ponto) => Math.max(0, (p.saida ?? Date.now()) - p.entrada);
const seguro = <T>(nome: string, fn: () => T, padrao: T): T => {
  try {
    return fn();
  } catch (err) {
    console.warn(`[relatorio] ${nome} ignorado:`, err instanceof Error ? err.message : err);
    return padrao;
  }
};

/* ---------- Números do "Resumo do Batalhão" (lidos dos textos das ocorrências) ---------- */

const ARMA = /\b(pistolas?|rev[oó]lver(?:es)?|fuzis?|fuzil|carabinas?|espingardas?|escopetas?|submetralhadoras?|metralhadoras?|garruchas?|armas?(?: de fogo)?)\b/i;
const DROGA = /\b(drogas?|entorpecentes?|maconha|coca[ií]na|crack|haxixe|skunk|ecstasy|lsd|lan[çc]a[- ]perfume|papelotes?|pinos?|tabletes?|trouxinhas?|buchas?)\b/i;
const VEICULO = /\b(ve[ií]culos?|carros?|motos?|motocicletas?|caminh[aã]o|caminh[oõ]es)\b/i;
const RECUPERADO = /recupera/i;
const NUM_EXTENSO: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, "três": 3, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10 };

/** "1 pistola 9mm, 2 fuzis" → 3. Cada trecho com arma conta o número do começo (ou 1). */
function contarArmas(texto: string | null): number {
  if (!texto) return 0;
  return texto
    .split(/[,;\n]|\s+e\s+|\s\+\s/i)
    .filter((trecho) => ARMA.test(trecho))
    .reduce((s, trecho) => {
      const m = /^\s*(\d{1,3}|um|uma|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez)\b/i.exec(trecho);
      return s + (m ? (Number(m[1]) || NUM_EXTENSO[m[1]!.toLowerCase()] || 1) : 1);
    }, 0);
}

const temDroga = (o: Ocorrencia) => DROGA.test(o.apreensoes ?? "") || /droga/i.test(o.tipo.nome) && Boolean(o.apreensoes?.trim());
const veiculoRecuperado = (o: Ocorrencia) =>
  [o.apreensoes, o.desfecho, o.relato, o.tipo.nome].some((x) => x && VEICULO.test(x) && RECUPERADO.test(x));

/* ---------- Coleta do período ---------- */

interface Periodo {
  ocorrencias: Ocorrencia[];
  presos: number;
  armas: number;
  drogas: number;
  veiculos: number;
  operacoes: ReturnType<typeof comunicadoStore.registros>;
  inteligencia: ReturnType<typeof inteligenciaStore.recentes>;
  total: number;
}

function periodo(desde: number, ate: number): Periodo {
  const ocorrencias = seguro("ocorrências", () => ocorrenciaStore.registros().filter((o) => dentro(o.em, desde, ate)), []);
  const operacoes = seguro("comunicados", () => comunicadoStore.registros().filter((c) => dentro(c.em, desde, ate)), []);
  const inteligencia = seguro("inteligência", () => inteligenciaStore.recentes(3_000).filter((r) => dentro(r.em, desde, ate)).reverse(), []);
  return {
    ocorrencias,
    presos: ocorrencias.reduce((s, o) => s + (o.houvePreso ? (o.presos?.length ?? 0) : 0), 0),
    armas: ocorrencias.reduce((s, o) => s + contarArmas(o.apreensoes), 0),
    drogas: ocorrencias.filter(temDroga).length,
    veiculos: ocorrencias.filter(veiculoRecuperado).length,
    operacoes,
    inteligencia,
    total: 0,
  };
}

/* ---------- Seções do modelo (cada uma vira um ou mais blocos de texto) ---------- */

function resumoBatalhao(cfg: RelatorioConfig, p: Periodo): string {
  return [
    "### RESUMO DO BATALHÃO",
    md(cfg.resumoTexto),
    "",
    "**Resumo:**",
    `Ocorrências atendidas: **${p.ocorrencias.length}**`,
    `Prisões realizadas: **${p.presos}**`,
    `Armas apreendidas: **${p.armas}**`,
    `Drogas apreendidas: **${p.drogas}** ${p.drogas === 1 ? "apreensão" : "apreensões"}`,
    `Veículos recuperados: **${p.veiculos}**`,
    `Operações realizadas: **${p.operacoes.length}**`,
    `Missões de inteligência concluídas: **${p.inteligencia.length}**`,
  ].join("\n");
}

function principaisOcorrencias(p: Periodo): string[] {
  if (!p.ocorrencias.length) return ["### PRINCIPAIS OCORRÊNCIAS\n_Nenhuma ocorrência registrada no período._"];
  // As mais relevantes primeiro: com preso, com apreensão, depois as demais (mais recentes).
  const peso = (o: Ocorrencia) => (o.houvePreso && o.presos?.length ? 2 : 0) + (o.apreensoes?.trim() ? 1 : 0);
  const ordem = [...p.ocorrencias].sort((a, b) => peso(b) - peso(a) || b.em - a.em);
  return [
    "### PRINCIPAIS OCORRÊNCIAS",
    ...lista(
      ordem.map((o) => {
        const extras = [
          o.apreensoes?.trim() ? `apreensão: ${caber(umaLinha(o.apreensoes), 120)}` : null,
          o.houvePreso && o.presos?.length ? `${o.presos.length} ${o.presos.length === 1 ? "preso" : "presos"} (${o.presos.map((x) => `${x.nome}, RG ${x.rg}`).join("; ")})` : null,
          o.desfecho ? caber(umaLinha(o.desfecho), 80) : null,
        ].filter(Boolean);
        return `**${md(caber(umaLinha(o.local), 60))}** — ${md(o.tipo.nome)}: ${md(caber(umaLinha(o.relato), 180))}${extras.length ? `\n-# ${md(extras.join(" · "))} · ${numeroOcorrencia(o)} · <@${o.autor.id}>` : `\n-# ${numeroOcorrencia(o)} · <@${o.autor.id}>`}`;
      }),
    ),
  ];
}

function atosInternos(cfg: RelatorioConfig, desde: number, ate: number): { texto: string; total: number } {
  const promocoes = seguro("promoções", () => promocaoStore.recentes(3_000).filter((x) => dentro(x.em, desde, ate)).reverse(), []);
  const designacoes = seguro("cargos", () => adicionarCargoStore.recentes(3_000).filter((x) => dentro(x.em, desde, ate)).reverse(), []);
  const disciplina = seguro("disciplina", () => disciplinaStore.registros().filter((x) => dentro(x.em, desde, ate)), []);
  const sets = seguro("sets", () => setStore.recentes(5_000).filter((x) => x.status === "aprovado" && dentro(x.decididoEm ?? x.em, desde, ate) && !/^(Promoção|Rebaixamento)/.test(x.motivo ?? "")), []);
  const curso = seguro("cursos", () => cursoStore.dados(), null);
  const sigla = (id: string) => curso?.cursos.find((c) => c.id === id)?.sigla ?? "Curso";
  const turmasFinalizadas = curso ? curso.turmas.filter((x) => x.status === "encerrada" && dentro(x.encerradaEm, desde, ate)) : [];
  const turmasAgendadas = curso ? curso.turmas.filter((x) => dentro(x.criadaEm, desde, ate)) : [];
  const aptos = seguro("horas", () => horasStore.alertas().filter((a) => dentro(a.em, desde, ate)), []);

  const movimentacoes = [
    ...sets.map((x) => `${md(x.apelido)} — incluído(a) no efetivo`),
    ...promocoes.filter((x) => x.modo === "rebaixamento").map((x) => `<@${x.userId}> — rebaixado(a) ${x.de?.prefixo ?? "—"} → ${x.para.prefixo}`),
    ...disciplina.filter((x) => x.tipo === "exoneracao").map((x) => `${md(x.nome)} — exonerado(a)`),
  ];
  const cursos = [
    ...turmasFinalizadas.map((x) => `${md(sigla(x.cursoId))} turma ${x.numero} concluída (${curso!.participantes.filter((p) => p.turmaId === x.id && p.status === "concluido").length} formados)`),
    ...turmasAgendadas.map((x) => `${md(sigla(x.cursoId))} turma ${x.numero} agendada${x.agendadoPara ? ` para ${fmtData(x.agendadoPara)} ${fmtHora(x.agendadoPara)}` : ""}`),
  ];
  const outras = [
    ...disciplina.filter((x) => x.tipo === "advertencia").map((x) => `${md(x.nome)} — advertência${x.nivel ? ` (${md(x.nivel.nome)})` : ""}`),
    ...disciplina.filter((x) => x.tipo === "advertencia_removida").map((x) => `${md(x.nome)} — advertência removida`),
    ...aptos.map((a) => `<@${a.userId}> — apto(a) à promoção ${a.de.prefixo} → ${a.para.prefixo}`),
  ];

  const promovidos = promocoes.filter((x) => x.modo === "promocao");
  const texto = [
    "### ATOS INTERNOS",
    `Por determinação do Comando do ${md(cfg.sigla)}, ficam registrados:`,
    "",
    `**Promoções:** ${ou(promovidos.map((x) => `<@${x.userId}> (${x.de?.prefixo ?? "—"} → ${x.para.prefixo})`))}`,
    `**Designações:** ${ou(designacoes.map((x) => `<@${x.userId}> — ${x.cargos.filter((c) => c.ok).map((c) => `<@&${c.id}>`).join(", ") || "—"}`))}`,
    `**Movimentações:** ${ou(movimentacoes)}`,
    `**Cursos e instruções:** ${ou(cursos)}`,
    `**Outras determinações:** ${ou(outras)}`,
  ].join("\n");
  return { texto: texto.length > LIMITE_BLOCO * 2 ? `${texto.slice(0, LIMITE_BLOCO * 2 - 1)}…` : texto, total: promovidos.length + designacoes.length + movimentacoes.length + cursos.length + outras.length };
}

function operacoesEfetivo(p: Periodo, desde: number, ate: number): string[] {
  const blocos: string[] = ["### OPERAÇÕES E EMPREGO DO EFETIVO"];
  if (!p.operacoes.length) blocos.push("_Nenhuma operação registrada no período._");
  for (const c of p.operacoes) {
    blocos.push(
      [
        `**Operação:** ${md(c.campos.operacao)}`,
        `**Local:** ${md(caber(umaLinha(c.campos.localOperacao || c.campos.localApresentacao || "—"), 120))}`,
        `**Frações empregadas:** ${md(caber(umaLinha(c.campos.efetivo || c.campos.emprego || "—"), 200))}`,
        `**Resultado:** ${md(caber(umaLinha(c.campos.objetivos || "—"), 240))}`,
      ].join("\n"),
    );
  }

  // Emprego do efetivo: guarnições assumidas e o bate-ponto (quem entrou, saiu e quantas horas ficou).
  const assuncoes = seguro("assunções", () => assuncaoStore.recentes(3_000).filter((r) => dentro(r.em, desde, ate)).reverse(), []);
  if (assuncoes.length) {
    blocos.push(["**Guarnições em serviço:**", ...lista(assuncoes.map((r) => `${t(r.em)} ${md(r.assuncaoNome)} · ${md(caber(r.setor, 40))} · ${md(caber(r.viatura, 30))} · cmt <@${r.comandante.id}> · ${2 + r.demais.length} PMs`))].join("\n"));
  }
  const pontos = seguro("ponto", () => pontoStore.pontos().filter((x) => dentro(x.entrada, desde, ate) || (x.status !== "aberto" && dentro(x.saida, desde, ate))), []);
  const aprovados = seguro("ponto", () => pontoStore.pontos().filter((x) => x.status === "aprovado" && dentro(x.decisao?.em, desde, ate)), []);
  const emServico = seguro("ponto", () => pontoStore.abertos().length, 0);
  const ST: Record<string, string> = { aberto: "em serviço", pendente: "aguardando aprovação", aprovado: "aprovado", reprovado: "reprovado", descartado: "descartado" };
  blocos.push(
    [
      `**Bate-ponto:** ${new Set(pontos.map((x) => x.userId)).size} policiais · ${fmtDur(aprovados.reduce((s, x) => s + dur(x), 0))} aprovadas no período · ${emServico} em serviço agora`,
      ...lista(
        pontos
          .sort((a, b) => a.entrada - b.entrada)
          .map((x) => `<@${x.userId}> · 🟢 ${t(x.entrada)}${x.saida && x.status !== "aberto" ? ` → 🔴 ${t(x.saida)}` : " → em serviço"} · **${fmtDur(dur(x))}** · ${ST[x.status] ?? x.status}`),
      ),
    ].join("\n"),
  );
  return blocos;
}

function determinacoes(cfg: RelatorioConfig): string {
  return `### DETERMINAÇÕES DO COMANDO\n${cfg.determinacoes.trim() ? md(cfg.determinacoes.trim()) : "_Sem novas determinações._"}`;
}

/** O resto do sistema (o que não está no modelo): boletins, baú, corregedoria, DOESP etc. */
function anexo(desde: number, ate: number): string[] {
  const linhas: string[] = [];
  seguro("boletins", () => {
    const bs = boletimStore.entre(desde, ate);
    if (bs.length) linhas.push(`📋 **Boletins das equipes:** ${bs.length} — ${bs.map((b) => `${numeroBoletim(b)} (${md(caber(b.equipe, 30))})`).join(", ")}`);
  }, undefined);
  seguro("baú", () => {
    const ms = arsenalStore.movimentos().filter((m) => dentro(m.em, desde, ate));
    const ICONE: Record<string, string> = { retirada: "retirou", devolucao: "devolveu", perda: "perdeu", recuperacao: "recuperou" };
    if (ms.length) linhas.push(`🗄️ **Baú:** ${ms.map((m) => `<@${m.pessoa.id}> ${ICONE[m.tipo] ?? m.tipo} ${md(m.armaNome)} \`${m.serie.replace(/`/g, "")}\``).join("; ")}`);
  }, undefined);
  seguro("inatividade", () => {
    const cs = pontoStore.casos().filter((c) => dentro(c.abertoEm, desde, ate) || dentro(c.decisao?.em, desde, ate));
    if (cs.length) linhas.push(`📉 **Inatividade:** ${cs.map((c) => `<@${c.userId}> (${c.status === "aberto" ? "em revisão" : c.status})`).join(", ")}`);
  }, undefined);
  seguro("corregedoria", () => {
    const ts = corregStore.tickets();
    const a = ts.filter((x) => dentro(x.abertoEm, desde, ate)).length;
    const f = ts.filter((x) => dentro(x.fechadoEm, desde, ate)).length;
    if (a || f) linhas.push(`🛡️ **Corregedoria:** ${a} atendimentos abertos · ${f} encerrados`);
  }, undefined);
  seguro("doesp", () => {
    const rs = doespStore.requests().filter((r) => dentro(r.createdAt, desde, ate));
    if (rs.length) linhas.push(`📄 **DOESP:** ${rs.length} requerimentos — ${rs.map((r) => `Nº ${String(r.number).padStart(3, "0")}/${r.year}`).join(", ")}`);
  }, undefined);
  seguro("entrada-saída", () => {
    const es = esStore.recentes(5_000).filter((e) => !e.bot && dentro(e.em, desde, ate));
    const ent = es.filter((e) => e.tipo === "entrada").length;
    if (es.length) linhas.push(`🚪 **Servidor:** ${ent} entraram · ${es.length - ent} saíram`);
  }, undefined);
  seguro("anúncios", () => {
    const as = anuncioStore.recentes(3_000).filter((a) => dentro(a.em, desde, ate));
    if (as.length) linhas.push(`📣 **Anúncios:** ${as.map((a) => md(caber(a.titulo, 40))).join("; ")}`);
  }, undefined);
  return linhas.length ? ["### ANEXO — DEMAIS REGISTROS DO SISTEMA", ...linhas] : [];
}

/* ---------- Montagem ---------- */

/** Junta linhas em blocos de texto que respeitam o limite (seções grandes viram vários blocos). */
function emBlocos(linhas: string[]): string[] {
  const out: string[] = [];
  let atual = "";
  for (const l of linhas) {
    if (atual && atual.length + l.length + 1 > LIMITE_BLOCO) {
      out.push(atual);
      atual = "";
    }
    atual = atual ? `${atual}\n${l.slice(0, LIMITE_BLOCO)}` : l.slice(0, LIMITE_BLOCO);
  }
  if (atual) out.push(atual);
  return out;
}

export function montarRelatorio(desde: number, ate: number, numero: string): { mensagens: MessageBody[]; vazio: boolean } {
  const cfg = boletimStore.config().relatorio;
  const p = periodo(desde, ate);
  const e = emojiLogo();
  const atos = atosInternos(cfg, desde, ate);
  const linhasAnexo = anexo(desde, ate);
  const secoes: string[][] = [
    [resumoBatalhao(cfg, p)],
    emBlocos(principaisOcorrencias(p)),
    emBlocos(atos.texto.split("\n")),
    emBlocos(operacoesEfetivo(p, desde, ate)),
    [determinacoes(cfg)],
    emBlocos(linhasAnexo),
    [`Publique-se para conhecimento do efetivo.\n\n**${md(cfg.sigla)} – PMERJ**\n${md(cfg.assinatura)}`],
  ].filter((s) => s.length);

  // "Vazio" = nada aconteceu em nenhum módulo (o modelo sairia com tudo zerado).
  const pontoVazio = seguro("ponto", () => !pontoStore.pontos().some((x) => dentro(x.entrada, desde, ate) || dentro(x.saida, desde, ate)), true);
  const assuncaoVazia = seguro("assunções", () => !assuncaoStore.recentes(3_000).some((r) => dentro(r.em, desde, ate)), true);
  const vazio = !p.ocorrencias.length && !p.operacoes.length && !p.inteligencia.length && !linhasAnexo.length && atos.total === 0 && pontoVazio && assuncaoVazia;

  // Distribui: cada bloco é um Text Display; seções separadas por divisória.
  type Item = { texto: string; divisoria: boolean };
  const itens: Item[] = secoes.flatMap((s) => s.map((texto, i) => ({ texto, divisoria: i === s.length - 1 })));
  const partes: Item[][] = [[]];
  let chars = 400;
  let comps = 8;
  for (const it of itens) {
    if (partes.at(-1)!.length && (chars + it.texto.length > LIMITE_TEXTO || comps + 2 > LIMITE_COMPONENTES)) {
      partes.push([]);
      chars = 250;
      comps = 4;
    }
    partes.at(-1)!.push(it);
    chars += it.texto.length;
    comps += 2;
  }

  const divisoria = { type: 14, divider: true, spacing: 1 };
  const periodoTxt = `${fmtHora(desde)} às ${fmtHora(ate)}${fmtData(desde) !== fmtData(ate) ? ` (desde ${fmtData(desde)})` : ""}`;
  const mensagens = partes.map((grupo, i): MessageBody => {
    const topo =
      i === 0
        ? [
            ...[
              cabecalho([
                "-# POLÍCIA MILITAR DO ESTADO DO RIO DE JANEIRO",
                `**${md(cfg.unidade)}**`,
                `## BOLETIM INTERNO ${numero}`,
                `Data: **${fmtData(ate)}** · período ${periodoTxt}`,
              ]),
            ].flat(),
            divisoria,
          ]
        : [{ type: 10, content: `## BOLETIM INTERNO ${numero} — continuação do relatório (${i + 1}/${partes.length})` }, divisoria];
    return {
      flags: FLAG_COMPONENTS_V2,
      // Todos aparecem marcados, ninguém é notificado.
      allowed_mentions: { parse: [] },
      components: [
        {
          type: 17,
          accent_color: COR,
          components: [
            ...topo,
            ...grupo.flatMap((it, j) => [{ type: 10, content: it.texto }, ...(it.divisoria && j < grupo.length - 1 ? [divisoria] : [])]),
            ...(i === partes.length - 1
              ? [{ type: 10, content: `-# ${e ? `${e} ` : ""}Boletim Interno automático · gerado ${t(Date.now(), "f")}` }]
              : [divisoria, { type: 10, content: `-# Continua na próxima mensagem (${i + 1}/${partes.length})` }]),
          ],
        },
      ],
    };
  });
  return { mensagens, vazio };
}

/**
 * Publica um período. `previa` = envio manual pelo site (não gasta número).
 * Devolve quantas mensagens saíram (0 = sem canal/falhou · -1 = pulado por estar vazio).
 */
export async function publicarRelatorio(desde: number, ate: number, previa = false): Promise<number> {
  const cfg = boletimStore.config().relatorio;
  if (!cfg.canalId) return 0;
  const ano = anoBR(ate);
  const proximo = cfg.ano === ano ? cfg.numero + 1 : 1;
  const numero = previa ? `(PRÉVIA)` : `Nº ${String(proximo).padStart(3, "0")}/${ano}`;
  const { mensagens, vazio } = montarRelatorio(desde, ate, numero);
  if (vazio && cfg.pularVazio && !previa) return -1;
  let n = 0;
  for (const [i, m] of mensagens.entries()) {
    if (!(await postMessage(cfg.canalId, m, i === 0 ? brasao() : undefined))) break;
    n++;
  }
  if (n > 0 && !previa) await boletimStore.saveConfig({ relatorio: { ...boletimStore.config().relatorio, numero: proximo, ano } });
  return n;
}

/* ---------- Agenda ---------- */

/** Fim do período atual: o último múltiplo do intervalo no relógio de Brasília (ex.: 14:00, 16:00). */
export function fimDoPeriodo(agora: number, intervaloHoras: number): number {
  const passo = intervaloHoras * HORA;
  return Math.floor((agora - OFFSET_BRT) / passo) * passo + OFFSET_BRT;
}

let rodando = false;

async function conferir(): Promise<void> {
  const c = boletimStore.config().relatorio;
  if (rodando || !c.ativo || !c.canalId) return;
  const fim = fimDoPeriodo(Date.now(), c.intervaloHoras);
  if (c.ultimoFim !== null && c.ultimoFim >= fim) return;
  rodando = true;
  try {
    // Sem relatório anterior: só o último período. Bot ficou fora: cobre o buraco (até 24 h).
    const desde = Math.max(c.ultimoFim ?? fim - c.intervaloHoras * HORA, fim - MAX_JANELA);
    await boletimStore.saveConfig({ relatorio: { ...c, ultimoFim: fim } }); // marca antes: nunca manda duas vezes
    const n = await publicarRelatorio(desde, fim);
    if (n === 0) {
      await boletimStore.saveConfig({ relatorio: { ...boletimStore.config().relatorio, ultimoFim: c.ultimoFim } }); // falhou: tenta de novo
      console.warn("[relatorio] não foi possível publicar (canal/permissões).");
    } else if (n > 0) console.info(`[relatorio] boletim ${fmtData(desde)} ${fmtHora(desde)} → ${fmtHora(fim)} publicado (${n} mensagem(ns))`);
  } finally {
    rodando = false;
  }
}

export function iniciarRelatorioSistema(): void {
  setTimeout(() => void conferir().catch((err: unknown) => console.warn("[relatorio]", err)), 90_000).unref();
  setInterval(() => void conferir().catch((err: unknown) => console.warn("[relatorio]", err)), 60_000).unref();
}
