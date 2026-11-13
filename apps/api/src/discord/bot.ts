import { env } from "../env.js";
import { diagLog, idadeInteracao } from "../lib/diagLog.js";

/**
 * Ponte REST com o Discord. O token do bot fica APENAS no servidor; o navegador nunca o vê.
 * Eventos em tempo real (entradas/saídas, cliques em botões) chegam pelo gateway (gateway.ts).
 *
 * Permissões necessárias no servidor: Gerenciar Apelidos, Ver Canais, Enviar Mensagens
 * e Inserir Links nos canais usados. O cargo do bot precisa estar ACIMA dos cargos dos
 * policiais, e o Discord não deixa bot algum mudar o apelido do dono do servidor.
 */
const DISCORD_API = "https://discord.com/api/v10";

export const botAtivo = Boolean(env.DISCORD_BOT_TOKEN && env.DISCORD_GUILD_ID);

/** Componentes V2 (Container, Section, Text Display…). */
export const FLAG_COMPONENTS_V2 = 1 << 15;
export const FLAG_EPHEMERAL = 1 << 6;

/** Arquivo enviado junto da mensagem (referenciado nos componentes como attachment://nome). */
export interface Arquivo {
  nome: string;
  dados: Buffer;
  tipo?: string;
}

async function call(
  method: string,
  path: string,
  body?: unknown,
  reason?: string,
  auth = true,
  files?: Arquivo[],
): Promise<Response> {
  const headers: Record<string, string> = { "User-Agent": "DiscordBot (pmerj-painel, 0.3.0)" };
  if (auth) headers.Authorization = `Bot ${env.DISCORD_BOT_TOKEN}`;
  const multipart = Boolean(files?.length);
  if (body !== undefined && !multipart) headers["Content-Type"] = "application/json";
  if (reason) headers["X-Audit-Log-Reason"] = encodeURIComponent(reason.slice(0, 400));

  // Com arquivos: multipart (payload_json + files[n]). Montado a cada tentativa, porque o corpo é consumido.
  const montarCorpo = () => {
    if (!multipart) return body === undefined ? undefined : JSON.stringify(body);
    const form = new FormData();
    // Anexos já existentes que devem ficar (`attachments: [{ id }]` no corpo) + os arquivos novos.
    const manter = ((body as { attachments?: unknown[] } | undefined)?.attachments ?? []) as unknown[];
    form.append("payload_json", JSON.stringify({ ...(body as object), attachments: [...manter, ...files!.map((f, i) => ({ id: i, filename: f.nome }))] }));
    files!.forEach((f, i) => form.append(`files[${i}]`, new Blob([new Uint8Array(f.dados)], { type: f.tipo ?? "image/png" }), f.nome));
    return form;
  };

  const send = () =>
    fetch(`${DISCORD_API}${path}`, {
      method,
      headers,
      body: montarCorpo(),
      // Vídeos: 15 s + 4 s por MB enviado (upload lento não derruba o envio).
      signal: AbortSignal.timeout(multipart ? 15_000 + Math.ceil(files!.reduce((t, f) => t + f.dados.length, 0) / 1_048_576) * 4_000 : 8_000),
    });

  let res = await send();
  if (res.status === 429) {
    // Limite de requisições: espera o que o Discord pedir (até 5s) e tenta uma vez.
    const info = (await res.json().catch(() => ({}))) as { retry_after?: number };
    const wait = Math.min(5, Math.max(0.2, info.retry_after ?? 1));
    await new Promise((r) => setTimeout(r, wait * 1000));
    res = await send();
  }
  return res;
}

