import type { Arquivo } from "../discord/bot.js";

/**
 * Anexos da equipe nas reuniões: baixados SÓ em memória para o bot reenviar como a corregedoria
 * (reunião não tem transcript, nada é guardado). Só o CDN oficial, sem redirecionamento, até 10 MB.
 */
const HOSTS = new Set(["cdn.discordapp.com", "media.discordapp.net"]);
const MAX = 10 * 1024 * 1024;

export async function guardarAnexosSimples(atts: Array<{ url: string; size: number; filename: string; content_type?: string }>): Promise<Arquivo[]> {
  const out: Arquivo[] = [];
  for (const [n, att] of atts.slice(0, 10).entries()) {
    if (att.size > MAX) continue;
    try {
      const url = new URL(att.url);
      if (url.protocol !== "https:" || !HOSTS.has(url.hostname)) continue;
      const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(30_000) });
      if (!res.ok) continue;
      const dados = Buffer.from(await res.arrayBuffer());
      if (dados.length > MAX) continue;
      const ext = (att.filename.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? "bin").toLowerCase();
      out.push({ nome: `anexo-${n + 1}.${ext}`, dados, tipo: att.content_type ?? "application/octet-stream" });
    } catch {
      // anexo que não baixou é ignorado; a mensagem de texto segue
    }
  }
  return out;
}
