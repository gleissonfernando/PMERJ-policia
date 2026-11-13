import { emojiLogo } from "../branding/emoji.js";
import { FLAG_COMPONENTS_V2, type MessageBody } from "../discord/bot.js";
import { cabecalho } from "../set/brasao.js";
import type { Assuncao } from "./types.js";

/**
 * Mensagens da Assunção de Serviço (Components V2), sempre com a logo da corporação
 * (Painel → Aparência) no canto superior direito e pequena no rodapé.
 */

export const PREFIXO = "assuncao:";
export const customAbrir = (id: string) => `${PREFIXO}abrir:${id}`;
export const customEnviar = (id: string) => `${PREFIXO}enviar:${id}`;
export const customEditar = (id: string) => `${PREFIXO}editar:${id}`;

export const SETOR_MAX = 60;
export const VIATURA_MAX = 30;
const RODAPE = "PMERJ · Polícia Militar do Estado do Rio de Janeiro";

const separador = { type: 14, divider: true, spacing: 1 };
const num = (n: number) => String(n).padStart(2, "0");
const rodape = () => `-# ${emojiLogo() ? `${emojiLogo()} ` : ""}${RODAPE}`;
export const tituloAssuncao = (a: Pick<Assuncao, "emoji" | "nome">) => `${a.emoji ? `${a.emoji} ` : ""}${a.nome}`.trim();

/* ---------- Painel fixo com o botão ---------- */

export function painelMensagem(a: Assuncao): MessageBody {
  const cargos = a.cargosPermitidos.length ? a.cargosPermitidos.map((id) => `<@&${id}>`).join(" ") : "_nenhum cargo configurado ainda_";
  const total = 2 + a.maxDemais;
  return {
    flags: FLAG_COMPONENTS_V2,
    allowed_mentions: { parse: [] },
    components: [
      {
        type: 17,
        accent_color: a.cor,
        components: [
          ...[cabecalho([`## ${tituloAssuncao(a)}`, "**Assunção de serviço**", a.descricao])].flat(),
          separador,
          {
            type: 10,
            content: [
              "**Como funciona**",
              `1. Clique em **Assumir serviço**.`,
              `2. Preencha ${a.campos.setor.label.toLowerCase()}, ${a.campos.viatura.label.toLowerCase()} e escolha os policiais da guarnição.`,
              "3. Envie — o registro sai no canal da escala com a identidade da PMERJ.",
              "",
              `**Guarnição:** de 2 a ${total} policiais (contando comandante e motopol).`,
              `**Quem pode usar:** ${cargos}`,
              ...(a.ativa ? [] : ["", "🔒 **Assunção fechada no momento.**"]),
            ].join("\n"),
          },
          {
            type: 1,
            components: [
              { type: 2, style: a.ativa ? 1 : 2, label: "Assumir serviço", emoji: { name: a.emoji || "🚓" }, custom_id: customAbrir(a.id), disabled: !a.ativa },
            ],
          },
          { type: 10, content: rodape() },
        ],
      },
    ],
  };
}

/* ---------- Formulário (modal) ---------- */

export interface Preenchido {
  setor: string;
  viatura: string;
  comandanteId: string | null;
  motopolId: string | null;
  demaisIds: string[];
}

export function formulario(a: Assuncao, p?: Preenchido): MessageBody {
  const c = a.campos;
  const label = (campo: keyof Assuncao["campos"], component: Record<string, unknown>) => ({
    type: 18,
    label: c[campo].label.slice(0, 45),
    ...(c[campo].descricao ? { description: c[campo].descricao.slice(0, 100) } : {}),
    component,
  });
  const usuario = (custom_id: string, ids: string[], min: number, max: number) => ({
    type: 5,
    custom_id,
    min_values: min,
    max_values: max,
    required: min > 0,
    placeholder: "Faça uma seleção",
    ...(ids.length ? { default_values: ids.slice(0, max).map((id) => ({ id, type: "user" })) } : {}),
  });

  const setores = a.setores.slice(0, 25);
  const setor =
    setores.length > 0
      ? {
          type: 3,
          custom_id: "setor",
          required: true,
          min_values: 1,
          max_values: 1,
          placeholder: "Escolha o setor",
          options: setores.map((s) => ({ label: s.slice(0, 100), value: s.slice(0, 100), ...(p?.setor === s ? { default: true } : {}) })),
        }
      : { type: 4, custom_id: "setor", style: 1, required: true, min_length: 1, max_length: SETOR_MAX, placeholder: "Ex.: Centro", ...(p?.setor ? { value: p.setor } : {}) };

  return {
    custom_id: customEnviar(a.id),
    title: tituloAssuncao(a).slice(0, 45),
    components: [
      label("setor", setor),
      label("viatura", { type: 4, custom_id: "viatura", style: 1, required: true, min_length: 1, max_length: VIATURA_MAX, placeholder: "Ex.: 54-1234", ...(p?.viatura ? { value: p.viatura } : {}) }),
      label("comandante", usuario("comandante", p?.comandanteId ? [p.comandanteId] : [], 1, 1)),
      label("motopol", usuario("motopol", p?.motopolId ? [p.motopolId] : [], 1, 1)),
      ...(a.maxDemais > 0 ? [label("demais", usuario("demais", p?.demaisIds ?? [], 0, a.maxDemais))] : []),
    ],
  };
}

/* ---------- Resultado publicado no canal ---------- */

export interface Resultado {
  setor: string;
  viatura: string;
  comandanteId: string;
  motopolId: string;
  demaisIds: string[];
  autorId: string;
  em: number;
}

export function resultadoMensagem(a: Assuncao, r: Resultado): MessageBody {
  const total = 2 + r.demaisIds.length;
  const c = a.campos;
  // Rótulo curto no resultado: "COMANDANTE (Sargento ou Oficial)" → "Comandante".
  const curto = (s: string) => {
    const t = s.replace(/\s*\(.*\)\s*$/, "").trim().toLowerCase();
    return t.charAt(0).toUpperCase() + t.slice(1);
  };
  const ids = [r.comandanteId, r.motopolId, ...r.demaisIds];
  return {
    flags: FLAG_COMPONENTS_V2,
    allowed_mentions: a.mencionar ? { parse: [], users: [...new Set(ids)] } : { parse: [] },
    components: [
      {
        type: 17,
        accent_color: a.cor,
        components: [
          ...[
            cabecalho([
              `## ${tituloAssuncao(a)}`,
              `**Assunção de serviço** · <t:${Math.floor(r.em / 1000)}:f>`,
              [`**${curto(c.setor.label)}:** ${r.setor}`, `**${curto(c.viatura.label)}:** ${r.viatura}`, `**Efetivo:** ${total} policiais`].join("\n"),
            ]),
          ].flat(),
          separador,
          {
            type: 10,
            content: [
              `\`01\` **${curto(c.comandante.label)}** · <@${r.comandanteId}>`,
              `\`02\` **${curto(c.motopol.label)}** · <@${r.motopolId}>`,
              ...r.demaisIds.map((id, i) => `\`${num(i + 3)}\` <@${id}>`),
            ].join("\n"),
          },
          separador,
          { type: 10, content: `${rodape()}\n-# Registrado por <@${r.autorId}>` },
        ],
      },
    ],
  };
}