async function safe<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[bot] falha em ${label}:`, err instanceof Error ? err.message : err);
    return fallback;
  }
}

/** Troca o apelido no servidor. Retorna false se o Discord recusar. */
export function setNickname(userId: string, nick: string, reason: string): Promise<boolean> {
  if (!botAtivo) return Promise.resolve(false);
  return safe("trocar apelido", async () => {
    const res = await call("PATCH", `/guilds/${env.DISCORD_GUILD_ID}/members/${userId}`, { nick }, reason);
    if (!res.ok) console.warn(`[bot] apelido de discord:${userId} recusado (${res.status})`);
    return res.ok;
  }, false);
}

/** Dá um cargo ao membro. O cargo do bot precisa estar acima dele. */
export function addRole(userId: string, roleId: string, reason: string): Promise<boolean> {
  if (!botAtivo) return Promise.resolve(false);
  return safe("dar cargo", async () => {
    const res = await call("PUT", `/guilds/${env.DISCORD_GUILD_ID}/members/${userId}/roles/${roleId}`, undefined, reason);
    if (!res.ok) console.warn(`[bot] cargo para discord:${userId} recusado (${res.status})`);
    return res.ok;
  }, false);
}

/* ---------- Mensagens ---------- */

export type MessageBody = Record<string, unknown>;

/** Publica uma mensagem. Nunca menciona ninguém, a não ser que `allowed_mentions` venha no corpo. */
export function postMessage(channelId: string, body: MessageBody, files?: Arquivo[]): Promise<{ id: string } | null> {
  if (!botAtivo) return Promise.resolve(null);
  return safe("enviar mensagem", async () => {
    const res = await call("POST", `/channels/${channelId}/messages`, { allowed_mentions: { parse: [] }, ...body }, undefined, true, files);
    if (!res.ok) {
      console.warn(`[bot] mensagem no canal ${channelId} recusada (${res.status}): ${(await res.text()).slice(0, 300)}`);
      return null;
    }
    const msg = (await res.json()) as { id: string };
    return { id: msg.id };
  }, null);
}

/** Edita uma mensagem do bot. Com `files`, os anexos são reenviados (substituem os antigos). */
export function editMessage(channelId: string, messageId: string, body: MessageBody, files?: Arquivo[]): Promise<boolean> {
  if (!botAtivo) return Promise.resolve(false);
  return safe("editar mensagem", async () => {
    const res = await call("PATCH", `/channels/${channelId}/messages/${messageId}`, { allowed_mentions: { parse: [] }, ...body }, undefined, true, files);
    if (!res.ok && res.status !== 404) console.warn(`[bot] edição no canal ${channelId} recusada (${res.status}): ${(await res.text()).slice(0, 300)}`);
    return res.ok;
  }, false);
}

interface LogField {
  name: string;
  value: string;
  inline?: boolean;
}

/** Registro simples (embed) num canal de log. */
export async function sendLog(
  channelId: string | null | undefined,
  opts: { title: string; color: number; fields: LogField[]; footer?: string },
): Promise<void> {
  if (!channelId) return;
  await postMessage(channelId, {
    embeds: [
      {
        title: opts.title,
        color: opts.color,
        fields: opts.fields.map((f) => ({ ...f, value: f.value.slice(0, 1024) })),
        timestamp: new Date().toISOString(),
        footer: { text: opts.footer ?? "PMERJ · Painel" },
      },
    ],
  });
}

/* ---------- Canais (para os seletores do painel) ---------- */

export type TipoCanal = "texto" | "anuncios" | "voz" | "palco";

export interface CanalTexto {
  id: string;
  nome: string;
  tipo: TipoCanal;
  categoria: string | null;
  /** O bot pode ver o canal e enviar mensagens nele (cargos + permissões do canal). */
  podeEnviar: boolean;
}

/** Tipos que aceitam mensagem do bot: texto, anúncios, chat de voz e chat de palco. */
const TIPOS: Record<number, TipoCanal> = { 0: "texto", 5: "anuncios", 2: "voz", 13: "palco" };

const PERM = { ADMIN: 1n << 3n, VER: 1n << 10n, ENVIAR: 1n << 11n };

interface RawCanal {
  id: string;
  name: string;
  type: number;
  position: number;
  parent_id: string | null;
  permission_overwrites?: Array<{ id: string; type: number; allow: string; deny: string }>;
}

/** Permissões efetivas do bot num canal (mesma regra do Discord: @everyone → cargos → membro). */
function permissoesNoCanal(base: bigint, canal: RawCanal, guildId: string, botId: string, botRoles: string[]): bigint {
  if (base & PERM.ADMIN) return ~0n;
  const ow = canal.permission_overwrites ?? [];
  let p = base;
  const everyone = ow.find((o) => o.id === guildId);
  if (everyone) p = (p & ~BigInt(everyone.deny)) | BigInt(everyone.allow);
  let allow = 0n;
  let deny = 0n;
  for (const o of ow) {
    if (o.type === 0 && botRoles.includes(o.id)) {
      allow |= BigInt(o.allow);
      deny |= BigInt(o.deny);
    }
  }
  p = (p & ~deny) | allow;
  const membro = ow.find((o) => o.type === 1 && o.id === botId);
  if (membro) p = (p & ~BigInt(membro.deny)) | BigInt(membro.allow);
  return p;
}

let canaisCache: { at: number; list: CanalTexto[] } | null = null;

/**
 * TODOS os canais do servidor que aceitam mensagem, na ordem do Discord, com a
 * permissão real do bot em cada um. Cache de 60s.
 */
export function listTextChannels(): Promise<CanalTexto[]> {
  if (!botAtivo) return Promise.resolve([]);
  if (canaisCache && Date.now() - canaisCache.at < 60_000) return Promise.resolve(canaisCache.list);
  return safe("listar canais", async () => {
    const guildId = env.DISCORD_GUILD_ID!;
    const [resCanais, resRoles, resMe] = await Promise.all([
      call("GET", `/guilds/${guildId}/channels`),
      call("GET", `/guilds/${guildId}/roles`),
      call("GET", "/users/@me"),
    ]);
    if (!resCanais.ok || !resRoles.ok || !resMe.ok) return canaisCache?.list ?? [];
    const raw = (await resCanais.json()) as RawCanal[];
    const roles = (await resRoles.json()) as Array<{ id: string; permissions: string }>;
    const botId = ((await resMe.json()) as { id: string }).id;
    const resMembro = await call("GET", `/guilds/${guildId}/members/${botId}`);
    const botRoles = resMembro.ok ? ((await resMembro.json()) as { roles: string[] }).roles : [];

    let base = 0n;
    for (const r of roles) if (r.id === guildId || botRoles.includes(r.id)) base |= BigInt(r.permissions);

    const categorias = new Map(raw.filter((c) => c.type === 4).map((c) => [c.id, c]));
    const catPos = (c: RawCanal) => (c.parent_id ? (categorias.get(c.parent_id)?.position ?? 0) + 1 : 0);
    // Na lista do Discord, dentro da categoria, texto vem antes de voz.
    const grupo = (c: RawCanal) => (c.type === 2 || c.type === 13 ? 1 : 0);

    const list = raw
      .filter((c) => c.type in TIPOS)
      .sort((a, b) => catPos(a) - catPos(b) || grupo(a) - grupo(b) || a.position - b.position)
      .map((c) => {
        const p = permissoesNoCanal(base, c, guildId, botId, botRoles);
        return {
          id: c.id,
          nome: c.name,
          tipo: TIPOS[c.type]!,
          categoria: c.parent_id ? (categorias.get(c.parent_id)?.name ?? null) : null,
          podeEnviar: Boolean(p & PERM.VER) && Boolean(p & PERM.ENVIAR),
        };
      });
    canaisCache = { at: Date.now(), list };
    return list;
  }, canaisCache?.list ?? []);
}

/* ---------- Cargos (para escolher aprovadores) ---------- */

export interface Cargo {
  id: string;
  nome: string;
  cor: number;
}

let cargosCache: { at: number; list: Cargo[] } | null = null;

/** Cargos do servidor, do mais alto para o mais baixo, sem @everyone e sem cargos de bots/integrações. */
export function listRoles(): Promise<Cargo[]> {
  if (!botAtivo) return Promise.resolve([]);
  if (cargosCache && Date.now() - cargosCache.at < 60_000) return Promise.resolve(cargosCache.list);
  return safe("listar cargos", async () => {
    const res = await call("GET", `/guilds/${env.DISCORD_GUILD_ID}/roles`);
    if (!res.ok) return cargosCache?.list ?? [];
    const raw = (await res.json()) as Array<{ id: string; name: string; color: number; position: number; managed: boolean }>;
    const list = raw
      .filter((r) => r.id !== env.DISCORD_GUILD_ID && !r.managed)
      .sort((a, b) => b.position - a.position)
      .map((r) => ({ id: r.id, nome: r.name, cor: r.color }));
    cargosCache = { at: Date.now(), list };
    return list;
  }, cargosCache?.list ?? []);
}

/** Cargo com o que é preciso para conferir hierarquia e permissões. */
export interface CargoDetalhado {
  id: string;
  nome: string;
  cor: number;
  posicao: number;
  /** Cargo de bot/integração/impulso (ninguém dá à mão). */
  gerenciado: boolean;
  permissoes: bigint;
}

let detalhadosCache: { at: number; list: CargoDetalhado[] } | null = null;

/** Todos os cargos do servidor (inclui @everyone e os gerenciados), com posição e permissões. Cache de 30 s. */
export function rolesDetalhados(fresco = false): Promise<CargoDetalhado[]> {
  if (!botAtivo) return Promise.resolve([]);
  if (!fresco && detalhadosCache && Date.now() - detalhadosCache.at < 30_000) return Promise.resolve(detalhadosCache.list);
  return safe("listar cargos (detalhes)", async () => {
    const res = await call("GET", `/guilds/${env.DISCORD_GUILD_ID}/roles`);
    if (!res.ok) return detalhadosCache?.list ?? [];
    const raw = (await res.json()) as Array<{ id: string; name: string; color: number; position: number; managed: boolean; permissions: string }>;
    const list = raw.map((r) => ({ id: r.id, nome: r.name, cor: r.color, posicao: r.position, gerenciado: r.managed, permissoes: BigInt(r.permissions) }));
    detalhadosCache = { at: Date.now(), list };
    return list;
  }, detalhadosCache?.list ?? []);
}

/** Posição do cargo mais alto do próprio bot (para saber quais cargos ele consegue dar). */
export async function posicaoDoBot(): Promise<number> {
  const id = await idDoBot();
  const membro = id ? await getMember(id) : null;
  if (!membro) return -1;
  const cargos = await rolesDetalhados();
  return Math.max(0, ...cargos.filter((c) => membro.roles.includes(c.id)).map((c) => c.posicao));
}

/** Avatar do SERVIDOR do membro (o da conta se ele não tiver um próprio no servidor). */
export function avatarDoMembro(userId: string, avatarServidor: string | null | undefined, avatarConta: string | null | undefined, tamanho = 1024): string {
  if (avatarServidor) return `https://cdn.discordapp.com/guilds/${env.DISCORD_GUILD_ID}/users/${userId}/avatars/${avatarServidor}.png?size=${tamanho}`;
  if (avatarConta) return `https://cdn.discordapp.com/avatars/${userId}/${avatarConta}.png?size=${tamanho}`;
  return `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(userId) >> 22n) % 6}.png`;
}

