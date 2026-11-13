import { emojiLogo } from "../branding/emoji.js";
import { FLAG_COMPONENTS_V2, type MessageBody } from "../discord/bot.js";
import { cabecalho } from "../set/brasao.js";
import type { InteligenciaConfig } from "./types.js";

/**
 * Mensagens da Assunção de Serviço Inteligência (Components V2), com a logo da corporação
 * (Painel → Aparência) no canto superior direito e pequena no rodapé.
 */

export const PREFIXO = "intel:";
export const C = {
  abrir: "intel:abrir",
  enviar: "intel:enviar",
  editar: "intel:editar",
} as const;

export const OBJETO_MAX = 100;
export const LINK_TEXTO_MAX = 1_500;
const RODAPE = "PMERJ · Polícia Militar do Estado do Rio de Janeiro";

const separador = { type: 14, divider: true, spacing: 1 };
const num = (n: number) => String(n).padStart(2, "0");
const rodape = () => `-# ${emojiLogo() ? `${emojiLogo()} ` : ""}${RODAPE}`;
export const tituloIntel = (c: Pick<InteligenciaConfig, "emoji" | "nome">) => `${c.emoji ? `${c.emoji} ` : ""}${c.nome}`.trim();
const qtd = (n: number) => `${n} ${n === 1 ? "policial" : "policiais"}`;

/* ---------- Painel fixo com o botão ---------- */

export function painelMensagem(cfg: InteligenciaConfig): MessageBody {
  const cargos = cfg.cargosPermitidos.length ? cfg.cargosPermitidos.map((id) => `<@&${id}>`).join(" ") : "_nenhum cargo configurado ainda_";
  return {
    flags: FLAG_COMPONENTS_V2,
    allowed_mentions: { parse: [] },
    components: [
      {
        type: 17,
        accent_color: cfg.cor,
        components: [
          ...[cabecalho([`## ${tituloIntel(cfg)}`, "**Assunção de serviço**", cfg.descricao])].flat(),
          separador,
          {
            type: 10,
            content: [
              "**Como funciona**",
              "1. Clique em **Assumir serviço**.",
              "2. Informe os policiais, o objeto da investigação e as fotos (upload ou link).",
              "3. Envie — o registro sai no canal da Inteligência com a identidade da PMERJ.",
              "",
              `**Quem pode usar:** ${cargos}`,
              ...(cfg.ativa ? [] : ["", "🔒 **Assunção fechada no momento.**"]),
            ].join("\n"),
          },
          {
            type: 1,
            components: [{ type: 2, style: cfg.ativa ? 1 : 2, label: "Assumir serviço", emoji: { name: cfg.emoji || "🕵️" }, custom_id: C.abrir, disabled: !cfg.ativa }],
          },
          { type: 10, content: rodape() },
        ],
      },
    ],
  };
}

/* ---------- Formulário (modal) ---------- */

export interface Preenchido {
  quantidade: number | null;
  policiaisIds: string[];
  objeto: string;
  linkTexto: string;
  /** Quantas fotos já foram enviadas e estão guardadas no rascunho (para "Corrigir"). */
  fotosGuardadas: number;
}

