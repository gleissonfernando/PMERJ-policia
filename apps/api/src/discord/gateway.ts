import { Client, Events, GatewayIntentBits, Partials, type GuildMember, type PartialGuildMember } from "discord.js";
import { env } from "../env.js";
import { botAtivo } from "./bot.js";
import { diagLog, idadeInteracao } from "../lib/diagLog.js";

/**
 * Conexão permanente do bot com o Discord (gateway). Recebe em tempo real:
 *   - entradas e saídas de membros  → anúncios (Entrada e Saída)
 *   - cliques em botões e formulários → painel "Pedir Set" no Discord
 *
 * Exige no Developer Portal → Bot → "Server Members Intent" ligado.
 * Se a conexão falhar, a API continua funcionando normalmente (só sem eventos).
 */

/** Interação crua do Discord (só os campos que usamos). Respondida via REST em bot.ts. */
export interface RawInteraction {
  id: string;
  token: string;
  type: number; // 3 = componente (botão/menu) · 5 = formulário enviado
  guild_id?: string;
  member?: {
    user: { id: string; username: string; global_name?: string | null; avatar?: string | null };
    nick?: string | null;
    joined_at?: string;
    /** Cargos atuais de quem clicou. */
    roles: string[];
    /** Permissões efetivas no canal (bitfield em texto). */
    permissions?: string;
  };
  data?: {
    /** Comandos de barra (type 2): nome e opções. */
    name?: string;
    options?: Array<{ name: string; type: number; value?: string | number | boolean }>;
    custom_id?: string;
    components?: unknown[];
    /** Menus de seleção: IDs escolhidos. */
    values?: string[];
    /** Objetos completos do que foi escolhido/enviado (canais do menu, arquivos do formulário). */
    resolved?: {
      channels?: Record<string, { id: string; name: string; type: number; permissions?: string }>;
      attachments?: Record<string, { id: string; filename: string; size: number; url: string; content_type?: string }>;
      users?: Record<string, { id: string; username: string; global_name?: string | null; avatar?: string | null; bot?: boolean }>;
      members?: Record<string, { nick?: string | null; joined_at?: string; roles?: string[] }>;
    };
  };
}

export interface MembroEvento {
  id: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
  bot: boolean;
  /** Quando a conta do Discord foi criada. */
  contaCriadaEm: number;
  /** Quando entrou no servidor (só se o bot sabia). */
  entrouEm: number | null;
  /** Total de membros depois do evento. */
  totalMembros: number;
  servidor: string;
}

/** Mensagem crua do Discord (MESSAGE_CREATE) — só os campos que usamos. */
export interface RawMensagem {
  id: string;
  channel_id: string;
  guild_id?: string;
  webhook_id?: string;
  content: string;
  author: { id: string; username: string; global_name?: string | null; avatar?: string | null; bot?: boolean };
  /** Cargos de quem escreveu (vem junto em mensagens de servidor). */
  member?: { roles: string[]; nick?: string | null };
  attachments: Array<{ id: string; filename: string; size: number; url: string; content_type?: string }>;
}

/** Alguém entrou, saiu ou trocou de canal de voz (null = fora de qualquer canal). */
export interface VozEvento {
  userId: string;
  bot: boolean;
  roles: string[];
  de: string | null;
  para: string | null;
}

type Handlers = {
  interaction: Array<(i: RawInteraction) => Promise<boolean>>;
  voz: Array<(v: VozEvento) => Promise<void>>;
  pronto: Array<(x: null) => Promise<void>>;
  mensagem: Array<(m: RawMensagem) => Promise<void>>;
  entrada: Array<(m: MembroEvento) => Promise<void>>;
  saida: Array<(m: MembroEvento) => Promise<void>>;
  cargos: Array<(userId: string) => Promise<void>>;
};
const handlers: Handlers = { interaction: [], voz: [], pronto: [], mensagem: [], entrada: [], saida: [], cargos: [] };

