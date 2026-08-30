import fs from "node:fs";
import path from "node:path";

/**
 * Carga el system prompt de EGO desde ego-system-prompt.md.
 * Fuente única de verdad: se edita el .md, no este archivo.
 * Cacheado en memoria tras la primera lectura (el proceso de Node vive
 * mientras dure la instancia del servidor).
 */
let cached: string | null = null;

export function getEgoSystemPrompt(): string {
  if (cached) return cached;
  const filePath = path.join(process.cwd(), "lib", "ego-system-prompt.md");
  cached = fs.readFileSync(filePath, "utf-8");
  return cached;
}
