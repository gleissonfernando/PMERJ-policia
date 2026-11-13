import { randomBytes, randomUUID } from "node:crypto";
import { emojiLogo } from "../branding/emoji.js";
import { logoDiscord } from "../branding/logo.js";
import {
  createTicketChannel,
  createWebhook,
  deleteChannel,
  editMessage,
  executeWebhook,
  FLAG_COMPONENTS_V2,
  getMember,
  postMessage,
  sendDM,
  setSendPermission,
  type Arquivo,
  type MessageBody,
} from "../discord/bot.js";
import { env } from "../env.js";
import { brasao } from "../set/brasao.js";
import { setStore } from "../set/store.js";
import { baixarAnexo, ehVideo } from "./arquivos.js";
import { corregStore, type Anexo, type EventoTicket, type Ticket, type TipoTicket } from "./store.js";

/**
 * Corregedoria — tickets.
 *  - canal temporário só para a equipe da corregedoria e quem abriu
 *  - a equipe NUNCA aparece pelo nome: as respostas saem pelo webhook com o nome de exibição
 *  - tudo fica registrado (eventos + arquivos) para o transcript
 */

export interface Quem {
  id: string;
  nome: string;
}
export type Resultado<T = Ticket> = { ok: true; valor: T } | { ok: false; erro: string };
const falha = (erro: string): { ok: false; erro: string } => ({ ok: false, erro });

const COR = 0x1e3a8a; // azul-marinho da corregedoria
export const MAX_PROVAS = 5;

/* ---------- Permissões e dados ---------- */

export function ehCorregedor(roles: string[]): boolean {
  const lista = corregStore.config().cargosCorregedoria;
  return lista.length > 0 && roles.some((r) => lista.includes(r));
}

/** Insígnia (sigla da patente) e nome de quem abre: do set; sem set, do apelido no servidor. */
export function identificacao(userId: string, apelido: string | null, username: string): { insignia: string | null; nome: string } {
  const set = setStore.atual(userId);
  if (set) return { insignia: set.patente.prefixo, nome: set.nome };
  return { insignia: null, nome: apelido ?? username };
}

export const transcriptUrl = (t: Ticket) => `${env.WEB_ORIGIN}/transcript/${t.userId}?ticket=${t.id}&chave=${t.chave}`;
export const canalUrl = (t: Ticket) => `https://discord.com/channels/${env.DISCORD_GUILD_ID}/${t.canalId}`;
const nn = (n: number) => String(n).padStart(4, "0");
const rodape = () => {
  const e = emojiLogo();
  return { type: 10, content: `-# ${e ? `${e} ` : ""}${corregStore.config().nomeExibicao}` };
};

function registrar(t: Ticket, e: Omit<EventoTicket, "id" | "em">): EventoTicket {
  const ev = { ...e, id: randomUUID(), em: Date.now() };
  t.eventos.push(ev);
  return ev;
}

/** Próximo número de arquivo do ticket (001, 002…). */
const proximoArquivo = (t: Ticket) => t.provas.length + t.eventos.reduce((s, e) => s + e.anexos.length, 0) + 1;

/** Baixa vários anexos para o ticket. Devolve os que deram certo e os avisos. */
export async function guardarAnexos(t: Ticket, atts: Array<{ url: string; size: number; filename: string }>) {
  const anexos: Anexo[] = [];
  const arquivos: Arquivo[] = [];
  const avisos: string[] = [];
  for (const att of atts) {
    const r = await baixarAnexo(t.id, proximoArquivo(t) + anexos.length, att);
    if (r.ok) {
      anexos.push(r.anexo);
      arquivos.push({ nome: r.anexo.arquivo, dados: r.dados, tipo: r.anexo.tipo });
    } else avisos.push(r.erro);
  }
  return { anexos, arquivos, avisos };
}

/* ---------- Painel do ticket (Components V2) ---------- */