export const onInteraction = (fn: Handlers["interaction"][number]) => handlers.interaction.push(fn);
export const onMembroEntrou = (fn: Handlers["entrada"][number]) => handlers.entrada.push(fn);
export const onMembroSaiu = (fn: Handlers["saida"][number]) => handlers.saida.push(fn);
/** Mensagens novas no servidor (ex.: canais de ticket da corregedoria). */
export const onMensagem = (fn: Handlers["mensagem"][number]) => handlers.mensagem.push(fn);
/** Mudanças em canais de voz do servidor oficial (ex.: bate-ponto automático). */
export const onVoz = (fn: Handlers["voz"][number]) => handlers.voz.push(fn);
/** O bot conectou (e reconectou do zero): bom momento para conferir o estado atual. */
export const onPronto = (fn: () => Promise<void>) => handlers.pronto.push(() => fn());
/** Os cargos (ou o apelido) de um membro mudaram. userId "*" = lista de membros acabou de carregar. Entradas e saídas têm eventos próprios. */
export const onCargosAlterados = (fn: (userId: string) => Promise<void>) => handlers.cargos.push(fn);

/** Membro do servidor com os cargos atuais (cache do gateway). */
export interface MembroCargos {
  id: string;
  nome: string;
  username: string;
  avatar: string | null;
  bot: boolean;
  roles: string[];
  /** Quando entrou no servidor (null se o Discord não informou). */
  entrouEm: number | null;
}

let membrosCarregados = false;

/** Todos os membros do servidor oficial (null = gateway offline ou lista ainda não carregada). */
export function membrosDoServidor(): MembroCargos[] | null {
  const g = cliente?.guilds.cache.get(env.DISCORD_GUILD_ID ?? "");
  if (!g || !membrosCarregados) return null;
  return [...g.members.cache.values()].map((m) => ({
    id: m.id,
    nome: m.displayName,
    username: m.user.username,
    avatar: m.user.avatar,
    bot: m.user.bot,
    roles: [...m.roles.cache.keys()].filter((r) => r !== g.id),
    entrouEm: m.joinedTimestamp ?? null,
  }));
}

/** Quem está em canal de voz agora (userId → canal), do cache do gateway. */
export function vozAtual(): Map<string, { canalId: string; roles: string[]; bot: boolean }> {
  const g = cliente?.guilds.cache.get(env.DISCORD_GUILD_ID ?? "");
  const out = new Map<string, { canalId: string; roles: string[]; bot: boolean }>();
  if (!g) return out;
  for (const [id, v] of g.voiceStates.cache) {
    if (v.channelId) out.set(id, { canalId: v.channelId, roles: v.member ? [...v.member.roles.cache.keys()] : [], bot: v.member?.user.bot ?? false });
  }
  return out;
}

export type GatewayStatus =
  | { estado: "desligado" }
  | { estado: "conectando" }
  | { estado: "online"; bot: string }
  | { estado: "erro"; motivo: string };

let status: GatewayStatus = { estado: "desligado" };
export const gatewayStatus = (): GatewayStatus => status;

let cliente: Client | null = null;

/** Nome e total de membros do servidor oficial (se o gateway estiver online). */
export function infoServidor(): { nome: string; total: number } | null {
  const g = cliente?.guilds.cache.get(env.DISCORD_GUILD_ID ?? "");
  return g ? { nome: g.name, total: g.memberCount } : null;
}

function toEvento(m: GuildMember | PartialGuildMember): MembroEvento {
  return {
    id: m.id,
    username: m.user.username ?? "desconhecido",
    globalName: m.user.globalName ?? null,
    avatar: m.user.avatar ?? null,
    bot: m.user.bot ?? false,
    contaCriadaEm: m.user.createdTimestamp,
    entrouEm: m.joinedTimestamp ?? null,
    totalMembros: m.guild.memberCount,
    servidor: m.guild.name,
  };
}

async function run<T>(label: string, list: Array<(x: T) => Promise<unknown>>, payload: T) {
  for (const fn of list) {
    try {
      await fn(payload);
    } catch (err) {
      console.error(`[gateway] erro em ${label}:`, err);
    }
  }
}

