import { randomUUID } from "node:crypto";
import {
  editInteractionReply,
  editMessage,
  FLAG_COMPONENTS_V2,
  FLAG_EPHEMERAL,
  interactionCallback,
  listTextChannels,
  postMessage,
  sendLog,
  type Arquivo,
  type MessageBody,
} from "../discord/bot.js";
import type { RawInteraction } from "../discord/gateway.js";
import { brasao } from "../set/brasao.js";
import { env } from "../env.js";
import {
  anexosAnuncio,
  caracteresFixos,
  CUSTOM_ABRIR,
  IMAGEM_MAX_BYTES,
  LIMITE_TOTAL,
  limiteTexto,
  limiteTextoMaximo,
  montarAnuncio,
  painelMensagem,
  TITULO_MAX,
} from "./mensagem.js";
import { anuncioStore } from "./store.js";

/**
 * "Realizar anúncio" no Discord. Tudo acontece numa mensagem efêmera (só quem clicou vê):
 *
 *   botão do painel → menu de canais (✖️ desmarca) → Confirmar → formulário (título, texto, imagem)
 *     → passou do limite? aviso + "Editar" (formulário volta preenchido)
 *     → publicado no canal + link para a mensagem
 *
 * Segurança: o cargo é conferido em CADA passo com os cargos atuais vindos do Discord.
 * O canal escolhido fica guardado no servidor (não confiamos em IDs vindos do cliente).
 */

const C = {
  canal: "anuncio:canal",
  limpar: "anuncio:limpar",
  confirmar: "anuncio:confirmar",
  enviar: "anuncio:enviar",
  editar: "anuncio:editar",
  cancelar: "anuncio:cancelar",
  novo: "anuncio:novo",
} as const;

const COR_ERRO = 0xe10600;
const COR_AVISO = 0xf59e0b;
const COR_OK = 0x22c55e;
const PERM_VER = 1n << 10n;
/** Tipos aceitos no menu: texto e anúncios. */
const TIPOS_CANAL = [0, 5];
const HOSTS_CDN = new Set(["cdn.discordapp.com", "media.discordapp.net"]);

/* ---------- Rascunho de cada pessoa (memória, 15 min = validade do token da interação) ---------- */

interface Rascunho {
  canalId: string | null;
  canalNome: string | null;
  titulo: string;
  texto: string;
  imagem: Arquivo | null;
  /** Nome original do arquivo enviado (para mostrar no formulário). */
  imagemOriginal: string | null;
  /** Publicação em andamento (bloqueia envio duplicado). */
  enviando: boolean;
  expira: number;
}

const TTL = 15 * 60_000;
const MAX_RASCUNHOS = 100;
const rascunhos = new Map<string, Rascunho>();

function rascunho(userId: string): Rascunho {
  const agora = Date.now();
  for (const [k, r] of rascunhos) if (r.expira < agora) rascunhos.delete(k);
  let r = rascunhos.get(userId);
  if (!r) {
    // Limite de memória: as imagens ficam aqui até publicar. Descarta o mais antigo.
    if (rascunhos.size >= MAX_RASCUNHOS) rascunhos.delete(rascunhos.keys().next().value!);
    r = { canalId: null, canalNome: null, titulo: "", texto: "", imagem: null, imagemOriginal: null, enviando: false, expira: 0 };
    rascunhos.set(userId, r);
  }
  r.expira = agora + TTL;
  return r;
}

/** Evita rajadas: um anúncio a cada 20s por pessoa. */
const ultimoEnvio = new Map<string, number>();
const INTERVALO_MS = 20_000;

/* ---------- Permissão ---------- */

export function podeAnunciar(roles: string[]): boolean {
  const permitidos = anuncioStore.config().cargosPermitidos;
  return permitidos.length > 0 && roles.some((r) => permitidos.includes(r));
}

/* ---------- Mensagens efêmeras do passo a passo ---------- */

const fmt = (n: number) => n.toLocaleString("pt-BR");
const rodapeEfemero = { type: 10, content: "-# Só você vê esta mensagem. O rascunho expira em 15 minutos." };

function caixa(cor: number, components: unknown[]): MessageBody {
  return { flags: FLAG_EPHEMERAL | FLAG_COMPONENTS_V2, components: [{ type: 17, accent_color: cor, components }] };
}

function aviso(cor: number, linhas: string[], botoes: unknown[] = []): MessageBody {
  return caixa(cor, [{ type: 10, content: linhas.join("\n") }, ...(botoes.length ? [{ type: 1, components: botoes }] : []), rodapeEfemero]);
}