/** Cargos atuais de um membro (direto do Discord, não do login). */
export function memberRoles(userId: string): Promise<string[] | null> {
  if (!botAtivo) return Promise.resolve(null);
  return safe("ler cargos do membro", async () => {
    const res = await call("GET", `/guilds/${env.DISCORD_GUILD_ID}/members/${userId}`);
    return res.ok ? ((await res.json()) as { roles: string[] }).roles : null;
  }, null);
}

/** Mensagem direta. Falha em silêncio se a pessoa bloqueia DMs do servidor. */
export function sendDM(userId: string, body: MessageBody, files?: Arquivo[]): Promise<boolean> {
  if (!botAtivo) return Promise.resolve(false);
  return safe("enviar DM", async () => {
    const res = await call("POST", "/users/@me/channels", { recipient_id: userId });
    if (!res.ok) return false;
    const canal = (await res.json()) as { id: string };
    return Boolean(await postMessage(canal.id, body, files));
  }, false);
}

/* ---------- Interações (respostas a botões e formulários) ---------- */

/** Resposta inicial a uma interação (tem 3 segundos). Não usa o token do bot. */
export function interactionCallback(id: string, token: string, body: MessageBody): Promise<boolean> {
  const tipo = (body as { type?: number }).type;
  return safe("responder interação", async () => {
    const res = await call("POST", `/interactions/${id}/${token}/callback`, body, undefined, false);
    const idade = idadeInteracao(id);
    if (!res.ok) {
      const motivo = (await res.text()).slice(0, 1500);
      console.warn(`[bot] resposta de interação recusada (${res.status}): ${motivo.slice(0, 300)}`);
      diagLog(`callback RECUSADO tipo=${tipo} status=${res.status} idade=${idade}ms motivo=${motivo}`);
    } else if (idade > 2_500) {
      diagLog(`callback LENTO tipo=${tipo} idade=${idade}ms (limite do Discord: 3000ms)`);
    }
    return res.ok;
  }, false).then((ok) => {
    if (!ok) diagLog(`callback FALHOU tipo=${tipo} idade=${idadeInteracao(id)}ms`);
    return ok;
  });
}

