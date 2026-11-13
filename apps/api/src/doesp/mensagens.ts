import { emojiLogo } from "../branding/emoji.js";
import type { MessageBody } from "../discord/bot.js";
import { env } from "../env.js";
import { cabecalho } from "../set/brasao.js";
import { LIMITES_MIDIA } from "./media.js";
import { LIMITES, numeroRequerimento, type Rascunho, type Requerimento, type StatusRequerimento } from "./store.js";

/** Todo custom_id do módulo começa com "req:" (igual ao sistema do BOPE). */
export const IDS = {
  novo: "req:new",
  despachar: (id: string) => `req:dispatch:${id}`,
  indeferir: (id: string) => `req:refuse:${id}`,
  indeferirModal: (id: string) => `req:refuse-modal:${id}`,
  designar: (id: string) => `req:assign:${id}`,
  designarModal: (id: string) => `req:assign-modal:${id}`,
  resultado: (id: string) => `req:result:${id}`,
  resultadoModal: (id: string) => `req:result-modal:${id}`,
  // Canal temporário (rascunho) do novo requerimento.
  preencher: (id: string) => `req:d-edit:${id}:fill`,
  midia: (id: string) => `req:d-edit:${id}:media`,
  preencherModal: (id: string) => `req:d-modal:${id}:fill`,
  enviar: (id: string) => `req:d-send:${id}`,
  limpar: (id: string) => `req:d-clear:${id}`,
  cancelar: (id: string) => `req:d-cancel:${id}`,
};

const Estilo = { primary: 1, secondary: 2, success: 3, danger: 4 } as const;
const linha = { type: 14, divider: true, spacing: 1 };
const linhaGrande = { type: 14, divider: true, spacing: 2 };
const texto = (content: string) => ({ type: 10, content });
const unix = (ms: number) => Math.floor(ms / 1000);
const dataLonga = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "numeric", month: "long", year: "numeric" });

export const md = (v: string) => v.replace(/([\\*_`~|>#])/g, "\\$1");
export const caber = (v: string, max: number) => (v.length > max ? `${v.slice(0, Math.max(0, max - 1)).trimEnd()}…` : v);

function botao(label: string, customId: string, emoji?: string, style: number = Estilo.secondary, disabled = false) {
  return { type: 2, style, label, custom_id: customId, ...(emoji ? { emoji: { name: emoji } } : {}), disabled };
}
const fila = (...components: unknown[]) => ({ type: 1, components });

/* ---------- Painel público ("Novo requerimento") ---------- */

export function painelRequerimento(): MessageBody {
  const e = emojiLogo();
  return {
    flags: 1 << 15,
    allowed_mentions: { parse: [] },
    components: [
      {
        type: 17,
        accent_color: 0x2b7fff,
        components: [
          ...[
            cabecalho([
              "-# PMERJ · P/2 – Seção de Inteligência",
              "## 📋 Requerimento ao Comando",
              "O Chefe da Seção de Inteligência (P/2) encaminha o requerimento ao Comandante do Batalhão, por meio do modelo oficial. Após o despacho, o Comando do BPM determina o emprego dos Agentes de Inteligência da P/2, definindo o efetivo necessário, o período de atuação e as diretrizes da missão..",
            ]),
          ].flat(),
          linha,
          texto(
            [
              "### Fluxo do requerimento",
              "`1` **Chefe de Seção** — preenche e envia a solicitação",
              "`2` **Comandante** — analisa, despacha ✅ ou indefere",
              "`3` **Comandante - Designa o Efetivo e o Período.",
              "`4` **P/2** — recebe os resultados, com imagens e vídeos",
            ].join("\n"),
          ),
          linha,
          texto("🔒 **Sigilo:** o preenchimento acontece num canal temporário só seu, e o requerimento vai para o canal restrito do Comando."),
          fila(botao("Novo requerimento", IDS.novo, "📋", Estilo.primary)),
          texto(`-# ${e ? `${e} ` : ""}Abertura restrita aos Chefes de Seção – P/2`),
        ],
      },
    ],
  };
}

/* ---------- Formulários ---------- */

