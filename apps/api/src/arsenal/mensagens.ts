import { emojiLogo } from "../branding/emoji.js";
import { FLAG_COMPONENTS_V2, type MessageBody } from "../discord/bot.js";
import { cabecalho } from "../set/brasao.js";
import { LIMITES, type Arma, type Item, type Movimento, type TipoMovimento } from "./store.js";

/** Todo custom_id do módulo começa com "ars:". */
export const IDS = {
  acao: "ars:acao",
  retirar: "ars:m-retirar",
  devolver: "ars:m-devolver",
  perda: "ars:m-perda",
  recuperar: "ars:m-recuperar",
};

const COR = 0x1e3a8a;
const linha = { type: 14, divider: true, spacing: 1 };
const texto = (content: string) => ({ type: 10, content });
const unix = (ms: number) => Math.floor(ms / 1000);
export const md = (v: string) => v.replace(/([\\*_`~|>#])/g, "\\$1");
const caber = (v: string, max: number) => (v.length > max ? `${v.slice(0, Math.max(0, max - 1)).trimEnd()}…` : v);
const rodape = (extra?: string) => {
  const e = emojiLogo();
  return texto(`-# ${e ? `${e} ` : ""}PMERJ · Retirada de Baú${extra ? ` · ${extra}` : ""}`);
};

/** Emoji de opção de select: unicode curto ou customizado (<:nome:id>). */
function emojiOpcao(e: string) {
  const custom = /^<(a?):(\w{2,32}):(\d{17,20})>$/.exec(e.trim());
  if (custom) return { id: custom[3], name: custom[2], animated: custom[1] === "a" };
  return e.trim() && e.trim().length <= 8 ? { name: e.trim() } : undefined;
}
const rotuloArma = (a: Pick<Arma, "nome" | "emoji">) => `${a.emoji ? `${a.emoji} ` : ""}${a.nome}`;

/* ---------- Painel público ---------- */

export const ACOES: Array<{ value: string; label: string; description: string; emoji: string }> = [
  { value: "retirar", label: "Retirar arma", description: "Escolha a arma e informe o prefixo/série.", emoji: "📦" },
  { value: "devolver", label: "Devolver arma", description: "Devolva uma arma que está com você.", emoji: "↩️" },
  { value: "perda", label: "Registrar perda", description: "Informe a perda de uma arma que está com você.", emoji: "⚠️" },
  { value: "recuperar", label: "Recuperar arma", description: "A série perdida volta para o sistema.", emoji: "✅" },
];

export function painelPublico(armas: Arma[]): MessageBody {
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
              "## 🗄️ Retirada de Baú",
              "Controle das armas do batalhão: retirada, devolução, perda e recuperação.",
              "-# Escolha a opção no menu abaixo. Seu ID e seu nome no servidor são registrados automaticamente.",
            ]),
          ].flat(),
          linha,
          texto(`### Armas disponíveis\n${armas.length ? armas.map((a) => `${a.emoji || "▫️"} ${md(a.nome)}`).join("\n") : "_Nenhuma arma cadastrada ainda._"}`),
          {
            type: 1,
            components: [
              {
                type: 3,
                custom_id: IDS.acao,
                placeholder: "Selecione uma opção",
                min_values: 1,
                max_values: 1,
                disabled: armas.length === 0,
                options: ACOES.map((o) => ({ label: o.label, value: o.value, description: o.description, emoji: { name: o.emoji } })),
              },
            ],
          },
          rodape(),
        ],
      },
    ],
  };
}

/* ---------- Formulários ---------- */

const selectModal = (label: string, descricao: string, customId: string, opcoes: Array<{ label: string; value: string; description?: string; emoji?: unknown }>) => ({
  type: 18,
  label,
  description: descricao.slice(0, 100),
  component: { type: 3, custom_id: customId, placeholder: "Selecione", min_values: 1, max_values: 1, required: true, options: opcoes.slice(0, 25) },
});
const campoTexto = (label: string, customId: string, max: number, o: { obrigatorio?: boolean; placeholder?: string; descricao?: string; paragrafo?: boolean }) => ({
  type: 18,
  label,
  ...(o.descricao ? { description: o.descricao.slice(0, 100) } : {}),
  component: { type: 4, custom_id: customId, style: o.paragrafo ? 2 : 1, required: o.obrigatorio ?? false, max_length: max, ...(o.placeholder ? { placeholder: o.placeholder.slice(0, 100) } : {}) },
});

