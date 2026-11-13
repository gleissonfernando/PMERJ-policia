import { randomUUID } from "node:crypto";
import { emojiLogo } from "../branding/emoji.js";
import { logoDiscord } from "../branding/logo.js";
import { corregStore } from "../corregedoria/store.js";
import {
  addRole,
  createTicketChannel,
  createWebhook,
  deleteChannel,
  editMessage,
  executeWebhook,
  FLAG_COMPONENTS_V2,
  getMember,
  kickMember,
  postMessage,
  removeRole,
  sendDM,
  type MembroDiscord,
  type MessageBody,
} from "../discord/bot.js";
import { env } from "../env.js";
import { patenteAtual, patentePelaSigla } from "../promocao/service.js";
import { brasao } from "../set/brasao.js";
import { disciplinaStore, type NivelAdvertencia, type RegistroDisciplinar, type Reuniao, type TipoRegistro } from "./store.js";

/**
 * Gestão disciplinar (tudo por CARGO):
 *  - advertência: dá o cargo do nível e tira os dos outros níveis · remover: tira os cargos de nível
 *  - exoneração: DM com o motivo e expulsão do servidor
 *  - reunião: canal temporário só para a gestão e o convocado; a equipe fala como a corregedoria
 * Cada medida é registrada (aparece no /perfil) e anunciada no canal configurado.
 */

export interface Quem {
  id: string;
  nome: string;
}
export type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: string };
const falha = (erro: string): { ok: false; erro: string } => ({ ok: false, erro });

const COR = 0x1e3a8a;
const nn = (n: number) => String(n).padStart(4, "0");
const nomeExibicao = () => corregStore.config().nomeExibicao;
const rodape = () => {
  const e = emojiLogo();
  return { type: 10, content: `-# ${e ? `${e} ` : ""}${nomeExibicao()}` };
};
const avatarUrl = (id: string, avatar: string | null) =>
  avatar ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=256` : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(id) >> 22n) % 6}.png`;

export function podeGerir(roles: string[]): boolean {
  const lista = disciplinaStore.config().cargosGestao;
  return lista.length > 0 && roles.some((r) => lista.includes(r));
}

/** Nível de advertência atual = o mais alto cujo cargo a pessoa tem. */
export function nivelAtual(roles: string[]): NivelAdvertencia | null {
  const niveis = disciplinaStore.config().niveis;
  for (let i = niveis.length - 1; i >= 0; i--) if (niveis[i]!.cargoId && roles.includes(niveis[i]!.cargoId!)) return niveis[i]!;
  return null;
}

/** "SD Silva" — insígnia (sigla da patente) + nome, para registros e painéis. */
export function nomeComInsignia(m: MembroDiscord): string {
  const apelido = m.nick ?? m.user.global_name ?? m.user.username;
  const p = patenteAtual(m.user.id, m.roles) ?? patentePelaSigla(apelido);
  return p && !apelido.toLowerCase().startsWith(p.prefixo.toLowerCase()) ? `${p.prefixo} ${apelido}` : apelido;
}

async function registrar(tipo: TipoRegistro, m: MembroDiscord, por: Quem, extra: { nivel?: NivelAdvertencia | null; motivo: string | null; ok: boolean }) {
  const r: RegistroDisciplinar = {
    id: randomUUID(),
    tipo,
    userId: m.user.id,
    username: m.user.username,
    avatar: m.user.avatar,
    nome: nomeComInsignia(m),
    nivel: extra.nivel ? { id: extra.nivel.id, nome: extra.nivel.nome } : null,
    motivo: extra.motivo,
    por,
    em: Date.now(),
    ok: extra.ok,
  };
  await disciplinaStore.addRegistro(r);
  return r;
}

