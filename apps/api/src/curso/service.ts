import { randomUUID } from "node:crypto";
import { addRole, createScheduledEvent, listTextChannels, removeRole, sendLog, updateScheduledEvent } from "../discord/bot.js";
import { env } from "../env.js";
import { setStore } from "../set/store.js";
import { emitirCertificados, revogarCertificado } from "./certificado.js";
import { cursoStore } from "./store.js";
import type { CursoConfig, Participante, Turma } from "./types.js";

/**
 * Regras dos cursos — as MESMAS para o site e para os botões do Discord.
 *
 *   Instrutor abre a turma → pessoas clicam Entrar/Sair
 *   → Iniciar: trava (ninguém entra nem sai)
 *   → Finalizar: TODOS os participantes recebem o curso e o cargo
 */

export interface Pessoa {
  id: string;
  username: string;
  nome: string;
  avatar: string | null;
}
export interface Quem {
  id: string;
  nome: string;
}

export type Resultado<T = Turma> = { ok: true; valor: T } | { ok: false; erro: string };
const falha = (erro: string): { ok: false; erro: string } => ({ ok: false, erro });

/* ---------- Permissões (sempre com os cargos ATUAIS do Discord) ---------- */

/** Instrutor = cargo de instrutor geral OU do próprio curso. Sem exceção para admin. */
export function ehInstrutor(curso: CursoConfig, roles: string[]): boolean {
  const gerais = cursoStore.dados().geral.cargosInstrutores;
  return roles.some((r) => gerais.includes(r) || curso.cargosInstrutores.includes(r));
}

/** É instrutor de pelo menos um curso (para mostrar o menu de gestão). */
export const instrutorDeAlgum = (roles: string[]) => cursoStore.dados().cursos.some((c) => ehInstrutor(c, roles));

export function podeRemover(roles: string[]): boolean {
  const permitidos = cursoStore.dados().geral.cargosRemover;
  return permitidos.length > 0 && roles.some((r) => permitidos.includes(r));
}

/* ---------- Avisos para o Discord (mensagem da turma) ---------- */

const ouvintesTurma: Array<(t: Turma) => void> = [];
/** O módulo do Discord se inscreve aqui para atualizar a mensagem da turma. */
export const onTurmaMudou = (fn: (t: Turma) => void) => void ouvintesTurma.push(fn);
const avisar = (t: Turma) => ouvintesTurma.forEach((fn) => setTimeout(() => fn(t), 0));

function log(curso: CursoConfig, title: string, color: number, fields: Array<{ name: string; value: string; inline?: boolean }>, turma?: Turma) {
  void sendLog(cursoStore.dados().geral.logCanalId, {
    title: `${title} — ${curso.sigla}${turma ? ` · Turma ${turma.numero}` : ""}`,
    color,
    footer: `PMERJ · Cursos`,
    fields,
  });
}

const ativos = (turmaId: string) => cursoStore.participantesDa(turmaId).filter((p) => p.status === "participando");

/* ---------- Horário (sempre no horário de Brasília) ---------- */

/** Brasil sem horário de verão desde 2019: UTC−3 fixo. */
const OFFSET_BRT_MS = 3 * 3_600_000;
const DURACAO_EVENTO_MS = 2 * 3_600_000;

/**
 * Entende o horário digitado no /curso:
 *   "20:00" / "20h" / "20h30"  → hoje (ou amanhã, se já passou)
 *   "15/11 20:00" / "15/11/2026 20h" / "20:00 15/11"
 * Devolve o instante em ms (UTC) ou null se não entender.
 */