/** Edita a resposta original de uma interação (válido por 15 min). */
export function editInteractionReply(token: string, body: MessageBody): Promise<boolean> {
  return safe("editar resposta", async () => {
    const res = await call(
      "PATCH",
      `/webhooks/${env.DISCORD_CLIENT_ID}/${token}/messages/@original`,
      { allowed_mentions: { parse: [] }, ...body },
      undefined,
      false,
    );
    if (!res.ok) {
      const motivo = (await res.text()).slice(0, 1500);
      console.warn(`[bot] edição de resposta recusada (${res.status}): ${motivo.slice(0, 300)}`);
      diagLog(`edição RECUSADA status=${res.status} motivo=${motivo}`);
    }
    return res.ok;
  }, false);
}

/** Tira um cargo do membro. */
export function removeRole(userId: string, roleId: string, reason: string): Promise<boolean> {
  if (!botAtivo) return Promise.resolve(false);
  return safe("tirar cargo", async () => {
    const res = await call("DELETE", `/guilds/${env.DISCORD_GUILD_ID}/members/${userId}/roles/${roleId}`, undefined, reason);
    return res.ok || res.status === 404;
  }, false);
}

/** Expulsa o membro do servidor. O cargo do bot precisa estar acima dele; o dono nunca pode ser expulso. */
export function kickMember(userId: string, reason: string): Promise<boolean> {
  if (!botAtivo) return Promise.resolve(false);
  return safe("expulsar membro", async () => {
    const res = await call("DELETE", `/guilds/${env.DISCORD_GUILD_ID}/members/${userId}`, undefined, reason);
    if (!res.ok) console.warn(`[bot] expulsão de discord:${userId} recusada (${res.status})`);
    return res.ok;
  }, false);
}

