import { emojiLogo } from "../branding/emoji.js";
import {
  deleteMessage,
  editInteractionReply,
  editMessage,
  FLAG_COMPONENTS_V2,
  FLAG_EPHEMERAL,
  interactionCallback,
  postMessage,
  upsertGuildCommand,
  type MessageBody,
} from "../discord/bot.js";
import type { RawInteraction } from "../discord/gateway.js";
import { brasao, cabecalho } from "../set/brasao.js";
import { setStore } from "../set/store.js";
import {
  abrirTurma,
  cancelarTurma,
  interpretarHorario,
  linkEvento,
  concluidosDe,
  ehInstrutor,
  entrar,
  finalizarTurma,
  iniciarTurma,
  MENSAGEM_ERRO,
  onTurmaMudou,
  podeRemover,
  removerCurso,
  sair,
  tirarDaTurma,
  type Quem,
} from "./service.js";
import { painelAntigo, cursoStore } from "./store.js";
import type { Turma } from "./types.js";

/**
 * Cursos no Discord:
 *  1) Mensagem de cada turma no canal configurado — Entrar / Sair (todos) e Iniciar / Finalizar / Cancelar
 *     (só instrutores). Iniciou: Entrar e Sair ficam desativados. Finalizou: todos recebem o curso.
 *  2) /remover curso — só para os cargos liberados. Painel V2 efêmero: escolhe a pessoa (o × do próprio
 *     nome para trocar), escolhe o curso e confirma.
 */

const COR = 0xe10600;
const P = "curso:";
const C = {
  entrar: `${P}entrar:`,
  sair: `${P}sair:`,
  acao: `${P}acao:`, // curso:acao:<iniciar|finalizar|cancelar>:<turmaId>  → pede confirmação
  conf: `${P}conf:`, // curso:conf:<acao>:<turmaId>                       → executa
  naoConf: `${P}naoconf`,
  tirar: `${P}tirar:`, // curso:tirar:<turmaId> (menu com os participantes)
} as const;
const RC = {
  pessoa: "rc:pessoa",
  curso: "rc:curso",
  confirmar: "rc:confirmar",
  novo: "rc:novo",
} as const;

const quemDe = (i: RawInteraction): Quem => ({ id: i.member!.user.id, nome: i.member!.user.global_name ?? i.member!.user.username });
const efemera = (cor: number, linhas: string[], botoes: unknown[] = []): MessageBody => ({
  flags: FLAG_EPHEMERAL | FLAG_COMPONENTS_V2,
  components: [{ type: 17, accent_color: cor, components: [{ type: 10, content: linhas.join("\n") }, ...(botoes.length ? [{ type: 1, components: botoes }] : [])] }],
});
const erro = (codigo: string) => efemera(COR, [`❌ ${MENSAGEM_ERRO[codigo] ?? "Não foi possível concluir."}`]);
/** Atualizar uma mensagem efêmera não aceita mudar a flag de efêmera. */
const paraEdicao = (b: MessageBody): MessageBody => ({ ...b, flags: FLAG_COMPONENTS_V2 });
const responder = (i: RawInteraction, type: number, data?: MessageBody) =>
  interactionCallback(i.id, i.token, data ? { type, data: type === 7 ? paraEdicao(data) : data } : { type });
const rodape = () => {
  const e = emojiLogo();
  return { type: 10, content: `-# ${e ? `${e} ` : ""}PMERJ · Cursos` };
};

/* =========================================================================
 * 1) Mensagem da turma
 * ========================================================================= */

const MAX_LISTA = 60;
const ts = (ms: number, estilo: "F" | "R" | "f") => `<t:${Math.floor(ms / 1000)}:${estilo}>`;
const nn = (n: number) => String(n).padStart(2, "0");

/** Lista numerada, dois por linha: `01` @a   `02` @b */
function listaNumerada(ids: string[]): string {
  if (ids.length === 0) return "_Ninguém ainda._";
  const itens = ids.slice(0, MAX_LISTA).map((id, i) => `\`${nn(i + 1)}\` <@${id}>`);
  const linhas: string[] = [];
  for (let i = 0; i < itens.length; i += 2) linhas.push(itens.slice(i, i + 2).join("　"));
  if (ids.length > MAX_LISTA) linhas.push(`-# … e mais ${ids.length - MAX_LISTA}`);
  return linhas.join("\n");
}