export function interpretarHorario(texto: string, agora = Date.now()): number | null {
  const s = texto.trim().toLowerCase().replace(/\s+/g, " ");
  const semData = s.replace(/\d{1,2}\/\d{1,2}(?:\/\d{2,4})?/, " ");
  const hora = /(?:^|\s|às\s?)(\d{1,2})(?:[:h](\d{2}))?\s*h?(?=\s|$)/.exec(semData);
  if (!hora) return null;
  const h = Number(hora[1]);
  const min = Number(hora[2] ?? 0);
  if (h > 23 || min > 59) return null;

  const hoje = new Date(agora - OFFSET_BRT_MS); // "relógio" de Brasília lido com getUTC*
  const data = /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/.exec(s);
  let dia = hoje.getUTCDate();
  let mes = hoje.getUTCMonth() + 1;
  let ano = hoje.getUTCFullYear();
  if (data) {
    dia = Number(data[1]);
    mes = Number(data[2]);
    if (data[3]) ano = data[3].length === 2 ? 2000 + Number(data[3]) : Number(data[3]);
    if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return null;
  }
  const instante = (a: number) => Date.UTC(a, mes - 1, dia, h, min) + OFFSET_BRT_MS;
  let t = instante(ano);
  if (new Date(t - OFFSET_BRT_MS).getUTCDate() !== dia) return null; // 31/02 etc.
  if (!data && t <= agora) t += 86_400_000; // só a hora e já passou: amanhã
  else if (data && !data[3] && t < agora - 86_400_000) t = instante(ano + 1); // dia/mês que já passou: ano que vem
  return t;
}

/** "1h", "1h30", "90min", "2 horas" → ms (para o término do evento). */
export function duracaoMs(texto: string | null): number | null {
  if (!texto) return null;
  const s = texto.toLowerCase();
  const h = /(\d+)\s*h/.exec(s)?.[1];
  const m = /(?:h\s*(\d{1,2})|(\d+)\s*min)/.exec(s);
  const total = (h ? Number(h) * 60 : 0) + Number(m?.[1] ?? m?.[2] ?? 0);
  return total > 0 && total <= 24 * 60 ? total * 60_000 : null;
}

export const fmtHorarioBR = (ms: number) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(ms);

/* ---------- Evento do servidor que acompanha a turma ---------- */

/** Nome do evento mostra a fase da turma (o Discord só tem agendado / ativo / encerrado). */
const FASE: Record<Turma["status"], string> = {
  inscricoes: "Inscrições abertas",
  andamento: "Curso iniciado",
  encerrada: "Finalizado",
  cancelada: "Cancelada",
};
const nomeEvento = (curso: CursoConfig, turma: Turma) => `🎓 ${curso.sigla} · Turma ${turma.numero} · ${FASE[turma.status]}`;

async function descricaoEvento(curso: CursoConfig, turma: Turma): Promise<string> {
  const canalId = cursoStore.dados().geral.canalTurmasId;
  const canal = canalId ? (await listTextChannels()).find((c) => c.id === canalId) : undefined;
  return [
    `${FASE[turma.status].toUpperCase()} — ${curso.nome}`,
    ...(turma.agendadoPara ? [`Horário do curso: ${fmtHorarioBR(turma.agendadoPara)} (Brasília)`] : []),
    ...(turma.duracao ? [`Duração: ${turma.duracao}`] : []),
    ...(turma.observacoes ? [`Observações: ${turma.observacoes}`] : []),
    turma.status === "inscricoes" ? `Entre pelo botão "Entrar no curso"${canal ? ` no canal #${canal.nome}` : ""}.` : "Entradas e saídas encerradas.",
  ].join("\n\n");
}

/**
 * O evento DISPARA NA HORA em que o curso é agendado: é criado e iniciado na sequência
 * (aparece como "acontecendo agora"). O horário do curso fica no nome/descrição e na mensagem da turma.
 */
