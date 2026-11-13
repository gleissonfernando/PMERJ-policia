import { editInteractionReply, FLAG_COMPONENTS_V2, FLAG_EPHEMERAL, getMember, interactionCallback, upsertGuildCommand, type MessageBody } from "../discord/bot.js";
import type { RawInteraction } from "../discord/gateway.js";
import { adicionarCargos, bloqueio, contexto, MAX_CARGOS_POR_VEZ, MENSAGEM_ERRO, MOTIVO_TEXTO, nomeDoMembro, podeUsar } from "./service.js";
import { adicionarCargoStore, type Quem } from "./store.js";

/**
 * /adicionar-cargo — painel V2 que só quem usou vê:
 *   1) membro   → menu de usuário com a escolha marcada (o × do próprio menu desmarca)
 *   2) cargo(s) → menu de cargos (ou só os cargos liberados, se a administração definiu a lista)
 *   3) prévia (✅ recebe · ➖ já tem · ❌ bloqueado e por quê) → Confirmar
 * O comando fica escondido para quem não é admin; em Painel → Adicionar Cargo a administração
 * aplica no Discord quais cargos VEEM o comando. O bot confere o cargo em todo passo.
 */

export const COMANDO_ADICIONAR_CARGO = {
  name: "adicionar-cargo",
  type: 1,
  description: "Dar um cargo a um membro do servidor",
  contexts: [0],
  // "0" = escondido para todos, exceto admins e os cargos liberados pelo painel.
  default_member_permissions: "0",
} as const;

export const registrarComandoAdicionarCargo = () => upsertGuildCommand({ ...COMANDO_ADICIONAR_CARGO });

const P = "ac:";
const ID = { pessoa: `${P}pessoa`, cargos: `${P}cargos`, ok: `${P}ok`, nova: `${P}nova` } as const;
const COR = 0x22c55e;

interface Rascunho {
  alvoId: string | null;
  cargos: string[];
  expira: number;
}
const rascunhos = new Map<string, Rascunho>();
function rascunho(userId: string): Rascunho {
  const agora = Date.now();
  for (const [k, v] of rascunhos) if (v.expira < agora) rascunhos.delete(k);
  let r = rascunhos.get(userId);
  if (!r) {
    if (rascunhos.size >= 200) rascunhos.delete(rascunhos.keys().next().value!);
    r = { alvoId: null, cargos: [], expira: 0 };
    rascunhos.set(userId, r);
  }
  r.expira = agora + 15 * 60_000;
  return r;
}

const quemDe = (i: RawInteraction): Quem => ({ id: i.member!.user.id, nome: i.member!.user.global_name ?? i.member!.user.username });
const paraEdicao = (b: MessageBody): MessageBody => ({ ...b, flags: FLAG_COMPONENTS_V2 });
const responder = (i: RawInteraction, type: number, data?: MessageBody) =>
  interactionCallback(i.id, i.token, data ? { type, data: type === 7 ? paraEdicao(data) : data } : { type });
const caixa = (cor: number, comps: unknown[]): MessageBody => ({
  flags: FLAG_EPHEMERAL | FLAG_COMPONENTS_V2,
  allowed_mentions: { parse: [] },
  components: [{ type: 17, accent_color: cor, components: [...comps, { type: 10, content: "-# Só você vê esta mensagem." }] }],
});

async function painel(r: Rascunho, rolesExecutor: string[], aviso?: string): Promise<MessageBody> {
  const comps: unknown[] = [{ type: 10, content: "### ➕ Adicionar cargo\nEscolha o membro e o cargo. Depois, confirme." }];

  const membro = r.alvoId ? await getMember(r.alvoId) : null;
  if (r.alvoId && !membro) {
    comps.push({ type: 10, content: "⚠️ Esse membro não está mais no servidor." });
    r.alvoId = null;
    r.cargos = [];
  }
  comps.push({
    type: 1,
    components: [{ type: 5, custom_id: ID.pessoa, placeholder: "Selecione o membro…", min_values: 0, max_values: 1, ...(r.alvoId ? { default_values: [{ id: r.alvoId, type: "user" }] } : {}) }],
  });

  if (membro) {
    const ctx = await contexto(rolesExecutor);
    if (ctx.permitidos.length > 0) {
      // Lista da administração: menu só com esses cargos (o que não existe mais some).
      const opcoes = ctx.permitidos.map((id) => ctx.cargos.get(id)).filter((c) => c !== undefined);
      r.cargos = r.cargos.filter((id) => opcoes.some((c) => c.id === id));
      if (opcoes.length === 0) comps.push({ type: 10, content: "⚠️ Nenhum dos cargos liberados existe mais. Peça para a administração revisar o painel." });
      else
        comps.push({
          type: 1,
          components: [
            {
              type: 3,
              custom_id: ID.cargos,
              placeholder: "Selecione o cargo…",
              min_values: 0,
              max_values: Math.min(MAX_CARGOS_POR_VEZ, opcoes.length),
              options: opcoes.slice(0, 25).map((c) => {
                const b = bloqueio(c.id, ctx);
                return {
                  label: c.nome.slice(0, 100),
                  value: c.id,
                  description: membro.roles.includes(c.id) ? "Já tem este cargo" : b ? `Bloqueado: ${MOTIVO_TEXTO[b]}`.slice(0, 100) : undefined,
                  default: r.cargos.includes(c.id),
                };
              }),
            },
          ],
        });
    } else {
      comps.push({
        type: 1,
        components: [
          {
            type: 6,
            custom_id: ID.cargos,
            placeholder: `Selecione o cargo (até ${MAX_CARGOS_POR_VEZ})…`,
            min_values: 0,
            max_values: MAX_CARGOS_POR_VEZ,
            ...(r.cargos.length ? { default_values: r.cargos.map((id) => ({ id, type: "role" })) } : {}),
          },
        ],
      });
    }

    if (r.cargos.length) {
      const linhas = r.cargos.map((id) => {
        const b = bloqueio(id, ctx);
        if (b) return `❌ <@&${id}> · ${MOTIVO_TEXTO[b]}`;
        if (membro.roles.includes(id)) return `➖ <@&${id}> · já tem`;
        return `✅ <@&${id}>`;
      });
      const validos = r.cargos.filter((id) => !bloqueio(id, ctx) && !membro.roles.includes(id)).length;
      const bloqueados = r.cargos.some((id) => bloqueio(id, ctx));
      comps.push(
        { type: 14, divider: true, spacing: 1 },
        { type: 10, content: [`**${nomeDoMembro(membro)}** vai receber:`, ...linhas, ...(bloqueados ? ["-# Tire do menu os cargos bloqueados para confirmar."] : [])].join("\n") },
        {
          type: 1,
          components: [{ type: 2, style: 3, label: validos > 1 ? `Confirmar ${validos} cargos` : "Confirmar", emoji: { name: "➕" }, custom_id: ID.ok, disabled: validos === 0 || bloqueados }],
        },
      );
    }
  }
  if (aviso) comps.push({ type: 10, content: `⚠️ ${aviso}` });
  return caixa(COR, comps);
}