const COR_STATUS: Record<Turma["status"], number> = { inscricoes: COR, andamento: 0x3b82f6, encerrada: 0x22c55e, cancelada: 0x4b5563 };

export function mensagemTurma(t: Turma): MessageBody {
  const curso = cursoStore.curso(t.cursoId)!;
  const geral = cursoStore.dados().geral;
  const todos = cursoStore.participantesDa(t.id);
  const aberta = t.status === "inscricoes";
  const andamento = t.status === "andamento";
  const ativa = aberta || andamento;
  const emoji = emojiLogo();
  const logo = emoji ? `${emoji} ` : "";

  // Quem aparece na lista: participando (ativa), quem concluiu (finalizada), quem estava (cancelada).
  const ids = todos
    .filter((p) => (t.status === "encerrada" ? p.status === "concluido" || p.status === "removido" : t.status === "cancelada" ? p.status === "cancelado" : p.status === "participando"))
    .map((p) => p.userId);

  const detalhes = [
    `👮 **Instrutor** · <@${t.abertaPor.id}>`,
    ...(t.agendadoPara ? [`🕐 **Horário** · ${ts(t.agendadoPara, "F")} · ${ts(t.agendadoPara, "R")}`] : []),
    ...(t.duracao ? [`⏳ **Duração** · ${t.duracao}`] : []),
    ...(t.local ? [`📍 **Local** · ${t.local}`] : []),
    ...(t.vagas ? [`🎟️ **Vagas** · ${t.vagas}`] : []),
  ].join("\n");

  const status = aberta
    ? "### 🟢 INSCRIÇÕES ABERTAS\n-# Clique em **Entrar no curso** para participar. Dá para sair até o curso começar."
    : andamento
      ? `### 🔵 CURSO EM ANDAMENTO\n-# Iniciado ${t.inicioEm ? ts(t.inicioEm, "f") : "agora"} · entradas e saídas encerradas.`
      : t.status === "encerrada"
        ? `### ✔️ CURSO FINALIZADO\n-# Finalizado ${t.encerradaEm ? ts(t.encerradaEm, "f") : ""} · ${ids.length} formado(s) · Os participantes receberam o curso no **/perfil**.`
        : `### ✖️ TURMA CANCELADA\n-# Cancelada ${t.encerradaEm ? ts(t.encerradaEm, "f") : ""} · ninguém recebeu o curso.`;

  const botao = (style: number, label: string, emojiNome: string, custom_id: string, ligado: boolean) => ({
    type: 2,
    style,
    label,
    emoji: { name: emojiNome },
    custom_id,
    disabled: !ligado,
  });

  return {
    flags: FLAG_COMPONENTS_V2,
    allowed_mentions: { parse: [] },
    components: [
      ...(geral.mencionarTodos ? [{ type: 10, content: "📣 @everyone" }] : []),
      {
        type: 17,
        accent_color: COR_STATUS[t.status],
        components: [
          { type: 10, content: `-# ${logo}PMERJ · Seção de Cursos` },
          ...[
            cabecalho([
              `## 🎓 ${curso.sigla} — ${curso.nome}`,
              ...(curso.descricao ? [`-# ${curso.descricao.slice(0, 400)}`] : []),
            ]),
          ].flat(),
          { type: 10, content: detalhes },
          ...(t.observacoes ? [{ type: 10, content: `📋 **Observações**\n${t.observacoes.split("\n").map((l) => `> ${l}`).join("\n")}` }] : []),
          { type: 14, divider: true, spacing: 2 },
          { type: 10, content: status },
          { type: 10, content: `### 👥 ${t.status === "encerrada" ? "Formados" : "Participantes"} · ${ids.length}${t.vagas && ativa ? `/${t.vagas}` : ""}\n${listaNumerada(ids)}` },
          {
            type: 1,
            components: [
              botao(3, "Entrar no curso", "👥", `${C.entrar}${t.id}`, aberta),
              botao(2, "Sair do curso", "🚪", `${C.sair}${t.id}`, aberta),
            ],
          },
          { type: 10, content: "-# 👮 Controle do instrutor" },
          {
            type: 1,
            components: [
              botao(1, "Iniciar", "🔓", `${C.acao}iniciar:${t.id}`, aberta),
              botao(3, "Finalizar", "🏁", `${C.acao}finalizar:${t.id}`, andamento),
              botao(4, "Cancelar", "✖️", `${C.acao}cancelar:${t.id}`, ativa),
              botao(2, "Remover usuário", "🗑️", `${C.acao}remover:${t.id}`, ativa),
            ],
          },
          { type: 14, divider: true, spacing: 1 },
          { type: 10, content: `-# ${logo}PMERJ` },
        ],
      },
    ],
  };
}

