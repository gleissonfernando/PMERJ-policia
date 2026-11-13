import { emojiLogo } from "../branding/emoji.js";
import { linkCertificado } from "../curso/certificado.js";
import { cursoStore } from "../curso/store.js";
import type { Participante } from "../curso/types.js";
import { FLAG_COMPONENTS_V2, interactionCallback, upsertGuildCommand, type MessageBody } from "../discord/bot.js";
import type { RawInteraction } from "../discord/gateway.js";
import { setStore } from "../set/store.js";
import { nivelAtual } from "../disciplina/service.js";
import { disciplinaStore } from "../disciplina/store.js";
import { patenteAtual } from "../promocao/service.js";
import { historicoPatente } from "../promocao/store.js";
import { fmtDur, resumoPolicial } from "../ponto/service.js";

/** Bate-ponto no perfil: status, horas aprovadas e posição no ranking. */
function linhaPonto(userId: string): string {
  const r = resumoPolicial(userId);
  return [
    "### ⏱️ Bate-ponto",
    r.aberto ? `🟢 **Em serviço** ${ts(r.aberto.entrada, "R")}` : "⚪ Fora de serviço",
    `**Horas aprovadas:** ${fmtDur(r.totalMs)}  ·  **Ranking:** ${fmtDur(r.rankingMs)}${r.posicao ? ` (${r.posicao}º)` : ""}${r.pendentes ? `  ·  ${r.pendentes} aguardando aprovação` : ""}`,
  ].join("\n");
}

/**
 * /perfil [membro] — qualquer membro do servidor pode usar.
 * Mostra o set (patente, nome, ID, órgão) e os cursos concluídos / em andamento.
 * A resposta é pública no canal e nunca menciona (pinga) ninguém.
 */

export const COMANDO_PERFIL = {
  name: "perfil",
  type: 1,
  description: "Mostra o perfil de um policial: set e cursos.",
  // Sem default_member_permissions: todo mundo pode usar.
  contexts: [0],
  options: [{ type: 6, name: "membro", description: "De quem ver o perfil (vazio = o seu)", required: false }],
};

export const registrarComandoPerfil = () => upsertGuildCommand(COMANDO_PERFIL);