export async function handleAdicionarCargoInteraction(i: RawInteraction): Promise<boolean> {
  const cid = i.data?.custom_id ?? "";
  const comando = i.type === 2 && i.data?.name === COMANDO_ADICIONAR_CARGO.name;
  if (!comando && !cid.startsWith(P)) return false;
  const member = i.member;
  if (!member) {
    await responder(i, 4, caixa(0xe10600, [{ type: 10, content: "Use dentro do servidor." }]));
    return true;
  }
  const roles = member.roles ?? [];
  const chave = member.user.id;

  // Cargo conferido em todo passo — a visibilidade do comando no Discord não basta.
  if (!podeUsar(roles)) {
    rascunhos.delete(chave);
    const semConfig = adicionarCargoStore.config().cargosUsar.length === 0;
    await responder(
      i,
      comando ? 4 : 7,
      caixa(0xe10600, [{ type: 10, content: `🔒 ${MENSAGEM_ERRO.sem_permissao}${semConfig ? "\n-# Nenhum cargo foi liberado ainda em Painel → Adicionar Cargo." : ""}` }]),
    );
    return true;
  }
  if (comando || cid === ID.nova) {
    rascunhos.delete(chave);
    await responder(i, comando ? 4 : 7, await painel(rascunho(chave), roles));
    return true;
  }

  const r = rascunho(chave);
  if (cid === ID.pessoa) {
    const alvo = i.data?.values?.[0] ?? null;
    if (alvo && alvo === member.user.id) {
      await responder(i, 7, await painel(r, roles, MENSAGEM_ERRO.auto));
      return true;
    }
    if (alvo && i.data?.resolved?.users?.[alvo]?.bot) {
      await responder(i, 7, await painel(r, roles, MENSAGEM_ERRO.alvo_bot));
      return true;
    }
    // × no menu (lista vazia) = desmarcou.
    if (alvo !== r.alvoId) r.cargos = [];
    r.alvoId = alvo;
  } else if (cid === ID.cargos) {
    r.cargos = (i.data?.values ?? []).filter((v) => /^\d{17,20}$/.test(v)).slice(0, MAX_CARGOS_POR_VEZ);
  } else if (cid === ID.ok) {
    if (!r.alvoId || r.cargos.length === 0) {
      await responder(i, 7, await painel(r, roles, "Escolha o membro e o cargo."));
      return true;
    }
    // Dar cargos e postar o registro pode passar de 3 s: confirma já e edita depois.
    await responder(i, 6);
    const res = await adicionarCargos(r.alvoId, r.cargos, quemDe(i), roles);
    if (!res.ok) {
      const texto = `${MENSAGEM_ERRO[res.erro] ?? "Não foi possível concluir."}${res.detalhe ? ` (${res.detalhe})` : ""}`;
      await editInteractionReply(i.token, paraEdicao(await painel(r, roles, texto)));
      return true;
    }
    rascunhos.delete(chave);
    const reg = res.registro;
    const dados = reg.cargos.filter((c) => c.ok);
    const falhos = reg.cargos.filter((c) => !c.ok);
    await editInteractionReply(
      i.token,
      paraEdicao(
        caixa(dados.length ? COR : 0xb45309, [
          {
            type: 10,
            content: [
              dados.length ? "### ✅ Cargo adicionado" : "### ⚠️ Nenhum cargo foi dado",
              ...(dados.length ? [`<@${reg.userId}> recebeu ${dados.map((c) => `<@&${c.id}>`).join(", ")}.`] : []),
              ...(res.jaTinha.length ? [`-# Já tinha: ${res.jaTinha.map((id) => `<@&${id}>`).join(", ")}`] : []),
              ...(falhos.length ? [`⚠️ O Discord recusou ${falhos.map((c) => `**${c.nome}**`).join(", ")}: o cargo do bot precisa ficar acima desses cargos.`] : []),
              reg.mensagem ? `-# Registro publicado em <#${reg.mensagem.canalId}>.` : "-# Nenhum canal de registro configurado no painel.",
            ].join("\n"),
          },
          { type: 1, components: [{ type: 2, style: 2, label: "Adicionar outro", emoji: { name: "➕" }, custom_id: ID.nova }] },
        ]),
      ),
    );
    return true;
  }
  await responder(i, 7, await painel(r, roles));
  return true;
}