async function criarEvento(curso: CursoConfig, turma: Turma): Promise<void> {
  if (!turma.agendadoPara) return;
  const canalId = cursoStore.dados().geral.canalTurmasId;
  const canal = canalId ? (await listTextChannels()).find((c) => c.id === canalId) : undefined;
  // O Discord exige início no futuro para criar: marca daqui a pouco e inicia logo em seguida.
  const inicio = Date.now() + 60_000;
  const fim = Math.max(turma.agendadoPara, inicio) + (duracaoMs(turma.duracao) ?? DURACAO_EVENTO_MS) + 3 * 3_600_000;
  const id = await createScheduledEvent({
    nome: nomeEvento(curso, turma),
    descricao: await descricaoEvento(curso, turma),
    local: turma.local ?? (canal ? `#${canal.nome} · PMERJ` : "Discord · PMERJ"),
    inicio,
    fim,
  });
  if (!id) return;
  turma.evento = { id, status: "agendado" };
  if (await updateScheduledEvent(id, { status: 2 }, `Turma ${turma.numero} agendada: evento iniciado`)) turma.evento.status = "andamento";
}

/** Acompanha a turma na hora: iniciou → "Curso iniciado"; finalizou → encerrado; cancelou → "Cancelada" + encerrado. */
async function atualizarEvento(turma: Turma, para: "andamento" | "encerrado" | "cancelado"): Promise<void> {
  const ev = turma.evento;
  const curso = cursoStore.curso(turma.cursoId);
  if (!ev || !curso || ev.status === "encerrado" || ev.status === "cancelado") return;
  const motivo = `Turma ${turma.numero}: ${FASE[turma.status]}`;
  const textos = { name: nomeEvento(curso, turma), description: await descricaoEvento(curso, turma) };
  if (para === "andamento") {
    if (await updateScheduledEvent(ev.id, { ...textos, ...(ev.status === "agendado" ? { status: 2 as const } : {}) }, motivo)) ev.status = "andamento";
    return;
  }
  // Evento que nem começou: cancela direto. Ativo: o Discord só deixa encerrar.
  if (para === "cancelado" && ev.status === "agendado") {
    if (await updateScheduledEvent(ev.id, { ...textos, status: 4 }, motivo)) ev.status = "cancelado";
    return;
  }
  if (ev.status === "agendado") await updateScheduledEvent(ev.id, { status: 2 }, motivo);
  await updateScheduledEvent(ev.id, textos, motivo);
  if (await updateScheduledEvent(ev.id, { status: 3 }, motivo)) ev.status = para === "cancelado" ? "cancelado" : "encerrado";
}

export const linkEvento = (t: Turma) => (t.evento ? `https://discord.com/events/${env.DISCORD_GUILD_ID}/${t.evento.id}` : null);

/* ---------- Instrutor: turma ---------- */

export interface DetalhesTurma {
  agendadoPara: number;
  vagas: number | null;
  duracao: string | null;
  local: string | null;
  observacoes: string | null;
}

export async function abrirTurma(curso: CursoConfig, quem: Quem, det: DetalhesTurma): Promise<Resultado<Turma & { eventoCriado: boolean }>> {
  if (!curso.ativo) return falha("curso_inativo");
  if (cursoStore.turmaAtual(curso.id)) return falha("turma_em_aberto");
  const { agendadoPara, vagas } = det;
  if (!Number.isFinite(agendadoPara) || agendadoPara < Date.now() + 60_000) return falha("horario_passado");
  if (agendadoPara > Date.now() + 365 * 86_400_000) return falha("horario_distante");
  const d = cursoStore.dados();
  const turma: Turma = {
    id: randomUUID(),
    cursoId: curso.id,
    numero: d.turmas.filter((t) => t.cursoId === curso.id).reduce((m, t) => Math.max(m, t.numero), 0) + 1,
    status: "inscricoes",
    vagas,
    criadaEm: Date.now(),
    inicioEm: null,
    encerradaEm: null,
    abertaPor: quem,
    iniciadaPor: null,
    encerradaPor: null,
    mensagem: null,
    agendadoPara,
    evento: null,
    duracao: det.duracao,
    local: det.local,
    observacoes: det.observacoes,
  };
  d.turmas.push(turma);
  await criarEvento(curso, turma);
  await cursoStore.salvar();
  console.info(`[curso] ${curso.sigla} turma ${turma.numero} agendada para ${fmtHorarioBR(agendadoPara)} por discord:${quem.id}`);
  log(curso, "📅 Turma agendada", 0xe10600, [
    { name: "Horário", value: `<t:${Math.floor(agendadoPara / 1000)}:F>`, inline: true },
    { name: "Vagas", value: vagas ? String(vagas) : "Sem limite", inline: true },
    { name: "Agendada por", value: `<@${quem.id}>`, inline: true },
    ...(turma.evento ? [{ name: "Evento", value: `[Abrir evento](${linkEvento(turma)})` }] : []),
  ], turma);
  avisar(turma);
  return { ok: true, valor: Object.assign(turma, { eventoCriado: Boolean(turma.evento) }) };
}