/* ---------- Canais temporários ---------- */

let botIdCache: string | null = null;
/** ID do próprio bot (para reconhecer as mensagens dele). */
export const idDoBot = (): Promise<string | null> => (botAtivo ? safe("ler o bot", botId, null) : Promise.resolve(null));

async function botId(): Promise<string | null> {
  if (botIdCache) return botIdCache;
  const res = await call("GET", "/users/@me");
  if (!res.ok) return null;
  botIdCache = ((await res.json()) as { id: string }).id;
  return botIdCache;
}

const P = { VER: 1n << 10n, ENVIAR: 1n << 11n, LINKS: 1n << 14n, ANEXAR: 1n << 15n, HISTORICO: 1n << 16n };
const LEITURA = (P.VER | P.HISTORICO).toString();

/**
 * Cria um canal de texto privado: some para @everyone e aparece só para os cargos
 * informados (leem, mas não escrevem — a decisão é pelos botões), para os `usuarios` (idem) e para o bot.
 */
export function createPrivateChannel(opts: {
  nome: string;
  topico: string;
  categoriaId: string | null;
  cargos: string[];
  usuarios?: string[];
  motivo: string;
}): Promise<string | null> {
  if (!botAtivo) return Promise.resolve(null);
  return safe("criar canal", async () => {
    const id = await botId();
    if (!id) return null;
    const guildId = env.DISCORD_GUILD_ID!;
    const res = await call(
      "POST",
      `/guilds/${guildId}/channels`,
      {
        name: opts.nome.slice(0, 100),
        type: 0,
        topic: opts.topico.slice(0, 1024),
        ...(opts.categoriaId ? { parent_id: opts.categoriaId } : {}),
        permission_overwrites: [
          { id: guildId, type: 0, deny: P.VER.toString(), allow: "0" },
          ...opts.cargos.map((r) => ({ id: r, type: 0, allow: LEITURA, deny: P.ENVIAR.toString() })),
          ...(opts.usuarios ?? []).filter((u) => u !== id).map((u) => ({ id: u, type: 1, allow: LEITURA, deny: P.ENVIAR.toString() })),
          { id, type: 1, allow: (P.VER | P.ENVIAR | P.HISTORICO | P.LINKS | P.ANEXAR).toString(), deny: "0" },
        ],
      },
      opts.motivo,
    );
    if (!res.ok) {
      console.warn(`[bot] criação de canal recusada (${res.status}): ${(await res.text()).slice(0, 300)}`);
      return null;
    }
    canaisCache = null;
    return ((await res.json()) as { id: string }).id;
  }, null);
}

export function deleteChannel(channelId: string, motivo: string): Promise<boolean> {
  if (!botAtivo) return Promise.resolve(false);
  return safe("apagar canal", async () => {
    const res = await call("DELETE", `/channels/${channelId}`, undefined, motivo);
    canaisCache = null;
    return res.ok || res.status === 404;
  }, false);
}

export interface Categoria {
  id: string;
  nome: string;
}

/** Categorias do servidor (para escolher onde nascem os canais temporários). */
export function listCategories(): Promise<Categoria[]> {
  if (!botAtivo) return Promise.resolve([]);
  return safe("listar categorias", async () => {
    const res = await call("GET", `/guilds/${env.DISCORD_GUILD_ID}/channels`);
    if (!res.ok) return [];
    const raw = (await res.json()) as Array<{ id: string; name: string; type: number; position: number }>;
    return raw
      .filter((c) => c.type === 4)
      .sort((a, b) => a.position - b.position)
      .map((c) => ({ id: c.id, nome: c.name }));
  }, []);
}

/* ---------- Emojis do próprio bot (application emojis: valem em qualquer servidor) ---------- */

export interface EmojiApp {
  id: string;
  name: string;
}

export function listAppEmojis(): Promise<EmojiApp[] | null> {
  if (!botAtivo) return Promise.resolve(null);
  return safe("listar emojis do bot", async () => {
    const res = await call("GET", `/applications/${env.DISCORD_CLIENT_ID}/emojis`);
    if (!res.ok) return null;
    return ((await res.json()) as { items: EmojiApp[] }).items;
  }, null);
}

/** Cria um emoji do bot. Imagem até 256 KB (limite do Discord). */
export function createAppEmoji(name: string, imagem: Buffer, tipo: string): Promise<EmojiApp | null> {
  if (!botAtivo) return Promise.resolve(null);
  return safe("criar emoji do bot", async () => {
    const res = await call("POST", `/applications/${env.DISCORD_CLIENT_ID}/emojis`, {
      name,
      image: `data:${tipo};base64,${imagem.toString("base64")}`,
    });
    if (!res.ok) {
      console.warn(`[bot] emoji recusado (${res.status}): ${(await res.text()).slice(0, 300)}`);
      return null;
    }
    return (await res.json()) as EmojiApp;
  }, null);
}

