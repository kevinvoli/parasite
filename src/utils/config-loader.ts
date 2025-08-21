import path from "path";
import fs from "fs-extra";
import chalk from "chalk";

export interface ParasiteConfig {
  projectRoot?: string;
  db?: {
    type?: 'postgres' | 'mysql';
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    database?: string;
  };
  templatesDir?: string;
  namingConvention?: 'camelCase' | 'snake_case';
  overwriteExisting?: boolean;
  entitiesPath?: string;
}

export async function loadConfig(): Promise<ParasiteConfig> {
  const configFilePath = path.resolve(process.cwd(), "parasite.conf.json");

  if (!fs.existsSync(configFilePath)) {
    // It's not an error to not have a config file, commands should rely on options.
    return {};
  }

  try {
    const config = await fs.readJson(configFilePath);
    return config as ParasiteConfig;
  } catch (error) {
    console.error(chalk.red("❌ Erreur lors de la lecture ou de l'analyse du fichier parasite.conf.json:"), error);
    // Return empty config on error to avoid crashing, but log the error.
    return {};
  }
}
