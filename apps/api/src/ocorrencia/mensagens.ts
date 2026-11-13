import { emojiLogo } from "../branding/emoji.js";
import { FLAG_COMPONENTS_V2, type MessageBody } from "../discord/bot.js";
import { cabecalho } from "../set/brasao.js";
import { LIMITES, numeroOcorrencia, RASCUNHO_TTL_MS, type Ocorrencia, type Preso, type Rascunho, type TipoOcorrencia } from "./store.js";

/** Todo custom_id do módulo começa com "oc:". */
export const IDS = {
  novo: "oc:new",
  novoModal: "oc:new-modal",
  preencher: (id: string) => `oc:d-fill:${id}`,
  preencherModal: (id: string) => `oc:d-modal:${id}`,
  participantes: (id: string) => `oc:d-part:${id}`,
  houvePreso: (id: string) => `oc:d-preso:${id}`,
  presoNovo: (id: string) => `oc:d-padd:${id}`,
  presoModal: (id: string) => `oc:d-pmodal:${id}`,
  presoRemover: (id: string) => `oc:d-prem:${id}`,
  evidencias: (id: string) => `oc:d-evid:${id}`,
  limpar: (id: string) => `oc:d-clear:${id}`,
  enviar: (id: string) => `oc:d-send:${id}`,
  cancelar: (id: string) => `oc:d-cancel:${id}`,
};

const Estilo = { primary: 1, secondary: 2, success: 3, danger: 4 } as const;
const linha = { type: 14, divider: true, spacing: 1 };
const texto = (content: string) => ({ type: 10, content });
const fila = (...components: unknown[]) => ({ type: 1, components });
const unix = (ms: number) => Math.floor(ms / 1000);
const botao = (label: string, customId: string, emoji: string, style: number = Estilo.secondary, disabled = false) => ({ type: 2, style, label, custom_id: customId, emoji: { name: emoji }, disabled });

export const md = (v: string) => v.replace(/([\\*_`~|>#])/g, "\\$1");
export const caber = (v: string, max: number) => (v.length > max ? `${v.slice(0, Math.max(0, max - 1)).trimEnd()}…` : v);
const citar = (v: string, max: number) => `> ${md(caber(v, max)).replace(/\n/g, "\n> ")}`;
const rotuloTipo = (t: Pick<TipoOcorrencia, "nome" | "emoji">) => `${t.emoji ? `${t.emoji} ` : ""}${t.nome}`;
const mencoes = (ids: string[]) => (ids.length ? ids.map((id) => `<@${id}>`).join(", ") : "_nenhum_");

/** Emoji de opção do select: unicode ou customizado (<:nome:id>). */
function emojiOpcao(e: string) {
  const custom = /^<(a?):(\w{2,32}):(\d{17,20})>$/.exec(e.trim());
  if (custom) return { id: custom[3], name: custom[2], animated: custom[1] === "a" };
  return e.trim() && e.trim().length <= 8 ? { name: e.trim() } : undefined;
}

/* ---------- Painel público ---------- */

export function painelPublico(tipos: TipoOcorrencia[]): MessageBody {
  const e = emojiLogo();
  const lista = tipos.length ? tipos.map((t) => `${t.emoji || "▫️"} ${md(t.nome)}`).join("\n") : "_Nenhum tipo cadastrado ainda._";
  return {
    flags: FLAG_COMPONENTS_V2,
    allowed_mentions: { parse: [] },
    components: [
      {
        type: 17,
        accent_color: 0xe10600,
        components: [
          ...[
            cabecalho([
              "-# POLÍCIA MILITAR DO ESTADO DO RIO DE JANEIRO",
              "## 🚨 Registro de Ocorrência",
              "Registre aqui toda ocorrência atendida em serviço: relato, participantes e evidências fotográficas.",
            ]),
          ].flat(),
          linha,
          texto(`### Tipos de ocorrência\n${lista}`),
          linha,
          texto(
            [
              "### Como registrar",
              "`1` Toque em **Registrar ocorrência** e escolha o tipo",
              "`2` No canal temporário, preencha **o que houve** e marque os **participantes**",
              "`3` Responda se **houve preso** — se sim, informe o **nome** e o **RG (ID na cidade)** de cada um",
              "`4` Mande as **fotos das evidências** no próprio canal",
              "`5` Toque em **Enviar** — o registro sai completo para o Comando",
            ].join("\n"),
          ),
          fila(botao("Registrar ocorrência", IDS.novo, "🚨", Estilo.danger, tipos.length === 0)),
          texto(`-# ${e ? `${e} ` : ""}O canal temporário é só seu e é apagado ao enviar ou cancelar.`),
        ],
      },
    ],
  };
}

