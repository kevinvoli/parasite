import chalk from "chalk";

type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

let currentLevel: LogLevel = "info";

export const logger = {
  setLevel(level: LogLevel): void {
    currentLevel = level;
  },

  debug(msg: string): void {
    if (LEVEL_ORDER[currentLevel] <= LEVEL_ORDER.debug) {
      console.log(chalk.gray(`[debug] ${msg}`));
    }
  },

  info(msg: string): void {
    if (LEVEL_ORDER[currentLevel] <= LEVEL_ORDER.info) {
      console.log(chalk.blue(msg));
    }
  },

  success(msg: string): void {
    if (LEVEL_ORDER[currentLevel] <= LEVEL_ORDER.info) {
      console.log(chalk.green(msg));
    }
  },

  warn(msg: string): void {
    if (LEVEL_ORDER[currentLevel] <= LEVEL_ORDER.warn) {
      console.warn(chalk.yellow(msg));
    }
  },

  error(msg: string): void {
    if (LEVEL_ORDER[currentLevel] <= LEVEL_ORDER.error) {
      console.error(chalk.red(msg));
    }
  },
};