export async function startGateway(): Promise<void> {
  if (!botAtivo) return;
  status = { estado: "conectando" };

  const client = new Client({
    // GuildMessages + MessageContent: tickets da corregedoria (respostas anônimas e transcript).
    // GuildVoiceStates: bate-ponto ao entrar nos canais de voz configurados.
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildVoiceStates],
    partials: [Partials.GuildMember, Partials.User],
  });
  cliente = client;

  client.once(Events.ClientReady, (c) => {
    status = { estado: "online", bot: c.user.tag };
    console.info(`[gateway] conectado como ${c.user.tag}`);
    if (!c.guilds.cache.has(env.DISCORD_GUILD_ID!)) {
      console.warn("[gateway] o bot NÃO está no servidor de DISCORD_GUILD_ID. Convide-o pelo Developer Portal → OAuth2.");
    }
    // Lista completa de membros uma vez (fica em dia pelos eventos de entrada/saída/atualização).
    const g = c.guilds.cache.get(env.DISCORD_GUILD_ID!);
    void run("pronto", handlers.pronto, null);
    // Lista carregada: quem depende dela (hierarquia) é avisado com "*".
    if (g)
      void g.members
        .fetch()
        .then(() => {
          membrosCarregados = true;
          return run("cargos", handlers.cargos, "*");
        })
        .catch((err: unknown) => console.warn("[gateway] não consegui carregar os membros:", err instanceof Error ? err.message : err));
  });

  client.on(Events.VoiceStateUpdate, (antes, depois) => {
    if (depois.guild.id !== env.DISCORD_GUILD_ID || antes.channelId === depois.channelId) return;
    const m = depois.member ?? antes.member;
    void run("voz", handlers.voz, {
      userId: depois.id,
      bot: m?.user.bot ?? false,
      roles: m ? [...m.roles.cache.keys()] : [],
      de: antes.channelId,
      para: depois.channelId,
    });
  });

  client.on(Events.GuildMemberAdd, (m) => {
    if (m.guild.id === env.DISCORD_GUILD_ID) void run("entrada", handlers.entrada, toEvento(m));
  });
  client.on(Events.GuildMemberUpdate, (antes, depois) => {
    if (depois.guild.id !== env.DISCORD_GUILD_ID) return;
    const a = antes.partial ? null : [...antes.roles.cache.keys()].sort().join(",");
    const d = [...depois.roles.cache.keys()].sort().join(",");
    // Antes parcial (fora do cache): avisa mesmo assim; troca de apelido também redesenha (o nome aparece nos painéis).
    if (a !== d || antes.displayName !== depois.displayName) void run("cargos", handlers.cargos, depois.id);
  });
  client.on(Events.GuildMemberRemove, (m) => {
    if (m.guild.id === env.DISCORD_GUILD_ID) void run("saída", handlers.saida, toEvento(m));
  });

  // Interações tratadas no formato cru da API: não dependem da versão dos builders do discord.js.
  client.on(Events.Raw, (packet: { t?: string; d?: unknown }) => {
    if (packet.t === "MESSAGE_CREATE") {
      const m = packet.d as RawMensagem;
      if (m?.guild_id === env.DISCORD_GUILD_ID) void run("mensagem", handlers.mensagem, m);
      return;
    }
  });
  client.on(Events.Raw, (packet: { t?: string; d?: RawInteraction }) => {
    if (packet.t !== "INTERACTION_CREATE" || !packet.d || packet.d.guild_id !== env.DISCORD_GUILD_ID) return;
    const i = packet.d;
    const chegada = idadeInteracao(i.id);
    const rotulo = `tipo=${i.type} custom_id=${i.data?.custom_id ?? "-"} chegou=${chegada}ms`;
    // Evento que já chega atrasado: o problema é a conexão, não o código.
    if (chegada > 1_500) diagLog(`interação ATRASADA ${rotulo}`);
    void (async () => {
      for (const fn of handlers.interaction) {
        try {
          if (await fn(i)) return;
        } catch (err) {
          console.error("[gateway] erro ao tratar interação:", err);
          diagLog(`interação ERRO ${rotulo} erro=${err instanceof Error ? err.stack ?? err.message : String(err)}`);
          return;
        }
      }
      diagLog(`interação SEM DONO ${rotulo}`);
    })();
  });

  client.on(Events.Error, (err) => console.error("[gateway] erro:", err.message));
  client.on(Events.ShardDisconnect, () => {
    if (status.estado === "online") status = { estado: "conectando" };
  });
  client.on(Events.ShardResume, () => {
    if (client.user) status = { estado: "online", bot: client.user.tag };
  });

  try {
    await client.login(env.DISCORD_BOT_TOKEN);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const motivo = /disallowed intents/i.test(msg)
      ? 'Ative "Server Members Intent" e "Message Content Intent" no Developer Portal → Bot.'
      : /token/i.test(msg)
        ? "Token do bot inválido (DISCORD_BOT_TOKEN)."
        : msg;
    status = { estado: "erro", motivo };
    console.error(`[gateway] não conectou: ${motivo} A API segue funcionando sem eventos do Discord.`);
    void client.destroy();
  }

  // Ouvir SIGINT/SIGTERM desliga a saída padrão do Node: encerra a conexão e sai de verdade.
  const shutdown = () => void client.destroy().finally(() => process.exit(0));
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