/* ---------- Formulários ---------- */

/** Modal com o select do tipo (Label + String Select dentro do modal). */
export const modalTipo = (tipos: TipoOcorrencia[]) => ({
  custom_id: IDS.novoModal,
  title: "🚨 Registrar ocorrência",
  components: [
    {
      type: 18,
      label: "Qual é a ocorrência?",
      description: "Depois disso, um canal temporário é aberto só para você.",
      component: {
        type: 3,
        custom_id: "tipo",
        placeholder: "Selecione o tipo de ocorrência",
        min_values: 1,
        max_values: 1,
        required: true,
        options: tipos.slice(0, LIMITES.tipos).map((t) => {
          const emoji = emojiOpcao(t.emoji);
          return { label: caber(t.nome, 100), value: t.id, ...(t.descricao ? { description: caber(t.descricao, 100) } : {}), ...(emoji ? { emoji } : {}) };
        }),
      },
    },
  ],
});

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

export function modalRelato(d: Rascunho) {
  const v = d.relato;
  return {
    custom_id: IDS.preencherModal(d.id),
    title: caber(`${d.tipo.emoji ? `${d.tipo.emoji} ` : ""}${d.tipo.nome}`, 45),
    components: [
      campo("Local", "local", LIMITES.local, { min: 2, placeholder: "Ex.: Av. Brasil, altura da Penha", valor: v.local }),
      campo("Data e horário", "quando", LIMITES.quando, { min: 2, placeholder: "Ex.: 13/11 às 21:40", valor: v.quando }),
      campo("O que houve", "relato", LIMITES.relato, {
        paragrafo: true,
        min: 10,
        descricao: "Relato objetivo da ocorrência, do início ao desfecho.",
        placeholder: "Ex.: Durante patrulhamento, a guarnição avistou...",
        valor: v.relato,
      }),
      campo("Apreensões / material", "apreensoes", LIMITES.apreensoes, { paragrafo: true, obrigatorio: false, placeholder: "Ex.: 1 pistola 9mm, 32 papelotes. Deixe vazio se não houve.", valor: v.apreensoes }),
      campo("Desfecho / encaminhamento", "desfecho", LIMITES.desfecho, { obrigatorio: false, placeholder: "Ex.: Conduzido à 22ª DP", valor: v.desfecho }),
    ],
  };
}

export const relatoCompleto = (d: Rascunho) => Boolean(d.relato.local && d.relato.quando && d.relato.relato);

/** "Houve preso?" respondido (e, se sim, com pelo menos um preso informado). */
export const presosCompletos = (d: Rascunho) => d.houvePreso === false || (d.houvePreso === true && d.presos.length > 0);

/** Formulário de um preso: nome, RG (ID na cidade) e o Discord dele (opcional). */
export function modalPreso(d: Rascunho) {
  return {
    custom_id: IDS.presoModal(d.id),
    title: `🔗 Preso ${d.presos.length + 1}`,
    components: [
      campo("Nome do preso", "nome", LIMITES.presoNome, { min: 2, placeholder: "Ex.: João da Silva" }),
      campo("RG (ID na cidade)", "rg", LIMITES.presoRg, { placeholder: "Ex.: 12345", descricao: "O ID do personagem na cidade." }),
      {
        type: 18,
        label: "Discord do preso",
        description: "Opcional: selecione a pessoa, se ela estiver no servidor.",
        component: { type: 5, custom_id: "discord", placeholder: "Selecione o membro (opcional)", min_values: 0, max_values: 1, required: false },
      },
    ],
  };
}

/** "**João da Silva** · RG `12345` · @fulano" */
export const linhaPreso = (x: Preso) => `**${md(x.nome)}** · RG \`${x.rg.replace(/`/g, "")}\`${x.discordId ? ` · <@${x.discordId}>` : ""}`;

export const comoMandarEvidencias = () =>
  [
    "### 📷 Como mandar as evidências",
    "**1.** Arraste as fotos para o chat **deste canal** (ou toque no **+**) e envie. Pode mandar várias de uma vez.",
    "**2.** O sistema coleta sozinho, mostra no painel e apaga a sua mensagem.",
    "**3.** Ao **Enviar**, as fotos vão junto com o relato no canal das ocorrências.",
    "-# Até 10 arquivos (PNG, JPG, WEBP, GIF; vídeos MP4/MOV/WEBM de até 4 min também são aceitos).",
  ].join("\n");

/* ---------- Painel do canal temporário ---------- */

