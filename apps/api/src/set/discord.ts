import {
  editInteractionReply,
  editMessage,
  FLAG_COMPONENTS_V2,
  FLAG_EPHEMERAL,
  interactionCallback,
  postMessage,
  type MessageBody,
} from "../discord/bot.js";
import type { RawInteraction } from "../discord/gateway.js";
import { montarApelido } from "./apelido.js";
import { brasao, cabecalho } from "./brasao.js";
import { CUSTOM_APROVAR, CUSTOM_MOTIVO, CUSTOM_REPROVAR } from "./mensagens.js";
import { checarDecisao, decidirSet, MENSAGEM_ERRO, solicitarSet } from "./service.js";
import { setStore } from "./store.js";
import type { SetConfig, SetRegistro } from "./types.js";

/**
 * "Pedir Set" dentro do Discord (Components V2):
 *   mensagem fixa com botão  →  formulário (modal)  →  apelido aplicado (automático)
 *   ou pedido no canal de aprovação com botões Aprovar / Reprovar (modo aprovação).
 */
export const CUSTOM_ABRIR = "set:abrir";
export const CUSTOM_ENVIAR = "set:enviar";
const COR = 0xe10600;
const SELECT_MAX = 25; // limite de opções de um menu no Discord

/* ---------- Mensagem do painel ---------- */

function exemplo(cfg: SetConfig): string {
  const p = cfg.patentes[Math.min(3, cfg.patentes.length - 1)] ?? { prefixo: "SD" };
  const o = cfg.campos.orgao ? cfg.orgaos[0]?.sigla : undefined;
  return montarApelido(cfg.formato, { prefixo: p.prefixo, nome: "Silva", id: "1234", orgao: o });
}

export function painelMensagem(cfg: SetConfig): MessageBody {
  const campos = ["patente", "nome de guerra", "ID", ...(cfg.campos.orgao ? ["órgão"] : [])];
  return {
    flags: FLAG_COMPONENTS_V2,
    components: [
      {
        type: 17,
        accent_color: COR,
        components: [
          ...[cabecalho([
            "## Pedir Set",
            cfg.modo === "aprovacao"
              ? "Solicite sua identificação na **Polícia Militar do Estado do Rio de Janeiro**. A equipe analisa o pedido e, aprovado, você recebe seus cargos e o apelido."
              : "Solicite sua identificação na **Polícia Militar do Estado do Rio de Janeiro**. O bot ajusta seu apelido na hora.",
          ])].flat(),
          { type: 14, divider: true, spacing: 1 },
          {
            type: 10,
            content: [
              `**Você informa:** ${campos.join(", ")}`,
              `**Seu apelido fica assim:** \`${exemplo(cfg)}\``,
              "",
              "Para corrigir algum dado, é só pedir de novo.",
            ].join("\n"),
          },
          {
            type: 1,
            components: [{ type: 2, style: 1, label: "Pedir set", emoji: { name: "🪪" }, custom_id: CUSTOM_ABRIR }],
          },
          { type: 10, content: "-# PMERJ · Polícia Militar do Estado do Rio de Janeiro" },
        ],
      },
    ],
  };
}

/**
 * Publica (ou atualiza) a mensagem do painel no canal. Se já existir no mesmo canal,
 * edita no lugar; se foi apagada ou o canal mudou, publica uma nova.
 */
export async function publicarPainel(canalId: string): Promise<SetConfig["painel"]> {
  const cfg = setStore.config();
  const body = painelMensagem(cfg);
  if (cfg.painel?.canalId === canalId && (await editMessage(canalId, cfg.painel.mensagemId, body, brasao()))) {
    return cfg.painel;
  }
  const msg = await postMessage(canalId, body, brasao());
  return msg ? { canalId, mensagemId: msg.id } : null;
}

/** Depois de mudar a configuração, mantém a mensagem já publicada em dia (silencioso). */
export async function atualizarPainelPublicado(): Promise<void> {
  const cfg = setStore.config();
  if (cfg.painel) await editMessage(cfg.painel.canalId, cfg.painel.mensagemId, painelMensagem(cfg), brasao());
}

/* ---------- Formulário (modal) ---------- */