const campo = (label: string, customId: string, max: number, o: { paragrafo?: boolean; obrigatorio?: boolean; placeholder?: string; descricao?: string; valor?: string | null; min?: number } = {}) => ({
  type: 18,
  label,
  ...(o.descricao ? { description: o.descricao.slice(0, 100) } : {}),
  component: {
    type: 4,
    custom_id: customId,
    style: o.paragrafo ? 2 : 1,
    required: o.obrigatorio ?? true,
    ...(o.min ? { min_length: o.min } : {}),
    max_length: max,
    ...(o.placeholder ? { placeholder: o.placeholder.slice(0, 100) } : {}),
    ...(o.valor ? { value: o.valor.slice(0, max) } : {}),
  },
});

export const modalIndeferir = (r: Requerimento) => ({
  custom_id: IDS.indeferirModal(r.id),
  title: `❌ Indeferir ${numeroRequerimento(r)}`.slice(0, 45),
  components: [
    campo("Motivo do indeferimento", "reason", LIMITES.reason, {
      paragrafo: true,
      min: 5,
      descricao: "O Chefe de Seção é avisado e o motivo fica registrado no requerimento.",
      placeholder: "Ex.: demanda já atendida por outra seção / faltam elementos para o emprego",
    }),
  ],
});

export const modalDesignar = (r: Requerimento) => ({
  custom_id: IDS.designarModal(r.id),
  // O Discord limita o título a 45 caracteres: o número vai no texto de cima.
  title: "🎖️ Designar Agentes de Inteligência",
  components: [
    texto(
      [
        `**Requerimento ${numeroRequerimento(r).replace(" - ", " – ")}**`,
        "⚠️ Este formulário é de uso restrito da PMERJ. As informações inseridas possuem caráter reservado e não devem ser compartilhadas fora dos canais autorizados.",
        `-# Período solicitado pela P/2: ${md(caber(r.period, LIMITES.period))}`,
      ].join("\n"),
    ),
    campo("Agentes de Inteligência designados", "doesp", LIMITES.doesp, {
      min: 2,
      descricao: "Informe os policiais que serão empregados na missão.",
      placeholder: "Ex.: 1º SGT Silva, CB Souza, SD Almeida",
    }),
    campo("Efetivo empregado", "team", LIMITES.team, {
      paragrafo: true,
      min: 2,
      descricao: "Informe a composição ou quantidade total do efetivo autorizado.",
      placeholder: "Ex.: 1 SGT, 1 CB e 2 SD",
    }),
    campo("Período de emprego", "period", LIMITES.period, {
      min: 2,
      descricao: "Informe o período autorizado para atuação dos agentes.",
      placeholder: "Ex.: 29/11/2026, das 20h às 23h",
    }),
  ],
});

/** "Encaminhar resultados à P/2": só o texto (as mídias foram anexadas na abertura). */
export const modalResultado = (r: Requerimento) => ({
  custom_id: IDS.resultadoModal(r.id),
  title: `🏁 Resultados · ${numeroRequerimento(r).replace(" - P/2", "")}`.slice(0, 45),
  components: [
    campo("Resultados obtidos", "result", LIMITES.result, {
      paragrafo: true,
      min: 5,
      descricao: `Sobre: ${caber(r.subject, 85)}`,
      placeholder: "Informações obtidas, verificadas ou atualizadas.",
    }),
  ],
});

/** Todos os campos do requerimento num formulário só (o Discord aceita 5: exatamente estes). */
export function modalPreencher(d: Rascunho) {
  const v = d.fields;
  return {
    custom_id: IDS.preencherModal(d.id),
    title: "📋 Requerimento ao Comando",
    components: [
      campo("Fato, ocorrência ou situação de interesse", "fact", LIMITES.fact, {
        paragrafo: true,
        min: 3,
        descricao: "O que motivou o pedido. Abre o texto do requerimento.",
        placeholder: "Ex.: aumento de roubos de veículos na região do Complexo X",
        valor: v.fact,
      }),
      campo("Objeto do levantamento", "subject", LIMITES.subject, {
        paragrafo: true,
        min: 3,
        descricao: "Sobre o que se quer ampliar as informações.",
        placeholder: "Ex.: movimentação de suspeitos e possíveis pontos de apoio",
        valor: v.subject,
      }),
      campo("Informações a confirmar", "information", LIMITES.information, {
        paragrafo: true,
        min: 3,
        descricao: "De forma objetiva: o que a inteligência deve verificar.",
        placeholder: "Ex.: horários de maior circulação e rotas de fuga utilizadas",
        valor: v.information,
      }),
      campo("I – Área de interesse", "area", LIMITES.area, { min: 2, descricao: "Região ou área geral do emprego.", placeholder: "Ex.: Zona Norte — entorno do Complexo X", valor: v.area }),
      campo("II – Período estimado", "period", LIMITES.period, { min: 2, descricao: "Data, horário ou duração.", placeholder: "Ex.: 29/09, das 20h às 23h", valor: v.period }),
    ],
  };
}

