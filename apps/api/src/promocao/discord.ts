import { editInteractionReply, FLAG_COMPONENTS_V2, FLAG_EPHEMERAL, getMember, interactionCallback, upsertGuildCommand, type MessageBody } from "../discord/bot.js";
import type { RawInteraction } from "../discord/gateway.js";
import { setStore } from "../set/store.js";
import { MENSAGEM_ERRO, podePromover, podeRebaixar, prever, promover, type Quem } from "./service.js";

/**
 * /promoção e /rebaixamento — mesmo fluxo, cada um com seus cargos (Painel → Promoções).
 * Painel V2 que só quem usou vê:
 *   1) policial  → menu com a escolha marcada; o × do próprio menu desmarca
 *   2) patente   → idem (no rebaixamento, só patentes ABAIXO da atual)
 *   3) prévia (patente atual → nova, apelido novo) [+ motivo, no rebaixamento] → Confirmar
 */

type Modo = "promocao" | "rebaixamento";

interface Fluxo {
  modo: Modo;
  comando: Record<string, unknown> & { name: string };
  p: string; // prefixo dos custom_ids
  cor: number;
  titulo: string;
  pode: (roles: string[]) => boolean;
  semPermissao: string;
  confirmar: string;
}

const FLUXOS: Fluxo[] = [
  {
    modo: "promocao",
    comando: {
      name: "promoção",
      type: 1,
      description: "Promover um policial (troca a patente, o cargo e a sigla do apelido)",
      contexts: [0],
      // "0" = escondido para quem não é admin. Libere os cargos em Integrações; o bot confere o cargo em todo passo.
      default_member_permissions: "0",
    },
    p: "pr",
    cor: 0xf1c40f,
    titulo: "### 🎖️ Promoção",
    pode: podePromover,
    semPermissao: MENSAGEM_ERRO.sem_permissao!,
    confirmar: "Confirmar promoção",
  },
  {
    modo: "rebaixamento",
    comando: {
      name: "rebaixamento",
      type: 1,
      description: "Rebaixar um policial (troca a patente, o cargo e a sigla do apelido)",
      contexts: [0],
      default_member_permissions: "0",
    },
    p: "rb",
    cor: 0xb45309,
    titulo: "### 📉 Rebaixamento",
    pode: podeRebaixar,
    semPermissao: MENSAGEM_ERRO.sem_permissao_rebaixar!,
    confirmar: "Confirmar rebaixamento",
  },
];

export const registrarComandosPromocao = () => Promise.all(FLUXOS.map((f) => upsertGuildCommand(f.comando))).then((r) => r.every(Boolean));