export function deleteAppEmoji(id: string): Promise<boolean> {
  if (!botAtivo) return Promise.resolve(false);
  return safe("apagar emoji do bot", async () => {
    const res = await call("DELETE", `/applications/${env.DISCORD_CLIENT_ID}/emojis/${id}`);
    return res.ok || res.status === 404;
  }, false);
}

/* ---------- Comandos de barra (do servidor oficial) ---------- */

/** ID de cada comando registrado (nome → id), para ajustar quem vê o comando. */
const comandosRegistrados = new Map<string, string>();
export const idDoComando = (nome: string) => comandosRegistrados.get(nome) ?? null;
let filaRegistroComandos: Promise<void> = Promise.resolve();

/** Cria ou atualiza (pelo nome) um comando de barra no servidor. Não mexe nos outros comandos. */
export function upsertGuildCommand(body: MessageBody): Promise<boolean> {
  if (!botAtivo) return Promise.resolve(false);
  const tarefa = filaRegistroComandos.then(() =>
    safe("registrar comando", async () => {
      const res = await call("POST", `/applications/${env.DISCORD_CLIENT_ID}/guilds/${env.DISCORD_GUILD_ID}/commands`, body);
      if (!res.ok) {
        console.warn(`[bot] comando recusado (${res.status}): ${(await res.text()).slice(0, 300)}`);
        return false;
      }
      const cmd = (await res.json().catch(() => null)) as { id?: string; name?: string } | null;
      if (cmd?.id && cmd.name) comandosRegistrados.set(cmd.name, cmd.id);
      return true;
    }, false),
  );
  // A API do Discord aplica rate limit por rota; os registros eram iniciados todos juntos no boot.
  filaRegistroComandos = tarefa.then(() => new Promise<void>((resolve) => setTimeout(resolve, 1_200)));
  return tarefa;
}

export type ErroPermissaoComando = "sem_permissao_servidor" | "comando_nao_registrado" | "falha_discord";

/**
 * Quem VÊ o comando: só os cargos liberados (o resto do servidor não vê; admins sempre veem).
 * O Discord só aceita isso com o token de um ADMIN do servidor (OAuth, escopo
 * applications.commands.permissions.update) — o token do bot é recusado.
 */
export async function setCommandRoles(bearer: string, nomeComando: string, cargos: string[]): Promise<{ ok: true } | { ok: false; erro: ErroPermissaoComando }> {
  const id = idDoComando(nomeComando);
  if (!botAtivo || !id) return { ok: false, erro: "comando_nao_registrado" };
  try {
    const res = await fetch(`${DISCORD_API}/applications/${env.DISCORD_CLIENT_ID}/guilds/${env.DISCORD_GUILD_ID}/commands/${id}/permissions`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json", "User-Agent": "DiscordBot (pmerj-painel, 0.3.0)" },
      body: JSON.stringify({ permissions: cargos.slice(0, 100).map((c) => ({ id: c, type: 1, permission: true })) }),
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) return { ok: true };
    console.warn(`[bot] permissões do comando /${nomeComando} recusadas (${res.status}): ${(await res.text()).slice(0, 300)}`);
    return { ok: false, erro: res.status === 403 || res.status === 401 ? "sem_permissao_servidor" : "falha_discord" };
  } catch (err) {
    console.warn(`[bot] falha ao ajustar o comando /${nomeComando}:`, err instanceof Error ? err.message : err);
    return { ok: false, erro: "falha_discord" };
  }
}

/** Apaga uma mensagem do bot (já apagada = ok). */
export function deleteMessage(channelId: string, messageId: string): Promise<boolean> {
  if (!botAtivo) return Promise.resolve(false);
  return safe("apagar mensagem", async () => {
    const res = await call("DELETE", `/channels/${channelId}/messages/${messageId}`);
    return res.ok || res.status === 404;
  }, false);
}

/* ---------- Eventos do servidor (Guild Scheduled Events) ---------- */

/** 1 agendado · 2 em andamento · 3 encerrado · 4 cancelado */
export type StatusEventoDiscord = 1 | 2 | 3 | 4;

/**
 * Cria um evento "externo" no servidor (aparece em Eventos, com local escrito).
 * Precisa da permissão Gerenciar Eventos (ou Criar Eventos) para o bot.
 */