/** Iniciar: entradas e saídas encerradas; o evento passa para "em andamento" na hora. */
export async function iniciarTurma(turma: Turma, quem: Quem): Promise<Resultado> {
  if (turma.status !== "inscricoes") return falha("transicao_invalida");
  if (ativos(turma.id).length === 0) return falha("sem_participantes");
  turma.status = "andamento";
  turma.inicioEm = Date.now();
  turma.iniciadaPor = quem;
  await atualizarEvento(turma, "andamento");
  await cursoStore.salvar();
  const curso = cursoStore.curso(turma.cursoId)!;
  console.info(`[curso] ${curso.sigla} turma ${turma.numero} iniciada por discord:${quem.id}`);
  log(curso, "▶️ Curso iniciado", 0x3b82f6, [
    { name: "Participantes", value: String(ativos(turma.id).length), inline: true },
    { name: "Iniciado por", value: `<@${quem.id}>`, inline: true },
  ], turma);
  avisar(turma);
  return { ok: true, valor: turma };
}

/** Finalizar: o evento fecha na hora; todo participante conclui o curso e recebe o cargo. */
export async function finalizarTurma(turma: Turma, quem: Quem): Promise<Resultado<{ turma: Turma; concluidos: number; falhasCargo: number }>> {
  if (turma.status !== "andamento") return falha("transicao_invalida");
  const curso = cursoStore.curso(turma.cursoId)!;
  const agora = Date.now();
  turma.status = "encerrada";
  turma.encerradaEm = agora;
  turma.encerradaPor = quem;
  const lista = ativos(turma.id);
  for (const p of lista) {
    p.status = "concluido";
    p.concluidoEm = agora;
    p.atualizadoEm = agora;
  }
  await atualizarEvento(turma, "encerrado"); // primeiro: o evento não espera a entrega dos cargos
  await cursoStore.salvar(); // registra a conclusão antes de mexer nos cargos
  avisar(turma);

  let falhasCargo = 0;
  if (curso.cargoId) {
    for (const p of lista) {
      p.cargoEntregue = await addRole(p.userId, curso.cargoId, `Concluiu o ${curso.sigla} (turma ${turma.numero})`);
      if (!p.cargoEntregue) falhasCargo++;
    }
    await cursoStore.salvar();
  }
  // Certificado de cada um no canal de certificados — em segundo plano (são várias postagens).
  void emitirCertificados(curso, turma, lista, quem).catch((err: unknown) => console.warn("[curso] falha nos certificados:", err));
  console.info(`[curso] ${curso.sigla} turma ${turma.numero} finalizada por discord:${quem.id} (${lista.length} concluíram)`);
  log(curso, "🎓 Curso finalizado", 0x22c55e, [
    { name: "Concluíram", value: lista.length ? lista.map((p) => `<@${p.userId}>`).join(" ").slice(0, 1000) : "Ninguém" },
    { name: "Finalizado por", value: `<@${quem.id}>`, inline: true },
    ...(curso.cargoId ? [{ name: "Cargo", value: falhasCargo ? `<@&${curso.cargoId}> · ⚠️ ${falhasCargo} sem cargo` : `<@&${curso.cargoId}> entregue`, inline: true }] : []),
  ], turma);
  return { ok: true, valor: { turma, concluidos: lista.length, falhasCargo } };
}

