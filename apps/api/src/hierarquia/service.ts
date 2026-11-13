import { emojiLogo } from "../branding/emoji.js";
import { deleteMessage, editMessage, FLAG_COMPONENTS_V2, listRoles, postMessage, type MessageBody } from "../discord/bot.js";
import { membrosDoServidor } from "../discord/gateway.js";
import { brasao, cabecalho } from "../set/brasao.js";
import { setStore } from "../set/store.js";
import { hierarquiaStore, type Nivel } from "./store.js";

/**
 * Hierarquia: níveis = cargos do Discord, na ordem montada no site (o primeiro é o mais alto).
 * Cada membro aparece UMA vez, no nível mais alto que tem. Qualquer troca de cargo, entrada,
 * saída ou mudança de apelido redesenha o painel (agrupado: no máximo uma vez a cada 3 s).
 */

export interface MembroNivel {
  id: string;
  nome: string;
  avatar: string | null;
}

export interface NivelMontado {
  nivel: Nivel;
  titulo: string;
  membros: MembroNivel[];
}

/**
 * Níveis que valem agora. No modo "patentes": extras (manuais) primeiro, depois as patentes do
 * Pedir Set que têm cargo, da mais alta para a mais baixa. Muda sozinho quando o Pedir Set muda.
 */
export function niveisEfetivos(): Array<Nivel & { patenteId?: string }> {
  const c = hierarquiaStore.config();
  if (c.origem === "manual") return c.niveis;
  const extras = new Set(c.niveis.map((n) => n.cargoId));
  const patentes = [...setStore.config().patentes]
    .reverse()
    .filter((p) => p.cargoId && !extras.has(p.cargoId))
    .map((p) => ({ id: `pat-${p.id}`, cargoId: p.cargoId!, titulo: p.nome, emoji: c.emojisPatentes[p.id] ?? "", patenteId: p.id }));
  return [...c.niveis, ...patentes];
}

const ordemNome = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

/** A árvore atual (null = lista de membros ainda não carregada / gateway offline). */
export async function montar(): Promise<NivelMontado[] | null> {
  const membros = membrosDoServidor();
  if (!membros) return null;
  const c = hierarquiaStore.config();
  const nomes = new Map((await listRoles()).map((r) => [r.id, r.nome]));
  const niveis = niveisEfetivos();
  const montado: NivelMontado[] = niveis.map((nivel) => ({ nivel, titulo: nivel.titulo.trim() || nomes.get(nivel.cargoId) || "Cargo removido", membros: [] }));
  const porCargo = new Map(montado.map((n) => [n.nivel.cargoId, n]));

  for (const m of membros) {
    if (m.bot) continue;
    // "Sempre o cargo maior": o primeiro nível da lista que a pessoa tem.
    const alvo = niveis.find((n) => m.roles.includes(n.cargoId));
    if (alvo) porCargo.get(alvo.cargoId)?.membros.push({ id: m.id, nome: m.nome, avatar: m.avatar });
  }
  for (const n of montado) n.membros.sort((a, b) => ordemNome.compare(a.nome, b.nome));
  return montado;
}

/* ---------- Mensagens (Components V2) ---------- */

const separador = { type: 14, divider: true, spacing: 1 };
const LIMITE_TEXTO = 3500; // por mensagem (o Discord aceita 4000 somando todos os textos)
const LIMITE_BLOCO = 1800;
const LIMITE_COMPONENTES = 34; // o Discord aceita 40

/** Blocos de texto de cada nível (níveis grandes viram vários blocos). */
function blocos(arvore: NivelMontado[], mostrarVagos: boolean): string[] {
  const out: string[] = [];
  for (const n of arvore) {
    if (!n.membros.length && !mostrarVagos) continue;
    const cab = `### ${n.nivel.emoji ? `${n.nivel.emoji} ` : ""}${n.titulo}${n.membros.length ? ` · ${n.membros.length}` : ""}`;
    if (!n.membros.length) {
      out.push(`${cab}\n-# Vago`);
      continue;
    }
    let atual = cab;
    for (const m of n.membros) {
      const linha = `\n<@${m.id}>`;
      if (atual.length + linha.length > LIMITE_BLOCO) {
        out.push(atual);
        atual = `### ${n.titulo} · continuação`;
      }
      atual += linha;
    }
    out.push(atual);
  }
  return out;
}

