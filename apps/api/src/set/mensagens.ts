import { FLAG_COMPONENTS_V2, type MessageBody } from "../discord/bot.js";
import { cabecalho } from "./brasao.js";
import type { SetRegistro } from "./types.js";

/**
 * Mensagens (Components V2) do fluxo de aprovação, com o brasão da PMERJ.
 * Sem dependência de serviço: usadas por service.ts e discord.ts.
 * Toda mensagem que usa o brasão precisa ser enviada com os anexos de BRASAO.
 */

export const CUSTOM_APROVAR = "set:aprovar:";
export const CUSTOM_REPROVAR = "set:reprovar:";
export const CUSTOM_MOTIVO = "set:motivo:";

const COR = { pendente: 0xf59e0b, aprovado: 0x22c55e, reprovado: 0xe10600, cancelado: 0x6b7280 } as const;

const ts = (ms: number, estilo: "R" | "f" = "R") => `<t:${Math.floor(ms / 1000)}:${estilo}>`;

const avatarUrl = (r: Pick<SetRegistro, "userId" | "avatar">) =>
  r.avatar
    ? `https://cdn.discordapp.com/avatars/${r.userId}/${r.avatar}.png?size=128`
    : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(r.userId) >> 22n) % 6}.png`;

/** Texto livre do aprovador: sem crases e sem quebrar o bloco de citação. */
const limparMotivo = (m: string) => m.replace(/`/g, "'").replace(/\n+/g, "\n> ").slice(0, 400);

/** Junta componentes que podem vir como um item (Section) ou uma lista (Text Displays). */
const flat = (...partes: unknown[]) => partes.flat();

function dados(r: SetRegistro): string {
  return [
    `**Apelido:** \`${r.apelido}\``,
    `**Patente:** ${r.patente.nome}  ·  **ID:** ${r.gameId}`,
    ...(r.orgao ? [`**Órgão:** ${r.orgao.sigla} — ${r.orgao.nome}`] : []),
  ].join("\n");
}

function rodapeDecisao(r: SetRegistro): string[] {
  const quem = r.decididoPor ? `<@${r.decididoPor.id}>` : "aprovação automática";
  const quando = r.decididoEm ? ` · ${ts(r.decididoEm)}` : "";
  switch (r.status) {
    case "aprovado":
      return [
        `✅ **Aprovado** por ${quem}${quando}`,
        ...(r.statusApelido === "falhou" ? ["-# ⚠️ O Discord recusou a troca do apelido (cargo do bot abaixo do membro, ou é o dono do servidor)."] : []),
        ...(r.statusCargos === "falhou" ? ["-# ⚠️ Não foi possível entregar algum cargo (o cargo do bot precisa estar acima dele)."] : []),
      ];
    case "reprovado":
      return [
        `❌ **Reprovado** por ${quem}${quando}`,
        ...(r.motivo ? [`> ${limparMotivo(r.motivo)}`] : []),
        ...(r.statusExpulsao === "feito" ? ["-# Membro expulso do servidor."] : []),
        ...(r.statusExpulsao === "falhou" ? ["-# ⚠️ Não foi possível expulsar (cargo do bot abaixo do membro, ou é o dono do servidor)."] : []),
      ];
    case "cancelado":
      return ["↩️ **Pedido cancelado.**"];
    default:
      return [];
  }
}

/** Mensagem do pedido no canal temporário. Com botões enquanto pendente; com o resultado depois. */
export function mensagemPedido(r: SetRegistro, opts: { expulsar: boolean; apagaEm?: number }): MessageBody {
  const pendente = r.status === "pendente";
  return {
    flags: FLAG_COMPONENTS_V2,
    components: [
      {
        type: 17,
        accent_color: COR[r.status],
        components: flat(
          cabecalho([`## Pedido de set`, `-# Polícia Militar do Estado do Rio de Janeiro`]),
          { type: 14, divider: true, spacing: 1 },
          {
            type: 9,
            components: [
              { type: 10, content: `**Policial:** <@${r.userId}> · @${r.username}` },
              { type: 10, content: dados(r) },
            ],
            accessory: { type: 11, media: { url: avatarUrl(r) }, description: `Avatar de ${r.username}`.slice(0, 1024) },
          },
          { type: 14, divider: true, spacing: 1 },
          pendente
            ? [
                {
                  type: 10,
                  content: [
                    `-# Pedido pelo ${r.origem === "discord" ? "Discord" : "site"} · ${ts(r.em)}`,
                    `-# Aprovar entrega os cargos e troca o apelido.${opts.expulsar ? " Reprovar **expulsa** o membro do servidor." : ""}`,
                  ].join("\n"),
                },
                {
                  type: 1,
                  components: [
                    { type: 2, style: 3, label: "Aprovar", emoji: { name: "✅" }, custom_id: `${CUSTOM_APROVAR}${r.id}` },
                    { type: 2, style: 4, label: opts.expulsar ? "Reprovar e expulsar" : "Reprovar", emoji: { name: "✖️" }, custom_id: `${CUSTOM_REPROVAR}${r.id}` },
                  ],
                },
              ]
            : [
                { type: 10, content: rodapeDecisao(r).join("\n") },
                ...(opts.apagaEm ? [{ type: 10, content: `-# Este canal será apagado ${ts(opts.apagaEm)}.` }] : []),
              ],
        ),
      },
    ],
  };
}

/** Aviso por mensagem direta para quem pediu. */
export function dmResultado(r: SetRegistro, servidor: string, expulso: boolean): MessageBody {
  const aprovado = r.status === "aprovado";
  const linhas = aprovado
    ? [
        "## ✅ Seu set foi aprovado",
        r.statusApelido === "aplicado"
          ? `Seu apelido em **${servidor}** agora é **${r.apelido}**.`
          : `Apelido aprovado: **${r.apelido}**. A troca automática não foi feita — avise a administração.`,
        ...(r.decididoPor ? [`-# Aprovado por @${r.decididoPor.username}`] : []),
      ]
    : [
        "## ❌ Seu set foi reprovado",
        `Pedido: **${r.apelido}**`,
        ...(r.motivo ? ["**Motivo:**", `> ${limparMotivo(r.motivo)}`] : []),
        "",
        expulso
          ? `Por isso você foi **removido de ${servidor}**. Se quiser tentar de novo, entre no servidor novamente e corrija os dados.`
          : "Corrija os dados e peça de novo no canal de identificação.",
      ];
  return {
    flags: FLAG_COMPONENTS_V2,
    components: [
      {
        type: 17,
        accent_color: COR[aprovado ? "aprovado" : "reprovado"],
        components: flat(cabecalho([linhas.join("\n")]), { type: 10, content: "-# PMERJ · Pedir Set" }),
      },
    ],
  };
}
