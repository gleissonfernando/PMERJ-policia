import { emojiLogo } from "../branding/emoji.js";
import { FLAG_COMPONENTS_V2, type MessageBody } from "../discord/bot.js";
import { cabecalho } from "../set/brasao.js";
import { LIMITES, numeroBoletim, type Boletim, type BoletimConfig } from "./store.js";

/* ---------- Leitura da mensagem: 1ª linha = equipe, resto = relatório ---------- */

export type Leitura = { ok: true; equipe: string; relatorio: string } | { ok: false; motivo: string };

const semControle = (s: string) => s.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "");

/** Aceita "Equipe Alfa", "**Equipe:** Alfa", "# Alfa"… e "Relatório: …" na 2ª linha. */
export function lerMensagem(conteudo: string, anexos: number): Leitura {
  if (anexos > 0) return { ok: false, motivo: "O boletim é só texto: mande sem fotos ou arquivos." };
  const linhas = semControle(conteudo.replace(/\r\n?/g, "\n")).split("\n");
  while (linhas.length && !linhas[0]!.trim()) linhas.shift();
  if (!linhas.length) return { ok: false, motivo: "Sua mensagem não tinha texto." };

  const equipe = linhas[0]!
    .trim()
    .replace(/^[#>*_~`\s-]+|[*_~`\s]+$/g, "")
    .replace(/^(nome\s+da\s+)?equipe\s*[:\-–]\s*/i, "")
    .replace(/^[*_\s]+/, "")
    .trim();
  const relatorio = linhas
    .slice(1)
    .join("\n")
    .trim()
    .replace(/^[*_]*relat[óo]rio[*_]*\s*[:\-–]\s*[*_]*\s*/i, "")
    .trim();

  if (!relatorio) return { ok: false, motivo: "Faltou o relatório. Escreva o nome da equipe na 1ª linha e o relatório a partir da 2ª (use **Shift + Enter** para pular linha)." };
  if (equipe.length < LIMITES.equipeMin) return { ok: false, motivo: "A 1ª linha precisa ter o nome da equipe." };
  if (equipe.length > LIMITES.equipe) return { ok: false, motivo: `A 1ª linha deve ser só o nome da equipe (até ${LIMITES.equipe} caracteres). O relatório começa na 2ª linha.` };
  if (relatorio.length < LIMITES.relatorioMin) return { ok: false, motivo: "O relatório está curto demais. Descreva o que a equipe fez." };
  if (relatorio.length > LIMITES.relatorio) return { ok: false, motivo: `O relatório passou do limite de ${LIMITES.relatorio} caracteres (tem ${relatorio.length}). Resuma um pouco.` };
  return { ok: true, equipe, relatorio };
}

/* ---------- Painel do boletim (Components V2) ---------- */

const separador = { type: 14, divider: true, spacing: 1 };

export function painelBoletim(b: Boletim, cfg: BoletimConfig): MessageBody {
  const topo = cabecalho(["## 📋 Boletim Interno", `-# ${numeroBoletim(b)} · <t:${Math.floor(b.em / 1000)}:f>`]);
  const emoji = emojiLogo();
  return {
    flags: FLAG_COMPONENTS_V2,
    // A menção ao autor aparece, mas ninguém é notificado.
    allowed_mentions: { parse: [] },
    components: [
      {
        type: 17,
        accent_color: cfg.cor,
        components: [
          ...(Array.isArray(topo) ? topo : [topo]),
          separador,
          { type: 10, content: `**🚓 Equipe**\n${b.equipe}` },
          { type: 10, content: `**📝 Relatório**\n${b.relatorio}` },
          separador,
          { type: 10, content: `-# Enviado por <@${b.autor.id}> · ${emoji ? `${emoji} ` : ""}${cfg.rodape}` },
        ],
      },
    ],
  };
}

/* ---------- Explicação para quem mandou errado ---------- */

const EXEMPLO = "Equipe Alfa\nPatrulhamento na Zona Norte das 14h às 18h. Duas abordagens, sem alterações.";

/** Bloco de código seguro (sem fechar o bloco no meio). */
const codigo = (t: string) => `\`\`\`\n${t.replace(/```/g, "ˋˋˋ").slice(0, 1500)}\n\`\`\``;

/**
 * Corpo da explicação. `original` (só na DM) devolve o texto apagado para a pessoa corrigir sem redigitar.
 * `mencionar` (aviso no canal, quando a DM está fechada) marca a pessoa no topo.
 */
export function explicacao(opts: { canalId: string; motivo: string; original?: string; mencionar?: string }): MessageBody {
  const partes = [
    `${opts.mencionar ? `<@${opts.mencionar}>\n` : ""}### ❌ Boletim não publicado`,
    opts.motivo,
    `**Como enviar no <#${opts.canalId}>:**\n${codigo(EXEMPLO)}\n-# 1ª linha: nome da equipe · Da 2ª linha em diante: relatório · Shift + Enter pula linha`,
  ];
  return {
    flags: FLAG_COMPONENTS_V2,
    allowed_mentions: { parse: [], users: opts.mencionar ? [opts.mencionar] : [] },
    components: [
      {
        type: 17,
        accent_color: 0xef5350,
        components: [
          { type: 10, content: partes.join("\n\n") },
          ...(opts.original?.trim() ? [separador, { type: 10, content: `**Sua mensagem** (copie, corrija e mande de novo):\n${codigo(opts.original.trim())}` }] : []),
        ],
      },
    ],
  };
}