/** Opção de select de uma arma física (modelo + série). */
const opcaoItem = (i: Item, extra?: string) => ({ label: caber(`${i.armaNome} · ${i.serie}`, 100), value: i.chave, ...(extra ? { description: caber(extra, 100) } : {}) });

export const modalRetirar = (armas: Arma[]) => ({
  custom_id: IDS.retirar,
  title: "📦 Retirar arma",
  components: [
    selectModal(
      "Arma",
      "Qual arma você está retirando do baú?",
      "arma",
      armas.map((a) => {
        const emoji = emojiOpcao(a.emoji);
        return { label: caber(a.nome, 100), value: a.id, ...(emoji ? { emoji } : {}) };
      }),
    ),
    campoTexto("Prefixo / série da arma", "serie", LIMITES.serie, { obrigatorio: true, descricao: "Exatamente como está gravado na arma.", placeholder: "Ex.: PM-0231" }),
  ],
});

export const modalDevolver = (itens: Item[]) => ({
  custom_id: IDS.devolver,
  title: "↩️ Devolver arma",
  components: [selectModal("Arma que está com você", "Ao enviar, ela deixa de ficar no seu nome.", "item", itens.map((i) => opcaoItem(i, `Retirada em ${new Date(i.desde).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`)))],
});

export const modalPerda = (itens: Item[]) => ({
  custom_id: IDS.perda,
  title: "⚠️ Registrar perda",
  components: [
    selectModal("Arma perdida", "Escolha a arma e a série que foram perdidas.", "item", itens.map((i) => opcaoItem(i))),
    campoTexto("O que aconteceu", "motivo", LIMITES.motivo, { paragrafo: true, descricao: "Opcional.", placeholder: "Ex.: perdida durante confronto na Av. Brasil" }),
  ],
});

export const modalRecuperar = (itens: Item[]) => ({
  custom_id: IDS.recuperar,
  title: "✅ Recuperar arma",
  components: [
    selectModal("Arma recuperada", "A série volta para o sistema e pode ser retirada de novo.", "item", itens.map((i) => opcaoItem(i, i.pessoa ? `Perdida por ${i.pessoa.nome}` : undefined))),
    campoTexto("Como foi recuperada", "motivo", LIMITES.motivo, { paragrafo: true, descricao: "Opcional.", placeholder: "Ex.: localizada pela guarnição Alfa" }),
  ],
});

/* ---------- Registros publicados nos canais ---------- */

const ESTILO: Record<TipoMovimento, { titulo: string; cor: number }> = {
  retirada: { titulo: "📦 Retirada de arma", cor: 0x2563eb },
  devolucao: { titulo: "↩️ Arma devolvida", cor: 0x22c55e },
  perda: { titulo: "⚠️ Perda de arma", cor: 0xe10600 },
  recuperacao: { titulo: "✅ Arma recuperada", cor: 0xf59e0b },
};

export function mensagemMovimento(m: Movimento, arma?: Pick<Arma, "nome" | "emoji">): MessageBody {
  const est = ESTILO[m.tipo];
  const nomeArma = `**${md(arma ? rotuloArma(arma) : m.armaNome)}**`;
  const serie = `Série \`${m.serie.replace(/`/g, "ˋ")}\``;
  const quem = `**${md(m.pessoa.nome)}** (<@${m.pessoa.id}>)`;
  const frase = {
    retirada: `${quem} retirou ${nomeArma} · ${serie}`,
    devolucao: `${quem} devolveu ${nomeArma} · ${serie}`,
    perda: `${quem} registrou a perda de ${nomeArma} · ${serie}${m.relacionado && m.relacionado.id !== m.pessoa.id ? `\n-# Estava com ${md(m.relacionado.nome)} (<@${m.relacionado.id}>)` : ""}`,
    recuperacao: `${nomeArma} · ${serie} foi recuperada por ${quem}${m.relacionado ? `\n-# Perdida por ${md(m.relacionado.nome)} (<@${m.relacionado.id}>)` : ""}`,
  }[m.tipo];
  return {
    flags: FLAG_COMPONENTS_V2,
    allowed_mentions: { parse: [] },
    components: [
      {
        type: 17,
        accent_color: est.cor,
        components: [
          ...[cabecalho([`### ${est.titulo}`, frase, `-# ID: ${m.pessoa.id} · <t:${unix(m.em)}:f>`])].flat(),
          ...(m.motivo ? [texto(`> ${md(m.motivo).replace(/\n/g, "\n> ")}`)] : []),
          linha,
          rodape(m.web ? "registrado pelo painel web" : undefined),
        ],
      },
    ],
  };
}