interface Rascunho {
  alvoId: string | null;
  patenteId: string | null;
  motivo: string | null;
  expira: number;
}
const rascunhos = new Map<string, Rascunho>();
function rascunho(chave: string): Rascunho {
  const agora = Date.now();
  for (const [k, v] of rascunhos) if (v.expira < agora) rascunhos.delete(k);
  let r = rascunhos.get(chave);
  if (!r) {
    if (rascunhos.size >= 200) rascunhos.delete(rascunhos.keys().next().value!);
    r = { alvoId: null, patenteId: null, motivo: null, expira: 0 };
    rascunhos.set(chave, r);
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

async function painel(f: Fluxo, r: Rascunho, aviso?: string): Promise<MessageBody> {
  const patentes = setStore.config().patentes;
  const id = (s: string) => `${f.p}:${s}`;
  const comps: unknown[] = [{ type: 10, content: `${f.titulo}\nEscolha o policial e a nova patente.` }];

  // Menus com o × do próprio Discord: min_values 0 + a escolha atual marcada dentro do menu.
  // Limpou (×) → volta ao passo anterior.
  const membro = r.alvoId ? await getMember(r.alvoId) : null;
  if (r.alvoId && !membro) {
    comps.push({ type: 10, content: "⚠️ Esse membro não está mais no servidor." });
    r.alvoId = null;
  }
  comps.push({
    type: 1,
    components: [{ type: 5, custom_id: id("pessoa"), placeholder: "Selecione o policial…", min_values: 0, max_values: 1, ...(r.alvoId ? { default_values: [{ id: r.alvoId, type: "user" }] } : {}) }],
  });
  if (r.alvoId && membro) {
    const atual = prever(membro, patentes[0]!).de;
    const idxAtual = atual ? patentes.findIndex((p) => p.id === atual.id) : -1;
    comps.push({ type: 10, content: `-# Patente atual: ${atual ? `**${atual.prefixo}** · ${atual.nome}` : "_não identificada_"}` });

    // Rebaixamento: só patentes abaixo da atual.
    const opcoes = f.modo === "rebaixamento" ? patentes.filter((_, i) => i < idxAtual) : patentes;
    const sel = r.patenteId ? opcoes.find((p) => p.id === r.patenteId) : undefined;
    if (f.modo === "rebaixamento" && idxAtual < 0) {
      comps.push({ type: 10, content: "⚠️ Não foi possível identificar a patente atual (sem cargo de patente, set ou sigla no apelido)." });
    } else if (opcoes.length === 0) {
      comps.push({ type: 10, content: "⚠️ Não há patente abaixo da atual." });
    } else {
      comps.push({
        type: 1,
        components: [
          {
            type: 3,
            custom_id: id("patente"),
            placeholder: "Selecione a nova patente…",
            min_values: 0,
            max_values: 1,
            options: opcoes.slice(-25).map((p) => ({
              label: `${p.prefixo} · ${p.nome}`.slice(0, 100),
              value: p.id,
              description: p.id === atual?.id ? "Patente atual" : p.cargoId ? undefined : "Sem cargo configurado",
              default: p.id === sel?.id,
            })),
          },
        ],
      });
    }
    if (sel) {
      const prev = prever(membro, sel);
      comps.push(
        { type: 14, divider: true, spacing: 1 },
        {
          type: 10,
          content: [
            `${prev.de ? `**${prev.de.prefixo}**` : "—"} → **${sel.prefixo}**${f.modo === "promocao" && !prev.subiu ? "  ·  ⚠️ patente abaixo da atual" : ""}`,
            `**Apelido:** ${prev.apelidoAntes ?? "—"} → **${prev.apelidoNovo ?? "não muda"}**`,
            ...(f.modo === "rebaixamento" ? [`**Motivo:** ${r.motivo ?? "_não informado_"}`] : []),
            ...(sel.cargoId ? [] : ["-# Essa patente não tem cargo configurado: só o apelido muda."]),
          ].join("\n"),
        },
        {
          type: 1,
          components: [
            { type: 2, style: f.modo === "rebaixamento" ? 4 : 3, label: f.confirmar, emoji: { name: f.modo === "rebaixamento" ? "📉" : "🎖️" }, custom_id: id("ok"), disabled: prev.de?.id === sel.id },
            ...(f.modo === "rebaixamento" ? [{ type: 2, style: 2, label: r.motivo ? "Editar motivo" : "Motivo (opcional)", emoji: { name: "✏️" }, custom_id: id("motivo") }] : []),
          ],
        },
      );
    }
  }
  if (aviso) comps.push({ type: 10, content: `⚠️ ${aviso}` });
  return caixa(f.cor, comps);
}

export async function handlePromocaoInteraction(i: RawInteraction): Promise<boolean> {
  const cid = i.data?.custom_id ?? "";
  const f = FLUXOS.find((x) => (i.type === 2 && i.data?.name === x.comando.name) || cid.startsWith(`${x.p}:`));
  if (!f) return false;
  const member = i.member;
  if (!member) {
    await responder(i, 4, caixa(0xe10600, [{ type: 10, content: "Use dentro do servidor." }]));
    return true;
  }
  const comando = i.type === 2;
  const acao = cid.slice(f.p.length + 1);
  const chave = `${f.modo}:${member.user.id}`;

  // Cargo conferido em todo passo — a visibilidade do comando no Discord não basta.
  if (!f.pode(member.roles ?? [])) {
    rascunhos.delete(chave);
    await responder(i, comando ? 4 : 7, caixa(0xe10600, [{ type: 10, content: `🔒 ${f.semPermissao}` }]));
    return true;
  }
  if (comando || acao === "nova") {
    rascunhos.delete(chave);
    await responder(i, comando ? 4 : 7, await painel(f, rascunho(chave)));
    return true;
  }

  const r = rascunho(chave);
  if (acao === "pessoa") {
    const alvo = i.data?.values?.[0] ?? null;
    if (alvo === member.user.id) {
      await responder(i, 7, await painel(f, r, MENSAGEM_ERRO.auto_promocao));
      return true;
    }
    // × no menu (lista vazia) = desmarcou.
    r.alvoId = alvo;
    r.patenteId = null;
  } else if (acao === "patente") {
    r.patenteId = i.data?.values?.[0] ?? null;
  } else if (acao === "motivo" && i.type === 3) {
    await responder(i, 9, {
      custom_id: `${f.p}:motivook`,
      title: "Motivo do rebaixamento",
      components: [{ type: 18, label: "Motivo", component: { type: 4, custom_id: "motivo", style: 2, required: false, max_length: 300, placeholder: "Opcional", ...(r.motivo ? { value: r.motivo } : {}) } }],
    });
    return true;
  } else if (acao === "motivook" && i.type === 5) {
    const comps = (i.data?.components ?? []) as Array<{ component?: { value?: string } }>;
    const v = (comps[0]?.component?.value ?? "").replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "").trim().slice(0, 300);
    r.motivo = v || null;
  } else if (acao === "ok") {
    if (!r.alvoId || !r.patenteId) {
      await responder(i, 7, await painel(f, r, "Escolha o policial e a patente."));
      return true;
    }
    await responder(i, 6);
    const res = await promover(r.alvoId, r.patenteId, quemDe(i), { modo: f.modo, motivo: r.motivo });
    if (!res.ok) {
      await editInteractionReply(i.token, paraEdicao(await painel(f, r, MENSAGEM_ERRO[res.erro] ?? "Não foi possível concluir.")));
      return true;
    }
    rascunhos.delete(chave);
    const p = res.registro;
    const falhas = [
      ...(p.statusCargos === "falhou" ? ["o Discord recusou trocar algum cargo (o cargo do bot precisa estar acima das patentes)"] : []),
      ...(p.statusApelido === "falhou" ? ["o Discord recusou trocar o apelido (dono do servidor ou cargo acima do bot)"] : []),
    ];
    await editInteractionReply(
      i.token,
      paraEdicao(
        caixa(0x22c55e, [
          {
            type: 10,
            content: [
              `### ✅ ${f.modo === "rebaixamento" ? "Rebaixamento registrado" : p.subiu ? "Promoção registrada" : "Patente alterada"}`,
              `<@${p.userId}>: ${p.de?.prefixo ?? "—"} → **${p.para.prefixo}**`,
              ...(p.apelidoNovo ? [`Apelido: **${p.apelidoNovo}**`] : []),
              p.anuncio ? `Anúncio publicado em <#${p.anuncio.canalId}>.` : "-# Nenhum canal de anúncio configurado no painel.",
              ...falhas.map((x) => `⚠️ ${x}`),
            ].join("\n"),
          },
          { type: 1, components: [{ type: 2, style: 2, label: f.modo === "rebaixamento" ? "Rebaixar outro" : "Promover outro", custom_id: `${f.p}:nova` }] },
        ]),
      ),
    );
    return true;
  }
  await responder(i, 7, await painel(f, r));
  return true;
}
