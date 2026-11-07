import OpenAI from "openai";
import { config } from "./config.js";
import type { TweetPost, Profile } from "./types.js";
import { collapseSpaces, truncate } from "./util.js";

interface Provider { name: string; model: string; client: OpenAI; }

function buildProviders(): Provider[] {
  const out: Provider[] = [];
  if (config.ollamaApiKey) out.push({ name: "Ollama", model: config.ollamaModel, client: new OpenAI({ apiKey: config.ollamaApiKey, baseURL: config.ollamaBaseUrl, timeout: config.requestTimeoutMs, maxRetries: 0 }) });
  if (config.groqApiKey) out.push({ name: "Groq", model: config.groqModel, client: new OpenAI({ apiKey: config.groqApiKey, baseURL: config.groqBaseUrl, timeout: config.requestTimeoutMs, maxRetries: 0 }) });
  return out;
}

async function chat(prompt: string, maxTokens = 500): Promise<string> {
  const providers = buildProviders();
  if (providers.length === 0) throw new Error("No AI provider configured");
  const failures: string[] = [];
  for (const p of providers) {
    try {
      const r = await p.client.chat.completions.create({ model: p.model, messages: [{ role: "user", content: prompt }], temperature: 0.3, max_tokens: maxTokens });
      const text = (r.choices[0]?.message?.content ?? "").trim();
      if (text) return text;
    } catch (e) {
      failures.push(`${p.name}: ${(e as Error).message}`);
    }
  }
  throw new Error(`All AI providers failed:\n${failures.join("\n")}`);
}

export async function chooseBestVideo(posts: TweetPost[]): Promise<TweetPost> {
  const withVideo = posts.filter(p => p.videos && p.videos.length > 0);
  if (withVideo.length === 0) throw new Error("No posts with video found");
  if (withVideo.length === 1) return withVideo[0]!;

  const list = withVideo.map((p, i) => {
    const v = p.videos[0]!;
    const dur = v.duration ? `${Math.round(v.duration)}s` : "?";
    const likes = p.stats.likes ?? 0;
    const views = p.stats.views ?? 0;
    return `[${i}] id=${p.id} likes=${likes} views=${views} dur=${dur}\nTEXT: ${truncate(p.text, 240)}`;
  }).join("\n\n");

  const prompt = `You are selecting the best short video (Reel) to repost on Instagram from an X (Twitter) account.

Pick the single most engaging, viral, clean, and visually appealing video. Prefer high views/likes, clear content, no watermarks, and a compelling hook. Avoid duplicates of the same topic.

Return ONLY the index number (e.g. 0) of the best choice. No explanation.

Candidates:
${list}`;

  const answer = await chat(prompt, 20);
  const match = answer.match(/\d+/);
  const idx = match ? Math.min(parseInt(match[0], 10), withVideo.length - 1) : 0;
  const chosen = withVideo[Math.max(0, idx)]!;
  console.log(`[ai] Chose video ${chosen.id} (index ${idx}) among ${withVideo.length} candidates`);
  return chosen;
}

export async function generateCaption(post: TweetPost, profile: Profile): Promise<string> {
  const prompt = `Write an engaging Instagram Reels caption for this video post originally from @${profile.handle} on X.

Original text:
${post.text}

Rules:
- English, natural, engaging, 1-3 short sentences.
- Add relevant emojis.
- Do not include source links or "translation" notes.
- Do not invent facts; stay true to the original text.
- End with a call-to-action like "Follow for more!".
Return only the caption (no hashtags).`;

  const caption = await chat(prompt, 300);
  return collapseSpaces(caption);
}

export async function generateHashtags(caption: string, post: TweetPost): Promise<string[]> {
  const prompt = `Generate 8-12 relevant Instagram hashtags for this Reel caption. Return a JSON array of strings only.

Caption: ${caption}
Original: ${truncate(post.text, 200)}

Rules: specific, relevant tags (topic, mood, format). Include #reels #viral where appropriate. No generic #fyp unless relevant. Return only JSON array.`;

  const raw = await chat(prompt, 200);
  let tags: string[] = [];
  try {
    const m = raw.match(/\[[\s\S]*\]/);
    const parsed = JSON.parse(m ? m[0] : raw);
    if (Array.isArray(parsed)) tags = parsed.filter((t) => typeof t === "string");
  } catch {
    tags = (raw.match(/#[A-Za-z0-9_]+/g) ?? []).slice(0, 12);
  }
  // normalize
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of tags) {
    const tag = t.trim().replace(/^#+/, "").replace(/[^A-Za-z0-9_]/g, "");
    if (!tag) continue;
    const norm = `#${tag}`;
    const key = norm.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(norm);
    if (out.length >= 15) break;
  }
  if (out.length === 0) out.push("#reels", "#viral", "#trending");
  return out;
}