/** O painel inteiro, dividido em quantas mensagens forem precisas. */
export function mensagens(arvore: NivelMontado[]): MessageBody[] {
  const c = hierarquiaStore.config();
  const total = arvore.reduce((s, n) => s + n.membros.length, 0);
  const e = emojiLogo();
  const topo = cabecalho([`## ${c.titulo}`, `-# ${total} ${total === 1 ? "membro" : "membros"} · cada um aparece no seu cargo mais alto`]);
  const rodape = `-# ${e ? `${e} ` : ""}${c.rodape} · atualizado <t:${Math.floor(Date.now() / 1000)}:R>`;

  const lista = blocos(arvore, c.mostrarVagos);
  if (!lista.length) lista.push("-# Ninguém tem os cargos da hierarquia ainda.");

  const partes: string[][] = [[]];
  let chars = 200;
  let comps = 6;
  for (const b of lista) {
    if (partes.at(-1)!.length && (chars + b.length > LIMITE_TEXTO || comps + 2 > LIMITE_COMPONENTES)) {
      partes.push([]);
      chars = 100;
      comps = 3;
    }
    partes.at(-1)!.push(b);
    chars += b.length;
    comps += 2;
  }

  return partes.map((textos, i) => ({
    flags: FLAG_COMPONENTS_V2,
    allowed_mentions: { parse: [] },
    components: [
      {
        type: 17,
        accent_color: c.cor,
        components: [
          ...(i === 0 ? [...[topo].flat(), separador] : []),
          ...textos.flatMap((t, j) => [{ type: 10, content: t }, ...(j < textos.length - 1 ? [separador] : [])]),
          ...(i === partes.length - 1 ? [separador, { type: 10, content: rodape }] : []),
        ],
      },
    ],
  }));
}

/* ---------- Publicação ---------- */

export class HierarquiaError extends Error {}

/** Conteúdo da última publicação (sem o "atualizado há…"): igual = nada a fazer. */
let ultimoConteudo = "";
let fila: Promise<unknown> = Promise.resolve();

const assinatura = (arvore: NivelMontado[]) => {
  const c = hierarquiaStore.config();
  return JSON.stringify([c.canalId, c.titulo, c.cor, c.rodape, c.mostrarVagos, emojiLogo(), arvore.map((n) => [n.nivel.emoji, n.titulo, n.membros.map((m) => m.id)])]);
};

async function publicarAgora(recriar: boolean) {
  const c = hierarquiaStore.config();
  if (!c.canalId) throw new HierarquiaError("Escolha e salve o canal do painel antes de publicar.");
  if (!niveisEfetivos().length) throw new HierarquiaError(c.origem === "patentes" ? "Nenhuma patente tem cargo no Pedir Set. Configure os cargos das patentes lá." : "Adicione pelo menos um nível (cargo) à hierarquia.");
  const arvore = await montar();
  if (!arvore) throw new HierarquiaError("A lista de membros ainda está carregando (o bot precisa estar online). Tente em instantes.");

  const conteudo = assinatura(arvore);
  if (!recriar && conteudo === ultimoConteudo && c.mensagemIds.length) return;
  const corpos = mensagens(arvore);
  const canal = c.canalId;

  // Mesmo número de mensagens: edita no lugar (a ordem no canal se mantém).
  let ids: string[] | null = null;
  if (!recriar && c.mensagemIds.length === corpos.length) {
    let ok = true;
    for (const [i, corpo] of corpos.entries()) {
      if (!(await editMessage(canal, c.mensagemIds[i]!, corpo, i === 0 ? brasao() : undefined))) {
        ok = false;
        break;
      }
    }
    if (ok) ids = c.mensagemIds;
  }

  // Mudou a quantidade (ou alguma foi apagada): publica tudo de novo, em ordem.
  if (!ids) {
    for (const id of c.mensagemIds) await deleteMessage(canal, id);
    ids = [];
    for (const [i, corpo] of corpos.entries()) {
      const msg = await postMessage(canal, corpo, i === 0 ? brasao() : undefined);
      if (!msg) {
        await hierarquiaStore.saveConfig({ mensagemIds: ids, erro: "o bot não pode enviar no canal" });
        throw new HierarquiaError("Não foi possível publicar: o bot precisa de Ver canal, Enviar mensagens e Anexar arquivos no canal.");
      }
      ids.push(msg.id);
    }
  }
  ultimoConteudo = conteudo;
  await hierarquiaStore.saveConfig({ mensagemIds: ids, erro: null, publicadoEm: Date.now() });
}

/** Publica (uma publicação por vez). `recriar` apaga e manda tudo de novo. */
export function publicar(recriar = false): Promise<void> {
  const p = fila.then(() => publicarAgora(recriar));
  fila = p.catch(() => undefined);
  return p;
}

/** Apaga o painel publicado (ex.: trocou de canal). */
export async function apagarPainel(canalId: string, ids: string[]) {
  for (const id of ids) await deleteMessage(canalId, id);
  ultimoConteudo = "";
}

let timer: NodeJS.Timeout | null = null;
/**
 * Agrupa várias mudanças seguidas (ex.: alguém trocando 3 cargos) numa atualização só.
 * Mudança que não mexe na hierarquia não edita nada (a assinatura do conteúdo é a mesma).
 */
export function agendarAtualizacao() {
  const c = hierarquiaStore.config();
  if (!c.canalId || !niveisEfetivos().length || !c.mensagemIds.length) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void publicar(false).catch((err: unknown) => console.warn("[hierarquia] não foi possível atualizar o painel:", err instanceof Error ? err.message : err));
  }, 3_000);
  timer.unref();
}


/** Logo trocada: redesenha mesmo com os mesmos membros. */
export function atualizarComLogoNova() {
  ultimoConteudo = "";
  agendarAtualizacao();
}
