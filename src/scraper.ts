import fs from "node:fs/promises";
import path from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { extractBootstrapData, extractMetaProfile, mergeProfile } from "./bootstrap.js";
import type { Profile, ScrapeResult, TweetPost } from "./types.js";
import { config } from "./config.js";
import { ensureDir, sleep } from "./util.js";

function parseCompactCount(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const cleaned = value.trim().replace(/,/g, "").replace(/\s+/g, "");
  const match = cleaned.match(/^([\d.]+)([KMB])?$/i);
  if (!match) return undefined;
  const number = Number.parseFloat(match[1] ?? "");
  if (!Number.isFinite(number)) return undefined;
  const mult = match[2]?.toUpperCase() === "K" ? 1000 : match[2]?.toUpperCase() === "M" ? 1e6 : match[2]?.toUpperCase() === "B" ? 1e9 : 1;
  return Math.round(number * mult);
}

function mediaIdFromUrl(url: string): string {
  return url.match(/pbs\.twimg\.com\/media\/([^?/.]+)/)?.[1] ?? url;
}

function mergeImages(bootstrap: any[], dom: any[]): any[] {
  const byId = new Map();
  for (const image of [...bootstrap, ...dom]) {
    const id = mediaIdFromUrl(image.url) || image.mediaId;
    const existing = byId.get(id);
    if (!existing) { byId.set(id, { ...image, mediaId: id }); continue; }
    byId.set(id, { ...existing, url: existing.url || image.url, width: existing.width ?? image.width, height: existing.height ?? image.height });
  }
  return [...byId.values()];
}

function mergePosts(bootstrapPosts: TweetPost[], domPosts: any[], profileHandle: string, maxPosts: number): TweetPost[] {
  const bootstrapById = new Map(bootstrapPosts.map((p) => [p.id, p]));
  const domById = new Map(domPosts.map((p: any) => [p.id, p]));
  const orderedIds = [...new Set([...bootstrapPosts.map(p=>p.id), ...domPosts.map((p:any)=>p.id)])];
  const merged: TweetPost[] = [];
  for (const id of orderedIds) {
    const b = bootstrapById.get(id);
    const d = domById.get(id);
    if (b && d) {
      merged.push({ ...b, url: b.url, text: b.text || d.text, createdAt: b.createdAt ?? d.createdAt, stats: { ...b.stats, views: d.stats?.views }, images: mergeImages(b.images, d.images), videos: b.videos.length > 0 ? b.videos : d.videos, source: "merged" });
    } else if (b) {
      merged.push({ ...b });
    } else if (d) {
      merged.push({ ...d, source: "dom" } as TweetPost);
    }
  }
  return merged.filter((p) => p.text.trim() !== "" || p.images.length > 0 || p.videos.length > 0).slice(0, maxPosts);
}

async function extractDomPosts(page: Page): Promise<any[]> {
  const raw = await page.$$eval("article", (articles) => {
    return articles.map((article) => {
      const statusLinks = Array.from(article.querySelectorAll('a[href*="/status/"]')).map((a) => a.getAttribute("href") ?? "");
      const statusLink = statusLinks.find((href) => /^\/[^/]+\/status\/\d+$/.test(href)) ?? statusLinks[0] ?? "";
      const statusMatch = statusLink.match(/^\/([^/]+)\/status\/(\d+)/);
      const id = statusMatch?.[2] ?? "";
      const authorHandle = statusMatch?.[1] ?? "";
      const textElement = article.querySelector('div[class*="whitespace-pre-wrap"]') ?? article.querySelector('[data-testid="tweetText"]');
      const text = (textElement as HTMLElement | null)?.innerText?.trim() ?? "";
      const images = Array.from(article.querySelectorAll('img[src*="pbs.twimg.com/media/"]')).map((image) => {
        const el = image as HTMLImageElement;
        const src = el.getAttribute("src") ?? el.currentSrc ?? "";
        return { mediaId: src.match(/pbs\.twimg\.com\/media\/([^?/.]+)/)?.[1] ?? src, url: src, width: el.naturalWidth || undefined, height: el.naturalHeight || undefined };
      });
      const stat = (action: string) => (article.querySelector(`[data-engagement-action="${action}"]`) as HTMLElement | null)?.innerText;
      const timeAnchor = Array.from(article.querySelectorAll('a[href*="/status/"]')).find((a) => new RegExp(`/status/${id}$`).test(a.getAttribute("href") ?? "") && (a.textContent ?? "").trim() !== "");
      return { id, authorHandle, url: statusLink ? `https://x.com${statusLink}` : "", text, createdAt: timeAnchor?.querySelector("time")?.getAttribute("datetime") ?? undefined, createdAtLabel: (timeAnchor?.textContent ?? "").trim() || undefined, stats: { replies: stat("reply"), reposts: stat("retweet"), likes: stat("like"), views: stat("generic") }, images, videos: [] };
    });
  });
  return raw.filter((p: any) => /^\d+$/.test(p.id)).map((p: any) => ({
    ...p,
    stats: { replies: parseCompactCount(p.stats.replies), reposts: parseCompactCount(p.stats.reposts), likes: parseCompactCount(p.stats.likes), views: parseCompactCount(p.stats.views) },
    images: p.images.map((i: any) => ({ ...i, mediaId: i.mediaId || mediaIdFromUrl(i.url) })),
  }));
}