/** `galeria`: nomes das evidências anexadas a esta mensagem. `fechando`: enviado/cancelado (sem controles). */
export function painelRascunho(d: Rascunho, ocupado: boolean, fechando = false, galeria: string[] = []): MessageBody {
  const v = d.relato;
  const pronto = relatoCompleto(d);
  const enviado = d.status === "SENT";
  const cancelado = d.status === "CANCELLED";
  const qtd = d.midias.length;

  const etapas = [
    `${pronto ? "✅" : "⬜"} Relato`,
    `${d.participantes.length ? "✅" : "▫️"} Participantes`,
    `${presosCompletos(d) ? "✅" : "⬜"} Presos`,
    `${ocupado ? "⏳" : qtd ? "✅" : "▫️"} Evidências`,
    `${enviado ? "✅" : pronto && presosCompletos(d) && !ocupado ? "➡️" : "⬜"} Enviar`,
  ].join("  ›  ");

  const relato = v.relato
    ? [
        `**📍 Local:** ${md(v.local ?? "—")}  ·  **🕒 Quando:** ${md(v.quando ?? "—")}`,
        `**📝 O que houve**\n${citar(v.relato, 900)}`,
        v.apreensoes ? `**📦 Apreensões:** ${md(caber(v.apreensoes, 300))}` : null,
        v.desfecho ? `**🏁 Desfecho:** ${md(v.desfecho)}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    : "Nada preenchido ainda. Toque em **✏️ Preencher relato**.";

  const escondidas = qtd - galeria.length;
  const evidencias = [
    `### 4 · Evidências ${qtd ? `· ${qtd} arquivo(s)` : "_(opcional)_"}`,
    qtd ? null : fechando ? "-# Nenhuma evidência anexada." : "Mande as fotos **como mensagem aqui no canal** — o sistema coleta e apaga a sua mensagem.",
    escondidas > 0 ? `-# ${escondidas} arquivo(s) não aparecem aqui pelo limite de envio do servidor, mas vão junto ao enviar.` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const titulo = enviado ? "## ✅ Ocorrência enviada" : cancelado ? "## 🗑️ Registro cancelado" : `## ${d.tipo.emoji || "🚨"} ${md(d.tipo.nome)}`;
  const cor = enviado ? 0x2bd678 : cancelado ? 0x6b7280 : ocupado ? 0xf5c542 : 0xe10600;

  const participantes = fechando
    ? [texto(`### 2 · Participantes\n${mencoes(d.participantes)}`)]
    : [
        texto(`### 2 · Participantes ${d.participantes.length ? `· ${d.participantes.length}` : "_(opcional)_"}\n-# Selecione abaixo quem participou. O **×** do campo limpa a seleção.`),
        fila({
          type: 5,
          custom_id: IDS.participantes(d.id),
          placeholder: "Selecione os policiais que participaram",
          min_values: 0,
          max_values: LIMITES.participantes,
          default_values: d.participantes.map((id) => ({ id, type: "user" })),
        }),
      ];

  const presosTexto = [
    `### 3 · Presos ${d.houvePreso === null ? "⏳ _(obrigatório)_" : d.houvePreso ? `· ${d.presos.length}` : "· não houve"}`,
    d.houvePreso === null ? "Responda abaixo: **teve alguém preso** nesta ocorrência?" : null,
    d.houvePreso && d.presos.length ? d.presos.map((x, i) => `\`${i + 1}\` ${linhaPreso(x)}`).join("\n") : null,
    d.houvePreso && !d.presos.length ? "⚠️ Toque em **Adicionar preso** e informe o nome e o RG (ID na cidade)." : null,
  ]
    .filter(Boolean)
    .join("\n");
  const presos = fechando
    ? [texto(d.houvePreso ? `### 3 · Presos · ${d.presos.length}\n${d.presos.map(linhaPreso).join("\n") || "_nenhum_"}` : "### 3 · Presos\n-# Não houve presos.")]
    : [
        texto(presosTexto),
        fila({
          type: 3,
          custom_id: IDS.houvePreso(d.id),
          placeholder: "Teve alguém preso? (Sim ou Não)",
          min_values: 1,
          max_values: 1,
          options: [
            { label: "Sim, houve preso", value: "sim", emoji: { name: "🔗" }, default: d.houvePreso === true },
            { label: "Não houve preso", value: "nao", emoji: { name: "✖️" }, default: d.houvePreso === false },
          ],
        }),
        ...(d.houvePreso
          ? [
              fila(botao(d.presos.length ? "Adicionar outro preso" : "Adicionar preso", IDS.presoNovo(d.id), "➕", d.presos.length ? Estilo.secondary : Estilo.primary, d.presos.length >= LIMITES.presos)),
              ...(d.presos.length
                ? [
                    fila({
                      type: 3,
                      custom_id: IDS.presoRemover(d.id),
                      placeholder: "Remover um preso da lista…",
                      min_values: 1,
                      max_values: 1,
                      options: d.presos.map((x, i) => ({ label: caber(`${i + 1}. ${x.nome}`, 100), value: x.id, description: caber(`RG ${x.rg}`, 100) })),
                    }),
                  ]
                : []),
            ]
          : []),
      ];

  const acoes = fechando
    ? []
    : [
        linha,
        fila(
          botao(pronto ? "Editar relato" : "Preencher relato", IDS.preencher(d.id), "✏️", pronto ? Estilo.secondary : Estilo.primary),
          botao(qtd ? `Evidências (${qtd})` : "Evidências", IDS.evidencias(d.id), "📷", Estilo.secondary, ocupado),
          ...(qtd && !ocupado ? [botao("Limpar evidências", IDS.limpar(d.id), "🧹")] : []),
        ),
        fila(
          botao(ocupado ? "Processando evidências…" : "Enviar ocorrência", IDS.enviar(d.id), ocupado ? "⏳" : "📤", Estilo.success, !pronto || !presosCompletos(d) || ocupado),
          botao("Cancelar", IDS.cancelar(d.id), "🗑️", Estilo.danger),
        ),
        texto(`-# 🔒 Só você e os gestores veem este canal · ao enviar, ele é apagado · expira <t:${unix(d.criadoEm + RASCUNHO_TTL_MS)}:R>`),
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
          texto(`### 1 · Relato ${pronto ? "✅" : "⏳"}\n${relato}`),
          linha,
          ...participantes,
          linha,
          ...presos,
          linha,
          texto(evidencias),
          ...(galeria.length ? [{ type: 12, items: galeria.map((n) => ({ media: { url: `attachment://${n}` } })) }] : []),
          ...(d.aviso ? [linha, texto(d.aviso)] : []),
          ...acoes,
        ],
      },
    ],
  };
}