export function formulario(cfg: InteligenciaConfig, p?: Preenchido): MessageBody {
  const c = cfg.campos;
  const label = (campo: keyof InteligenciaConfig["campos"], component: Record<string, unknown>, descricao = c[campo].descricao) => ({
    type: 18,
    label: c[campo].label.slice(0, 45),
    ...(descricao ? { description: descricao.slice(0, 100) } : {}),
    component,
  });
  const max = Math.max(1, cfg.maxPoliciais);
  const objetos = cfg.objetos.slice(0, 25);

  return {
    custom_id: C.enviar,
    title: tituloIntel(cfg).slice(0, 45),
    components: [
      label("quantidade", {
        type: 3,
        custom_id: "quantidade",
        required: true,
        min_values: 1,
        max_values: 1,
        placeholder: "Faça uma seleção",
        options: Array.from({ length: max }, (_, i) => ({ label: qtd(i + 1), value: String(i + 1), ...(p?.quantidade === i + 1 ? { default: true } : {}) })),
      }),
      label("policiais", {
        type: 5,
        custom_id: "policiais",
        required: true,
        min_values: 1,
        max_values: max,
        placeholder: "Faça uma seleção",
        ...(p?.policiaisIds.length ? { default_values: p.policiaisIds.slice(0, max).map((id) => ({ id, type: "user" })) } : {}),
      }),
      label(
        "objeto",
        objetos.length
          ? {
              type: 3,
              custom_id: "objeto",
              required: true,
              min_values: 1,
              max_values: 1,
              placeholder: "Escolha a comunidade ou organização",
              options: objetos.map((o) => ({ label: o.slice(0, 100), value: o.slice(0, 100), ...(p?.objeto === o ? { default: true } : {}) })),
            }
          : { type: 4, custom_id: "objeto", style: 1, required: true, min_length: 2, max_length: OBJETO_MAX, placeholder: "Comunidade ou organização", ...(p?.objeto ? { value: p.objeto } : {}) },
      ),
      label(
        "fotos",
        { type: 19, custom_id: "fotos", min_values: 0, max_values: 5, required: false },
        p?.fotosGuardadas ? `${p.fotosGuardadas} foto(s) já enviada(s). Envie outras para trocar ou deixe vazio para manter.` : undefined,
      ),
      label("link", {
        type: 4,
        custom_id: "link",
        style: 2,
        required: false,
        max_length: LINK_TEXTO_MAX,
        placeholder: "https://…",
        ...(p?.linkTexto ? { value: p.linkTexto } : {}),
      }),
    ],
  };
}

/* ---------- Links ---------- */

const EXT_IMAGEM = /\.(png|jpe?g|webp|gif)$/i;

/** Extrai os links http(s) do texto. Devolve null se houver algo que não é link. */
export function lerLinks(texto: string, max: number): { links: string[]; invalido: string | null } {
  const partes = texto.split(/\s+/).filter(Boolean);
  const links: string[] = [];
  for (const p of partes) {
    let url: URL;
    try {
      url = new URL(p);
    } catch {
      return { links, invalido: p.slice(0, 60) };
    }
    if ((url.protocol !== "https:" && url.protocol !== "http:") || p.length > 400) return { links, invalido: p.slice(0, 60) };
    if (!links.includes(url.href)) links.push(url.href);
  }
  return { links: links.slice(0, max), invalido: null };
}

const ehImagem = (link: string) => {
  const u = new URL(link);
  return u.protocol === "https:" && EXT_IMAGEM.test(u.pathname);
};

/* ---------- Resultado publicado no canal ---------- */

export interface Resultado {
  objeto: string;
  policiaisIds: string[];
  /** Nomes dos anexos (attachment://nome). */
  fotos: string[];
  links: string[];
  autorId: string;
  em: number;
}

export function resultadoMensagem(cfg: InteligenciaConfig, r: Resultado): MessageBody {
  const curto = (s: string) => {
    const t = s.replace(/\s*\(.*\)\s*$/, "").trim().toLowerCase();
    return t.charAt(0).toUpperCase() + t.slice(1);
  };
  const imagensLink = r.links.filter(ehImagem);
  const galeria = [...r.fotos.map((f) => `attachment://${f}`), ...imagensLink].slice(0, 10);
  return {
    flags: FLAG_COMPONENTS_V2,
    allowed_mentions: cfg.mencionar ? { parse: [], users: [...new Set(r.policiaisIds)] } : { parse: [] },
    components: [
      {
        type: 17,
        accent_color: cfg.cor,
        components: [
          ...[
            cabecalho([
              `## ${tituloIntel(cfg)}`,
              `**Assunção de serviço** · <t:${Math.floor(r.em / 1000)}:f>`,
              [`**${curto(cfg.campos.objeto.label)}:** ${r.objeto}`, `**Efetivo:** ${qtd(r.policiaisIds.length)}`].join("\n"),
            ]),
          ].flat(),
          separador,
          { type: 10, content: r.policiaisIds.map((id, i) => `\`${num(i + 1)}\` <@${id}>`).join("\n") },
          ...(galeria.length ? [separador, { type: 12, items: galeria.map((url) => ({ media: { url } })) }] : []),
          ...(r.links.length ? [{ type: 10, content: ["**Links**", ...r.links.map((l) => `🔗 ${l}`)].join("\n") }] : []),
          separador,
          { type: 10, content: `${rodape()}\n-# Registrado por <@${r.autorId}>` },
        ],
      },
    ],
  };
}
