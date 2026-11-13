// Início na Discloud: a hospedagem expõe o site na porta 8080 e fica atrás de proxy (HTTPS).
// As variáveis de verdade (Discord, MONGODB_URI…) ficam no painel da Discloud — veja .env.discloud.example.
// Aqui só entram os padrões que a hospedagem exige, sem sobrescrever o que já foi definido.
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

process.env.NODE_ENV = "production";
process.env.PORT = "8080";
process.env.TRUST_PROXY = "true";

// A Discloud pode iniciar o MAIN sem materializar os workspaces do npm no
// contÃªiner. Garanta as dependÃªncias de runtime antes de importar a API.
if (!existsSync("node_modules/mongodb") || !existsSync("node_modules/discord.js")) {
  console.info("[PMERJ] DependÃªncias ausentes; instalando dependÃªncias de produÃ§Ã£o...");
  const install = spawnSync("npm", ["install", "--omit=dev"], { stdio: "inherit", env: process.env });
  if (install.error) throw install.error;
  if (install.status !== 0) process.exit(install.status ?? 1);
}

await import("../apps/api/dist/main.js");