const botao = (style: number, custom_id: string, label: string | null, emoji?: string) => ({
  type: 2,
  style,
  custom_id,
  ...(label ? { label } : {}),
  ...(emoji ? { emoji: { name: emoji } } : {}),
});
const BOTAO_NOVO = botao(2, C.novo, "Novo anúncio", "📢");
const BOTAO_EDITAR = botao(1, C.editar, "Editar anúncio", "✏️");
const BOTAO_CANCELAR = botao(2, C.cancelar, "Cancelar", "✖️");

/** Passo 1: escolher o canal. O canal fica marcado no menu; o × do próprio menu desmarca. */
function passoCanal(r: Rascunho, erro?: string): MessageBody {
  const cor = anuncioStore.config().cor;
  return caixa(cor, [
    { type: 10, content: "### 📢 Novo anúncio\n**Passo 1 de 2 ·** Escolha o canal onde o anúncio será publicado." },
    {
      type: 1,
      components: [
        {
          type: 8,
          custom_id: C.canal,
          channel_types: TIPOS_CANAL,
          placeholder: "Selecione o canal…",
          min_values: 0,
          max_values: 1,
          ...(r.canalId ? { default_values: [{ id: r.canalId, type: "channel" }] } : {}),
        },
      ],
    },
    ...(erro ? [{ type: 10, content: `⚠️ ${erro}` }] : []),
    ...(r.canalId
      ? [
          { type: 14, divider: true, spacing: 1 },
          { type: 10, content: `**Canal selecionado:** <#${r.canalId}>\nConfirme para escrever o anúncio. Para trocar, use o × do menu ou escolha outro canal.` },
          { type: 1, components: [botao(3, C.confirmar, "Confirmar canal", "✅")] },
        ]
      : []),
    rodapeEfemero,
  ]);
}

/** Passo 2: formulário. Volta preenchido quando a pessoa precisa editar. */
function formulario(r: Rascunho, autorId: string): MessageBody {
  const cfg = anuncioStore.config();
  const maxTexto = limiteTextoMaximo(cfg, autorId);
  const texto = (custom_id: string, opts: Record<string, unknown>, valor: string) => ({
    type: 4,
    custom_id,
    required: true,
    ...opts,
    ...(valor ? { value: valor.slice(0, Number(opts.max_length)) } : {}),
  });
  // Só o conteúdo do formulário: o `type: 9` (abrir modal) é colocado por responder().
  return {
      custom_id: C.enviar,
      title: r.titulo ? "✏️ Editar anúncio" : "📢 Novo anúncio",
      components: [
        {
          type: 10,
          content: [
            `**Passo 2 de 2 ·** Publicando em **#${r.canalNome ?? "canal"}**.`,
            `O Discord aceita **${fmt(LIMITE_TOTAL)}** caracteres por mensagem: título e rodapé entram na conta, a imagem não. Sobram até **${fmt(maxTexto)}** para o texto.`,
          ].join("\n"),
        },
        {
          type: 18,
          label: "Título",
          description: "Aparece em destaque no topo do anúncio.",
          component: texto("titulo", { style: 1, min_length: 1, max_length: TITULO_MAX, placeholder: "Ex.: Operação Verão 2026" }, r.titulo),
        },
        {
          type: 18,
          label: "Texto do anúncio",
          description: "Aceita **negrito**, *itálico*, listas, links e quebras de linha.",
          component: texto("texto", { style: 2, min_length: 1, max_length: maxTexto, placeholder: "Escreva o comunicado…" }, r.texto),
        },
        {
          type: 18,
          label: "Imagem (opcional)",
          description: r.imagem
            ? `Atual: ${(r.imagemOriginal ?? "imagem").slice(0, 40)}. Envie outra para trocar ou deixe vazio para manter.`
            : "PNG, JPG, WEBP ou GIF até 8 MB. Fica entre o texto e o rodapé.",
          component: { type: 19, custom_id: "imagem", min_values: 0, max_values: 1, required: false },
        },
      ],
  };
}

/* ---------- Leitura do formulário ---------- */

function lerFormulario(components: unknown): { textos: Record<string, string>; arquivos: Record<string, string[]> } {
  const textos: Record<string, string> = {};
  const arquivos: Record<string, string[]> = {};
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const n = node as { type?: number; custom_id?: string; value?: string; values?: string[]; component?: unknown; components?: unknown[] };
    if (n.custom_id && typeof n.value === "string") textos[n.custom_id] = n.value;
    if (n.custom_id && n.type === 19 && Array.isArray(n.values)) arquivos[n.custom_id] = n.values;
    if (n.component) walk(n.component);
    if (Array.isArray(n.components)) n.components.forEach(walk);
  };
  if (Array.isArray(components)) components.forEach(walk);
  return { textos, arquivos };
}

