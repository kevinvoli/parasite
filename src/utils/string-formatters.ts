export function kebabCase(str: string): string {
  return str.replace(/[A-Z]/g, (match, offset) => (offset ? "-" : "") + match.toLowerCase());
}

export function camelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

export function toPascalCase(str: string): string {
  const camel = camelCase(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}