function modal(cfg: SetConfig, ultimo: SetRegistro | undefined): MessageBody {
  // Opção do menu: rótulo curto em destaque (prefixo/sigla) + nome completo como descrição.
  const opcoes = <T extends { id: string }>(list: T[], label: (x: T) => string, descricao: (x: T) => string, selecionado?: string) =>
    list.slice(0, SELECT_MAX).map((x) => ({
      label: label(x).slice(0, 100),
      description: descricao(x).slice(0, 100),
      value: x.id,
      default: x.id === selecionado,
    }));

  const aprovacao = cfg.modo === "aprovacao";
  const quando = aprovacao ? "depois que a equipe aprovar" : "na hora";
  const intro =
    ultimo?.status === "pendente"
      ? [`Você já tem um pedido **aguardando aprovação**: **${ultimo.apelido}**.`, "Enviar de novo atualiza esse mesmo pedido."]
      : ultimo
        ? [`Seu set atual é **${ultimo.apelido}**.`, `Altere o que precisar e envie — o apelido muda ${quando}.`]
        : [`Preencha seus dados e envie — o apelido muda ${quando}.`, `Vai ficar assim: **${exemplo(cfg)}**`];

  const texto = (custom_id: string, opts: Record<string, unknown>, valor?: string) => ({
    type: 4,
    custom_id,
    style: 1,
    required: true,
    ...opts,
    ...(valor ? { value: valor } : {}),
  });

  return {
    type: 9,
    data: {
      custom_id: CUSTOM_ENVIAR,
      title: ultimo ? "🪪 Atualizar Set" : "🪪 Pedir Set",
      // Limite do Discord: no máximo 5 componentes no modal (texto + até 4 campos) — o rodapé vai junto da abertura.
      components: [
        { type: 10, content: [...intro, "-# Para corrigir depois, é só clicar em **Pedir set** de novo."].join("\n") },
        {
          type: 18,
          label: "Patente",
          description: "Define o prefixo do seu apelido.",
          component: {
            type: 3,
            custom_id: "patente",
            placeholder: "Escolha sua patente",
            options: opcoes(cfg.patentes, (p) => p.prefixo, (p) => p.nome, ultimo?.patente.id),
          },
        },
        {
          type: 18,
          label: "Nome de guerra",
          description: "Como você vai aparecer. Só letras, até 24 caracteres.",
          component: texto("nome", { min_length: 2, max_length: 24, placeholder: "Ex.: Silva" }, ultimo?.nome),
        },
        {
          type: 18,
          label: "ID",
          description: "Seu ID na cidade. Somente números.",
          component: texto("gameId", { min_length: 1, max_length: 7, placeholder: "Ex.: 1234" }, ultimo?.gameId),
        },
        ...(cfg.campos.orgao && cfg.orgaos.length > 0
          ? [
              {
                type: 18,
                label: "Órgão",
                description: "Batalhão ou unidade em que você serve.",
                component: {
                  type: 3,
                  custom_id: "orgao",
                  placeholder: "Escolha seu órgão",
                  options: opcoes(cfg.orgaos, (o) => o.sigla, (o) => o.nome, ultimo?.orgao?.id),
                },
              },
            ]
          : []),
      ],
    },
  };
}

/** Lê os valores do formulário enviado (formato novo com Label e o antigo com Action Row). */
function lerCampos(components: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const n = node as { custom_id?: string; value?: string; values?: string[]; component?: unknown; components?: unknown[] };
    if (n.custom_id && typeof n.value === "string") out[n.custom_id] = n.value;
    if (n.custom_id && Array.isArray(n.values)) out[n.custom_id] = n.values[0] ?? "";
    if (n.component) walk(n.component);
    if (Array.isArray(n.components)) n.components.forEach(walk);
  };
  if (Array.isArray(components)) components.forEach(walk);
  return out;
}

/* ---------- Respostas ---------- */

function respostaV2(cor: number, linhas: string[]): MessageBody {
  return {
    flags: FLAG_EPHEMERAL | FLAG_COMPONENTS_V2,
    components: [{ type: 17, accent_color: cor, components: [{ type: 10, content: linhas.join("\n") }] }],
  };
}

type ResultadoPedido = Awaited<ReturnType<typeof solicitarSet>>;

function resultado(r: ResultadoPedido): { v2: MessageBody; texto: string } {
  if (!r.ok) {
    const msg = MENSAGEM_ERRO[r.erro] ?? MENSAGEM_ERRO.dados_invalidos!;
    return { v2: respostaV2(COR, ["### ❌ Não foi possível enviar o pedido", msg]), texto: `❌ ${msg}` };
  }
  const { apelido, statusApelido, status } = r.registro;
  const linhas =
    status === "pendente"
      ? [
          "### 📨 Pedido enviado para aprovação",
          `Apelido pedido: **${apelido}**`,
          "-# Você recebe uma mensagem direta quando a equipe analisar. Pedir de novo atualiza este mesmo pedido.",
        ]
      : statusApelido === "aplicado"
        ? ["### ✅ Set aplicado", `Seu apelido agora é **${apelido}**.`]
        : statusApelido === "falhou"
          ? [
              "### ⚠️ Set registrado, mas o apelido não mudou",
              `Apelido previsto: **${apelido}**`,
              "-# O Discord recusou a troca (cargo do bot abaixo do seu, ou você é o dono do servidor). Avise a administração.",
            ]
          : ["### ✅ Set registrado", `Apelido: **${apelido}**`, "-# A troca automática de apelido está desligada no painel."];
  const cor = status === "pendente" ? 0xf59e0b : statusApelido === "falhou" ? 0xf59e0b : 0x22c55e;
  return { v2: respostaV2(cor, linhas), texto: linhas.join("\n") };
}

