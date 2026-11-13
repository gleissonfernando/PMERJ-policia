import { randomUUID } from "node:crypto";
import { emojiLogo } from "../branding/emoji.js";
import { addReaction, addRole, botAtivo, FLAG_COMPONENTS_V2, getMember, postMessage, removeRole, sendLog, setNickname, type MembroDiscord } from "../discord/bot.js";
import { APELIDO_MAX, montarApelido } from "../set/apelido.js";
import { setStore } from "../set/store.js";
import type { Patente } from "../set/types.js";
import { promocaoStore, type PatenteFoto, type Promocao, type StatusAcao } from "./store.js";

/**
 * Promoção: troca a patente de um policial.
 *   - tira o cargo da patente antiga (e de qualquer outra patente) e dá o da nova
 *   - no apelido, troca SÓ a sigla da patente — nome e ID continuam
 *   - registra no histórico, atualiza o set e anuncia no canal configurado
 * As patentes (ordem = hierarquia, sigla, cargo) são as do Pedir Set.
 */

export interface Quem {
  id: string;
  nome: string;
}

const foto = (p: Patente): PatenteFoto => ({ id: p.id, nome: p.nome, prefixo: p.prefixo, cargoId: p.cargoId ?? null });

/** Pode usar /promoção: tem um dos cargos configurados (cargos ATUAIS do Discord). */
export function podePromover(roles: string[]): boolean {
  const lista = promocaoStore.config().cargosPromover;
  return lista.length > 0 && roles.some((r) => lista.includes(r));
}

/** Pode usar /rebaixamento (e rebaixar pela corregedoria). */
export function podeRebaixar(roles: string[]): boolean {
  const lista = promocaoStore.config().cargosRebaixar;
  return lista.length > 0 && roles.some((r) => lista.includes(r));
}

/**
 * Patente atual: pelo CARGO de patente que a pessoa tem no Discord (o mais alto);
 * sem cargo de patente, usa o set registrado.
 */
export function patenteAtual(userId: string, roles: string[]): Patente | null {
  const patentes = setStore.config().patentes;
  for (let i = patentes.length - 1; i >= 0; i--) {
    const p = patentes[i]!;
    if (p.cargoId && roles.includes(p.cargoId)) return p;
  }
  const set = setStore.atual(userId);
  return set ? (patentes.find((p) => p.id === set.patente.id) ?? null) : null;
}

/** Último recurso: a sigla no começo do apelido ("SD Silva | 1234" → SD). */
export function patentePelaSigla(apelido: string | null): Patente | null {
  if (!apelido) return null;
  const a = apelido.toLowerCase();
  const ordem = [...setStore.config().patentes].sort((x, y) => y.prefixo.length - x.prefixo.length);
  return ordem.find((p) => a.startsWith(`${p.prefixo.toLowerCase()} `) || a.startsWith(`[${p.prefixo.toLowerCase()}] `)) ?? null;
}

/**
 * Novo apelido: com set registrado, remonta pelo formato (nome e ID do set).
 * Sem set, troca a sigla no apelido atual ("SD Silva | 1234" → "CB Silva | 1234").
 */
export function novoApelido(userId: string, apelidoAtual: string | null, nova: Patente): string | null {
  const cfg = setStore.config();
  const set = setStore.atual(userId);
  if (set) {
    const a = montarApelido(cfg.formato, { prefixo: nova.prefixo, nome: set.nome, id: set.gameId, orgao: set.orgao?.sigla });
    return a.slice(0, APELIDO_MAX);
  }
  if (!apelidoAtual) return null;
  // Sigla mais longa primeiro ("2º SGT" antes de "SGT"); aceita "[SD] Silva" também.
  const siglas = cfg.patentes.map((p) => p.prefixo).sort((a, b) => b.length - a.length);
  for (const s of siglas) {
    for (const forma of [`[${s}] `, `${s} `]) {
      if (apelidoAtual.toLowerCase().startsWith(forma.toLowerCase())) {
        const resto = apelidoAtual.slice(forma.length);
        return (forma.startsWith("[") ? `[${nova.prefixo}] ${resto}` : `${nova.prefixo} ${resto}`).slice(0, APELIDO_MAX);
      }
    }
  }
  return `${nova.prefixo} ${apelidoAtual}`.slice(0, APELIDO_MAX);
}

export interface Previa {
  de: Patente | null;
  para: Patente;
  apelidoAntes: string | null;
  apelidoNovo: string | null;
  subiu: boolean;
}