export function painelTicket(t: Ticket): MessageBody {
  const aberto = t.status === "aberto";
  const status = !aberto
    ? "🔒 **Ticket fechado.**"
    : t.assumidoPor
      ? "🟢 **Assumido pela Corregedoria.** A conversa agora é só entre você e a equipe responsável."
      : "🟡 **Aguardando a Corregedoria assumir.** Você já pode escrever aqui.";
  const desc = t.descricao.split("\n").map((l) => `> ${l}`).join("\n");
  return {
    flags: FLAG_COMPONENTS_V2,
    allowed_mentions: { parse: [], users: [t.userId] },
    components: [
      {
        type: 17,
        accent_color: aberto ? COR : 0x4b5563,
        components: [
          ...[
            (() => {
              const l = logoDiscord();
              const textos = [
                { type: 10, content: `## ${t.tipo.emoji} Corregedoria · Ticket #${nn(t.numero)}` },
                { type: 10, content: `**Órgão:** ${t.tipo.nome}\n**Aberto por:** <@${t.userId}> · ${t.insignia ? `**${t.insignia}** ` : ""}${t.nome}` },
              ];
              return l ? { type: 9, components: textos, accessory: { type: 11, media: { url: `attachment://${l.nomeArquivo}` }, description: "Logo da PMERJ" } } : textos;
            })(),
          ].flat(),
          { type: 14, divider: true, spacing: 1 },
          { type: 10, content: `**Motivo:** ${t.motivo}\n**Assunto:** ${t.assunto}\n**Descrição**\n${desc}` },
          { type: 10, content: `📎 **Provas:** ${t.provas.length ? `${t.provas.length} ${t.provas.length === 1 ? "arquivo" : "arquivos"} (abaixo)` : "nenhuma enviada"}` },
          { type: 14, divider: true, spacing: 1 },
          { type: 10, content: status },
          ...(aberto
            ? [
                { type: 10, content: "-# 🛡️ Somente Corregedoria" },
                {
                  type: 1,
                  components: [
                    { type: 2, style: 3, label: "Assumir ticket", emoji: { name: "🛡️" }, custom_id: `cg:assumir:${t.id}`, disabled: Boolean(t.assumidoPor) },
                    { type: 2, style: 1, label: "Responder", emoji: { name: "💬" }, custom_id: `cg:responder:${t.id}` },
                    { type: 2, style: 2, label: "Chamar oficial", emoji: { name: "🔔" }, custom_id: `cg:chamar:${t.id}` },
                    { type: 2, style: 4, label: "Fechar ticket", emoji: { name: "🔒" }, custom_id: `cg:fechar:${t.id}` },
                  ],
                },
              ]
            : []),
          rodape(),
        ],
      },
    ],
  };
}

/** Provas numa mensagem própria (galeria de imagens e vídeos). Lotes de até ~20 MB por envio. */
async function postarProvas(t: Ticket, arquivos: Arquivo[]) {
  const lotes: Arquivo[][] = [];
  let atual: Arquivo[] = [];
  let tam = 0;
  for (const a of arquivos) {
    if (atual.length && (tam + a.dados.length > 20 * 1024 * 1024 || atual.length >= 10)) {
      lotes.push(atual);
      atual = [];
      tam = 0;
    }
    atual.push(a);
    tam += a.dados.length;
  }
  if (atual.length) lotes.push(atual);
  for (const [i, lote] of lotes.entries()) {
    await postMessage(
      t.canalId!,
      {
        flags: FLAG_COMPONENTS_V2,
        components: [
          {
            type: 17,
            accent_color: COR,
            components: [
              { type: 10, content: `### 📎 Provas${lotes.length > 1 ? ` (${i + 1}/${lotes.length})` : ""}` },
              { type: 12, items: lote.map((a) => ({ media: { url: `attachment://${a.nome}` }, description: (ehVideo(a.tipo ?? "") ? "Vídeo" : "Imagem").slice(0, 1024) })) },
            ],
          },
        ],
      },
      lote,
    );
  }
}

/* ---------- Abrir ---------- */

export interface Abertura {
  usuario: { id: string; username: string; avatar: string | null; apelido: string | null };
  tipo: TipoTicket;
  motivo: string;
  assunto: string;
  descricao: string;
  provas: Array<{ url: string; size: number; filename: string }>;
}