function anuncio(cor: number, titulo: string, frase: string, r: RegistroDisciplinar): MessageBody {
  return {
    flags: FLAG_COMPONENTS_V2,
    allowed_mentions: { parse: [], users: [r.userId] },
    components: [
      {
        type: 17,
        accent_color: cor,
        components: [
          {
            type: 9,
            components: [
              { type: 10, content: titulo },
              { type: 10, content: frase },
              { type: 10, content: `-# ${r.nome}${r.motivo ? `\n-# Motivo: ${r.motivo}` : ""}` },
            ],
            accessory: { type: 11, media: { url: avatarUrl(r.userId, r.avatar) }, description: `Avatar de ${r.username}`.slice(0, 1024) },
          },
          { type: 10, content: `-# ${emojiLogo() ? `${emojiLogo()} ` : ""}${nomeExibicao()} · <t:${Math.floor(r.em / 1000)}:f>` },
        ],
      },
    ],
  };
}

/* ---------- Advertência ---------- */

export async function aplicarAdvertencia(alvoId: string, nivelId: string, motivo: string | null, por: Quem): Promise<Resultado<RegistroDisciplinar>> {
  if (alvoId === por.id) return falha("propria_pessoa");
  const nivel = disciplinaStore.config().niveis.find((n) => n.id === nivelId);
  if (!nivel) return falha("nivel_invalido");
  if (!nivel.cargoId) return falha("nivel_sem_cargo");
  const m = await getMember(alvoId);
  if (!m) return falha("membro_nao_encontrado");
  const motivoAudit = `Advertência (${nivel.nome}) por ${por.nome}`;
  const outros = disciplinaStore.config().niveis.map((n) => n.cargoId).filter((c): c is string => Boolean(c) && c !== nivel.cargoId && m.roles.includes(c!));
  const res = await Promise.all([addRole(alvoId, nivel.cargoId, motivoAudit), ...outros.map((c) => removeRole(alvoId, c, motivoAudit))]);
  const r = await registrar("advertencia", m, por, { nivel, motivo, ok: res.every(Boolean) });
  const canal = disciplinaStore.config().canalAdvertenciaId;
  if (canal) await postMessage(canal, anuncio(0xf59e0b, "### ⚠️ Advertência", `<@${alvoId}> **recebeu** <@&${nivel.cargoId}>.`, r));
  console.info(`[disciplina] advertência ${nivel.nome} para discord:${alvoId} por discord:${por.id}`);
  return r.ok ? { ok: true, valor: r } : falha("cargo_recusado");
}

export async function removerAdvertencia(alvoId: string, motivo: string | null, por: Quem): Promise<Resultado<RegistroDisciplinar>> {
  if (alvoId === por.id) return falha("propria_pessoa");
  const m = await getMember(alvoId);
  if (!m) return falha("membro_nao_encontrado");
  const atual = nivelAtual(m.roles);
  const cargos = disciplinaStore.config().niveis.map((n) => n.cargoId).filter((c): c is string => Boolean(c) && m.roles.includes(c!));
  if (cargos.length === 0) return falha("sem_advertencia");
  const res = await Promise.all(cargos.map((c) => removeRole(alvoId, c, `Advertência removida por ${por.nome}`)));
  const r = await registrar("advertencia_removida", m, por, { nivel: atual, motivo, ok: res.every(Boolean) });
  const canal = disciplinaStore.config().canalAdvertenciaId;
  if (canal) await postMessage(canal, anuncio(0x22c55e, "### ✅ Advertência removida", `<@${alvoId}> **teve a advertência removida**${atual ? ` (${atual.nome})` : ""}.`, r));
  return r.ok ? { ok: true, valor: r } : falha("cargo_recusado");
}

/* ---------- Exoneração ---------- */

export async function exonerar(alvoId: string, motivo: string | null, por: Quem): Promise<Resultado<RegistroDisciplinar>> {
  if (alvoId === por.id) return falha("propria_pessoa");
  const m = await getMember(alvoId);
  if (!m) return falha("membro_nao_encontrado");
  if (m.user.bot) return falha("alvo_bot");
  // DM ANTES de expulsar (depois o bot não alcança mais a pessoa pelo servidor).
  await sendDM(alvoId, {
    flags: FLAG_COMPONENTS_V2,
    components: [
      {
        type: 17,
        accent_color: 0xe10600,
        components: [
          { type: 10, content: `### 🚫 Você foi exonerado(a) da PMERJ\n${motivo ? `**Motivo:** ${motivo}` : "Nenhum motivo foi informado."}` },
          rodape(),
        ],
      },
    ],
  });
  const ok = await kickMember(alvoId, `Exoneração por ${por.nome}${motivo ? `: ${motivo}` : ""}`.slice(0, 400));
  const r = await registrar("exoneracao", m, por, { motivo, ok });
  const canal = disciplinaStore.config().canalExoneracaoId;
  if (canal && ok) await postMessage(canal, anuncio(0xe10600, "### 🚫 Exoneração", `<@${alvoId}> **foi exonerado(a) da corporação.**`, r));
  console.info(`[disciplina] exoneração de discord:${alvoId} por discord:${por.id} (${ok ? "expulso" : "falhou"})`);
  return ok ? { ok: true, valor: r } : falha("expulsao_recusada");
}

/* ---------- Reunião ---------- */

export const canalUrl = (r: Reuniao) => `https://discord.com/channels/${env.DISCORD_GUILD_ID}/${r.canalId}`;

export function painelReuniao(r: Reuniao): MessageBody {
  const encerrada = r.status === "encerrada";
  const status = r.status === "iniciada" ? `🟢 **Reunião iniciada** <t:${Math.floor((r.iniciadaEm ?? Date.now()) / 1000)}:R>` : encerrada ? "🔒 **Reunião encerrada.**" : "🟡 **Aguardando o início da reunião.**";
  const l = logoDiscord();
  const cab = [
    { type: 10, content: `## 📅 Reunião com a Corregedoria · #${nn(r.numero)}` },
    { type: 10, content: `**Convocado:** <@${r.userId}> · ${r.nome}\n**Motivo:** ${r.motivo ?? "_não informado_"}` },
  ];
  return {
    flags: FLAG_COMPONENTS_V2,
    allowed_mentions: { parse: [], users: [r.userId] },
    components: [
      {
        type: 17,
        accent_color: encerrada ? 0x4b5563 : r.status === "iniciada" ? 0x22c55e : COR,
        components: [
          ...[l ? { type: 9, components: cab, accessory: { type: 11, media: { url: `attachment://${l.nomeArquivo}` }, description: "Logo da PMERJ" } } : cab].flat(),
          { type: 14, divider: true, spacing: 1 },
          { type: 10, content: status },
          ...(encerrada
            ? []
            : [
                { type: 10, content: "-# 🛡️ Somente Corregedoria" },
                {
                  type: 1,
                  components: [
                    { type: 2, style: 3, label: "Iniciar reunião", emoji: { name: "▶️" }, custom_id: `dc:iniciar:${r.id}`, disabled: r.status === "iniciada" },
                    { type: 2, style: 1, label: "Painel de gerenciamento da corregedoria", emoji: { name: "⚖️" }, custom_id: `dc:gestao:${r.id}` },
                  ],
                },
                {
                  type: 1,
                  components: [
                    { type: 2, style: 2, label: "Chamar novamente", emoji: { name: "🔔" }, custom_id: `dc:chamar:${r.id}` },
                    { type: 2, style: 4, label: "Fechar canal", emoji: { name: "🔒" }, custom_id: `dc:fechar:${r.id}` },
                  ],
                },
              ]),
          rodape(),
        ],
      },
    ],
  };
}

async function avisarConvocado(r: Reuniao, novamente = false) {
  return sendDM(r.userId, {
    flags: FLAG_COMPONENTS_V2,
    components: [
      {
        type: 17,
        accent_color: COR,
        components: [
          { type: 10, content: `### 📅 ${novamente ? "A Corregedoria está chamando você" : "Você foi convocado(a) para uma reunião com a Corregedoria"}\n${r.motivo ? `**Motivo:** ${r.motivo}` : "Compareça ao canal da reunião."}` },
          { type: 1, components: [{ type: 2, style: 5, label: "Ir para a reunião", emoji: { name: "🛡️" }, url: canalUrl(r) }] },
          rodape(),
        ],
      },
    ],
  });
}

export async function abrirReuniao(alvoId: string, motivo: string | null, por: Quem): Promise<Resultado<{ reuniao: Reuniao; dm: boolean }>> {
  if (alvoId === por.id) return falha("propria_pessoa");
  const cfg = disciplinaStore.config();
  const m = await getMember(alvoId);
  if (!m) return falha("membro_nao_encontrado");
  if (m.user.bot) return falha("alvo_bot");
  const r: Reuniao = {
    id: randomUUID(),
    numero: disciplinaStore.proximaReuniao(),
    userId: alvoId,
    username: m.user.username,
    avatar: m.user.avatar,
    nome: nomeComInsignia(m),
    motivo,
    canalId: null,
    painelMensagemId: null,
    webhook: null,
    status: "aguardando",
    abertaPor: por,
    criadaEm: Date.now(),
    iniciadaEm: null,
    encerradaEm: null,
  };
  const canal = await createTicketChannel({
    nome: `📅・reuniao-${nn(r.numero)}`,
    topico: `Reunião com a Corregedoria · #${nn(r.numero)}`,
    categoriaId: cfg.categoriaId,
    cargos: cfg.cargosGestao,
    usuarioId: alvoId,
    motivo: `Reunião da corregedoria #${nn(r.numero)}`,
  });
  if (!canal) return falha("falha_canal");
  r.canalId = canal;
  const logo = logoDiscord();
  r.webhook = await createWebhook(canal, nomeExibicao(), logo ? { dados: logo.dados, tipo: logo.tipo } : null);
  await disciplinaStore.addReuniao(r);
  const painel = await postMessage(canal, painelReuniao(r), brasao());
  if (painel) r.painelMensagemId = painel.id;
  await postMessage(canal, { content: `<@${alvoId}>, você foi convocado(a) pela Corregedoria. Aguarde o início da reunião.`, allowed_mentions: { parse: [], users: [alvoId] } });
  await disciplinaStore.salvar();
  const dm = await avisarConvocado(r);
  console.info(`[disciplina] reunião #${nn(r.numero)} com discord:${alvoId} aberta por discord:${por.id}`);
  return { ok: true, valor: { reuniao: r, dm } };
}

async function atualizarPainel(r: Reuniao) {
  if (r.canalId && r.painelMensagemId) await editMessage(r.canalId, r.painelMensagemId, painelReuniao(r), brasao());
}

/** Fala no canal da reunião como a corregedoria (webhook com o nome de exibição). */
export async function falarNaReuniao(r: Reuniao, texto: string, arquivos: Parameters<typeof executeWebhook>[2] = []) {
  if (!r.canalId) return false;
  const corpo = { content: texto.slice(0, 2000) };
  return Boolean(r.webhook ? await executeWebhook(r.webhook, corpo, arquivos) : await postMessage(r.canalId, { ...corpo, allowed_mentions: { parse: [] } }, arquivos));
}

export async function iniciarReuniao(r: Reuniao): Promise<Resultado<Reuniao>> {
  if (r.status !== "aguardando") return falha("reuniao_ja_iniciada");
  r.status = "iniciada";
  r.iniciadaEm = Date.now();
  await disciplinaStore.salvar();
  await atualizarPainel(r);
  await falarNaReuniao(r, "▶️ A reunião foi iniciada.");
  return { ok: true, valor: r };
}

export async function chamarNovamente(r: Reuniao): Promise<Resultado<Reuniao>> {
  return (await avisarConvocado(r, true)) ? { ok: true, valor: r } : falha("dm_bloqueada");
}

/** Sem transcript: fecha, avisa e apaga o canal. */
export async function fecharReuniao(r: Reuniao): Promise<Resultado<Reuniao>> {
  if (r.status === "encerrada") return falha("reuniao_encerrada");
  r.status = "encerrada";
  r.encerradaEm = Date.now();
  await disciplinaStore.salvar();
  await atualizarPainel(r);
  const canal = r.canalId;
  if (canal) {
    await postMessage(canal, { content: "🔒 Reunião encerrada. Este canal será apagado em 5 segundos.", allowed_mentions: { parse: [] } });
    setTimeout(() => void deleteChannel(canal, `Reunião #${nn(r.numero)} encerrada`), 5_000);
  }
  return { ok: true, valor: r };
}

export const MENSAGEM_ERRO: Record<string, string> = {
  sem_permissao: "Somente a gestão da corregedoria pode fazer isso.",
  propria_pessoa: "Você não pode aplicar isso a si mesmo.",
  nivel_invalido: "Nível de advertência não encontrado.",
  nivel_sem_cargo: "Esse nível de advertência não tem cargo configurado.",
  membro_nao_encontrado: "Essa pessoa não está mais no servidor.",
  alvo_bot: "Não é possível aplicar isso a um bot.",
  cargo_recusado: "Registrado, mas o Discord recusou trocar o cargo (o cargo do bot precisa estar acima).",
  sem_advertencia: "Essa pessoa não tem advertência.",
  expulsao_recusada: "O Discord recusou a expulsão (dono do servidor ou cargo acima do bot).",
  falha_canal: "Não foi possível criar o canal da reunião.",
  reuniao_ja_iniciada: "A reunião já foi iniciada.",
  reuniao_encerrada: "Esta reunião já foi encerrada.",
  dm_bloqueada: "Não foi possível enviar a DM: a pessoa bloqueia mensagens diretas.",
};
