// Envia o discloud-upload.zip para a Discloud pela API (mesmo fluxo do sistema do BOPE).
//   npm run build && npm run discloud:zip && npm run discloud:deploy
// DISCLOUD_TOKEN fica no .env local da raiz (fora do Git). Nunca cole o token no chat.
import { existsSync, readFileSync } from "node:fs";

const zip = process.argv[3] || "discloud-upload.zip";
let tokenArquivo;

function carregar(arquivo) {
  if (!existsSync(arquivo)) return;
  for (const linha of readFileSync(arquivo, "utf8").split(/\r?\n/)) {
    const t = linha.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const [k, ...resto] = t.split("=");
    const key = k.trim();
    const value = resto.join("=").trim().replace(/^['"]|['"]$/g, "");
    if (/^(DISCLOUD_TOKEN|DISCLOUD_API_TOKEN|Disclaud_token)$/i.test(key)) tokenArquivo = value;
    process.env[key] ||= value;
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
const token = tokenArquivo || process.env.DISCLOUD_TOKEN || process.env.DISCLOUD_API_TOKEN || process.env.Disclaud_token;

if (!token || token.length < 20) {
  console.error("[discloud] Coloque DISCLOUD_TOKEN no .env da raiz (Discloud → Dashboard → API) para fazer deploy.");
  process.exit(1);
}
if (!existsSync(zip)) {
  console.error(`[discloud] ${zip} não encontrado. Rode npm run build && npm run discloud:zip antes.`);
  process.exit(1);
}

try {
  const headers = { "api-token": token };
  const form = new FormData();
  form.append("file", new Blob([readFileSync(zip)]), zip.split(/[\\/]/).pop());

  console.log(`[discloud] Enviando ${zip} para ${appId}...`);
  const response = await fetch(`https://api.discloud.app/v2/app/${encodeURIComponent(appId)}/commit`, {
    method: "PUT",
    headers,
    body: form,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.status === "error") {
    throw new Error(`API HTTP ${response.status}: ${result.message ?? "falha ao atualizar a aplicacao"}`);
  }
  console.log(`[discloud] Deploy enviado: ${result.message ?? "ok"}`);

  let appStatus;
  for (let attempt = 0; attempt < 8; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const statusResponse = await fetch(`https://api.discloud.app/v2/app/${encodeURIComponent(appId)}/status`, { headers });
    const statusResult = await statusResponse.json().catch(() => ({}));
    const apps = statusResult.apps;
    appStatus = Array.isArray(apps) ? apps[0] : apps;
    if (appStatus?.container === "Online") {
      console.log(`[discloud] Online | RAM ${appStatus.memory ?? "indisponivel"}`);
      break;
    }
    console.log(`[discloud] Aguardando inicializacao (${appStatus?.container ?? statusResult.message ?? "sem status"})...`);
  }

  const logsResponse = await fetch(`https://api.discloud.app/v2/app/${encodeURIComponent(appId)}/logs`, { headers });
  const logsResult = await logsResponse.json().catch(() => ({}));
  const appLogs = Array.isArray(logsResult.apps) ? logsResult.apps[0] : logsResult.apps;
  const logText = appLogs?.terminal?.small ?? appLogs?.terminal?.big;
  if (logText) {
    const secrets = Object.entries(process.env)
      .filter(([key, value]) => /TOKEN|SECRET|MONGODB_URI/i.test(key) && value && value.length > 8)
      .map(([, value]) => value);
    const safeLogs = secrets.reduce((text, secret) => text.split(secret).join("[REDACTED]"), logText);
    const relevant = safeLogs.split(/\r?\n/).filter((line) => /error|fatal|exception|ERR_|PMERJ|dados\]/i.test(line)).slice(-25);
    console.log(relevant.length ? `[discloud] Logs relevantes:\n${relevant.join("\n")}` : "[discloud] Sem erros de inicializacao nos logs consultados.");
  }
} catch (err) {
  console.error(`[discloud] Deploy falhou: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}