/** Publica (ou atualiza) a mensagem da turma no canal configurado. */
async function sincronizarTurma(t: Turma): Promise<void> {
  const geral = cursoStore.dados().geral;
  const body = mensagemTurma(t);
  if (t.mensagem && (await editMessage(t.mensagem.canalId, t.mensagem.mensagemId, body, brasao()))) return;
  // Sem mensagem (ou apagada): só turmas ativas ganham uma nova.
  if (!geral.canalTurmasId || (t.status !== "inscricoes" && t.status !== "andamento")) return;
  // Só a primeira postagem pode notificar o @everyone (edições nunca notificam).
  const primeira = geral.mencionarTodos ? { ...body, allowed_mentions: { parse: ["everyone"] } } : body;
  const msg = await postMessage(geral.canalTurmasId, primeira, brasao());
  if (msg) {
    t.mensagem = { canalId: geral.canalTurmasId, mensagemId: msg.id };
    await cursoStore.salvar();
  }
}

/**
 * Primeira postagem e mudança de status (iniciar, finalizar, cancelar): NA HORA.
 * Só entradas/saídas seguidas são agrupadas (1s) para não estourar o limite do Discord.
 */
const agendadas = new Map<string, ReturnType<typeof setTimeout>>();
const ultimoStatus = new Map<string, Turma["status"]>();
function agendar(t: Turma, ms?: number) {
  const imediato = !t.mensagem || ultimoStatus.get(t.id) !== t.status;
  ultimoStatus.set(t.id, t.status);
  const atual = agendadas.get(t.id);
  if (atual) clearTimeout(atual);
  agendadas.set(
    t.id,
    setTimeout(
      () => {
        agendadas.delete(t.id);
        void sincronizarTurma(t);
      },
      ms ?? (imediato ? 0 : 1_000),
    ),
  );
}
onTurmaMudou((t) => agendar(t));

/** Depois de salvar o cadastro / trocar a logo: turmas ativas no canal certo e em dia. */
export async function sincronizarTurmasAtivas(): Promise<void> {
  const d = cursoStore.dados();
  for (const t of d.turmas.filter((x) => x.status === "inscricoes" || x.status === "andamento")) {
    if (t.mensagem && d.geral.canalTurmasId && t.mensagem.canalId !== d.geral.canalTurmasId) {
      await deleteMessage(t.mensagem.canalId, t.mensagem.mensagemId);
      t.mensagem = null;
    }
    agendar(t, 300);
  }
}

/** O painel de inscrição antigo (menu de cursos) não é mais usado: some do canal. */
export async function limparPainelAntigo(): Promise<void> {
  if (painelAntigo) await deleteMessage(painelAntigo.canalId, painelAntigo.mensagemId);
}

/* =========================================================================
 * 2) /remover curso
 * ========================================================================= */

export const COMANDO_REMOVER = {
  name: "remover",
  type: 1,
  description: "Remover registros de um policial",
  contexts: [0],
  // "0" = escondido para quem não é administrador. Os cargos liberados são adicionados em
  // Configurações do servidor → Integrações → PMERJ (o bot confere o cargo de novo a cada uso).
  default_member_permissions: "0",
  options: [{ type: 1, name: "curso", description: "Remove um curso de um policial (e o cargo do curso)" }],
};
export const registrarComandoRemover = () => upsertGuildCommand(COMANDO_REMOVER);

interface Remocao {
  alvoId: string | null;
  alvoNome: string | null;
  cursoId: string | null;
  expira: number;
}
const remocoes = new Map<string, Remocao>();
function remocao(userId: string): Remocao {
  const agora = Date.now();
  for (const [k, v] of remocoes) if (v.expira < agora) remocoes.delete(k);
  let r = remocoes.get(userId);
  if (!r) {
    if (remocoes.size >= 200) remocoes.delete(remocoes.keys().next().value!);
    r = { alvoId: null, alvoNome: null, cursoId: null, expira: 0 };
    remocoes.set(userId, r);
  }
  r.expira = agora + 15 * 60_000;
  return r;
}

