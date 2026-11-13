import { emojiLogo } from "../branding/emoji.js";
import { FLAG_COMPONENTS_V2, type MessageBody } from "../discord/bot.js";
import { cabecalho } from "../set/brasao.js";
import { LIMITES, numeroComunicado, RASCUNHO_TTL_MS, type Campos, type Comunicado, type Rascunho } from "./store.js";

/** Todo custom_id do módulo começa com "com:". */
export const IDS = {
  novo: "com:new",
  dados: (id: string) => `com:d-dados:${id}`,
  dadosModal: (id: string) => `com:d-dados-modal:${id}`,
  detalhes: (id: string) => `com:d-det:${id}`,
  detalhesModal: (id: string) => `com:d-det-modal:${id}`,
  canal: (id: string) => `com:d-canal:${id}`,
  cargos: (id: string) => `com:d-cargos:${id}`,
  midia: (id: string) => `com:d-midia:${id}`,
  limpar: (id: string) => `com:d-clear:${id}`,
  publicar: (id: string) => `com:d-send:${id}`,
  cancelar: (id: string) => `com:d-cancel:${id}`,
};

const Estilo = { primary: 1, secondary: 2, success: 3, danger: 4 } as const;
const COR = 0xe11d48;
const linha = { type: 14, divider: true, spacing: 1 };
const texto = (content: string) => ({ type: 10, content });
const fila = (...components: unknown[]) => ({ type: 1, components });
const unix = (ms: number) => Math.floor(ms / 1000);
const botao = (label: string, customId: string, emoji: string, style: number = Estilo.secondary, disabled = false) => ({ type: 2, style, label, custom_id: customId, emoji: { name: emoji }, disabled });

export const md = (v: string) => v.replace(/([\\*_`~|>#])/g, "\\$1");
export const caber = (v: string, max: number) => (v.length > max ? `${v.slice(0, Math.max(0, max - 1)).trimEnd()}…` : v);
const rodapeOrg = () => {
  const e = emojiLogo();
  return `-# ${e ? `${e} ` : ""}41º BATALHÃO DE POLÍCIA MILITAR – PMERJ`;
};

/* ---------- Painel público ---------- */

export function painelPublico(): MessageBody {
  const e = emojiLogo();
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
              "## 📢 Comunicados de Operação",
              "Monte o comunicado da operação (data, horários, locais, efetivo e objetivo), confira a prévia e publique no canal escolhido.",
              "-# Somente quem tem permissão pode publicar.",
            ]),
          ].flat(),
          fila(botao("Gerar comunicado", IDS.novo, "📢", Estilo.danger)),
          linha,
          texto(`-# ${e ? `${e} ` : ""}PMERJ`),
        ],
      },
    ],
  };
}

/* ---------- Formulários (sem nada preenchido pelo sistema) ---------- */

const campo = (label: string, customId: string, max: number, o: { paragrafo?: boolean; placeholder?: string; descricao?: string; valor?: string | null; min?: number } = {}) => ({
  type: 18,
  label,
  ...(o.descricao ? { description: o.descricao.slice(0, 100) } : {}),
  component: {
    type: 4,
    custom_id: customId,
    style: o.paragrafo ? 2 : 1,
    required: true,
    min_length: o.min ?? 2,
    max_length: max,
    ...(o.placeholder ? { placeholder: o.placeholder.slice(0, 100) } : {}),
    // Só volta o que a PRÓPRIA pessoa já digitou (ao editar).
    ...(o.valor ? { value: o.valor.slice(0, max) } : {}),
  },
});

export const modalDados = (d: Rascunho) => ({
  custom_id: IDS.dadosModal(d.id),
  title: "📢 Dados da operação",
  components: [
    campo("Operação", "operacao", LIMITES.operacao, { placeholder: "Ex.: OPERAÇÃO LIMPEZA DO LIXO", valor: d.campos.operacao }),
    campo("Data", "data", LIMITES.data, { placeholder: "Ex.: 29/10/2026", valor: d.campos.data }),
    campo("Horário de apresentação", "horaApresentacao", LIMITES.hora, { placeholder: "Ex.: 19h00", valor: d.campos.horaApresentacao }),
    campo("Horário previsto para início", "horaInicio", LIMITES.hora, { placeholder: "Ex.: 19h30", valor: d.campos.horaInicio }),
    campo("Local de apresentação", "localApresentacao", LIMITES.local, { placeholder: "Ex.: 41º Batalhão de Polícia Militar", valor: d.campos.localApresentacao }),
  ],
});

