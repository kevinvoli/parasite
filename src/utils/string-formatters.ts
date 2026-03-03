export function kebabCase(str: string): string {
  return str
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")  // keep acronyms together: HTTPRequest → HTTP-Request
    .replace(/([a-z])([A-Z])/g, "$1-$2")          // camel splits: myWord → my-Word
    .replace(/_+/g, "-")                            // underscores → hyphens
    .replace(/-+/g, "-")                            // collapse consecutive hyphens
    .toLowerCase()
    .replace(/^-/, "");                             // strip leading hyphen
}

export function camelCase(str: string): string {
  if (!str.includes("_")) {
    return str.charAt(0).toLowerCase() + str.slice(1);
  }
  const parts = str.split(/_+/);
  return parts
    .map((part, i) =>
      i === 0
        ? part.toLowerCase()
        : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    )
    .join("");
}

export function toPascalCase(str: string): string {
  const camel = camelCase(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

const IRREGULAR_PLURALS: Record<string, string> = {
  people: "person",
  children: "child",
  men: "man",
  women: "woman",
  teeth: "tooth",
  feet: "foot",
  mice: "mouse",
  geese: "goose",
};

const INVARIANT_WORDS = new Set(["news", "series", "species", "deer", "sheep", "fish", "information"]);

export function toSingular(word: string): string {
  if (IRREGULAR_PLURALS[word]) return IRREGULAR_PLURALS[word];     // people → person
  if (INVARIANT_WORDS.has(word)) return word;                       // news → news
  if (word.endsWith("ies")) return word.slice(0, -3) + "y";       // categories → category
  if (word.endsWith("ses") || word.endsWith("xes") || word.endsWith("zes"))
    return word.slice(0, -2);                                       // addresses → address
  if (word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us"))
    return word.slice(0, -1);                                       // users → user
  return word;                                                      // status → status
}