export function createScheduledEvent(opts: { nome: string; descricao: string; local: string; inicio: number; fim: number }): Promise<string | null> {
  if (!botAtivo) return Promise.resolve(null);
  return safe("criar evento", async () => {
    const res = await call(
      "POST",
      `/guilds/${env.DISCORD_GUILD_ID}/scheduled-events`,
      {
        name: opts.nome.slice(0, 100),
        description: opts.descricao.slice(0, 1000),
        privacy_level: 2,
        entity_type: 3,
        entity_metadata: { location: opts.local.slice(0, 100) },
        scheduled_start_time: new Date(opts.inicio).toISOString(),
        scheduled_end_time: new Date(opts.fim).toISOString(),
      },
      "Turma de curso agendada pelo painel",
    );
    if (!res.ok) {
      console.warn(`[bot] evento recusado (${res.status}): ${(await res.text()).slice(0, 300)}`);
      return null;
    }
    return ((await res.json()) as { id: string }).id;
  }, null);
}

/** Muda o status (e outros campos) de um evento. Evento já apagado = ok. */
export function updateScheduledEvent(
  id: string,
  body: { status?: StatusEventoDiscord; scheduled_end_time?: string; name?: string; description?: string },
  motivo: string,
): Promise<boolean> {
  if (!botAtivo) return Promise.resolve(false);
  return safe("atualizar evento", async () => {
    const res = await call("PATCH", `/guilds/${env.DISCORD_GUILD_ID}/scheduled-events/${id}`, body, motivo);
    if (!res.ok && res.status !== 404) console.warn(`[bot] atualização de evento recusada (${res.status}): ${(await res.text()).slice(0, 300)}`);
    return res.ok || res.status === 404;
  }, false);
}

/** Membro do servidor (apelido, cargos, usuário) direto do Discord. */
export interface MembroDiscord {
  nick: string | null;
  /** Avatar próprio deste servidor (null = usa o da conta). */
  avatar?: string | null;
  roles: string[];
  user: { id: string; username: string; global_name: string | null; avatar: string | null; bot?: boolean };
}
export function getMember(userId: string): Promise<MembroDiscord | null> {
  if (!botAtivo) return Promise.resolve(null);
  return safe("ler membro", async () => {
    const res = await call("GET", `/guilds/${env.DISCORD_GUILD_ID}/members/${userId}`);
    return res.ok ? ((await res.json()) as MembroDiscord) : null;
  }, null);
}

/** O bot reage a uma mensagem (ex.: 🎉 no anúncio de promoção). */
export function addReaction(channelId: string, messageId: string, emoji: string): Promise<boolean> {
  if (!botAtivo) return Promise.resolve(false);
  return safe("reagir", async () => {
    const res = await call("PUT", `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`);
    return res.ok;
  }, false);
}

/* ---------- Tickets (corregedoria): canal com permissões próprias + webhook anônimo ---------- */

const PT = {
  VER: 1n << 10n,
  ENVIAR: 1n << 11n,
  GERENCIAR_MSG: 1n << 13n,
  LINKS: 1n << 14n,
  ANEXAR: 1n << 15n,
  HISTORICO: 1n << 16n,
  WEBHOOKS: 1n << 29n,
};
const CONVERSA = (PT.VER | PT.ENVIAR | PT.HISTORICO | PT.ANEXAR | PT.LINKS).toString();

/**
 * Canal privado do ticket: invisível para @everyone; os cargos da equipe e quem abriu
 * conversam; o bot gerencia mensagens e webhooks (respostas anônimas).
 */
export function createTicketChannel(opts: { nome: string; topico: string; categoriaId: string | null; cargos: string[]; usuarioId: string; motivo: string }): Promise<string | null> {
  if (!botAtivo) return Promise.resolve(null);
  return safe("criar canal de ticket", async () => {
    const id = await botId();
    if (!id) return null;
    const guildId = env.DISCORD_GUILD_ID!;
    const res = await call(
      "POST",
      `/guilds/${guildId}/channels`,
      {
        name: opts.nome.slice(0, 100),
        type: 0,
        topic: opts.topico.slice(0, 1024),
        ...(opts.categoriaId ? { parent_id: opts.categoriaId } : {}),
        permission_overwrites: [
          { id: guildId, type: 0, deny: PT.VER.toString(), allow: "0" },
          ...opts.cargos.map((r) => ({ id: r, type: 0, allow: CONVERSA, deny: "0" })),
          { id: opts.usuarioId, type: 1, allow: CONVERSA, deny: "0" },
          { id, type: 1, allow: (BigInt(CONVERSA) | PT.GERENCIAR_MSG | PT.WEBHOOKS).toString(), deny: "0" },
        ],
      },
      opts.motivo,
    );
    if (!res.ok) {
      console.warn(`[bot] canal de ticket recusado (${res.status}): ${(await res.text()).slice(0, 300)}`);
      return null;
    }
    return ((await res.json()) as { id: string }).id;
  }, null);
}