export async function abrirTicket(a: Abertura): Promise<Resultado<{ ticket: Ticket; avisos: string[] }>> {
  const cfg = corregStore.config();
  if (cfg.cargosCorregedoria.length === 0) return falha("sem_equipe");
  if (corregStore.abertoDe(a.usuario.id)) return falha("ja_tem_ticket");
  const id = identificacao(a.usuario.id, a.usuario.apelido, a.usuario.username);
  const t: Ticket = {
    id: randomUUID(),
    numero: corregStore.proximoNumero(),
    userId: a.usuario.id,
    username: a.usuario.username,
    avatar: a.usuario.avatar,
    insignia: id.insignia,
    nome: id.nome,
    tipo: { ...a.tipo },
    motivo: a.motivo,
    assunto: a.assunto,
    descricao: a.descricao,
    provas: [],
    canalId: null,
    painelMensagemId: null,
    webhook: null,
    chave: randomBytes(24).toString("base64url"),
    status: "aberto",
    assumidoPor: null,
    abertoEm: Date.now(),
    fechadoEm: null,
    fechadoPor: null,
    eventos: [],
  };

  const provas = await guardarAnexos(t, a.provas.slice(0, MAX_PROVAS));
  t.provas = provas.anexos;

  const canal = await createTicketChannel({
    nome: `🛡️・ticket-${nn(t.numero)}`,
    topico: `Corregedoria · ${t.tipo.nome} · ticket #${nn(t.numero)}`,
    categoriaId: cfg.categoriaId,
    cargos: cfg.cargosCorregedoria,
    usuarioId: t.userId,
    motivo: `Ticket da corregedoria #${nn(t.numero)}`,
  });
  if (!canal) return falha("falha_canal");
  t.canalId = canal;

  // Webhook com o nome de exibição e a logo: é por ele que a equipe fala.
  const logo = logoDiscord();
  t.webhook = await createWebhook(canal, cfg.nomeExibicao, logo ? { dados: logo.dados, tipo: logo.tipo } : null);

  registrar(t, {
    tipo: "abertura",
    papel: "denunciante",
    autor: { id: t.userId, nome: t.nome, avatar: t.avatar },
    conteudo: `${t.motivo}\n${t.assunto}`,
    anexos: t.provas,
  });
  await corregStore.add(t);

  const painel = await postMessage(canal, painelTicket(t), brasao());
  if (painel) t.painelMensagemId = painel.id;
  if (provas.arquivos.length) await postarProvas(t, provas.arquivos);
  await postMessage(canal, {
    content: `<@${t.userId}>, seu ticket foi aberto. Aguarde: a Corregedoria vai responder por aqui.`,
    allowed_mentions: { parse: [], users: [t.userId] },
  });
  await corregStore.salvar();
  console.info(`[corregedoria] ticket #${nn(t.numero)} aberto por discord:${t.userId}`);
  return { ok: true, valor: { ticket: t, avisos: provas.avisos } };
}

async function atualizarPainel(t: Ticket) {
  if (t.canalId && t.painelMensagemId) await editMessage(t.canalId, t.painelMensagemId, painelTicket(t), brasao());
}

/* ---------- Assumir ---------- */

export async function assumir(t: Ticket, quem: Quem): Promise<Resultado> {
  if (t.status !== "aberto") return falha("ticket_fechado");
  if (t.assumidoPor) return falha(t.assumidoPor.id === quem.id ? "ja_assumido_por_voce" : "ja_assumido");
  if (quem.id === t.userId) return falha("proprio_ticket");
  t.assumidoPor = quem;
  // Daqui em diante só quem abriu e quem assumiu escrevem.
  const motivo = `Ticket #${nn(t.numero)} assumido`;
  await Promise.all(corregStore.config().cargosCorregedoria.map((r) => setSendPermission(t.canalId!, r, 0, false, motivo)));
  await setSendPermission(t.canalId!, quem.id, 1, true, motivo);
  registrar(t, { tipo: "sistema", papel: "sistema", autor: quem, conteudo: "Ticket assumido pela Corregedoria.", anexos: [] });
  await corregStore.salvar();
  await atualizarPainel(t);
  await falarComoCorregedoria(t, "🟢 Seu ticket foi assumido pela Corregedoria. Pode continuar por aqui.", [], null);
  return { ok: true, valor: t };
}

/* ---------- Falar como a corregedoria (anônimo) ---------- */

/** Publica pelo webhook (nome de exibição) e registra o autor real só para a equipe. */
export async function falarComoCorregedoria(t: Ticket, texto: string, arquivos: Arquivo[], autor: Quem | null, anexos: Anexo[] = []): Promise<boolean> {
  if (!t.canalId) return false;
  const corpo = { content: texto.slice(0, 2000) || (arquivos.length ? "" : "…") };
  const enviado = t.webhook
    ? await executeWebhook(t.webhook, corpo, arquivos)
    : await postMessage(t.canalId, { ...corpo, allowed_mentions: { parse: [] } }, arquivos);
  if (autor) {
    registrar(t, { tipo: "mensagem", papel: "corregedoria", autor, conteudo: texto, anexos });
    await corregStore.salvar();
  }
  return Boolean(enviado);
}

/* ---------- Chamar quem abriu ---------- */