export function prever(membro: MembroDiscord, para: Patente): Previa {
  const patentes = setStore.config().patentes;
  const antes = membro.nick ?? membro.user.global_name ?? membro.user.username;
  const de = patenteAtual(membro.user.id, membro.roles) ?? patentePelaSigla(antes);
  return {
    de,
    para,
    apelidoAntes: antes,
    apelidoNovo: novoApelido(membro.user.id, antes, para),
    subiu: !de || patentes.findIndex((p) => p.id === para.id) > patentes.findIndex((p) => p.id === de.id),
  };
}

/* ---------- Anúncio (Components V2) ---------- */

const avatarUrl = (id: string, avatar: string | null) =>
  avatar ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=256` : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(id) >> 22n) % 6}.png`;

export function mensagemAnuncio(r: Promocao) {
  const cfg = promocaoStore.config();
  const emoji = emojiLogo();
  const alvo = r.para.cargoId ? `<@&${r.para.cargoId}>` : `**${r.para.nome}**`;
  const rebaixou = r.modo === "rebaixamento";
  const titulo = rebaixou ? "### 📉 Rebaixamento" : r.subiu ? "### 🎖️ Promoção" : "### Alteração de patente";
  const frase = rebaixou
    ? `<@${r.userId}> **foi rebaixado(a) a** ${alvo}.`
    : r.subiu
      ? `<@${r.userId}> **foi promovido(a) a** ${alvo} **!** 🎉`
      : `<@${r.userId}> **teve a patente alterada para** ${alvo}.`;
  return {
    flags: FLAG_COMPONENTS_V2,
    // Só a própria pessoa é notificada. Cargos aparecem mas não pingam.
    allowed_mentions: { parse: [], users: [r.userId] },
    components: [
      {
        type: 17,
        accent_color: rebaixou ? 0xb45309 : r.subiu ? 0xf1c40f : 0x6b7280,
        components: [
          {
            type: 9,
            components: [
              { type: 10, content: titulo },
              { type: 10, content: frase },
              { type: 10, content: `-# ${r.de ? `${r.de.prefixo} → ${r.para.prefixo} · ` : ""}por <@${r.por.id}>${r.motivo ? `\n-# Motivo: ${r.motivo}` : ""}` },
            ],
            accessory: { type: 11, media: { url: avatarUrl(r.userId, r.avatar) }, description: `Avatar de ${r.username}`.slice(0, 1024) },
          },
          { type: 10, content: `-# ${emoji ? `${emoji} ` : ""}${rebaixou ? "PMERJ · Corregedoria" : cfg.rodape} · <t:${Math.floor(r.em / 1000)}:f>` },
        ],
      },
    ],
  };
}

/* ---------- Promover ---------- */

export type Resultado = { ok: true; registro: Promocao } | { ok: false; erro: string };

export interface OpcoesPromocao {
  modo?: "promocao" | "rebaixamento";
  motivo?: string | null;
}

export async function promover(alvoId: string, patenteId: string, por: Quem, opcoes: OpcoesPromocao = {}): Promise<Resultado> {
  const modo = opcoes.modo ?? "promocao";
  const rebaixamento = modo === "rebaixamento";
  if (!botAtivo) return { ok: false, erro: "bot_desligado" };
  if (alvoId === por.id) return { ok: false, erro: "auto_promocao" };
  const cfg = setStore.config();
  const para = cfg.patentes.find((p) => p.id === patenteId);
  if (!para) return { ok: false, erro: "patente_invalida" };
  // Dados ATUAIS do alvo (cargos e apelido podem ter mudado desde que o painel foi aberto).
  const membro = await getMember(alvoId);
  if (!membro) return { ok: false, erro: "membro_nao_encontrado" };
  if (membro.user.bot) return { ok: false, erro: "alvo_bot" };
  const prev = prever(membro, para);
  if (prev.de?.id === para.id) return { ok: false, erro: "mesma_patente" };
  // Rebaixamento só para uma patente ABAIXO da atual (e precisa saber qual é a atual).
  if (rebaixamento && (!prev.de || prev.subiu)) return { ok: false, erro: prev.de ? "nao_e_rebaixamento" : "patente_atual_desconhecida" };

  const motivo = `${rebaixamento ? "Rebaixamento" : "Promoção"} para ${para.nome} por ${por.nome}`.slice(0, 400);

  // Cargos: dá o da nova patente e tira os de todas as outras patentes.
  let statusCargos: StatusAcao = "nao_se_aplica";
  const dar = para.cargoId ? [para.cargoId] : [];
  const tirar = cfg.patentes.map((p) => p.cargoId).filter((c): c is string => Boolean(c) && c !== para.cargoId && membro.roles.includes(c!));
  if (dar.length || tirar.length) {
    const r = await Promise.all([...dar.map((c) => addRole(alvoId, c, motivo)), ...tirar.map((c) => removeRole(alvoId, c, motivo))]);
    statusCargos = r.every(Boolean) ? "feito" : "falhou";
  }

  // Apelido: troca só a sigla.
  let statusApelido: StatusAcao = "nao_se_aplica";
  if (prev.apelidoNovo && prev.apelidoNovo !== membro.nick) statusApelido = (await setNickname(alvoId, prev.apelidoNovo, motivo)) ? "feito" : "falhou";

  const agora = Date.now();
  const registro: Promocao = {
    id: randomUUID(),
    userId: alvoId,
    username: membro.user.username,
    avatar: membro.user.avatar,
    de: prev.de ? foto(prev.de) : null,
    para: foto(para),
    modo,
    motivo: opcoes.motivo ?? null,
    subiu: prev.subiu,
    apelidoAntes: prev.apelidoAntes,
    apelidoNovo: prev.apelidoNovo,
    statusApelido,
    statusCargos,
    por,
    em: agora,
    anuncio: null,
  };

  // O set registrado acompanha a nova patente (o /perfil e o site mostram a patente certa).
  const set = setStore.atual(alvoId);
  if (set) {
    await setStore.add({
      ...set,
      id: randomUUID(),
      patente: { ...para },
      apelido: prev.apelidoNovo ?? set.apelido,
      statusApelido: statusApelido === "feito" ? "aplicado" : statusApelido === "falhou" ? "falhou" : set.statusApelido,
      statusCargos,
      origem: "discord",
      em: agora,
      decididoPor: { id: por.id, username: por.nome },
      decididoEm: agora,
      motivo: `${rebaixamento ? "Rebaixamento" : "Promoção"}: ${prev.de?.prefixo ?? "—"} → ${para.prefixo}`,
      mensagem: null,
    });
  }

  // Anúncio no canal (+ 🎉 só na promoção)
  const canal = rebaixamento ? promocaoStore.config().canalRebaixamentoId : promocaoStore.config().canalAnuncioId;
  if (canal) {
    const msg = await postMessage(canal, mensagemAnuncio(registro));
    if (msg) {
      registro.anuncio = { canalId: canal, mensagemId: msg.id };
      if (!rebaixamento && prev.subiu) void addReaction(canal, msg.id, "🎉");
    }
  }
  await promocaoStore.add(registro);
  console.info(`[promocao] discord:${alvoId} ${prev.de?.prefixo ?? "—"} → ${para.prefixo} por discord:${por.id}`);
  void sendLog(cfg.logCanalId, {
    title: rebaixamento ? "📉 Rebaixamento" : prev.subiu ? "🎖️ Promoção" : "Alteração de patente",
    color: rebaixamento ? 0xb45309 : prev.subiu ? 0xf1c40f : 0x6b7280,
    fields: [
      { name: "Policial", value: `<@${alvoId}>`, inline: true },
      { name: "Patente", value: `${prev.de?.prefixo ?? "—"} → ${para.prefixo}`, inline: true },
      { name: "Por", value: `<@${por.id}>`, inline: true },
      { name: "Apelido", value: prev.apelidoNovo ?? "—" },
      ...(opcoes.motivo ? [{ name: "Motivo", value: opcoes.motivo }] : []),
    ],
    footer: "PMERJ · Promoções",
  });
  return { ok: true, registro };
}

export const MENSAGEM_ERRO: Record<string, string> = {
  sem_permissao: "Seu cargo não pode promover.",
  bot_desligado: "O bot não está configurado no servidor.",
  auto_promocao: "Você não pode promover a si mesmo.",
  patente_invalida: "Patente não encontrada (a lista pode ter mudado).",
  membro_nao_encontrado: "Esse policial não está mais no servidor.",
  alvo_bot: "Bots não podem ser promovidos.",
  mesma_patente: "O policial já está nessa patente.",
  sem_permissao_rebaixar: "Seu cargo não pode rebaixar.",
  nao_e_rebaixamento: "Rebaixamento só para uma patente abaixo da atual.",
  patente_atual_desconhecida: "Não foi possível identificar a patente atual do policial.",
};