/** Responde em até 3s; se a tarefa demorar, avisa "pensando…" e edita depois. */
async function responderComPrazo<T>(i: RawInteraction, tarefa: Promise<T>, render: (r: T) => { v2: MessageBody; texto: string }) {
  const rapido = await Promise.race([tarefa, new Promise<null>((r) => setTimeout(() => r(null), 2_200))]);
  if (rapido !== null) {
    await interactionCallback(i.id, i.token, { type: 4, data: render(rapido).v2 });
  } else {
    await interactionCallback(i.id, i.token, { type: 5, data: { flags: FLAG_EPHEMERAL } });
    await editInteractionReply(i.token, { content: render(await tarefa).texto });
  }
}

const erroEfemero = (i: RawInteraction, codigo: string) =>
  interactionCallback(i.id, i.token, { type: 4, data: respostaV2(COR, [MENSAGEM_ERRO[codigo] ?? MENSAGEM_ERRO.dados_invalidos!]) });

/* ---------- Reprovar: formulário com motivo ---------- */

function modalMotivo(r: SetRegistro): MessageBody {
  return {
    type: 9,
    data: {
      custom_id: `${CUSTOM_MOTIVO}${r.id}`,
      title: setStore.config().expulsarAoReprovar ? "Reprovar e expulsar" : "Reprovar set",
      components: [
        {
          type: 10,
          content: [
            `Pedido de <@${r.userId}>: **${r.apelido}**`,
            setStore.config().expulsarAoReprovar
              ? "⚠️ O policial recebe o motivo por mensagem direta e é **expulso do servidor**."
              : "O policial recebe o motivo por mensagem direta.",
          ].join("\n"),
        },
        {
          type: 18,
          label: "Motivo",
          description: "Opcional. Ex.: patente não confere, ID errado…",
          component: { type: 4, custom_id: "motivo", style: 2, required: false, max_length: 400, placeholder: "Explique o que corrigir" },
        },
      ],
    },
  };
}

/* ---------- Tratamento das interações ---------- */

export async function handleSetInteraction(i: RawInteraction): Promise<boolean> {
  const customId = i.data?.custom_id ?? "";
  const nosso =
    customId === CUSTOM_ABRIR ||
    customId === CUSTOM_ENVIAR ||
    customId.startsWith(CUSTOM_APROVAR) ||
    customId.startsWith(CUSTOM_REPROVAR) ||
    customId.startsWith(CUSTOM_MOTIVO);
  if (!nosso) return false;

  const member = i.member;
  if (!member) {
    await interactionCallback(i.id, i.token, { type: 4, data: respostaV2(COR, ["Use este painel dentro do servidor."]) });
    return true;
  }
  const user = member.user;

  // Clique em "Pedir set" → formulário preenchido com o pedido pendente ou o set atual.
  if (i.type === 3 && customId === CUSTOM_ABRIR) {
    const base = setStore.pendente(user.id) ?? setStore.atual(user.id);
    await interactionCallback(i.id, i.token, modal(setStore.config(), base));
    return true;
  }

  // Formulário enviado → aplica (automático) ou cria o pedido (aprovação).
  if (i.type === 5 && customId === CUSTOM_ENVIAR) {
    const v = lerCampos(i.data?.components);
    const quem = { id: user.id, username: user.username, avatar: user.avatar ?? null };
    const pedido = { nome: v.nome ?? "", gameId: v.gameId ?? "", patenteId: v.patente ?? "", orgaoId: v.orgao || null };
    await responderComPrazo(i, solicitarSet(quem, pedido, "discord"), resultado);
    return true;
  }

  // Aprovar / Reprovar (botões no canal de aprovação).
  const aprovador = {
    id: user.id,
    username: user.username,
    roles: member.roles ?? [],
  };
  const pedidoId = customId.slice(customId.lastIndexOf(":") + 1);

  if (i.type === 3 && (customId.startsWith(CUSTOM_APROVAR) || customId.startsWith(CUSTOM_REPROVAR))) {
    const check = checarDecisao(pedidoId, aprovador);
    if (!check.ok) {
      await erroEfemero(i, check.erro);
      return true;
    }
    if (customId.startsWith(CUSTOM_REPROVAR)) {
      await interactionCallback(i.id, i.token, modalMotivo(check.registro));
      return true;
    }
    // Aprovar: confirma o clique na hora; a mensagem é atualizada quando o apelido for aplicado.
    await interactionCallback(i.id, i.token, { type: 6 });
    await decidirSet(pedidoId, aprovador, "aprovar");
    return true;
  }

  if (i.type === 5 && customId.startsWith(CUSTOM_MOTIVO)) {
    const check = checarDecisao(pedidoId, aprovador);
    if (!check.ok) {
      await erroEfemero(i, check.erro);
      return true;
    }
    await interactionCallback(i.id, i.token, { type: 6 });
    await decidirSet(pedidoId, aprovador, "reprovar", lerCampos(i.data?.components).motivo ?? null);
    return true;
  }
  return false;
}
