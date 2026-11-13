import { randomUUID } from "node:crypto";
import { postMessage, FLAG_COMPONENTS_V2, type MessageBody } from "../discord/bot.js";
import type { MembroEvento } from "../discord/gateway.js";
import { jsonFile } from "../lib/jsonFile.js";
import type { AnuncioConfig, EntradaSaidaConfig, EntradaSaidaData, EventoMembro, TipoAnuncio } from "./types.js";

/* ---------- Armazenamento (apps/api/data/entrada-saida.json) ---------- */

export const DEFAULT_ES_CONFIG: EntradaSaidaConfig = {
  entrada: {
    ativo: false,
    canalId: null,
    titulo: "Novo membro no {servidor}",
    mensagem: "Seja bem-vindo(a), {membro}! Você é o membro nº **{total}**.\nPeça seu set no canal de identificação para receber seu apelido.",
    cor: 0x22c55e,
    detalhes: true,
    mencionar: true,
  },
  saida: {
    ativo: false,
    canalId: null,
    titulo: "Membro saiu",
    mensagem: "**{nome}** ({usuario}) deixou o servidor. Agora somos **{total}**.",
    cor: 0xe10600,
    detalhes: true,
    mencionar: false,
  },
  ignorarBots: true,
  atualizadoEm: 0,
  atualizadoPor: null,
};

const HISTORY_LIMIT = 2_000;

const db = jsonFile<EntradaSaidaData>(
  "entrada-saida",
  () => ({ versao: 1, config: structuredClone(DEFAULT_ES_CONFIG), eventos: [] }),
  (raw) => ({
    versao: 1,
    config: {
      ...structuredClone(DEFAULT_ES_CONFIG),
      ...raw.config,
      entrada: { ...DEFAULT_ES_CONFIG.entrada, ...raw.config?.entrada },
      saida: { ...DEFAULT_ES_CONFIG.saida, ...raw.config?.saida },
    },
    eventos: Array.isArray(raw.eventos) ? raw.eventos : [],
  }),
);

export const esStore = {
  config: () => db.get().config,
  async saveConfig(config: EntradaSaidaConfig) {
    db.get().config = config;
    await db.save();
  },
  recentes: (limit: number) => db.get().eventos.slice(-limit).reverse(),
  /** Entradas e saídas desde `desde` (para os contadores do painel). */
  contar(desde: number) {
    let entradas = 0;
    let saidas = 0;
    for (const e of db.get().eventos) {
      if (e.em < desde) continue;
      if (e.tipo === "entrada") entradas++;
      else saidas++;
    }
    return { entradas, saidas };
  },
  async add(e: EventoMembro) {
    const d = db.get();
    d.eventos.push(e);
    if (d.eventos.length > HISTORY_LIMIT) d.eventos.splice(0, d.eventos.length - HISTORY_LIMIT);
    await db.save();
  },
};

/* ---------- Mensagem (Components V2) ---------- */

/** Nomes vêm do usuário: escapa markdown para ninguém quebrar o anúncio. */
const escapeMd = (s: string) => s.replace(/([\\*_~`|>#[\]()-])/g, "\\$1");

const avatarUrl = (m: Pick<MembroEvento, "id" | "avatar">) =>
  m.avatar
    ? `https://cdn.discordapp.com/avatars/${m.id}/${m.avatar}.png?size=256`
    : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(m.id) >> 22n) % 6}.png`;

function preencher(modelo: string, m: MembroEvento): string {
  return modelo
    .replaceAll("{membro}", `<@${m.id}>`)
    .replaceAll("{nome}", escapeMd(m.globalName ?? m.username))
    .replaceAll("{usuario}", `@${escapeMd(m.username)}`)
    .replaceAll("{servidor}", escapeMd(m.servidor))
    .replaceAll("{total}", m.totalMembros.toLocaleString("pt-BR"));
}

const ts = (ms: number, estilo: "R" | "D" | "f") => `<t:${Math.floor(ms / 1000)}:${estilo}>`;

export function montarAnuncio(tipo: TipoAnuncio, cfg: AnuncioConfig, m: MembroEvento): MessageBody {
  const detalhes: string[] = [];
  if (cfg.detalhes) {
    detalhes.push(`**Conta criada** ${ts(m.contaCriadaEm, "R")}`);
    if (tipo === "entrada") detalhes.push(`**Membro nº** ${m.totalMembros.toLocaleString("pt-BR")}`);
    if (tipo === "saida" && m.entrouEm) detalhes.push(`**Estava no servidor desde** ${ts(m.entrouEm, "D")}`);
  }

  return {
    flags: FLAG_COMPONENTS_V2,
    // Só pinga a própria pessoa, e só se o comando quiser. Nunca @everyone/@here/cargos.
    allowed_mentions: tipo === "entrada" && cfg.mencionar ? { parse: [], users: [m.id] } : { parse: [] },
    components: [
      {
        type: 17,
        accent_color: cfg.cor,
        components: [
          {
            type: 9,
            components: [
              { type: 10, content: `## ${tipo === "entrada" ? "📥" : "📤"} ${preencher(cfg.titulo, m)}` },
              { type: 10, content: preencher(cfg.mensagem, m) },
            ],
            accessory: { type: 11, media: { url: avatarUrl(m) }, description: `Avatar de ${m.username}`.slice(0, 1024) },
          },
          ...(detalhes.length
            ? [
                { type: 14, divider: true, spacing: 1 },
                { type: 10, content: detalhes.join("  ·  ") },
              ]
            : []),
          { type: 10, content: `-# ID ${m.id} · ${ts(Date.now(), "f")}` },
        ],
      },
    ],
  };
}

/* ---------- Eventos do gateway ---------- */

export async function registrarEvento(tipo: TipoAnuncio, m: MembroEvento, teste = false): Promise<boolean> {
  const cfg = esStore.config();
  const anuncio = cfg[tipo];
  const deveAnunciar = anuncio.ativo && anuncio.canalId && !(cfg.ignorarBots && m.bot);

  let anunciado = false;
  if (deveAnunciar || (teste && anuncio.canalId)) {
    anunciado = Boolean(await postMessage(anuncio.canalId!, montarAnuncio(tipo, anuncio, m)));
  }
  if (!teste) {
    await esStore.add({
      id: randomUUID(),
      tipo,
      userId: m.id,
      username: m.username,
      globalName: m.globalName,
      avatar: m.avatar,
      bot: m.bot,
      em: Date.now(),
      totalMembros: m.totalMembros,
      contaCriadaEm: m.contaCriadaEm,
      entrouEm: m.entrouEm,
      anunciado,
    });
    console.info(`[entrada-saida] ${tipo} discord:${m.id}${anunciado ? " (anunciado)" : ""}`);
  }
  return anunciado;
}
