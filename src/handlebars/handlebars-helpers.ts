import Handlebars from "handlebars";
import { camelCase } from "typeorm/util/StringUtils.js";
// Opérateurs logiques
Handlebars.registerHelper("eq", (a: any, b: any) => a === b);
Handlebars.registerHelper("neq", (a: any, b: any) => a !== b);
Handlebars.registerHelper("ne", (a: any, b: any) => a !== b);
Handlebars.registerHelper("and", (a: any, b: any) => a && b);
Handlebars.registerHelper("or", (a: any, b: any) => a || b);
Handlebars.registerHelper("kebabCase", function (str) {
  return str.replace(/[A-Z]/g, (m: string, i: number) => (i > 0 ? "-" : "") + m.toLowerCase());
});

Handlebars.registerHelper('not', function(value) {
  return !value;
});
// Formatage
Handlebars.registerHelper("Capitalise", (str: string) =>
  str ? str.charAt(0).toUpperCase() + str.slice(1) : ""
);
Handlebars.registerHelper("lowercase", (str: string) =>
  str ? str.toLowerCase() : ""
);
Handlebars.registerHelper("camelCase", function (str: string) {
  return camelCase(str);
});

// Tu peux ajouter d'autres helpers ici...

export default Handlebars;
