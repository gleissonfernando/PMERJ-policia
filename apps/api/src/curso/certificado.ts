import { emojiLogo } from "../branding/emoji.js";
import { avatarDoMembro, editMessage, FLAG_COMPONENTS_V2, getMember, postMessage, type MessageBody } from "../discord/bot.js";
import { env } from "../env.js";
import { brasao, cabecalho } from "../set/brasao.js";
import { setStore } from "../set/store.js";
import { cursoStore } from "./store.js";
import type { Certificado, CursoConfig, Participante, Turma } from "./types.js";

/**
 * Certificado de conclusão — sai quando o instrutor FINALIZA a turma (um por participante).
 * Mensagem V2 no canal de certificados: logo, número e código, a FOTO DO SERVIDOR da pessoa
 * (avatar do servidor; sem ele, o da conta), curso, turma, instrutor e data.
 * O site lista os certificados de cada curso e permite publicar de novo o que falhou.
 */

const COR = 0xc9a227; // dourado
const COR_REVOGADO = 0x4b5563;
const nn = (n: number) => String(n).padStart(2, "0");
const escapeMd = (s: string) => s.replace(/([\\*_~`|>#[\]()-])/g, "\\$1");
const ts = (ms: number, estilo: "D" | "f") => `<t:${Math.floor(ms / 1000)}:${estilo}>`;

export const linkCertificado = (c: Certificado) => (c.mensagem ? `https://discord.com/channels/${env.DISCORD_GUILD_ID}/${c.mensagem.canalId}/${c.mensagem.mensagemId}` : null);

function proximoNumero(): number {
  return cursoStore.dados().participantes.reduce((m, p) => Math.max(m, p.certificado?.numero ?? 0), 0) + 1;
}

function codigo(curso: CursoConfig, turma: Turma | undefined, numero: number): string {
  const sigla = curso.sigla.normalize("NFD").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10) || "CURSO";
  return `${sigla}-${nn(turma?.numero ?? 0)}-${String(numero).padStart(4, "0")}`;
}

export function mensagemCertificado(p: Participante, curso: CursoConfig, turma: Turma | undefined): MessageBody {
  const c = p.certificado!;
  const emoji = emojiLogo();
  const revogado = Boolean(c.revogadoEm);
  const topo = cabecalho([
    "-# POLÍCIA MILITAR DO ESTADO DO RIO DE JANEIRO",
    revogado ? "## ~~🎓 Certificado de Conclusão~~" : "## 🎓 Certificado de Conclusão",
    `-# Nº ${String(c.numero).padStart(4, "0")} · Código \`${c.codigo}\``,
  ]);
  return {
    flags: FLAG_COMPONENTS_V2,
    // Só o formado é notificado (na primeira publicação).
    allowed_mentions: { parse: [], users: [p.userId] },
    components: [
      {
        type: 17,
        accent_color: revogado ? COR_REVOGADO : COR,
        components: [
          ...(Array.isArray(topo) ? topo : [topo]),
          { type: 14, divider: true, spacing: 2 },
          { type: 12, items: [{ media: { url: c.foto }, description: `Foto de ${c.nome}`.slice(0, 1024) }] },
          {
            type: 10,
            content: `Certificamos que **${escapeMd(c.nome)}** (<@${p.userId}>) concluiu com aproveitamento o curso **${escapeMd(curso.nome)}** (${escapeMd(curso.sigla)})${turma ? `, turma ${nn(turma.numero)}` : ""}.`,
          },
          { type: 10, content: `🧑‍🏫 **Instrutor:** <@${c.instrutor.id}>\n📅 **Conclusão:** ${ts(p.concluidoEm ?? c.emitidoEm, "D")}` },
          ...(revogado ? [{ type: 10, content: `⛔ **Certificado revogado** em ${ts(c.revogadoEm!, "D")}: o curso foi removido deste policial.` }] : []),
          { type: 14, divider: true, spacing: 1 },
          { type: 10, content: `-# ${emoji ? `${emoji} ` : ""}PMERJ · Cursos · emitido ${ts(c.emitidoEm, "f")}` },
        ],
      },
    ],
  };
}

/** Cria o certificado (se ainda não existe) com a foto e o nome ATUAIS do servidor. Não salva. */
async function prepararCertificado(p: Participante, curso: CursoConfig, turma: Turma | undefined, instrutor: { id: string; nome: string }): Promise<Certificado> {
  if (p.certificado) return p.certificado;
  const membro = await getMember(p.userId);
  const nome = setStore.atual(p.userId)?.apelido ?? membro?.nick ?? membro?.user.global_name ?? p.nome;
  const numero = proximoNumero();
  p.certificado = {
    numero,
    codigo: codigo(curso, turma, numero),
    emitidoEm: Date.now(),
    instrutor,
    nome: nome.slice(0, 80),
    foto: avatarDoMembro(p.userId, membro?.avatar, membro?.user.avatar ?? p.avatar),
    mensagem: null,
    revogadoEm: null,
  };
  return p.certificado;
}

/** Publica no canal de certificados (se configurado e ainda não publicado). Não salva. */
async function publicar(p: Participante, curso: CursoConfig, turma: Turma | undefined): Promise<boolean> {
  const canal = cursoStore.dados().geral.canalCertificadosId;
  if (!canal || !p.certificado || p.certificado.mensagem) return Boolean(p.certificado?.mensagem);
  const msg = await postMessage(canal, mensagemCertificado(p, curso, turma), brasao());
  if (msg) p.certificado.mensagem = { canalId: canal, mensagemId: msg.id };
  return Boolean(msg);
}

/**
 * Turma finalizada: certificado de cada participante, um por vez (respeita o limite do Discord).
 * Roda em segundo plano — o instrutor não espera as postagens.
 */
export async function emitirCertificados(curso: CursoConfig, turma: Turma, lista: Participante[], instrutor: { id: string; nome: string }): Promise<{ publicados: number; falhas: number }> {
  let publicados = 0;
  let falhas = 0;
  for (const p of lista) {
    try {
      await prepararCertificado(p, curso, turma, instrutor);
      await cursoStore.salvar(); // número reservado antes de postar
      if (await publicar(p, curso, turma)) publicados++;
      else if (cursoStore.dados().geral.canalCertificadosId) falhas++;
      await cursoStore.salvar();
    } catch (err) {
      falhas++;
      console.warn(`[curso] certificado de discord:${p.userId} não emitido:`, err instanceof Error ? err.message : err);
    }
  }
  console.info(`[curso] ${curso.sigla} turma ${turma.numero}: ${lista.length} certificados (${publicados} publicados, ${falhas} falhas)`);
  return { publicados, falhas };
}

export type ResultadoCertificado = { ok: true; certificado: Certificado } | { ok: false; erro: string };

/** Pelo site: emite (quem concluiu antes dos certificados existirem) ou publica de novo o que falhou. */
export async function emitirCertificado(p: Participante, quem: { id: string; nome: string }): Promise<ResultadoCertificado> {
  if (p.status !== "concluido") return { ok: false, erro: "nao_concluido" };
  const curso = cursoStore.curso(p.cursoId);
  if (!curso) return { ok: false, erro: "curso_nao_encontrado" };
  const turma = cursoStore.turma(p.turmaId);
  const c = await prepararCertificado(p, curso, turma, turma?.encerradaPor ?? quem);
  await cursoStore.salvar();
  if (!cursoStore.dados().geral.canalCertificadosId) return { ok: false, erro: "sem_canal_certificados" };
  const ok = await publicar(p, curso, turma);
  await cursoStore.salvar();
  return ok ? { ok: true, certificado: c } : { ok: false, erro: "certificado_nao_publicado" };
}

/** /remover curso: o certificado continua no histórico, marcado como revogado (e a mensagem é atualizada). */
export async function revogarCertificado(p: Participante): Promise<void> {
  const c = p.certificado;
  if (!c || c.revogadoEm) return;
  c.revogadoEm = Date.now();
  const curso = cursoStore.curso(p.cursoId);
  if (c.mensagem && curso) {
    const corpo = { ...mensagemCertificado(p, curso, cursoStore.turma(p.turmaId)), allowed_mentions: { parse: [] } };
    await editMessage(c.mensagem.canalId, c.mensagem.mensagemId, corpo, brasao());
  }
}