export const faltando = (d: Rascunho) => {
  const v = d.fields;
  return v.fact && v.subject && v.information && v.area && v.period ? [] : ["Preencher"];
};

/** Resposta do botão Imagem/Vídeo: os arquivos são mandados como mensagem no canal temporário. */
export const comoAnexar = () =>
  [
    "### 📷 Como anexar fotos e vídeos",
    "**1.** Arraste os arquivos para o chat deste canal (ou toque no **+**) e envie. Pode mandar vários de uma vez.",
    "**2.** Também vale colar links: YouTube (não listado), Drive, Streamable…",
    "**3.** O sistema coleta sozinho, mostra no painel e apaga a sua mensagem.",
    "-# Vídeos acima de 10 MB (até 4 min) são comprimidos e podem levar alguns minutos — o **Enviar** libera quando terminar. Vídeos maiores: use link.",
  ].join("\n");

function rotuloLink(url: string, i: number) {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    // Link já validado; mantém o rótulo simples.
  }
  return caber(`Abrir link ${i + 1}${host ? ` · ${host}` : ""}`, 80);
}

/** Galeria dos arquivos anexados (pelos nomes) e uma linha de botões de link. */
function blocoMidia(nomes: string[], links: string[]) {
  return [
    ...(nomes.length ? [{ type: 12, items: nomes.map((n) => ({ media: { url: `attachment://${n}` } })) }] : []),
    ...(links.length ? [fila(...links.map((url, i) => ({ type: 2, style: 5, label: rotuloLink(url, i), url })))] : []),
  ];
}

/**
 * Painel do canal temporário. `galeria`: nomes das mídias anexadas a esta mensagem.
 * `fechando`: enviado ou cancelado (sem botões). A logo vai anexada junto (attachment://).
 */
