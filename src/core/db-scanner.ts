import { ParsedEntity } from "../types.js";

export interface DatabaseScanner {
  introspect(dbUrl: string): Promise<ParsedEntity[]>;
}