/* ---------- Ocorrência publicada (canal das ocorrências) ---------- */

/**
 * Painel V2 da ocorrência. A parte 1 leva tudo (relato, participantes) e a 1ª leva de evidências;
 * as demais partes (se as fotos não couberem numa mensagem) levam só as fotos restantes.
 */
export function mensagemOcorrencia(o: Ocorrencia, galeria: string[], parte: number, partes: number): MessageBody {
  const e = emojiLogo();
  const galeriaBloco = galeria.length ? [{ type: 12, items: galeria.map((n) => ({ media: { url: `attachment://${n}` } })) }] : [];
  const sufixo = partes > 1 ? ` (${parte}/${partes})` : "";

  if (parte > 1) {
    return {
      flags: FLAG_COMPONENTS_V2,
      allowed_mentions: { parse: [] },
      components: [{ type: 17, accent_color: 0xe10600, components: [texto(`### 📷 Evidências · Ocorrência ${numeroOcorrencia(o)}${sufixo}`), ...galeriaBloco] }],
    };
  }

  return {
    flags: FLAG_COMPONENTS_V2,
    // Responsável e participantes aparecem marcados, sem notificar.
    allowed_mentions: { parse: [] },
    components: [
      {
        type: 17,
        accent_color: 0xe10600,
        components: [
          ...[cabecalho(["-# POLÍCIA MILITAR DO ESTADO DO RIO DE JANEIRO", `## ${rotuloTipo(o.tipo)}`, `-# Ocorrência ${numeroOcorrencia(o)} · registrada <t:${unix(o.em)}:f>`])].flat(),
          linha,
          texto(`**👮 Responsável:** <@${o.autor.id}>\n**👥 Participantes:** ${mencoes(o.participantes)}`),
          linha,
          texto(
            [
              `**📍 Local:** ${md(o.local)}`,
              `**🕒 Data e horário:** ${md(o.quando)}`,
              `**📝 O que houve**\n${citar(o.relato, LIMITES.relato)}`,
              o.apreensoes ? `**📦 Apreensões / material**\n${citar(o.apreensoes, LIMITES.apreensoes)}` : null,
              o.desfecho ? `**🏁 Desfecho:** ${md(o.desfecho)}` : null,
            ]
              .filter(Boolean)
              .join("\n"),
          ),
          linha,
          texto(o.houvePreso ? `### 🔗 Presos · ${o.presos.length}\n${o.presos.map((x, i) => `\`${i + 1}\` ${linhaPreso(x)}`).join("\n")}` : "**🔗 Presos:** não houve."),
          linha,
          texto(o.midias.length ? `### 📷 Evidências · ${o.midias.length} arquivo(s)${sufixo}` : "-# Sem evidências anexadas."),
          ...galeriaBloco,
          texto(`-# ${e ? `${e} ` : ""}Registro de Ocorrência · PMERJ`),
        ],
      },
    ],
  };
}