export function painelRascunho(d: Rascunho, ocupado: boolean, fechando = false, galeria: string[] = []): MessageBody {
  const v = d.fields;
  const pronto = faltando(d).length === 0;
  const qtd = d.media.length + d.links.length;
  const enviado = d.status === "SENT";
  const cancelado = d.status === "CANCELLED";

  const etapas = [
    `${pronto ? "✅" : "⬜"} Preencher`,
    `${ocupado ? "⏳" : qtd ? "✅" : "▫️"} Fotos e vídeos`,
    `${enviado ? "✅" : pronto && !ocupado ? "➡️" : "⬜"} Enviar`,
  ].join("  ›  ");

  const bloco = (rotulo: string, valor: string | undefined, max: number) => (valor ? `**${rotulo}**\n> ${md(caber(valor, max)).replace(/\n/g, "\n> ")}` : null);
  const informacoes =
    pronto || v.fact
      ? [
          bloco("Fato, ocorrência ou situação", v.fact, 300),
          bloco("Objeto do levantamento", v.subject, 250),
          bloco("Informações a confirmar", v.information, 400),
          [v.area ? `**I – Área de interesse:** ${md(v.area)}` : null, v.period ? `**II – Período estimado:** ${md(v.period)}` : null].filter(Boolean).join("\n") || null,
        ]
          .filter(Boolean)
          .join("\n")
      : "Nada preenchido ainda. Toque em **✏️ Preencher** para abrir o formulário com os 5 campos do modelo oficial.";

  const escondidos = d.media.length - galeria.length;
  const midias = [
    `### 2 · Fotos e vídeos ${qtd ? `· ${d.media.length} arquivo(s)${d.links.length ? `, ${d.links.length} link(s)` : ""}` : "_(opcional)_"}`,
    qtd ? null : fechando ? "-# Nenhuma mídia anexada." : "Mande as fotos e vídeos **como mensagem aqui no canal** — arraste o arquivo ou cole o link do YouTube/Drive.",
    escondidos > 0 ? `-# ${escondidos} arquivo(s) não aparecem aqui pelo limite de envio do servidor, mas vão junto ao enviar.` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const titulo = enviado ? "## ✅ Requerimento enviado" : cancelado ? "## 🗑️ Preenchimento cancelado" : "## 📋 Novo requerimento ao Comando";
  const cor = enviado ? 0x2bd678 : cancelado ? 0x6b7280 : ocupado ? 0xf5c542 : 0x2b7fff;

  const acoes = fechando
    ? []
    : [
        linha,
        fila(
          botao(pronto ? "Editar informações" : "Preencher", IDS.preencher(d.id), "✏️", pronto ? Estilo.secondary : Estilo.primary),
          botao(ocupado ? "Processando mídias…" : "Enviar requerimento", IDS.enviar(d.id), ocupado ? "⏳" : "📤", Estilo.success, !pronto || ocupado),
        ),
        fila(
          botao(qtd ? `Fotos e vídeos (${qtd})` : "Como anexar fotos/vídeos", IDS.midia(d.id), "📷", Estilo.secondary, ocupado),
          ...(qtd && !ocupado ? [botao("Limpar mídias", IDS.limpar(d.id), "🧹")] : []),
          botao("Cancelar", IDS.cancelar(d.id), "🗑️", Estilo.danger),
        ),
        texto(`-# 🔒 Só você e os gestores veem este canal · ao enviar, ele é apagado · expira <t:${unix(d.createdAt + 6 * 3_600_000)}:R>`),
      ];

  return {
    flags: 1 << 15,
    allowed_mentions: { parse: [] },
    components: [
      {
        type: 17,
        accent_color: cor,
        components: [
          ...[cabecalho([titulo, `**Responsável:** <@${d.author.id}>\n-# ${etapas}`])].flat(),
          linha,
          texto(`### 1 · Informações ${pronto ? "✅" : "⏳"}\n${informacoes}`),
          linha,
          texto(midias),
          ...blocoMidia(galeria, d.links.slice(0, 5)),
          ...(d.notice ? [linha, texto(d.notice)] : []),
          ...acoes,
        ],
      },
    ],
  };
}

/* ---------- O requerimento (modelo oficial) com status e botões ---------- */

const STATUS: Record<StatusRequerimento, { emoji: string; label: string; cor: number }> = {
  AGUARDANDO: { emoji: "🟡", label: "Aguardando despacho do Comandante do BPM", cor: 0xf5c542 },
  DEFERIDO: { emoji: "✅", label: "DESPACHADO — AGUARDANDO DESIGNAÇÃO DO DOESP", cor: 0x2bd678 },
  EM_EXECUCAO: { emoji: "🔵", label: "DOESP DESIGNADO — EM EXECUÇÃO", cor: 0x3b82f6 },
  CONCLUIDO: { emoji: "🏁", label: "CONCLUÍDO — RESULTADOS ENCAMINHADOS À P/2", cor: 0x2bd678 },
  INDEFERIDO: { emoji: "❌", label: "INDEFERIDO", cor: 0xef5350 },
};

/**
 * Painel(is) V2 publicados no canal dos resultados: só as imagens/vídeos anexados na abertura.
 * O primeiro leva também os links (YouTube, Drive…) e o botão de volta ao requerimento.
 */
export function mensagemMidia(r: Requerimento, nomes: string[], parte: number, partes: number, urlRequerimento: string | null): MessageBody {
  const primeira = parte === 1;
  const links = primeira ? r.requestLinks.slice(0, urlRequerimento ? 4 : 5) : [];
  const botoes = [
    ...links.map((url, i) => ({ type: 2, style: 5, label: rotuloLink(url, i), url })),
    ...(primeira && urlRequerimento ? [{ type: 2, style: 5, label: "Abrir requerimento", url: urlRequerimento }] : []),
  ];
  const cab = [
    primeira ? "-# PMERJ · P/2 – Seção de Inteligência · DOESP" : null,
    `### 📎 Imagens e vídeos · ${numeroRequerimento(r)}${partes > 1 ? ` (${parte}/${partes})` : ""}`,
    primeira ? `-# ${md(caber(r.subject, 200))}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return {
    flags: 1 << 15,
    allowed_mentions: { parse: [] },
    components: [{ type: 17, accent_color: STATUS[r.status].cor, components: [texto(cab), ...blocoMidia(nomes, []), ...(botoes.length ? [fila(...botoes)] : [])] }],
  };
}

/**
 * Texto do campo do modal dentro de uma frase: exatamente o que a pessoa escreveu, só sem a pontuação
 * final (a frase já tem a sua) e com as linhas unidas por vírgula. Nada é acrescentado.
 */
function noTexto(v: string | null | undefined, max: number) {
  const unido = (v ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/[.,;:]+$/, "").trim())
    .filter(Boolean)
    .join(", ");
  return md(caber(unido, max));
}

export function mensagemRequerimento(r: Requerimento, mencionarCargos: string[] = []): MessageBody {
  const st = STATUS[r.status];
  const quem = (p: { id: string } | null) => (p ? `<@${p.id}>` : "—");
  const quando = (ms: number) => `<t:${unix(ms)}:f>`;
  const numero = numeroRequerimento(r).replace(" - ", " – ");

  const cab = [
    "-# POLÍCIA MILITAR DO ESTADO DO RIO DE JANEIRO",
    "-# 41º BATALHÃO DE POLÍCIA MILITAR",
    "-# P/2 – SEÇÃO DE INTELIGÊNCIA",
    `## 📋 REQUERIMENTO INTERNO ${numero}`,
    "Ao Senhor Comandante do 41º Batalhão de Polícia Militar",
    "",
    "Assunto: Solicitação de emprego de Agentes de Inteligência da P/2",
  ].join("\n");

  const corpo = (max: number) =>
    [
      "Senhor Comandante,",
      "",
      `O Chefe da P/2 – Seção de Inteligência, no exercício de suas atribuições de assessoramento ao Comando, vem requerer autorização para o emprego de Agentes de Inteligência da própria Seção, destinados às atividades de obtenção, verificação e confirmação de informações relacionadas à ${noTexto(r.fact, max)}.`,
      "",
      `A solicitação decorre da necessidade de ampliar os elementos disponíveis acerca de ${noTexto(r.subject, max)}, especialmente quanto à ${noTexto(r.information, max)}, com a finalidade de subsidiar a produção de conhecimento de inteligência e o posterior processo decisório do Comando.`,
    ].join("\n");

  const parametros = (max: number) =>
    [
      "O emprego requerido deverá observar os seguintes parâmetros:",
      "",
      `I – Área de interesse: ${noTexto(r.area, max)};`,
      "",
      `II – Período estimado: ${noTexto(r.period, max)};`,
      "",
      "III – Objetivo: obter, verificar, confirmar e atualizar informações de interesse institucional relacionadas aos fatos apresentados;",
      "",
      "IV – Efetivo solicitado: conforme quantitativo autorizado pelo Comando do BPM;",
      "",
      "V – Coordenação: a atividade será organizada, coordenada e controlada pelo Chefe da P/2, observadas as diretrizes estabelecidas pelo Comandante do Batalhão;",
      "",
      "VI – Limites de atuação: os Agentes de Inteligência deverão atuar exclusivamente dentro das determinações autorizadas pelo Comando, observando a legislação aplicável, os regulamentos institucionais, a preservação do sigilo e a segurança do efetivo empregado;",
      "",
      "VII – Resultado: ao término da missão, os dados e informações obtidos serão encaminhados ao Chefe da P/2 para análise, avaliação, consolidação e produção do respectivo Relatório de Inteligência, destinado ao assessoramento do Comando.",
    ].join("\n");

  const fecho = [
    "A P/2 – Seção de Inteligência permanecerá responsável pela definição das necessidades de informação, pelo planejamento da atividade de inteligência e pelo tratamento, análise e consolidação dos dados obtidos.",
    "",
    "Autorizado o emprego pelo Comandante do Batalhão, caberá ao Chefe da P/2 organizar, coordenar e controlar a atuação dos Agentes de Inteligência designados.",
    "",
    "Requer-se:",
    "",
    "a) autorização para o emprego dos Agentes de Inteligência da P/2;",
    "b) definição do efetivo a ser empregado;",
    "c) definição do período de atuação;",
    "d) autorização das diretrizes gerais da missão; e",
    "e) apresentação do resultado da atividade ao Comando, após análise e consolidação pela P/2.",
    "",
    "Termos em que,",
    "pede deferimento.",
    "",
    `Rio de Janeiro, ${dataLonga.format(r.createdAt)}.`,
    "",
    `Chefe da P/2 – Seção de Inteligência\n${quem(r.requester)}`,
  ].join("\n");

  const citar = (v: string, max: number) => `> ${md(caber(v, max)).replace(/\n/g, "\n> ")}`;
  const designados = [r.doesp, r.team].filter(Boolean).map((v) => md(caber(v!, 150))).join(" · ");
  const andamento = (maxResultado: number) =>
    [
      r.status === "AGUARDANDO" ? `${st.emoji} ${st.label}` : null,
      r.dispatchedAt && r.status !== "INDEFERIDO" ? `✅ Despachado pelo Comandante do BPM — ${quem(r.dispatchedBy)}, ${quando(r.dispatchedAt)}` : null,
      r.status === "INDEFERIDO" && r.dispatchedAt ? `❌ Indeferido pelo Comandante do BPM — ${quem(r.dispatchedBy)}, ${quando(r.dispatchedAt)}\n${citar(r.refusedReason ?? "", LIMITES.reason)}` : null,
      r.assignedAt ? `🎖️ Agentes de Inteligência designados pelo Comando — ${quem(r.assignedBy)}, ${quando(r.assignedAt)}${designados ? `\n-# ${designados}` : ""}` : null,
      r.assignedAt && r.assignedPeriod ? `⏱️ Período autorizado: ${md(r.assignedPeriod)}` : null,
      r.resultAt
        ? `🏁 Missão concluída\n📑 Resultados encaminhados ao Chefe da P/2 para análise e consolidação — ${quem(r.resultBy)}, ${quando(r.resultAt)}\n${citar(r.result ?? "", maxResultado)}${(r.result ?? "").length > maxResultado ? "\n-# Texto completo no painel web (DOESP)." : ""}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

  const passos: Record<StatusRequerimento, Array<{ dica: string; fila: unknown }>> = {
    AGUARDANDO: [
      {
        fila: fila(botao("Despachar", IDS.despachar(r.id), "✅", Estilo.success), botao("Indeferir", IDS.indeferir(r.id), "❌", Estilo.danger)),
        dica: "-# Comandante: **Despachar** autoriza o emprego e passa para a designação dos agentes.",
      },
    ],
    DEFERIDO: [{ fila: fila(botao("Designar agentes", IDS.designar(r.id), "🎖️", Estilo.primary)), dica: "-# Comando: designe os Agentes de Inteligência, o efetivo e o período." }],
    EM_EXECUCAO: [{ fila: fila(botao("Encaminhar resultados à P/2", IDS.resultado(r.id), "🏁", Estilo.success)), dica: "-# Ao término da missão, encaminhe os resultados ao Chefe da P/2." }],
    CONCLUIDO: [],
    INDEFERIDO: [],
  };

  // O Discord recusa mensagem acima de 4000 caracteres: encolhe primeiro o resultado, depois os campos longos.
  const mencao = mencionarCargos.map((id) => `<@&${id}>`).join(" ");
  const dicas = passos[r.status].map((p) => p.dica).join("");
  let maxValor: number = LIMITES.information;
  let maxResultado: number = LIMITES.result;
  for (const [mv, mr] of [
    [LIMITES.information, LIMITES.result],
    [LIMITES.information, 400],
    [LIMITES.information, 150],
    [200, 150],
    [120, 80],
    [70, 60],
  ] as const) {
    maxValor = mv;
    maxResultado = mr;
    if ([mencao, cab, corpo(mv), parametros(mv), fecho, andamento(mr), dicas].join("").length <= 3950) break;
  }

  return {
    flags: 1 << 15,
    allowed_mentions: { parse: [], roles: mencionarCargos },
    components: [
      ...(mencao ? [texto(mencao)] : []),
      {
        type: 17,
        accent_color: st.cor,
        components: [
          texto(cab),
          linha,
          texto(corpo(maxValor)),
          linha,
          texto(parametros(maxValor)),
          linha,
          texto(fecho),
          linhaGrande,
          texto(andamento(maxResultado)),
          ...(r.resultChannelId && r.resultMessageId
            ? [fila({ type: 2, style: 5, label: "Ver imagens e vídeos", url: `https://discord.com/channels/${env.DISCORD_GUILD_ID}/${r.resultChannelId}/${r.resultMessageId}` })]
            : []),
          ...passos[r.status].flatMap((p) => [p.fila, texto(p.dica)]),
        ],
      },
    ],
  };
}

export { LIMITES_MIDIA };
