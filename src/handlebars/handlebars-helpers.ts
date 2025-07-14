import Handlebars from "handlebars";

// Opérateurs logiques
Handlebars.registerHelper("eq", (a: any, b: any) => a === b);
Handlebars.registerHelper("ne", (a: any, b: any) => a !== b);
Handlebars.registerHelper("and", (a: any, b: any) => a && b);
Handlebars.registerHelper("or", (a: any, b: any) => a || b);

// Formatage
Handlebars.registerHelper("Capitalise", (str: string) =>
  str ? str.charAt(0).toUpperCase() + str.slice(1) : ""
);
Handlebars.registerHelper("lowercase", (str: string) =>
  str ? str.toLowerCase() : ""
);

// Tu peux ajouter d'autres helpers ici...

export default Handlebars;