function painelRemover(r: Remocao, aviso?: string): MessageBody {
  const comps: unknown[] = [{ type: 10, content: "### 🗑️ Remover curso\nEscolha o policial e o curso. O cargo do curso também é retirado." }];

  // Menu com o × do próprio Discord: a escolha fica marcada dentro dele; limpar desmarca.
  comps.push({
    type: 1,
    components: [{ type: 5, custom_id: RC.pessoa, placeholder: "Selecione o policial…", min_values: 0, max_values: 1, ...(r.alvoId ? { default_values: [{ id: r.alvoId, type: "user" }] } : {}) }],
  });
  if (r.alvoId) {
    const cursos = concluidosDe(r.alvoId)
      .map((p) => cursoStore.curso(p.cursoId))
      .filter((c, i, l): c is NonNullable<typeof c> => Boolean(c) && l.findIndex((x) => x?.id === c!.id) === i);
    if (cursos.length === 0) {
      comps.push({ type: 10, content: "_Esse policial não tem cursos concluídos._" });
    } else {
      comps.push({
        type: 1,
        components: [
          {
            type: 3,
            custom_id: RC.curso,
            placeholder: "Selecione o curso a remover…",
            min_values: 0,
            max_values: 1,
            options: cursos.slice(0, 25).map((c) => ({
              label: `${c.sigla} · ${c.nome}`.slice(0, 100),
              description: c.cargoId ? "O cargo deste curso será retirado" : "Curso sem cargo",
              value: c.id,
              emoji: { name: "🎓" },
              default: c.id === r.cursoId,
            })),
          },
        ],
      });
      const sel = r.cursoId ? cursos.find((c) => c.id === r.cursoId) : undefined;
      if (sel) {
        comps.push(
          { type: 14, divider: true, spacing: 1 },
          { type: 10, content: `Remover **${sel.sigla}** de <@${r.alvoId}>${sel.cargoId ? ` e retirar <@&${sel.cargoId}>` : ""}?` },
          { type: 1, components: [{ type: 2, style: 4, label: "Remover curso", emoji: { name: "🗑️" }, custom_id: RC.confirmar }] },
        );
      }
    }
  }
  if (aviso) comps.push({ type: 10, content: `⚠️ ${aviso}` });
  comps.push({ type: 10, content: "-# Só você vê esta mensagem." });
  return { flags: FLAG_EPHEMERAL | FLAG_COMPONENTS_V2, allowed_mentions: { parse: [] }, components: [{ type: 17, accent_color: COR, components: comps }] };
}

async function handleRemover(i: RawInteraction): Promise<boolean> {
  const id = i.data?.custom_id ?? "";
  const comando = i.type === 2 && i.data?.name === "remover";
  if (!comando && !id.startsWith("rc:")) return false;
  const member = i.member!;
  const tipoResposta = comando ? 4 : 7;

  // Cargo conferido em todo passo (a visibilidade do comando no Discord não basta).
  if (!podeRemover(member.roles ?? [])) {
    remocoes.delete(member.user.id);
    await responder(i, tipoResposta, erro("sem_permissao_remover"));
    return true;
  }

  if (comando || id === RC.novo) {
    remocoes.delete(member.user.id);
    await responder(i, tipoResposta, painelRemover(remocao(member.user.id)));
    return true;
  }

  const r = remocao(member.user.id);
  if (id === RC.pessoa) {
    const alvo = i.data?.values?.[0] ?? null;
    const u = alvo ? i.data?.resolved?.users?.[alvo] : undefined;
    const m = alvo ? i.data?.resolved?.members?.[alvo] : undefined;
    r.alvoId = alvo;
    r.alvoNome = alvo ? (setStore.atual(alvo)?.apelido ?? m?.nick ?? u?.global_name ?? u?.username ?? null) : null;
    r.cursoId = null;
  } else if (id === RC.curso) {
    r.cursoId = i.data?.values?.[0] ?? null;
  } else if (id === RC.confirmar) {
    if (!r.alvoId || !r.cursoId) {
      await responder(i, 7, painelRemover(r, "Escolha o policial e o curso."));
      return true;
    }
    const res = await removerCurso(r.alvoId, r.cursoId, quemDe(i));
    if (!res.ok) {
      await responder(i, 7, painelRemover(r, MENSAGEM_ERRO[res.erro] ?? "Não foi possível remover."));
      return true;
    }
    const alvo = r.alvoId;
    remocoes.delete(member.user.id);
    const cargo = res.valor.curso.cargoId;
    await responder(
      i,
      7,
      efemera(
        0x22c55e,
        [
          "### ✅ Curso removido",
          `**${res.valor.curso.sigla}** foi removido de <@${alvo}>.`,
          ...(cargo ? [res.valor.cargoRetirado ? `O cargo <@&${cargo}> foi retirado.` : `⚠️ O Discord recusou retirar <@&${cargo}> (cargo do bot abaixo dele?).`] : []),
        ],
        [{ type: 2, style: 2, label: "Remover outro", emoji: { name: "🗑️" }, custom_id: RC.novo }],
      ),
    );
    return true;
  }
  await responder(i, 7, painelRemover(r));
  return true;
}

