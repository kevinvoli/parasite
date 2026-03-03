import path from "path";
import fs from "fs-extra";
import chalk from "chalk";
import { z } from "zod";

const DbConfigSchema = z.object({
  type: z.enum(["postgres", "mysql"]).optional(),
  host: z.string().optional(),
  port: z.number().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  database: z.string().optional(),
});

const ParasiteConfigSchema = z.object({
  projectRoot: z.string().optional(),
  db: DbConfigSchema.optional(),
  templatesDir: z.string().optional(),
  namingConvention: z.enum(["camelCase", "snake_case"]).optional(),
  overwriteExisting: z.boolean().optional(),
  entitiesPath: z.string().optional(),
  swagger: z.boolean().optional(),
});

export type ParasiteConfig = z.infer<typeof ParasiteConfigSchema>;

function resolveEnvVars(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(/\$\{(\w+)\}/g, (_, varName) => process.env[varName] ?? `\${${varName}}`);
  }
  if (Array.isArray(value)) {
    return value.map(resolveEnvVars);
  }
  if (value !== null && typeof value === "object") {
    const resolved: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      resolved[k] = resolveEnvVars(v);
    }
    return resolved;
  }
  return value;
}

export async function loadConfig(): Promise<ParasiteConfig> {
  const configFilePath = path.resolve(process.cwd(), "parasite.conf.json");

  if (!fs.existsSync(configFilePath)) {
    // It's not an error to not have a config file, commands should rely on options.
    return {};
  }

  try {
    const raw = await fs.readJson(configFilePath);
    const resolved = resolveEnvVars(raw);
    const result = ParasiteConfigSchema.safeParse(resolved);
    if (!result.success) {
      for (const issue of result.error.issues) {
        console.warn(chalk.yellow(`⚠️  parasite.conf.json — ${issue.path.join(".")}: ${issue.message}`));
      }
    }
    return (result.success ? result.data : resolved) as ParasiteConfig;
  } catch (error) {
    console.error(chalk.red("❌ Erreur lors de la lecture ou de l'analyse du fichier parasite.conf.json:"), error);
    // Return empty config on error to avoid crashing, but log the error.
    return {};
  }
}
