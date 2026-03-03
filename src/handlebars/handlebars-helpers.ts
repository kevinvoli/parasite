import Handlebars from "handlebars";
import { camelCase, kebabCase as kebabCaseUtil } from "../utils/string-formatters.js";

// Opérateurs logiques
Handlebars.registerHelper("eq", (a: any, b: any) => a === b);
Handlebars.registerHelper("neq", (a: any, b: any) => a !== b);
Handlebars.registerHelper("and", (a: any, b: any) => a && b);
Handlebars.registerHelper("or", (a: any, b: any) => a || b);
Handlebars.registerHelper("not", (value: any) => !value);

// Formatage
Handlebars.registerHelper("kebabCase", (str: any) => (str && typeof str === "string") ? kebabCaseUtil(str) : "");
Handlebars.registerHelper("camelCase", (str: any) => (str && typeof str === "string") ? camelCase(str) : "");
Handlebars.registerHelper("Capitalise", (str: string) =>
  str ? str.charAt(0).toUpperCase() + str.slice(1) : ""
);
Handlebars.registerHelper("lowercase", (str: string) =>
  str ? str.toLowerCase() : ""
);

// TypeScript → SQL type mapping
const TS_TO_SQL: Record<string, string> = {
  number: "int",
  string: "varchar",
  boolean: "boolean",
  Date: "timestamp",
  any: "text",
};
Handlebars.registerHelper("toSqlType", (tsType: string) =>
  TS_TO_SQL[tsType] ?? "text"
);

// Date column detection helpers (handles snake_case and camelCase variants)
Handlebars.registerHelper("isCreatedAt", (name: string) => {
  const n = name.toLowerCase().replace(/_/g, "");
  return n === "createdat" || n === "datecreation" || n === "datecreated";
});
Handlebars.registerHelper("isUpdatedAt", (name: string) => {
  const n = name.toLowerCase().replace(/_/g, "");
  return n === "updatedat" || n === "datemodification" || n === "dateupdated";
});
Handlebars.registerHelper("isDeletedAt", (name: string) => {
  const n = name.toLowerCase().replace(/_/g, "");
  return n === "deletedat" || n === "datesuppression" || n === "datedeleted";
});

export default Handlebars;