/* =========================================================================
 * 3) /curso — agendar uma turma (modal V2: curso + horário + vagas)
 * ========================================================================= */

export const COMANDO_CURSO = {
  name: "curso",
  type: 1,
  description: "Agendar uma turma de curso (instrutores)",
  contexts: [0],
};
export const registrarComandoCurso = () => upsertGuildCommand(COMANDO_CURSO);

const AG = { enviar: "ag:enviar", abrir: "ag:abrir" } as const;

/** Último preenchimento de cada instrutor: o formulário volta preenchido se algo der errado. */
type RascunhoAgenda = { cursoId: string; horario: string; duracao: string; local: string; observacoes: string };
const rascunhosAgenda = new Map<string, RascunhoAgenda & { expira: number }>();

/** Cursos que esta pessoa pode agendar agora: ativos, sem turma aberta, e ela é instrutora. */
const cursosAgendaveis = (roles: string[]) =>
  cursoStore.dados().cursos.filter((c) => c.ativo && !cursoStore.turmaAtual(c.id) && ehInstrutor(c, roles));

function modalAgendar(cursos: ReturnType<typeof cursosAgendaveis>, previo?: RascunhoAgenda): MessageBody {
  return {
    custom_id: AG.enviar,
    title: "📅 Agendar curso",
    // Limite do Discord: no máximo 5 componentes no modal — só os 5 campos, sem texto extra.
    components: [
      {
        type: 18,
        label: "Curso",
        description: "Ao enviar, o bot cria o evento no servidor e posta a turma com Entrar / Sair.",
        component: {
          type: 3,
          custom_id: "curso",
          placeholder: "Escolha o curso",
          options: cursos.slice(0, 25).map((c) => ({
            label: `${c.sigla} · ${c.nome}`.slice(0, 100),
            value: c.id,
            emoji: { name: "🎓" },
            default: c.id === previo?.cursoId || (cursos.length === 1 && !previo),
          })),
        },
      },
      {
        type: 18,
        label: "Data e horário",
        description: "Horário de Brasília. Ex.: 20:00 (hoje) · 15/11 20:00 · 15/11/2026 20h",
        component: { type: 4, custom_id: "horario", style: 1, required: true, min_length: 2, max_length: 40, placeholder: "15/11 20:00", ...(previo?.horario ? { value: previo.horario } : {}) },
      },
      {
        type: 18,
        label: "Duração (opcional)",
        description: "Ex.: 1h · 1h30 · 90min",
        component: { type: 4, custom_id: "duracao", style: 1, required: false, max_length: 40, placeholder: "1h", ...(previo?.duracao ? { value: previo.duracao } : {}) },
      },
      {
        type: 18,
        label: "Local (opcional)",
        description: "Onde o curso acontece.",
        component: { type: 4, custom_id: "local", style: 1, required: false, max_length: 80, placeholder: "Ex.: Batalhão do BOPE", ...(previo?.local ? { value: previo.local } : {}) },
      },
      {
        type: 18,
        label: "Observações (opcional)",
        description: "Material, uniforme, pré-requisitos…",
        component: { type: 4, custom_id: "observacoes", style: 2, required: false, max_length: 500, placeholder: "Ex.: 1 fuzil, 150 munições", ...(previo?.observacoes ? { value: previo.observacoes } : {}) },
      },
    ],
  };
}