const COR = 0xe10600;
const escapeMd = (s: string) => s.replace(/([\\*_~`|>#[\]()-])/g, "\\$1");
const ts = (ms: number, estilo: "D" | "R") => `<t:${Math.floor(ms / 1000)}:${estilo}>`;
const nn = (n: number | null) => (n === null ? "—" : String(n).padStart(2, "0"));

function avatarUrl(id: string, avatar: string | null | undefined): string {
  return avatar
    ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=256`
    : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(id) >> 22n) % 6}.png`;
}

/** " · 🎓 [Certificado CFSD-03-0012](link)" — ou só o código, se não foi publicado. */
function linhaCertificado(p: Participante): string {
  const c = p.certificado;
  if (!c) return "";
  const link = linkCertificado(c);
  return ` · 🎓 ${link ? `[Certificado ${c.codigo}](${link})` : `Certificado \`${c.codigo}\``}`;
}

function montarPerfil(alvo: { id: string; nome: string; avatar: string | null | undefined; entrouEm: number | null; bot: boolean; roles: string[] }): MessageBody {
  const set = setStore.atual(alvo.id);
  const registros = cursoStore.doPolicial(alvo.id);
  const numeroTurma = (p: Participante) => cursoStore.turma(p.turmaId)?.numero ?? null;

  // Um registro por curso: o concluído vale mais que turmas anteriores.
  const concluidos: string[] = [];
  const andamento: string[] = [];
  for (const curso of cursoStore.dados().cursos) {
    const doCurso = registros.filter((p) => p.cursoId === curso.id);
    const concluido = doCurso.find((p) => p.status === "concluido");
    if (concluido) {
      concluidos.push(
        `✅ **${escapeMd(curso.sigla)}** · ${escapeMd(curso.nome)}\n-# Turma ${nn(numeroTurma(concluido))} · concluído ${ts(concluido.concluidoEm ?? concluido.atualizadoEm, "D")}` +
          (curso.cargoId ? ` · <@&${curso.cargoId}>` : "") +
          linhaCertificado(concluido),
      );
      continue;
    }
    const ativo = doCurso.find((p) => p.status === "participando");
    if (ativo) {
      const t = cursoStore.turma(ativo.turmaId);
      andamento.push(`📘 **${escapeMd(curso.sigla)}** · turma ${nn(numeroTurma(ativo))} · ${t?.status === "andamento" ? "em andamento" : "aguardando início"}`);
    }
  }

  // Patente pelo CARGO atual (tudo funciona por cargo); sem cargo de patente, a do set.
  const patente = patenteAtual(alvo.id, alvo.roles) ?? (set ? set.patente : null);
  const { ultimaPromocao, rebaixamentos } = historicoPatente(alvo.id);
  const adv = nivelAtual(alvo.roles);
  const identificacao = [
    patente ? `**Patente:** ${escapeMd(patente.nome)} (${escapeMd(patente.prefixo)})` : "**Patente:** _não identificada_",
    ...(set ? [`**ID:** ${escapeMd(set.gameId)}${set.orgao ? `  ·  **Órgão:** ${escapeMd(set.orgao.sigla)}` : ""}`] : ["_Ainda não pediu set._"]),
    `**Última promoção:** ${ultimaPromocao ? `${ts(ultimaPromocao.em, "D")} (${escapeMd(ultimaPromocao.de?.prefixo ?? "—")} → ${escapeMd(ultimaPromocao.para.prefixo)})` : "_nenhuma registrada_"}`,
    `**Advertência atual:** ${adv ? (adv.cargoId ? `<@&${adv.cargoId}>` : escapeMd(adv.nome)) : "nenhuma"}`,
  ].join("\n");

  // Histórico disciplinar: advertências, remoções, rebaixamentos e exonerações (mais recentes primeiro).
  const ROTULO = { advertencia: "⚠️ Advertência", advertencia_removida: "✅ Advertência removida", exoneracao: "🚫 Exoneração" } as const;
  const disciplina = [
    ...disciplinaStore.doPolicial(alvo.id).map((r) => ({
      em: r.em,
      linha: `${ROTULO[r.tipo]}${r.nivel ? ` · ${escapeMd(r.nivel.nome)}` : ""} · ${ts(r.em, "D")}${r.motivo ? `\n-# ${escapeMd(r.motivo.slice(0, 120))}` : ""}`,
    })),
    ...rebaixamentos.map((r) => ({
      em: r.em,
      linha: `📉 Rebaixamento · ${escapeMd(r.de?.prefixo ?? "—")} → ${escapeMd(r.para.prefixo)} · ${ts(r.em, "D")}${r.motivo ? `\n-# ${escapeMd(r.motivo.slice(0, 120))}` : ""}`,
    })),
  ].sort((a, b) => b.em - a.em);
  const desde = alvo.entrouEm ? `\n**No servidor desde** ${ts(alvo.entrouEm, "D")}` : "";
  const emoji = emojiLogo();

  return {
    flags: FLAG_COMPONENTS_V2,
    allowed_mentions: { parse: [] },
    components: [
      {
        type: 17,
        accent_color: COR,
        components: [
          {
            type: 9,
            components: [
              { type: 10, content: `## 👮 ${escapeMd(set?.apelido ?? alvo.nome)}` },
              { type: 10, content: `<@${alvo.id}>\n${identificacao}${desde}` },
            ],
            accessory: { type: 11, media: { url: avatarUrl(alvo.id, alvo.avatar) }, description: `Avatar de ${alvo.nome}`.slice(0, 1024) },
          },
          { type: 14, divider: true, spacing: 1 },
          {
            type: 10,
            content: [
              `### 🎓 Cursos concluídos · ${concluidos.length}`,
              concluidos.length ? concluidos.join("\n") : "_Nenhum curso concluído ainda._",
            ].join("\n"),
          },
          ...(andamento.length ? [{ type: 10, content: ["### Em andamento", ...andamento].join("\n") }] : []),
          { type: 14, divider: true, spacing: 1 },
          { type: 10, content: linhaPonto(alvo.id) },
          { type: 14, divider: true, spacing: 1 },
          {
            type: 10,
            content: [
              `### ⚖️ Histórico disciplinar · ${disciplina.length}`,
              disciplina.length ? disciplina.slice(0, 10).map((d) => d.linha).join("\n") : "_Nada registrado._",
              ...(disciplina.length > 10 ? [`-# … e mais ${disciplina.length - 10}`] : []),
            ].join("\n"),
          },
          { type: 14, divider: true, spacing: 1 },
          { type: 10, content: `-# ${emoji ? `${emoji} ` : ""}PMERJ · Polícia Militar do Estado do Rio de Janeiro` },
        ],
      },
    ],
  };
}

export async function handlePerfilInteraction(i: RawInteraction): Promise<boolean> {
  if (i.type !== 2 || i.data?.name !== COMANDO_PERFIL.name) return false;
  if (!i.member) {
    await interactionCallback(i.id, i.token, { type: 4, data: { flags: 64, content: "Use o /perfil dentro do servidor." } });
    return true;
  }

  const alvoId = i.data.options?.find((o) => o.name === "membro")?.value;
  let alvo: Parameters<typeof montarPerfil>[0];
  if (typeof alvoId === "string" && alvoId !== i.member.user.id) {
    const u = i.data.resolved?.users?.[alvoId];
    const m = i.data.resolved?.members?.[alvoId];
    if (!u) {
      await interactionCallback(i.id, i.token, { type: 4, data: { flags: 64, content: "Não encontrei esse membro." } });
      return true;
    }
    alvo = { id: u.id, nome: m?.nick ?? u.global_name ?? u.username, avatar: u.avatar, entrouEm: m?.joined_at ? Date.parse(m.joined_at) : null, bot: Boolean(u.bot), roles: m?.roles ?? [] };
  } else {
    const u = i.member.user;
    alvo = { id: u.id, nome: i.member.nick ?? u.global_name ?? u.username, avatar: u.avatar, entrouEm: i.member.joined_at ? Date.parse(i.member.joined_at) : null, bot: false, roles: i.member.roles ?? [] };
  }

  await interactionCallback(i.id, i.token, { type: 4, data: montarPerfil(alvo) });
  return true;
}