const limparTitulo = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim().slice(0, TITULO_MAX);
const limparTexto = (s: string) =>
  s
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+$/gm, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();

/* ---------- Imagem enviada no formulário ---------- */

type TipoImagem = "image/png" | "image/jpeg" | "image/webp" | "image/gif";
const EXT: Record<TipoImagem, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

/** Formato pelos primeiros bytes — não confia na extensão nem no Content-Type. */
function detectarImagem(buf: Buffer): TipoImagem | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buf.length >= 6 && /^GIF8[79]a$/.test(buf.toString("ascii", 0, 6))) return "image/gif";
  return null;
}

/**
 * Baixa o arquivo do CDN do Discord e reenvia como anexo do anúncio (o link do upload
 * expira). Só aceita o CDN oficial, sem redirecionamento, com limite de tamanho.
 */
async function baixarImagem(att: { url: string; size: number; filename: string }): Promise<{ ok: true; arquivo: Arquivo } | { ok: false; erro: string }> {
  if (att.size > IMAGEM_MAX_BYTES) return { ok: false, erro: `A imagem tem ${(att.size / 1024 / 1024).toFixed(1)} MB. O máximo é 8 MB.` };
  let url: URL;
  try {
    url = new URL(att.url);
  } catch {
    return { ok: false, erro: "Não foi possível ler a imagem enviada." };
  }
  if (url.protocol !== "https:" || !HOSTS_CDN.has(url.hostname)) return { ok: false, erro: "Não foi possível ler a imagem enviada." };
  try {
    const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return { ok: false, erro: "Não foi possível baixar a imagem. Envie de novo." };
    if (Number(res.headers.get("content-length") ?? 0) > IMAGEM_MAX_BYTES) return { ok: false, erro: "A imagem passa de 8 MB." };
    const dados = Buffer.from(await res.arrayBuffer());
    if (dados.length > IMAGEM_MAX_BYTES) return { ok: false, erro: "A imagem passa de 8 MB." };
    const tipo = detectarImagem(dados);
    if (!tipo) return { ok: false, erro: "Formato não aceito. Envie PNG, JPG, WEBP ou GIF." };
    return { ok: true, arquivo: { nome: `anuncio.${EXT[tipo]}`, dados, tipo } };
  } catch (err) {
    console.warn("[anuncio] falha ao baixar imagem:", err instanceof Error ? err.message : err);
    return { ok: false, erro: "Não foi possível baixar a imagem. Envie de novo." };
  }
}

/* ---------- Publicação ---------- */

