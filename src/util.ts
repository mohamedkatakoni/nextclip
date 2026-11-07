import fs from "node:fs/promises";

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function collapseSpaces(value: string): string {
  return value.replace(/[^\S\n]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function truncate(value: string, max: number): string {
  const clean = collapseSpaces(value);
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/**
 * Cut text to a maximum length at a sentence or word boundary without adding
 * an ellipsis. Used only when the AI shortening call is unavailable.
 */
export function shortenAtBoundary(value: string, max: number): string {
  const clean = collapseSpaces(value);
  const characters = Array.from(clean);
  if (characters.length <= max) return clean;

  let candidate = characters.slice(0, Math.max(1, max)).join("").trimEnd();
  const lastBreak = Math.max(
    candidate.lastIndexOf("\n"),
    candidate.lastIndexOf(" "),
    candidate.lastIndexOf("."),
    candidate.lastIndexOf("!"),
    candidate.lastIndexOf("?"),
    candidate.lastIndexOf("،"),
  );

  if (lastBreak >= Math.floor(max * 0.55)) {
    const breakCharacter = candidate[lastBreak];
    candidate = candidate
      .slice(0, breakCharacter === " " || breakCharacter === "\n" ? lastBreak : lastBreak + 1)
      .trimEnd();
  }

  candidate = candidate.replace(/[.,;:…\-–—]+$/u, "").trimEnd();
  if (candidate && Array.from(candidate).length < max && !/[.!?…]$/u.test(candidate)) {
    candidate += ".";
  }
  return candidate;
}

export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

export function extractMeta(html: string, key: string): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtmlEntities(match[1]);
  }
  return undefined;
}

export function extractLinkHref(html: string, rel: string): string | undefined {
  const escaped = rel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`<link[^>]+rel=["']${escaped}["'][^>]+href=["']([^"']+)["']`, "i"));
  return match?.[1] ? decodeHtmlEntities(match[1]) : undefined;
}