export async function chamarOficial(t: Ticket, quem: Quem): Promise<Resultado> {
  if (t.status !== "aberto") return falha("ticket_fechado");
  const ok = await sendDM(t.userId, {
    flags: FLAG_COMPONENTS_V2,
    components: [
      {
        type: 17,
        accent_color: COR,
        components: [
          { type: 10, content: `### 🔔 A Corregedoria está chamando você\nSeu ticket **#${nn(t.numero)}** (${t.tipo.nome}) precisa da sua resposta.` },
          { type: 1, components: [{ type: 2, style: 5, label: "Ir para o ticket", emoji: { name: "🛡️" }, url: canalUrl(t) }] },
          rodape(),
        ],
      },
    ],
  });
  registrar(t, { tipo: "sistema", papel: "sistema", autor: quem, conteudo: ok ? "Policial chamado por mensagem direta." : "Tentativa de chamar o policial (DM bloqueada).", anexos: [] });
  await corregStore.salvar();
  return ok ? { ok: true, valor: t } : falha("dm_bloqueada");
}

/* ---------- Fechar + transcript ---------- */

function painelTranscript(t: Ticket, paraEquipe: boolean): MessageBody {
  return {
    flags: FLAG_COMPONENTS_V2,
    allowed_mentions: { parse: [] },
    components: [
      {
        type: 17,
        accent_color: COR,
        components: [
          {
            type: 10,
            content: [
              `### 🔒 Ticket #${nn(t.numero)} fechado`,
              `**Órgão:** ${t.tipo.nome}`,
              `**Assunto:** ${t.assunto}`,
              ...(paraEquipe
                ? [`**Aberto por:** <@${t.userId}> · ${t.insignia ? `${t.insignia} ` : ""}${t.nome}`, `**Atendido por:** ${t.assumidoPor ? `<@${t.assumidoPor.id}>` : "ninguém assumiu"}`, `**Fechado por:** <@${t.fechadoPor?.id}>`]
                : ["Obrigado por falar com a Corregedoria. O registro completo do atendimento fica disponível no link abaixo."]),
              `-# Aberto <t:${Math.floor(t.abertoEm / 1000)}:f> · fechado <t:${Math.floor((t.fechadoEm ?? Date.now()) / 1000)}:f>`,
            ].join("\n"),
          },
          { type: 1, components: [{ type: 2, style: 5, label: "Ver transcript", emoji: { name: "📄" }, url: transcriptUrl(t) }] },
          rodape(),
        ],
      },
    ],
  };
}

export async function fecharTicket(t: Ticket, quem: Quem): Promise<Resultado> {
  if (t.status !== "aberto") return falha("ticket_fechado");
  t.status = "fechado";
  t.fechadoEm = Date.now();
  t.fechadoPor = quem;
  registrar(t, { tipo: "sistema", papel: "sistema", autor: quem, conteudo: "Ticket fechado pela Corregedoria.", anexos: [] });
  await corregStore.salvar();
  await atualizarPainel(t);
  if (t.canalId) await postMessage(t.canalId, { content: "🔒 Ticket fechado. Este canal será apagado em 10 segundos.", allowed_mentions: { parse: [] } });

  await sendDM(t.userId, painelTranscript(t, false));
  const log = corregStore.config().logCanalId;
  if (log) await postMessage(log, painelTranscript(t, true));
  console.info(`[corregedoria] ticket #${nn(t.numero)} fechado por discord:${quem.id}`);

  const canal = t.canalId;
  if (canal) setTimeout(() => void deleteChannel(canal, `Ticket #${nn(t.numero)} fechado`), 10_000);
  return { ok: true, valor: t };
}

/** Quem está no servidor agora (para conferir cargos atuais de quem clica). */
export const membroAtual = getMember;

export const MENSAGEM_ERRO: Record<string, string> = {
  sem_equipe: "A corregedoria ainda não foi configurada (nenhum cargo de atendimento).",
  ja_tem_ticket: "Você já tem um ticket aberto. Use o canal dele.",
  falha_canal: "Não foi possível criar o canal do ticket. Avise a administração.",
  ticket_fechado: "Este ticket já foi fechado.",
  ja_assumido: "Outro membro da corregedoria já assumiu este ticket.",
  ja_assumido_por_voce: "Você já assumiu este ticket.",
  proprio_ticket: "Você não pode atender o seu próprio ticket.",
  dm_bloqueada: "Não foi possível enviar a DM: o policial bloqueia mensagens diretas do servidor.",
  sem_permissao: "Somente a Corregedoria pode fazer isso.",
  nao_assumiu: "Este ticket foi assumido por outro membro da corregedoria.",
  tipo_invalido: "Esse tipo de ticket não existe mais. Escolha de novo.",
};