export async function scrapeProfile(username: string, maxPosts: number): Promise<ScrapeResult> {
  const profileUrl = `https://x.com/${encodeURIComponent(username)}`;
  console.log(`Opening ${profileUrl} ...`);
  const browser = await puppeteer.launch({
    headless: config.headless,
    userDataDir: config.userDataDir,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled", "--disable-gpu"],
    defaultViewport: { width: 1280, height: 900 },
  });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument("globalThis.__name = globalThis.__name || ((fn) => fn);");
  const warnings: string[] = [];
  try {
    await page.setUserAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36");
    const response = await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: config.timeoutMs });
    if (!response || !response.ok()) throw new Error(`X returned HTTP ${response?.status()} for ${profileUrl}`);
    const initialHtml = await response.text().catch(() => "");
    await page.waitForFunction(() => document.querySelectorAll("article").length > 0 || /Log in or sign up for X/i.test(document.body.innerText), { timeout: 20000 }).catch(() => {});
    await sleep(2500);

    let bootstrap: any = { profile: {}, posts: [] };
    if (initialHtml) {
      try { bootstrap = extractBootstrapData(initialHtml); } catch (e) { warnings.push(`bootstrap parse failed: ${(e as Error).message}`); }
    }

    let domPosts = await extractDomPosts(page);
    let posts = mergePosts(bootstrap.posts ?? [], domPosts, bootstrap.profile?.handle ?? username, maxPosts);
    let stableRounds = 0, previousCount = posts.length;
    for (let round = 0; round < 3 && posts.length < maxPosts; round++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForNetworkIdle({ idleTime: 700, timeout: 5000 }).catch(() => {});
      await sleep(800);
      domPosts = await extractDomPosts(page);
      posts = mergePosts(bootstrap.posts ?? [], domPosts, bootstrap.profile?.handle ?? username, maxPosts);
      if (posts.length <= previousCount) { stableRounds++; if (stableRounds >= 2) break; } else stableRounds = 0;
      previousCount = posts.length;
      console.log(`  loaded ${posts.length} post(s) ...`);
    }

    const metaProfile = extractMetaProfile(initialHtml || (await page.content().catch(() => "")));
    const profile = mergeProfile(metaProfile, bootstrap.profile ?? {}, username);

    if (posts.length === 0) {
      warnings.push("No posts found.");
      await saveDebug(page);
    }

    return { profile, posts, loginWallReached: false, authUsed: true, warnings };
  } finally {
    await browser.close().catch(() => {});
  }
}

async function saveDebug(page: Page): Promise<void> {
  const dir = path.join(config.outputDir, "debug");
  await ensureDir(dir);
  await page.screenshot({ path: path.join(dir, "page.png") }).catch(() => {});
  const html = await page.content().catch(() => "");
  if (html) await fs.writeFile(path.join(dir, "page.html"), html);
}