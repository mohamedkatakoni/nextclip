import path from "path";
import process from "node:process";

try { process.loadEnvFile(".env"); } catch {}

function env(name: string, fallback = ""): string {
  return (process.env[name] ?? fallback).trim();
}
function envInt(name: string, fallback: number, min = 0, max = 1000): number {
  const v = Number.parseInt(process.env[name] ?? "", 10);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}
function envBool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v.trim() === "") return fallback;
  return ["1","true","yes","on"].includes(v.trim().toLowerCase());
}

const accounts = env("X_ACCOUNTS", "Nocapmedia,JCFights")
  .split(",").map(s => s.trim().replace(/^@/, "")).filter(Boolean);

export const config = {
  accounts,
  maxPosts: envInt("MAX_POSTS", 15, 1, 100),
  headless: envBool("HEADLESS", true),
  timeoutMs: envInt("BROWSER_TIMEOUT_MS", 60000, 10000, 300000),
  requestTimeoutMs: envInt("REQUEST_TIMEOUT_MS", 60000, 5000, 180000),
  userDataDir: path.resolve(env("USER_DATA_DIR", "./zalda2")),
  outputDir: path.resolve(env("OUTPUT_DIR", "output")),
  logoPath: path.resolve(env("LOGO_PATH", "./logo.png")),
  igAccountId: env("INSTAGRAM_ACCOUNT_ID"),
  igAccessToken: env("FACEBOOK_ACCESS_TOKEN"),
  graphVersion: env("GRAPH_API_VERSION", "v21.0"),
  ollamaApiKey: env("OLLAMA_API_KEY"),
  ollamaBaseUrl: env("OLLAMA_BASE_URL", "https://ollama.com/v1"),
  ollamaModel: env("OLLAMA_MODEL", "gemma4"),
  groqApiKey: env("GROQ_API_KEY"),
  groqBaseUrl: env("GROQ_BASE_URL", "https://api.groq.com/openai/v1"),
  groqModel: env("GROQ_MODEL", "meta-llama/llama-4-scout-17b-16e-instruct"),
  databaseUrl: env("DATABASE_URL"),
  pageName: env("PAGE_NAME", "nextclip"),
  debug: envBool("DEBUG", false),
};
export function graphUrl(version: string, p: string): string {
  return `https://graph.facebook.com/${version}${p}`;
}
export type Config = typeof config;