function lerModal(components: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const n = node as { custom_id?: string; value?: string; values?: string[]; component?: unknown; components?: unknown[] };
    if (n.custom_id && typeof n.value === "string") out[n.custom_id] = n.value;
    if (n.custom_id && Array.isArray(n.values)) out[n.custom_id] = n.values[0] ?? "";
    if (n.component) walk(n.component);
    if (Array.isArray(n.components)) n.components.forEach(walk);
  };
  if (Array.isArray(components)) components.forEach(walk);
  return out;
}

const BOTAO_CORRIGIR = { type: 2, style: 1, label: "Corrigir", emoji: { name: "✏️" }, custom_id: AG.abrir };

async function handleAgendar(i: RawInteraction): Promise<boolean> {
  const id = i.data?.custom_id ?? "";
  const comando = i.type === 2 && i.data?.name === COMANDO_CURSO.name;
  if (!comando && !id.startsWith("ag:")) return false;
  const member = i.member!;
  const roles = member.roles ?? [];

  // Abrir o formulário (pelo comando ou pelo botão "Corrigir").
  if (comando || (i.type === 3 && id === AG.abrir)) {
    const cursos = cursosAgendaveis(roles);
    if (cursos.length === 0) {
      await responder(i, comando ? 4 : 7, erro("sem_curso_para_agendar"));
      return true;
    }
    const previo = rascunhosAgenda.get(member.user.id);
    await responder(i, 9, modalAgendar(cursos, previo && previo.expira > Date.now() ? previo : undefined));
    return true;
  }

  if (i.type === 5 && id === AG.enviar) {
    const v = lerModal(i.data?.components);
    const limpar = (s: string | undefined, max: number) => (s ?? "").normalize("NFC").replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "").trim().slice(0, max);
    const previo = {
      cursoId: v.curso ?? "",
      horario: limpar(v.horario, 40),
      duracao: limpar(v.duracao, 40),
      local: limpar(v.local, 80),
      observacoes: limpar(v.observacoes, 500),
      expira: Date.now() + 15 * 60_000,
    };
    rascunhosAgenda.set(member.user.id, previo);
    if (rascunhosAgenda.size > 200) rascunhosAgenda.delete(rascunhosAgenda.keys().next().value!);

    const curso = cursoStore.curso(previo.cursoId);
    const falhar = (codigo: string) => responder(i, 4, efemera(COR, [`❌ ${MENSAGEM_ERRO[codigo] ?? "Não foi possível agendar."}`], [BOTAO_CORRIGIR]));
    if (!curso) return falhar("curso_nao_encontrado").then(() => true);
    // Cargo conferido de novo no envio (o formulário pode ter ficado aberto).
    if (!ehInstrutor(curso, roles)) return falhar("nao_instrutor").then(() => true);
    const quando = interpretarHorario(previo.horario);
    if (quando === null) return falhar("horario_invalido").then(() => true);

    // Criar o evento e postar a turma pode passar de 3s: confirma já e responde depois.
    await responder(i, 5, { flags: FLAG_EPHEMERAL });
    const r = await abrirTurma(curso, quemDe(i), {
      agendadoPara: quando,
      vagas: null,
      duracao: previo.duracao || null,
      local: previo.local || null,
      observacoes: previo.observacoes || null,
    });
    if (!r.ok) {
      await editInteractionReply(i.token, paraEdicao(efemera(COR, [`❌ ${MENSAGEM_ERRO[r.erro] ?? "Não foi possível agendar."}`], [BOTAO_CORRIGIR])));
      return true;
    }
    rascunhosAgenda.delete(member.user.id);
    const t = r.valor;
    const seg = Math.floor(quando / 1000);
    const canal = cursoStore.dados().geral.canalTurmasId;
    const url = linkEvento(t);
    await editInteractionReply(
      i.token,
      paraEdicao(
        efemera(
          0x22c55e,
          [
            `### 📅 ${curso.sigla} · Turma ${t.numero} agendada`,
            `**Horário:** <t:${seg}:F> (<t:${seg}:R>)`,
            ...(previo.duracao ? [`**Duração:** ${previo.duracao}`] : []),
            ...(previo.local ? [`**Local:** ${previo.local}`] : []),
            t.eventoCriado ? "🗓️ Evento criado no servidor." : "⚠️ O evento não foi criado: dê ao bot a permissão **Gerenciar Eventos**.",
            canal ? `A turma com **Entrar / Sair** foi postada em <#${canal}>.` : "⚠️ Nenhum canal de turmas configurado no painel: a mensagem com Entrar / Sair não foi postada.",
          ],
          url ? [{ type: 2, style: 5, label: "Ver evento", emoji: { name: "🗓️" }, url }] : [],
        ),
      ),
    );
    return true;
  }
  return false;
}

