import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "./config.js";
import { ensureDir } from "./util.js";

const exec = promisify(execFile);

export async function downloadVideo(url: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nextclip-video-"));
  const filePath = path.join(dir, "video.mp4");
  const res = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0", referer: "https://x.com/" },
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`Video download HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) throw new Error(`Video too small (${buf.length})`);
  await fs.writeFile(filePath, buf);
  return filePath;
}

export async function addLogo(inputPath: string, logoPath: string): Promise<string> {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "nextclip-wm-"));
  const outPath = path.join(outDir, "watermarked.mp4");
  // top-right overlay, scale logo to ~15% of width
  const filter = "[1:v]scale=iw*0.15:-1[logo];[0:v][logo]overlay=W-w-20:20";
  await exec("ffmpeg", [
    "-y",
    "-i", inputPath,
    "-i", logoPath,
    "-filter_complex", filter,
    "-c:a", "copy",
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "23",
    "-movflags", "+faststart",
    outPath,
  ], { timeout: 300_000 });
  return outPath;
}

export async function cleanupDir(p: string): Promise<void> {
  await fs.rm(p, { recursive: true, force: true }).catch(() => {});
}