export async function cancelarTurma(turma: Turma, quem: Quem): Promise<Resultado> {
  if (turma.status !== "inscricoes" && turma.status !== "andamento") return falha("transicao_invalida");
  turma.status = "cancelada";
  turma.encerradaEm = Date.now();
  turma.encerradaPor = quem;
  for (const p of ativos(turma.id)) {
    p.status = "cancelado";
    p.atualizadoEm = Date.now();
  }
  await atualizarEvento(turma, "cancelado");
  await cursoStore.salvar();
  const curso = cursoStore.curso(turma.cursoId)!;
  log(curso, "✖️ Turma cancelada", 0x737373, [{ name: "Cancelada por", value: `<@${quem.id}>` }], turma);
  avisar(turma);
  return { ok: true, valor: turma };
}

/** Instrutor tira alguém da turma (só antes de finalizar). */
export async function tirarDaTurma(turma: Turma, participanteId: string, quem: Quem): Promise<Resultado> {
  if (turma.status !== "inscricoes" && turma.status !== "andamento") return falha("turma_encerrada");
  const p = ativos(turma.id).find((x) => x.id === participanteId);
  if (!p) return falha("nao_encontrado");
  p.status = "saiu";
  p.atualizadoEm = Date.now();
  await cursoStore.salvar();
  const curso = cursoStore.curso(turma.cursoId)!;
  log(curso, "➖ Retirado da turma", 0x737373, [
    { name: "Policial", value: `<@${p.userId}>`, inline: true },
    { name: "Por", value: `<@${quem.id}>`, inline: true },
  ], turma);
  avisar(turma);
  return { ok: true, valor: turma };
}

/* ---------- Policial: entrar / sair ---------- */

export async function entrar(turma: Turma, pessoa: Pessoa): Promise<Resultado> {
  const curso = cursoStore.curso(turma.cursoId);
  if (!curso?.ativo) return falha("curso_inativo");
  if (turma.status === "andamento") return falha("curso_iniciado");
  if (turma.status !== "inscricoes") return falha("turma_encerrada");

  const meus = cursoStore.doPolicial(pessoa.id).filter((p) => p.cursoId === curso.id);
  if (meus.some((p) => p.status === "concluido")) return falha("ja_concluido");
  if (meus.some((p) => p.turmaId === turma.id && p.status === "participando")) return falha("ja_participa");
  if (turma.vagas && ativos(turma.id).length >= turma.vagas) return falha("sem_vagas");

  if (curso.patenteMinimaId) {
    const patentes = setStore.config().patentes;
    const minIdx = patentes.findIndex((p) => p.id === curso.patenteMinimaId);
    const set = setStore.atual(pessoa.id);
    const idx = set ? patentes.findIndex((p) => p.id === set.patente.id) : -1;
    if (!set) return falha("sem_set");
    if (minIdx >= 0 && idx < minIdx) return falha("patente_insuficiente");
  }

  const agora = Date.now();
  const nome = setStore.atual(pessoa.id)?.apelido ?? pessoa.nome;
  const existente = meus.find((p) => p.turmaId === turma.id); // saiu e voltou
  if (existente) {
    existente.status = "participando";
    existente.nome = nome;
    existente.entrouEm = agora;
    existente.atualizadoEm = agora;
  } else {
    const p: Participante = {
      id: randomUUID(),
      cursoId: curso.id,
      turmaId: turma.id,
      userId: pessoa.id,
      username: pessoa.username,
      nome,
      avatar: pessoa.avatar,
      status: "participando",
      entrouEm: agora,
      atualizadoEm: agora,
      cargoEntregue: null,
      concluidoEm: null,
      removido: null,
      certificado: null,
    };
    cursoStore.dados().participantes.push(p);
  }
  await cursoStore.salvar();
  console.info(`[curso] discord:${pessoa.id} entrou em ${curso.sigla} turma ${turma.numero}`);
  avisar(turma);
  return { ok: true, valor: turma };
}