/** Libera ou bloqueia o envio de mensagens para um cargo (type 0) ou membro (type 1) no canal. */
export function setSendPermission(channelId: string, alvoId: string, tipo: 0 | 1, podeEnviar: boolean, motivo: string): Promise<boolean> {
  if (!botAtivo) return Promise.resolve(false);
  const enviar = PT.ENVIAR.toString();
  const ver = (PT.VER | PT.HISTORICO | PT.LINKS).toString();
  return safe("permissão do canal", async () => {
    const res = await call(
      "PUT",
      `/channels/${channelId}/permissions/${alvoId}`,
      { type: tipo, allow: podeEnviar ? CONVERSA : ver, deny: podeEnviar ? "0" : enviar },
      motivo,
    );
    return res.ok;
  }, false);
}

export interface Webhook {
  id: string;
  token: string;
}

/** Webhook do canal com nome e foto próprios (as respostas saem com esse nome, não com o do autor). */
export function createWebhook(channelId: string, nome: string, avatar: { dados: Buffer; tipo: string } | null): Promise<Webhook | null> {
  if (!botAtivo) return Promise.resolve(null);
  return safe("criar webhook", async () => {
    const res = await call("POST", `/channels/${channelId}/webhooks`, {
      name: nome.slice(0, 80),
      ...(avatar ? { avatar: `data:${avatar.tipo};base64,${avatar.dados.toString("base64")}` } : {}),
    });
    if (!res.ok) {
      console.warn(`[bot] webhook recusado (${res.status}): ${(await res.text()).slice(0, 300)}`);
      return null;
    }
    const w = (await res.json()) as { id: string; token: string };
    return { id: w.id, token: w.token };
  }, null);
}

/** Envia pelo webhook (sem token do bot: o token do webhook já autoriza). */
export function executeWebhook(w: Webhook, body: MessageBody, files?: Arquivo[]): Promise<{ id: string } | null> {
  return safe("enviar pelo webhook", async () => {
    const res = await call("POST", `/webhooks/${w.id}/${w.token}?wait=true`, { allowed_mentions: { parse: [] }, ...body }, undefined, false, files);
    if (!res.ok) {
      console.warn(`[bot] webhook recusou a mensagem (${res.status}): ${(await res.text()).slice(0, 300)}`);
      return null;
    }
    return { id: ((await res.json()) as { id: string }).id };
  }, null);
}

/* ---------- DOESP: limite de upload, mensagens do canal e reações ---------- */

let limiteUpload: { at: number; bytes: number } | null = null;
/** Quanto o bot pode anexar por mensagem neste servidor (10 MB · 50 MB no nível 2 · 100 MB no nível 3). Cache de 10 min. */
export async function guildUploadLimit(): Promise<number> {
  if (limiteUpload && Date.now() - limiteUpload.at < 600_000) return limiteUpload.bytes;
  const tier = await safe("ler servidor", async () => {
    const res = await call("GET", `/guilds/${env.DISCORD_GUILD_ID}`);
    return res.ok ? (((await res.json()) as { premium_tier?: number }).premium_tier ?? 0) : null;
  }, null);
  const bytes = (tier !== null && tier >= 3 ? 100 : tier === 2 ? 50 : 10) * 1_048_576;
  if (tier !== null) limiteUpload = { at: Date.now(), bytes };
  return bytes;
}

export interface MensagemCanal {
  id: string;
  content: string;
  author: { id: string; bot?: boolean };
  attachments: Array<{ id: string; filename: string; size: number; url: string; content_type?: string }>;
  reactions?: Array<{ emoji: { name: string | null }; me: boolean }>;
  timestamp: string;
  flags?: number;
  /** Components V2 da mensagem (como o Discord devolve). */
  components?: unknown[];
}
/** Últimas mensagens de um canal (mais novas primeiro). */
export function listMessages(channelId: string, limit = 50): Promise<MensagemCanal[]> {
  if (!botAtivo) return Promise.resolve([]);
  return safe("ler mensagens", async () => {
    const res = await call("GET", `/channels/${channelId}/messages?limit=${Math.min(100, Math.max(1, limit))}`);
    return res.ok ? ((await res.json()) as MensagemCanal[]) : [];
  }, []);
}

/** Tira a reação do próprio bot. */
export function removeOwnReaction(channelId: string, messageId: string, emoji: string): Promise<boolean> {
  if (!botAtivo) return Promise.resolve(false);
  return safe("tirar reação", async () => (await call("DELETE", `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`)).ok, false);
}

/** Resposta a uma mensagem (aviso de erro no canal temporário). */
export function replyMessage(channelId: string, messageId: string, content: string): Promise<{ id: string } | null> {
  return postMessage(channelId, { content: content.slice(0, 2000), message_reference: { message_id: messageId, fail_if_not_exists: false } });
}