/* =========================================================================
 * Interações
 * ========================================================================= */

const ACOES: Record<string, { titulo: string; texto: (n: number) => string }> = {
  iniciar: { titulo: "▶️ Iniciar o curso?", texto: (n) => `${n} ${n === 1 ? "participante" : "participantes"}. Depois de iniciar, **ninguém mais entra nem sai**.` },
  finalizar: { titulo: "🏁 Finalizar o curso?", texto: (n) => `**${n} ${n === 1 ? "participante recebe" : "participantes recebem"} o curso**, o cargo e o certificado agora.` },
  cancelar: { titulo: "✖️ Cancelar a turma?", texto: () => "Ninguém recebe o curso e a turma é encerrada." },
};

export async function handleCursoInteraction(i: RawInteraction): Promise<boolean> {
  const id = i.data?.custom_id ?? "";
  const nosso =
    id.startsWith(P) || id.startsWith("rc:") || id.startsWith("ag:") || (i.type === 2 && (i.data?.name === "remover" || i.data?.name === COMANDO_CURSO.name));
  if (!nosso) return false;
  if (!i.member) {
    await responder(i, 4, efemera(COR, ["Use dentro do servidor."]));
    return true;
  }
  if (await handleRemover(i)) return true;
  if (await handleAgendar(i)) return true;

  if (id === C.naoConf) {
    await responder(i, 7, efemera(0x4b5563, ["Nada foi alterado."]));
    return true;
  }

  const user = i.member.user;
  const turmaDoBotao = () => cursoStore.turma(id.slice(id.lastIndexOf(":") + 1));

  // Entrar / Sair (qualquer membro).
  if (id.startsWith(C.entrar) || id.startsWith(C.sair)) {
    const t = turmaDoBotao();
    if (!t) {
      await responder(i, 4, erro("turma_encerrada"));
      return true;
    }
    const curso = cursoStore.curso(t.cursoId)!;
    const r = id.startsWith(C.entrar)
      ? await entrar(t, { id: user.id, username: user.username, nome: i.member.nick ?? user.global_name ?? user.username, avatar: user.avatar ?? null })
      : await sair(t, user.id);
    await responder(
      i,
      4,
      r.ok
        ? id.startsWith(C.entrar)
          ? efemera(0x22c55e, [`✅ Você entrou no **${curso.sigla}** · Turma ${t.numero}.`, "-# Quando o curso for finalizado, você recebe o curso e o cargo automaticamente."])
          : efemera(0x4b5563, [`🚪 Você saiu do **${curso.sigla}** · Turma ${t.numero}.`])
        : erro(r.erro),
    );
    return true;
  }

  // Iniciar / Finalizar / Cancelar (só instrutores): pede confirmação, depois executa.
  // Remover usuário (instrutor): menu com os participantes → tira da turma.
  if (id.startsWith(`${C.acao}remover:`) || id.startsWith(C.tirar)) {
    const t = cursoStore.turma(id.slice(id.lastIndexOf(":") + 1));
    const curso = t ? cursoStore.curso(t.cursoId) : undefined;
    const tipo = id.startsWith(C.tirar) ? 7 : 4;
    if (!t || !curso) {
      await responder(i, tipo, erro("turma_encerrada"));
      return true;
    }
    if (!ehInstrutor(curso, i.member.roles ?? [])) {
      await responder(i, tipo, erro("nao_instrutor"));
      return true;
    }
    let aviso: string | null = null;
    if (id.startsWith(C.tirar)) {
      const alvo = i.data?.values?.[0] ?? "";
      const nome = cursoStore.participantesDa(t.id).find((p) => p.id === alvo)?.nome;
      const r = await tirarDaTurma(t, alvo, quemDe(i));
      aviso = r.ok ? `✅ **${nome ?? "Participante"}** foi removido da turma.` : `❌ ${MENSAGEM_ERRO[r.erro] ?? "Não foi possível remover."}`;
    }
    const lista = cursoStore.participantesDa(t.id).filter((p) => p.status === "participando");
    const comps: unknown[] = [{ type: 10, content: `### 🗑️ Remover usuário\n**${curso.sigla}** · Turma ${t.numero} — escolha quem sai da turma.` }];
    if (aviso) comps.push({ type: 10, content: aviso });
    if (lista.length === 0) comps.push({ type: 10, content: "_Ninguém participando agora._" });
    else
      comps.push({
        type: 1,
        components: [
          {
            type: 3,
            custom_id: `${C.tirar}${t.id}`,
            placeholder: "Selecione o participante…",
            options: lista.slice(0, 25).map((p, n) => ({ label: `${nn(n + 1)} · ${p.nome}`.slice(0, 100), description: `@${p.username}`.slice(0, 100), value: p.id })),
          },
        ],
      });
    comps.push({ type: 10, content: "-# Só você vê esta mensagem." });
    await responder(i, tipo, { flags: FLAG_EPHEMERAL | FLAG_COMPONENTS_V2, components: [{ type: 17, accent_color: COR, components: comps }] });
    return true;
  }

  if (id.startsWith(C.acao) || id.startsWith(C.conf)) {
    const [, , acao = "", turmaId = ""] = id.split(":");
    const t = cursoStore.turma(turmaId);
    const curso = t ? cursoStore.curso(t.cursoId) : undefined;
    if (!t || !curso || !ACOES[acao]) {
      await responder(i, id.startsWith(C.conf) ? 7 : 4, erro("turma_encerrada"));
      return true;
    }
    if (!ehInstrutor(curso, i.member.roles ?? [])) {
      await responder(i, id.startsWith(C.conf) ? 7 : 4, erro("nao_instrutor"));
      return true;
    }
    const n = cursoStore.participantesDa(t.id).filter((p) => p.status === "participando").length;
    if (id.startsWith(C.acao)) {
      await responder(
        i,
        4,
        efemera(COR, [`### ${ACOES[acao]!.titulo}`, `**${curso.sigla}** · Turma ${t.numero}`, ACOES[acao]!.texto(n)], [
          { type: 2, style: acao === "cancelar" ? 4 : 3, label: "Confirmar", custom_id: `${C.conf}${acao}:${t.id}` },
          { type: 2, style: 2, label: "Voltar", custom_id: C.naoConf },
        ]),
      );
      return true;
    }
    // Confirmado. Finalizar entrega cargos e pode demorar: confirma já e edita depois.
    await responder(i, 6);
    const quem = quemDe(i);
    const r = acao === "iniciar" ? await iniciarTurma(t, quem) : acao === "finalizar" ? await finalizarTurma(t, quem) : await cancelarTurma(t, quem);
    await editInteractionReply(
      i.token,
      paraEdicao(
        !r.ok
          ? erro(r.erro)
          : acao === "iniciar"
            ? efemera(0x3b82f6, [`▶️ **${curso.sigla} · Turma ${t.numero}** iniciado. Entradas e saídas encerradas.`])
            : acao === "finalizar"
              ? efemera(0x22c55e, [
                  `🏁 **${curso.sigla} · Turma ${t.numero}** finalizado.`,
                  `${n} ${n === 1 ? "policial recebeu" : "policiais receberam"} o curso.`,
                  cursoStore.dados().geral.canalCertificadosId
                    ? `🎓 ${n === 1 ? "O certificado está sendo publicado" : "Os certificados estão sendo publicados"} em <#${cursoStore.dados().geral.canalCertificadosId}>.`
                    : "-# Sem canal de certificados: os certificados ficam só no site.",
                  ...("valor" in r && typeof r.valor === "object" && r.valor && "falhasCargo" in r.valor && r.valor.falhasCargo
                    ? [`⚠️ ${r.valor.falhasCargo} sem o cargo: o cargo do bot precisa ficar acima do cargo do curso.`]
                    : []),
                ])
              : efemera(0x4b5563, [`✖️ **${curso.sigla} · Turma ${t.numero}** cancelada.`]),
      ),
    );
    return true;
  }
  return false;
}
