import path from "path";
import { config } from "./config.js";
import { scrapeProfile } from "./scraper.js";
import { chooseBestVideo, generateCaption, generateHashtags } from "./ai.js";
import { downloadVideo, addLogo, cleanupDir } from "./video.js";
import { postVideoToInstagram } from "./instagram.js";
import { prisma, closeDb } from "./db.js";
import type { TweetPost } from "./types.js";
import { truncate } from "./util.js";

async function main(): Promise<void> {
  console.log("=== nextclip pipeline ===");
  console.log("Accounts:", config.accounts.join(", "));

  // 1. Scrape
  const allPosts: { account: string; post: TweetPost }[] = [];
  for (const acct of config.accounts) {
    console.log(`\n--- Scraping @${acct} ---`);
    try {
      const res = await scrapeProfile(acct, config.maxPosts);
      console.log(`Scraped ${res.posts.length} posts (${res.posts.filter(p=>p.videos.length>0).length} with video).`);
      for (const w of res.warnings) console.log("[note]", w);
      for (const p of res.posts) allPosts.push({ account: acct, post: p });
    } catch (e) {
      console.error(`[error] scrape @${acct}:`, (e as Error).message);
    }
  }

  const candidates = allPosts.filter(({ post }) => post.videos && post.videos.length > 0);
  if (candidates.length === 0) {
    console.log("No video posts found. Exiting.");
    return;
  }
  console.log(`\nTotal video candidates: ${candidates.length}`);

  // 2. Dedup against DB
  const existing = await prisma.postedVideo.findMany({ select: { id: true, status: true } });
  const doneIds = new Set(existing.filter(e => e.status === "posted" || e.status === "pending").map(e => e.id));
  const fresh = candidates.filter(({ post }) => !doneIds.has(post.id));
  if (fresh.length === 0) {
    console.log("All candidates already posted/pending. Exiting.");
    return;
  }
  console.log(`Fresh candidates: ${fresh.length}`);

  // 3. Choose best
  const chosenWrapper = await chooseBestVideo(fresh.map(f => f.post));
  const chosenEntry = fresh.find(f => f.post.id === chosenWrapper.id)!;
  const chosen = chosenEntry.post;
  const account = chosenEntry.account;
  console.log(`Chosen: ${chosen.id} from @${account}`);

  // 4. Generate caption + hashtags
  const profile = { name: account, handle: account, bio: "", location: "", verified: false } as any;
  const captionBase = await generateCaption(chosen, profile);
  const tags = await generateHashtags(captionBase, chosen);
  const caption = `${captionBase}\n\n${tags.join(" ")}\n\nFollow @${config.pageName} for more!`;
  console.log("\nCaption:\n" + caption);

  // 5. Download + watermark
  const videoUrl = chosen.videos[0]!.url;
  console.log("Downloading:", videoUrl);
  const rawPath = await downloadVideo(videoUrl);
  const rawDir = path.dirname(rawPath);
  let wmPath = rawPath;
  try {
    wmPath = await addLogo(rawPath, config.logoPath);
  } catch (e) {
    console.warn("[warn] logo overlay failed, using raw video:", (e as Error).message);
  }

  // 6. Post to Instagram
  let igMediaId: string | null = null;
  let status = "failed";
  let errorMsg: string | null = null;
  try {
    const res = await postVideoToInstagram(config.graphVersion, config.igAccountId, config.igAccessToken, wmPath, caption);
    igMediaId = res.id;
    status = "posted";
    console.log("Posted to IG:", igMediaId);
  } catch (e) {
    errorMsg = truncate((e as Error).message, 1000);
    console.error("IG post failed:", errorMsg);
  }

  // 7. Record in DB
  await prisma.postedVideo.upsert({
    where: { id: chosen.id },
    update: { status, igMediaId, error: errorMsg, postedAt: status === "posted" ? new Date() : undefined, caption, videoUrl },
    create: {
      id: chosen.id,
      account,
      url: chosen.url,
      text: chosen.text,
      caption,
      videoUrl,
      igMediaId,
      status,
      error: errorMsg,
      postedAt: status === "posted" ? new Date() : undefined,
    },
  });

  // cleanup
  await cleanupDir(rawDir);
  if (wmPath !== rawPath) await cleanupDir(path.dirname(wmPath));

  if (status !== "posted") {
    throw new Error("Pipeline failed to post.");
  }
}

main()
  .catch((e) => { console.error("\nFailed:", e); process.exitCode = 1; })
  .finally(async () => { await closeDb(); });