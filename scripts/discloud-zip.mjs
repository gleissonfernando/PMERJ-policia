// Monta o discloud-upload.zip (mesma ideia do sistema do BOPE).
// O pacote leva só código compilado; o MongoDB é o único armazenamento de dados.
//
//   npm run build && npm run discloud:zip
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = process.cwd();
const output = "discloud-upload.zip";
const fail = (msg) => {
  console.error(`[discloud] ${msg}`);
  process.exit(1);
};
const lines = (file) =>
  existsSync(file)
    ? readFileSync(file, "utf8")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"))
    : [];
const readEnv = (file) => Object.fromEntries(lines(file).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));

if (!existsSync(resolve(root, "discloud.config"))) fail("discloud.config não encontrado. Rode na raiz do projeto.");
for (const need of ["apps/api/dist/main.js", "apps/web/dist/index.html"]) {
  if (!existsSync(resolve(root, need))) fail(`${need} não existe. Rode "npm run build" antes.`);
}

const config = readEnv(resolve(root, "discloud.config"));
const env = readEnv(resolve(root, ".env.discloud"));
const avisos = [];
if (!existsSync(resolve(root, ".env.discloud"))) {
  avisos.push("Sem .env.discloud: copie o .env.discloud.example como guia e crie as variáveis no painel da Discloud.");
} else {
  for (const k of ["WEB_ORIGIN", "DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET", "DISCORD_REDIRECT_URI", "DISCORD_GUILD_ID", "DISCORD_BOT_TOKEN", "MONGODB_URI"]) {
    if (!env[k]) avisos.push(`.env.discloud: ${k} está vazio.`);
  }
  const esperado = `https://${config.ID}.discloud.app`;
  if (env.WEB_ORIGIN && config.ID && env.WEB_ORIGIN.replace(/\/$/, "") !== esperado) avisos.push(`WEB_ORIGIN (${env.WEB_ORIGIN}) não bate com ${esperado}. Ignore se usar domínio próprio.`);
}

// .discloudignore no formato "*" + "!incluir": entram só as linhas com "!".
const entradas = [
  ...new Set(
    lines(resolve(root, ".discloudignore"))
      .filter((l) => l.startsWith("!") && !l.endsWith("/**"))
      .map((l) => l.slice(1)),
  ),
].filter((e) => existsSync(resolve(root, e)));

rmSync(resolve(root, output), { force: true });
const r =
  process.platform === "win32"
    ? spawnSync(join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe"), ["-a", "-c", "-f", output, ...entradas], { cwd: root, stdio: "inherit" })
    : spawnSync("zip", ["-r", "-q", output, ...entradas], { cwd: root, stdio: "inherit" });
if (r.status !== 0) fail(`Não foi possível criar o ${output}${r.error ? `: ${r.error.message}` : "."}`);

console.log(`[discloud] ${output} criado (${(statSync(resolve(root, output)).size / 1_048_576).toFixed(1)} MB).`);
console.log(`[discloud] Incluído: ${entradas.join(", ")}`);
for (const a of avisos) console.warn(`[discloud] Aviso: ${a}`);