export const modalDetalhes = (d: Rascunho) => ({
  custom_id: IDS.detalhesModal(d.id),
  title: "🔎 Objetivos e emprego",
  components: [
    campo("Local da operação", "localOperacao", LIMITES.local, { placeholder: "Ex.: a ser designado pelo Comando", valor: d.campos.localOperacao }),
    campo("Efetivo", "efetivo", LIMITES.efetivo, { paragrafo: true, placeholder: "Ex.: conforme Ordem de Operações e determinação do Comando do 41º BPM", valor: d.campos.efetivo }),
    campo("Objetivos", "objetivos", LIMITES.objetivos, {
      paragrafo: true,
      descricao: "Um objetivo por linha.",
      placeholder: "Ex.: Repressão qualificada à atividade criminosa;",
      valor: d.campos.objetivos,
    }),
    campo("Emprego operacional", "emprego", LIMITES.emprego, {
      paragrafo: true,
      descricao: "Como o efetivo será distribuído.",
      placeholder: "Ex.: O efetivo será distribuído conforme planejamento do Comando do 41º BPM...",
      valor: d.campos.emprego,
    }),
  ],
});

const DADOS: Array<keyof Campos> = ["operacao", "data", "horaApresentacao", "horaInicio", "localApresentacao"];
const DETALHES: Array<keyof Campos> = ["localOperacao", "efetivo", "objetivos", "emprego"];
export const dadosOk = (c: Campos) => DADOS.every((k) => c[k]);
export const detalhesOk = (c: Campos) => DETALHES.every((k) => c[k]);

export const comoMandarMidia = () =>
  [
    "### 📷 Fotos e vídeos do comunicado",
    "**1.** Arraste as fotos ou vídeos para o chat **deste canal** (ou toque no **+**) e envie.",
    "**2.** O sistema coleta sozinho, mostra na prévia e apaga a sua mensagem.",
    "**3.** Ao **Publicar**, eles saem junto com o comunicado.",
    "-# Até 10 arquivos. Vídeos acima do limite do servidor (até 4 min) são comprimidos e podem levar alguns minutos.",
  ].join("\n");

/* ---------- O comunicado (prévia e publicado usam o mesmo texto) ---------- */

