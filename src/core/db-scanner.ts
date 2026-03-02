import { ParsedEntity } from "../types.js";

export interface DatabaseScanner {
  introspect(dbUrl: string, outputDir: string): Promise<ParsedEntity[]>;
}