async function publicar(i: RawInteraction, r: Rascunho): Promise<MessageBody> {
  const user = i.member!.user;
  const cfg = anuncioStore.config();
  const em = Date.now();

  // Conferência final do limite (o título também gasta caracteres).
  const limite = limiteTexto(cfg, r.titulo, user.id);
  if (r.texto.length > limite) {
    const excesso = r.texto.length - limite;
    return aviso(
      COR_AVISO,
      [
        "### ⚠️ O anúncio passou do limite de caracteres",
        `Seu texto tem **${fmt(r.texto.length)}** caracteres, mas com este título e o rodapé o máximo é **${fmt(limite)}**.`,
        `Corte **${fmt(excesso)}** ${excesso === 1 ? "caractere" : "caracteres"} (ou encurte o título) e envie de novo.`,
        `-# Total da mensagem: ${fmt(r.texto.length + caracteresFixos(cfg, r.titulo, user.id))} de ${fmt(LIMITE_TOTAL)}. A imagem não conta.`,
      ],
      [BOTAO_EDITAR, BOTAO_CANCELAR],
    );
  }

  const espera = (ultimoEnvio.get(user.id) ?? 0) + INTERVALO_MS - em;
  if (espera > 0) {
    return aviso(COR_AVISO, [`### ⏳ Aguarde ${Math.ceil(espera / 1000)}s`, "Você acabou de publicar um anúncio. Tente de novo em instantes — o rascunho continua salvo."], [
      botao(1, C.editar, "Tentar de novo", "🔁"),
      BOTAO_CANCELAR,
    ]);
  }

  const body = montarAnuncio(cfg, { titulo: r.titulo, texto: r.texto, imagem: r.imagem?.nome ?? null, autorId: user.id, em });
  const msg = await postMessage(r.canalId!, body, anexosAnuncio(r.imagem));
  if (!msg) {
    return aviso(
      COR_ERRO,
      [
        "### ❌ O Discord recusou o anúncio",
        `Confira se o bot pode **ver o canal**, **enviar mensagens** e **anexar arquivos** em <#${r.canalId}>.`,
        "-# Seu texto continua salvo: corrija e tente de novo.",
      ],
      [botao(1, C.editar, "Tentar de novo", "🔁"), BOTAO_CANCELAR],
    );
  }

  ultimoEnvio.set(user.id, em);
  const canalId = r.canalId!;
  const canalNome = r.canalNome ?? canalId;
  const link = `https://discord.com/channels/${env.DISCORD_GUILD_ID}/${canalId}/${msg.id}`;
  await anuncioStore.add({
    id: randomUUID(),
    autor: { id: user.id, username: user.username, avatar: user.avatar ?? null },
    canalId,
    canalNome,
    mensagemId: msg.id,
    titulo: r.titulo,
    trecho: r.texto.slice(0, 240),
    caracteres: r.texto.length,
    comImagem: Boolean(r.imagem),
    em,
  });
  console.info(`[anuncio] publicado em #${canalNome} por discord:${user.id}`);
  void sendLog(cfg.logCanalId, {
    title: "📢 Anúncio publicado",
    color: cfg.cor,
    fields: [
      { name: "Autor", value: `<@${user.id}> (${user.username})`, inline: true },
      { name: "Canal", value: `<#${canalId}>`, inline: true },
      { name: "Título", value: r.titulo },
      { name: "Mensagem", value: `[Abrir anúncio](${link})` },
    ],
    footer: "PMERJ · Anúncios",
  });
  rascunhos.delete(user.id);

  return caixa(COR_OK, [
    { type: 10, content: `### ✅ Anúncio publicado\n**${r.titulo}** foi enviado em <#${canalId}>.` },
    { type: 1, components: [{ type: 2, style: 5, label: "Ver anúncio", emoji: { name: "🔗" }, url: link }, BOTAO_NOVO] },
    { type: 10, content: "-# Só você vê esta mensagem." },
  ]);
}

/* ---------- Tratamento das interações ---------- */

/** Atualizar/editar uma mensagem não aceita mudar a flag de efêmera: mantém só a de V2. */
const paraEdicao = (body: MessageBody): MessageBody => (body.flags !== undefined ? { ...body, flags: FLAG_COMPONENTS_V2 } : body);

const responder = (i: RawInteraction, type: number, data?: MessageBody) =>
  interactionCallback(i.id, i.token, data ? { type, data: type === 7 ? paraEdicao(data) : data } : { type });

const editarResposta = (i: RawInteraction, body: MessageBody) => editInteractionReply(i.token, paraEdicao(body));

