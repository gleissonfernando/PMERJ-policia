import { z } from "zod";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

// Resolve relativo a este arquivo: funciona da raiz do monorepo, do workspace
// apps/api e também no build (dist fica ao lado do .env do workspace).
const envPath = resolve(fileURLToPath(new URL("..", import.meta.url)), ".env");

if (existsSync(envPath)) {
  const contents = readFileSync(envPath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)?\s*$/);
    if (!match) continue;

    const key = match[1]!;
    const rawValue = match[2] ?? "";
    if (process.env[key] !== undefined) continue;

    const value = rawValue.trim();
    const unquoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
        ? value.slice(1, -1)
        : value.replace(/\s+#.*$/, "");

    process.env[key] = unquoted.replace(/\\n/g, "\n");
  }
}

/**
 * Validação das variáveis de ambiente.
 * Se algo estiver faltando ou inválido, a API NÃO sobe — melhor falhar no
 * boot do que rodar com configuração insegura.
 */
const snowflakeOpt = z
  .string()
  .regex(/^\d{17,20}$/, "ID do Discord inválido")
  .optional()
  .or(z.literal("").transform(() => undefined));

const snowflakeList = z
  .string()
  .default("")
  .transform((v) =>
    v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.string().regex(/^\d{17,20}$/, "Lista com ID do Discord inválido")));

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3333),

    /** Origem pública do site (ex.: https://painel.pmerj.com.br). */
    WEB_ORIGIN: z.url(),

    DISCORD_CLIENT_ID: z.string().regex(/^\d{17,20}$/, "Client ID do Discord inválido"),
    DISCORD_CLIENT_SECRET: z.string().min(16, "Client Secret do Discord inválido"),
    /** Precisa ser idêntica à cadastrada no Discord Developer Portal. */
    DISCORD_REDIRECT_URI: z.url(),
    /** Servidor oficial da PMERJ. Obrigatório em produção para liberar o painel. */
    DISCORD_GUILD_ID: z
      .string()
      .regex(/^\d{17,20}$/, "Guild ID do Discord inválido")
      .optional()
      .or(z.literal("").transform(() => undefined)),

    /** Token do bot (Gerenciar Apelidos). Vazio = painel funciona, mas sem mexer no Discord. */
    DISCORD_BOT_TOKEN: z
      .string()
      .min(50, "Token do bot inválido")
      .optional()
      .or(z.literal("").transform(() => undefined)),
    /** Quem administra o painel: IDs de usuários e/ou de cargos, separados por vírgula. */
    PAINEL_ADMIN_IDS: snowflakeList,
    PAINEL_ADMIN_ROLE_IDS: snowflakeList,
    /** IDs reconhecidos com o selo de desenvolvedor (sem permissões extras). */
    DEVELOPER_DISCORD_IDS: z
      .string()
      .default("1426287249020158018")
      .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean))
      .pipe(z.array(z.string().regex(/^\d{17,20}$/, "Lista com ID do Discord inválido"))),
    /** Curso BOPE: canal de log e cargo entregue ao formado (opcionais). */
    CURSO_LOG_CHANNEL_ID: snowflakeOpt,
    CURSO_CARGO_FORMADO_ID: snowflakeOpt,

    /** Banco MongoDB (Discloud). Vazio = arquivos em apps/api/data (só desenvolvimento). Obrigatório em produção. */
    MONGODB_URI: z
      .string()
      .regex(/^mongodb(\+srv)?:\/\//, "Use uma URI mongodb:// ou mongodb+srv://")
      .optional()
      .or(z.literal("").transform(() => undefined)),

    SESSION_TTL_HOURS: z.coerce.number().min(1).max(72).default(8),
    /** Só ative se a API estiver atrás de um proxy reverso confiável (Nginx, Cloudflare...). */
    TRUST_PROXY: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
  })
  .superRefine((env, ctx) => {
    if (env.DISCORD_BOT_TOKEN && !env.DISCORD_GUILD_ID) {
      ctx.addIssue({ code: "custom", path: ["DISCORD_GUILD_ID"], message: "Necessário para usar o bot" });
    }
    if (env.NODE_ENV !== "production") return;
    if (!env.DISCORD_GUILD_ID) {
      ctx.addIssue({ code: "custom", path: ["DISCORD_GUILD_ID"], message: "Obrigatório em produção" });
    }
    // Na hospedagem os arquivos locais somem a cada deploy: os dados precisam do banco.
    if (!env.MONGODB_URI) {
      ctx.addIssue({ code: "custom", path: ["MONGODB_URI"], message: "Obrigatório em produção (banco da Discloud)" });
    }
    for (const key of ["WEB_ORIGIN", "DISCORD_REDIRECT_URI"] as const) {
      if (!env[key].startsWith("https://")) {
        ctx.addIssue({ code: "custom", path: [key], message: "Use HTTPS em produção" });
      }
    }
  });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("\n[PMERJ] Configuração inválida no .env:\n");
  for (const issue of parsed.error.issues) {
    console.error(`  • ${issue.path.join(".")}: ${issue.message}`);
  }
  console.error("\nVeja apps/api/.env.example\n");
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
