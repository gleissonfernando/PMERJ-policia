// Envia o discloud-upload.zip para a Discloud pela API (mesmo fluxo do sistema do BOPE).
//   npm run build && npm run discloud:zip && npm run discloud:deploy
// DISCLOUD_TOKEN fica no .env local da raiz (fora do Git). Nunca cole o token no chat.
import { existsSync, readFileSync } from "node:fs";

const zip = process.argv[3] || "discloud-upload.zip";

function carregar(arquivo) {
  if (!existsSync(arquivo)) return;
  for (const linha of readFileSync(arquivo, "utf8").split(/\r?\n/)) {
    const t = linha.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const [k, ...resto] = t.split("=");
    process.env[k.trim()] ||= resto.join("=").trim().replace(/^['"]|['"]$/g, "");
  }
}
carregar(".env");
carregar(".env.discloud");

const config = Object.fromEntries(
  readFileSync("discloud.config", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const appId = process.argv[2] || process.env.DISCLOUD_APP_ID || config.ID;
// Aceita tambÃ©m o nome usado no .env local legado ("Disclaud_token").
const token = process.env.DISCLOUD_TOKEN || process.env.DISCLOUD_API_TOKEN || process.env.Disclaud_token;

if (!token || token.length < 20) {
  console.error("[discloud] Coloque DISCLOUD_TOKEN no .env da raiz (Discloud → Dashboard → API) para fazer deploy.");
  process.exit(1);
}
if (!existsSync(zip)) {
  console.error(`[discloud] ${zip} não encontrado. Rode npm run build && npm run discloud:zip antes.`);
  process.exit(1);
}

// Importado só depois de ler os .env: o pacote preenche DISCLOUD_TOKEN com um valor padrão.
const { discloud } = await import("discloud.app");

try {
  await discloud.login(token);
  console.log(`[discloud] Enviando ${zip} para ${appId}...`);
  const r = await discloud.apps.update(appId, { file: { data: readFileSync(zip), name: zip } });
  console.log(`[discloud] Deploy enviado: ${r?.message ?? r?.status ?? "ok"}`);
  const st = await discloud.apps.status.fetch(appId).catch((error) => ({ error }));
  console.log("error" in st ? `[discloud] Status: não consultado (${st.error?.message ?? st.error})` : `[discloud] Status: ${st.container} | ${st.status} | RAM ${st.memory}`);
} catch (err) {
  console.error(`[discloud] Deploy falhou: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}
