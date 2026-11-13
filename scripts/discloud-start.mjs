// Início na Discloud: a hospedagem expõe o site na porta 8080 e fica atrás de proxy (HTTPS).
// As variáveis de verdade (Discord, MONGODB_URI…) ficam no painel da Discloud — veja .env.discloud.example.
// Aqui só entram os padrões que a hospedagem exige, sem sobrescrever o que já foi definido.
process.env.NODE_ENV ||= "production";
process.env.PORT ||= "8080";
process.env.TRUST_PROXY ||= "true";

await import("../apps/api/dist/main.js");