export async function sair(turma: Turma, userId: string): Promise<Resultado> {
  if (turma.status === "andamento") return falha("curso_iniciado");
  if (turma.status !== "inscricoes") return falha("turma_encerrada");
  const p = ativos(turma.id).find((x) => x.userId === userId);
  if (!p) return falha("nao_participa");
  p.status = "saiu";
  p.atualizadoEm = Date.now();
  await cursoStore.salvar();
  avisar(turma);
  return { ok: true, valor: turma };
}

/* ---------- /remover curso ---------- */

/** Cursos concluídos de alguém (o que dá para remover). */
export const concluidosDe = (userId: string) => cursoStore.doPolicial(userId).filter((p) => p.status === "concluido");

export async function removerCurso(alvoId: string, cursoId: string, quem: Quem): Promise<Resultado<{ curso: CursoConfig; cargoRetirado: boolean | null }>> {
  const curso = cursoStore.curso(cursoId);
  if (!curso) return falha("curso_nao_encontrado");
  const registros = concluidosDe(alvoId).filter((p) => p.cursoId === cursoId);
  if (registros.length === 0) return falha("nao_tem_curso");
  const cargoRetirado = curso.cargoId ? await removeRole(alvoId, curso.cargoId, `Curso ${curso.sigla} removido por ${quem.nome}`) : null;
  const agora = Date.now();
  for (const p of registros) {
    p.status = "removido";
    p.atualizadoEm = agora;
    p.removido = { porId: quem.id, porNome: quem.nome, em: agora, cargoRetirado };
    await revogarCertificado(p);
  }
  await cursoStore.salvar();
  console.info(`[curso] ${curso.sigla} removido de discord:${alvoId} por discord:${quem.id}`);
  log(curso, "🗑️ Curso removido", 0xff5a4f, [
    { name: "Policial", value: `<@${alvoId}>`, inline: true },
    { name: "Removido por", value: `<@${quem.id}>`, inline: true },
    ...(curso.cargoId ? [{ name: "Cargo", value: cargoRetirado ? `<@&${curso.cargoId}> retirado` : "⚠️ o Discord recusou retirar o cargo" }] : []),
  ]);
  return { ok: true, valor: { curso, cargoRetirado } };
}

export const MENSAGEM_ERRO: Record<string, string> = {
  curso_inativo: "Este curso está desativado.",
  curso_nao_encontrado: "Curso não encontrado.",
  turma_em_aberto: "Este curso já tem uma turma aberta ou em andamento.",
  transicao_invalida: "Essa ação não é possível na situação atual da turma.",
  sem_participantes: "Ninguém entrou na turma ainda.",
  curso_iniciado: "O curso já começou: não dá mais para entrar nem sair.",
  turma_encerrada: "Esta turma já foi encerrada.",
  ja_concluido: "Você já concluiu este curso.",
  ja_participa: "Você já está participando desta turma.",
  nao_participa: "Você não está participando desta turma.",
  sem_vagas: "A turma está lotada.",
  sem_set: "Este curso exige patente mínima: peça seu set antes de entrar.",
  patente_insuficiente: "Sua patente está abaixo da mínima exigida para este curso.",
  nao_tem_curso: "Essa pessoa não tem esse curso.",
  nao_encontrado: "Participante não encontrado.",
  nao_instrutor: "Só os instrutores deste curso podem fazer isso.",
  sem_permissao_remover: "Seu cargo não pode remover cursos.",
  horario_invalido: "Não entendi o horário. Use, por exemplo, 20:00 ou 15/11 20:00 (horário de Brasília).",
  horario_passado: "Esse horário já passou. Escolha um horário no futuro.",
  horario_distante: "Escolha um horário dentro dos próximos 12 meses.",
  vagas_invalidas: "Vagas: use um número de 1 a 200, ou deixe em branco para sem limite.",
  sem_curso_para_agendar: "Você não é instrutor de nenhum curso ativo sem turma aberta.",
  nao_concluido: "Essa pessoa não concluiu o curso.",
  sem_canal_certificados: "Nenhum canal de certificados configurado em Cadastro de cursos.",
  certificado_nao_publicado: "O Discord recusou publicar o certificado. Confira as permissões do bot no canal.",
};