/** Blocos de texto do comunicado no modelo oficial. `max` encurta os campos longos (prévia). */
function blocosComunicado(c: Campos, numero: string, max = 1000) {
  const v = (k: keyof Campos, lim = max) => (c[k] ? md(caber(c[k]!, lim)) : "—");
  const objetivos = (c.objetivos ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return {
    topo: [
      `## 📢 COMUNICADO DE OPERAÇÃO ${numero}`,
      `🔎 **OPERAÇÃO:** ${v("operacao")}`,
      `📅 **DATA:** ${v("data")}`,
      `🕒 **HORÁRIO DE APRESENTAÇÃO:** ${v("horaApresentacao")}`,
      `🕒 **HORÁRIO PREVISTO PARA INÍCIO:** ${v("horaInicio")}`,
      `📍 **LOCAL DE APRESENTAÇÃO:** ${v("localApresentacao")}`,
      `🔴 **LOCAL DA OPERAÇÃO:** ${v("localOperacao")}`,
      `👥 **EFETIVO:** ${v("efetivo")}`,
    ].join("\n"),
    objetivos: `### 🔎 OBJETIVOS\n${objetivos.length ? md(caber(objetivos.join("\n"), max)) : "—"}`,
    emprego: `### ⚔️ EMPREGO OPERACIONAL\n${v("emprego")}\n\nTodo o efetivo deverá apresentar-se no horário estabelecido, devidamente equipado e em condições para o serviço.`,
  };
}

const galeria = (nomes: string[]) => (nomes.length ? [{ type: 12, items: nomes.map((n) => ({ media: { url: `attachment://${n}` } })) }] : []);

/**
 * Comunicado publicado. A parte 1 leva a menção dos cargos, o texto e a 1ª leva de mídias;
 * as demais (quando as mídias não cabem numa mensagem) levam só as mídias restantes.
 */
export function mensagemComunicado(c: Comunicado, nomes: string[], parte: number, partes: number): MessageBody {
  const numero = numeroComunicado(c);
  if (parte > 1) {
    return {
      flags: FLAG_COMPONENTS_V2,
      allowed_mentions: { parse: [] },
      components: [{ type: 17, accent_color: COR, components: [texto(`### 📷 Comunicado de Operação ${numero} · mídias (${parte}/${partes})`), ...galeria(nomes)] }],
    };
  }
  const b = blocosComunicado(c.campos, numero);
  const mencao = c.cargosMencao.map((id) => `<@&${id}>`).join(" ");
  return {
    flags: FLAG_COMPONENTS_V2,
    allowed_mentions: { parse: [], roles: c.cargosMencao },
    components: [
      ...(mencao ? [texto(mencao)] : []),
      {
        type: 17,
        accent_color: COR,
        components: [...[cabecalho([b.topo])].flat(), linha, texto(b.objetivos), linha, texto(b.emprego), ...galeria(nomes), linha, texto(rodapeOrg())],
      },
    ],
  };
}

/* ---------- Painel do canal temporário ---------- */

export function painelRascunho(d: Rascunho, ocupado: boolean, fechando = false, nomesGaleria: string[] = [], proximo = "Nº ··/····"): MessageBody {
  const enviado = d.status === "SENT";
  const cancelado = d.status === "CANCELLED";
  const ok1 = dadosOk(d.campos);
  const ok2 = detalhesOk(d.campos);
  const pronto = ok1 && ok2 && Boolean(d.destinoCanalId);
  const qtd = d.midias.length;

  const etapas = [
    `${ok1 ? "✅" : "⬜"} Dados`,
    `${ok2 ? "✅" : "⬜"} Objetivos`,
    `${d.destinoCanalId ? "✅" : "⬜"} Canal`,
    `${ocupado ? "⏳" : qtd ? "✅" : "▫️"} Mídias`,
    `${enviado ? "✅" : pronto && !ocupado ? "➡️" : "⬜"} Publicar`,
  ].join("  ›  ");

  const titulo = enviado ? "## ✅ Comunicado publicado" : cancelado ? "## 🗑️ Comunicado cancelado" : "## 📢 Novo comunicado de operação";
  const cor = enviado ? 0x2bd678 : cancelado ? 0x6b7280 : ocupado ? 0xf5c542 : COR;
  const b = blocosComunicado(d.campos, proximo, 350);

  const controles = fechando
    ? []
    : [
        linha,
        texto(`### 📍 Onde publicar\n${d.destinoCanalId ? `Canal: <#${d.destinoCanalId}>` : "Escolha o canal abaixo."}`),
        fila({ type: 8, custom_id: IDS.canal(d.id), placeholder: "Selecione o canal de publicação", channel_types: [0, 5], min_values: 0, max_values: 1, default_values: d.destinoCanalId ? [{ id: d.destinoCanalId, type: "channel" }] : [] }),
        texto(`### 🔔 Mencionar cargos _(opcional)_\n-# Até ${LIMITES.mencoes} cargos são marcados acima do comunicado. O **×** do campo limpa a seleção.`),
        fila({ type: 6, custom_id: IDS.cargos(d.id), placeholder: "Selecione os cargos a mencionar", min_values: 0, max_values: LIMITES.mencoes, default_values: d.cargosMencao.map((id) => ({ id, type: "role" })) }),
        texto(`### 📷 Fotos e vídeos ${qtd ? `· ${qtd}` : "_(opcional)_"}\n${qtd ? "-# Aparecem na prévia acima." : "Mande como **mensagem aqui no canal** — o sistema coleta e apaga a sua mensagem."}`),
        ...(d.aviso ? [linha, texto(d.aviso)] : []),
        linha,
        fila(
          botao(ok1 ? "Editar dados" : "Dados da operação", IDS.dados(d.id), "📅", ok1 ? Estilo.secondary : Estilo.primary),
          botao(ok2 ? "Editar objetivos" : "Objetivos e emprego", IDS.detalhes(d.id), "🔎", ok2 ? Estilo.secondary : Estilo.primary),
          botao(qtd ? `Mídias (${qtd})` : "Mídias", IDS.midia(d.id), "📷", Estilo.secondary, ocupado),
        ),
        fila(
          botao(ocupado ? "Processando mídias…" : "Publicar comunicado", IDS.publicar(d.id), ocupado ? "⏳" : "📤", Estilo.success, !pronto || ocupado),
          ...(qtd && !ocupado ? [botao("Limpar mídias", IDS.limpar(d.id), "🧹")] : []),
          botao("Cancelar", IDS.cancelar(d.id), "🗑️", Estilo.danger),
        ),
        texto(`-# 🔒 Só você e os gestores veem este canal · ao publicar, ele é apagado · expira <t:${unix(d.criadoEm + RASCUNHO_TTL_MS)}:R>`),
      ];

  return {
    flags: FLAG_COMPONENTS_V2,
    allowed_mentions: { parse: [] },
    components: [
      {
        type: 17,
        accent_color: cor,
        components: [
          ...[cabecalho([titulo, `**Responsável:** <@${d.autor.id}>\n-# ${etapas}`])].flat(),
          linha,
          texto(`-# PRÉVIA${d.cargosMencao.length ? ` · menciona ${d.cargosMencao.map((id) => `<@&${id}>`).join(" ")}` : ""}`),
          texto(b.topo),
          texto(b.objetivos),
          texto(b.emprego),
          ...galeria(nomesGaleria),
          ...(fechando && d.aviso ? [linha, texto(d.aviso)] : []),
          ...controles,
        ],
      },
    ],
  };
}