export async function handleAnuncioInteraction(i: RawInteraction): Promise<boolean> {
  const customId = i.data?.custom_id ?? "";
  if (customId !== CUSTOM_ABRIR && !Object.values(C).includes(customId as (typeof C)[keyof typeof C])) return false;

  const member = i.member;
  const vindoDoPainel = customId === CUSTOM_ABRIR;
  // Do painel: resposta nova (efêmera). Dentro do passo a passo: atualiza a mesma mensagem.
  const tipoResposta = vindoDoPainel ? 4 : 7;

  if (!member) {
    await responder(i, 4, aviso(COR_ERRO, ["Use o painel de anúncios dentro do servidor."]));
    return true;
  }
  if (!podeAnunciar(member.roles ?? [])) {
    rascunhos.delete(member.user.id);
    const nenhum = anuncioStore.config().cargosPermitidos.length === 0;
    await responder(
      i,
      i.type === 5 ? 4 : tipoResposta,
      aviso(COR_ERRO, [
        "### 🔒 Sem permissão",
        nenhum
          ? "Nenhum cargo foi autorizado a fazer anúncios ainda. Peça à administração para configurar em **Painel → Anúncio**."
          : "Só os cargos autorizados no painel podem realizar anúncios.",
      ]),
    );
    return true;
  }

  const userId = member.user.id;

  // Abrir (painel) ou começar de novo: passo 1 com o menu de canais.
  if (i.type === 3 && (customId === CUSTOM_ABRIR || customId === C.novo)) {
    rascunhos.delete(userId);
    await responder(i, tipoResposta, passoCanal(rascunho(userId)));
    return true;
  }

  const r = rascunho(userId);

  if (i.type === 3 && customId === C.canal) {
    const canalId = i.data?.values?.[0];
    // × no menu (lista vazia) = desmarcou o canal.
    if (!canalId) {
      r.canalId = null;
      r.canalNome = null;
      await responder(i, 7, passoCanal(r));
      return true;
    }
    const canal = canalId ? i.data?.resolved?.channels?.[canalId] : undefined;
    if (!canalId || !canal || !TIPOS_CANAL.includes(canal.type)) {
      await responder(i, 7, passoCanal(r, "Escolha um canal de texto ou de anúncios."));
      return true;
    }
    // A própria pessoa precisa enxergar o canal (não dá para anunciar onde ela não tem acesso).
    if (canal.permissions !== undefined && !(BigInt(canal.permissions) & PERM_VER)) {
      await responder(i, 7, passoCanal(r, "Você não tem acesso a esse canal."));
      return true;
    }
    // O bot precisa poder escrever lá. A lista fica em cache; se demorar, confere só no envio.
    const canais = await Promise.race([listTextChannels(), new Promise<null>((ok) => setTimeout(() => ok(null), 1_500))]);
    const info = canais?.find((c) => c.id === canalId);
    if (info && !info.podeEnviar) {
      r.canalId = null;
      r.canalNome = null;
      await responder(i, 7, passoCanal(r, `O bot não pode enviar mensagens em <#${canalId}>. Libere nas permissões do canal ou escolha outro.`));
      return true;
    }
    r.canalId = canalId;
    r.canalNome = canal.name;
    await responder(i, 7, passoCanal(r));
    return true;
  }

  if (i.type === 3 && customId === C.limpar) {
    r.canalId = null;
    r.canalNome = null;
    await responder(i, 7, passoCanal(r));
    return true;
  }

  if (i.type === 3 && (customId === C.confirmar || customId === C.editar)) {
    if (!r.canalId) {
      await responder(i, 7, passoCanal(r, "O rascunho expirou. Escolha o canal de novo."));
      return true;
    }
    await responder(i, 9, formulario(r, userId));
    return true;
  }

  if (i.type === 3 && customId === C.cancelar) {
    rascunhos.delete(userId);
    await responder(i, 7, aviso(0x4b5563, ["### Anúncio cancelado", "Nada foi publicado."], [BOTAO_NOVO]));
    return true;
  }

  if (i.type === 5 && customId === C.enviar) {
    if (!r.canalId) {
      await responder(i, 7, passoCanal(r, "O rascunho expirou. Escolha o canal de novo."));
      return true;
    }
    const { textos, arquivos } = lerFormulario(i.data?.components);
    r.titulo = limparTitulo(textos.titulo ?? "");
    r.texto = limparTexto(textos.texto ?? "");
    const anexoId = arquivos.imagem?.[0];
    const anexo = anexoId ? i.data?.resolved?.attachments?.[anexoId] : undefined;

    if (!r.titulo || !r.texto) {
      await responder(i, 7, aviso(COR_AVISO, ["### ⚠️ Faltou preencher", "O anúncio precisa de título e texto."], [BOTAO_EDITAR, BOTAO_CANCELAR]));
      return true;
    }

    // Baixar a imagem e publicar pode passar dos 3s: confirma já e atualiza a mensagem depois.
    await responder(i, 6);
    // Clique duplo / envio repetido: só um publica.
    if (r.enviando) return true;
    r.enviando = true;
    try {
      if (anexo) {
        const img = await baixarImagem(anexo);
        if (!img.ok) {
          await editarResposta(i, aviso(COR_AVISO, ["### ⚠️ Problema com a imagem", img.erro, "-# Seu texto continua salvo."], [BOTAO_EDITAR, BOTAO_CANCELAR]));
          return true;
        }
        r.imagem = img.arquivo;
        r.imagemOriginal = anexo.filename;
      }
      await editarResposta(i, await publicar(i, r));
    } finally {
      r.enviando = false;
    }
    return true;
  }

  return false;
}

/* ---------- Painel fixo ---------- */

/** Publica (ou atualiza no lugar) a mensagem com o botão "Realizar anúncio". */
export async function publicarPainel(canalId: string) {
  const cfg = anuncioStore.config();
  const body = painelMensagem(cfg);
  if (cfg.painel?.canalId === canalId && (await editMessage(canalId, cfg.painel.mensagemId, body, brasao()))) return cfg.painel;
  const msg = await postMessage(canalId, body, brasao());
  return msg ? { canalId, mensagemId: msg.id } : null;
}

/** Mantém o painel publicado em dia (cargos, cor, rodapé, logo). Silencioso. */
export async function atualizarPainelPublicado(): Promise<void> {
  const cfg = anuncioStore.config();
  if (cfg.painel) await editMessage(cfg.painel.canalId, cfg.painel.mensagemId, painelMensagem(cfg), brasao());
}
