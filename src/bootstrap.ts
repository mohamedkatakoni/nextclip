import type { BootstrapData, Profile, TweetImage, TweetPost, TweetStats, TweetVideo } from "./types.js";
import { decodeHtmlEntities, extractLinkHref, extractMeta, unique } from "./util.js";

type JsonObject = Record<string, unknown>;

function readJsString(source: string, quoteIndex: number): { value: string; end: number } {
  const quote = source[quoteIndex];
  let value = "";
  let index = quoteIndex + 1;

  while (index < source.length) {
    const char = source[index]!;
    if (char === "\\") {
      const next = source[index + 1];
      if (next === "u") {
        value += String.fromCharCode(Number.parseInt(source.slice(index + 2, index + 6), 16));
        index += 6;
        continue;
      }
      if (next === "x") {
        value += String.fromCharCode(Number.parseInt(source.slice(index + 2, index + 4), 16));
        index += 4;
        continue;
      }
      const escapes: Record<string, string> = {
        n: "\n",
        r: "\r",
        t: "\t",
        b: "\b",
        f: "\f",
        v: "\v",
        "0": "\0",
        "\\": "\\",
        '"': '"',
        "'": "'",
        "/": "/",
      };
      value += escapes[next ?? ""] ?? next ?? "";
      index += 2;
      continue;
    }
    if (char === quote) return { value, end: index + 1 };
    value += char;
    index++;
  }

  return { value, end: source.length };
}

function decodeResultValues(html: string): unknown[] {
  const values: unknown[] = [];
  const marker = /kind:\s*["']Result\.Ok["']\s*,\s*value:\s*/g;
  for (const match of html.matchAll(marker)) {
    const quoteIndex = (match.index ?? 0) + match[0].length;
    const quote = html[quoteIndex];
    if (quote !== '"' && quote !== "'") continue;
    try {
      const { value } = readJsString(html, quoteIndex);
      values.push(JSON.parse(value));
    } catch {
      // Ignore stream entries that are not plain JSON strings.
    }
  }
  return values;
}

function asObject(value: unknown): JsonObject | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function extractProfile(value: JsonObject): Partial<Profile> | undefined {
  const data = asObject(value.data);
  const userResult = asObject(data?.user_result_by_screen_name);
  const user = asObject(userResult?.result);
  if (!user) return undefined;

  const core = asObject(user.core);
  const legacy = asObject(user.legacy);
  const bio = asObject(user.profile_bio);
  const relationship = asObject(user.relationship_counts);
  const avatar = asObject(user.avatar);
  const banner = asObject(user.banner);
  const verification = asObject(user.verification);
  const location = asObject(user.location);
  const tweetCounts = asObject(user.tweet_counts);
  const createdAtMs = asNumber(core?.created_at_ms) ?? asNumber(user.created_at_ms);

  const name = asString(core?.name);
  const handle = asString(core?.screen_name);
  if (!name && !handle) return undefined;

  return {
    name: name ?? handle ?? "",
    handle: handle ?? "",
    bio: asString(bio?.description) ?? asString(user.description) ?? asString(legacy?.description),
    location: asString(location?.location) ?? asString(user.location),
    followers: asNumber(relationship?.followers),
    following: asNumber(relationship?.following),
    posts: asNumber(tweetCounts?.tweets),
    joinedAt: createdAtMs ? new Date(createdAtMs).toISOString() : undefined,
    avatarUrl: asString(avatar?.image_url),
    bannerUrl: asString(banner?.image_url),
    verified: verification?.is_blue_verified === true,
  };
}

function pickMediaUrl(media: JsonObject): string | undefined {
  return (
    asString(media.media_url_https) ??
    asString(media.media_url) ??
    asString(media.url)
  );
}

function extractMedia(result: JsonObject): TweetImage[] {
  const images: TweetImage[] = [];
  const seen = new Set<string>();

  const push = (media: unknown): void => {
    const item = asObject(media);
    if (!item) return;
    const type = asString(item.type);
    if (type && type !== "photo") return;
    const url = pickMediaUrl(item);
    if (!url || seen.has(url)) return;
    seen.add(url);
    const sizes = asObject(item.sizes);
    const original = asObject(item.original_info) ?? asObject(sizes?.large);
    const idStr = asString(item.id_str) ?? asString(item.media_key) ?? url.match(/media\/([^.?]+)/)?.[1] ?? url;
    images.push({
      mediaId: idStr,
      url,
      width: asNumber(original?.width),
      height: asNumber(original?.height),
    });
  };

  for (const [key, value] of Object.entries(result)) {
    if (key.startsWith("media_entities") && Array.isArray(value)) value.forEach(push);
  }

  const legacy = asObject(result.legacy);
  const extended = asObject(legacy?.extended_entities);
  const entities = asObject(legacy?.entities);
  if (Array.isArray(extended?.media)) extended.media.forEach(push);
  else if (Array.isArray(entities?.media)) entities.media.forEach(push);

  return images;
}

function extractVideos(result: JsonObject): TweetVideo[] {
  const videos: TweetVideo[] = [];
  const seen = new Set<string>();

  const push = (media: unknown): void => {
    const item = asObject(media);
    if (!item) return;
    const type = asString(item.type);
    if (type !== "video" && type !== "animated_gif") return;

    const videoInfo = asObject(item.video_info);
    const variants = Array.isArray(videoInfo?.variants)
      ? videoInfo.variants.map(asObject).filter((variant): variant is JsonObject => Boolean(variant))
      : [];
    const mp4 = variants
      .filter((variant) => asString(variant.content_type) === "video/mp4" && asString(variant.url))
      .sort((left, right) => (asNumber(right.bitrate) ?? 0) - (asNumber(left.bitrate) ?? 0))[0];
    const url = asString(mp4?.url) ?? pickMediaUrl(item);
    if (!url || seen.has(url)) return;
    seen.add(url);

    const original = asObject(item.original_info);
    const idStr = asString(item.id_str) ?? asString(item.media_key) ?? url.match(/\/([^/.?]+)\.mp4/)?.[1] ?? url;
    videos.push({
      mediaId: idStr,
      url,
      thumbnailUrl: asString(item.media_url_https) ?? asString(item.media_url),
      width: asNumber(original?.width),
      height: asNumber(original?.height),
      duration: asNumber(videoInfo?.duration_millis) ? (asNumber(videoInfo?.duration_millis) ?? 0) / 1_000 : undefined,
      format: asString(mp4?.content_type),
    });
  };

  for (const [key, value] of Object.entries(result)) {
    if (key.startsWith("media_entities") && Array.isArray(value)) value.forEach(push);
  }

  const legacy = asObject(result.legacy);
  const extended = asObject(legacy?.extended_entities);
  const entities = asObject(legacy?.entities);
  if (Array.isArray(extended?.media)) extended.media.forEach(push);
  else if (Array.isArray(entities?.media)) entities.media.forEach(push);

  return videos;
}

function extractTweet(tweetResults: JsonObject): TweetPost | undefined {
  const outerResult = asObject(tweetResults.result);
  if (!outerResult) return undefined;

  let result = outerResult;
  if (asString(result.__typename) === "TweetWithVisibilityResults") {
    result = asObject(result.tweet) ?? result;
  }

  const legacyResult = asObject(result.legacy);
  const id = asString(tweetResults.rest_id) ?? asString(result.rest_id) ?? asString(legacyResult?.id_str);
  if (!id || !/^\d+$/.test(id)) return undefined;

  const details = asObject(result.details) ?? {};
  const legacy = asObject(result.legacy) ?? {};
  const counts = asObject(result.counts) ?? {};
  const text = asString(details.full_text) ?? asString(legacy.full_text) ?? "";
  const createdAtMs = asNumber(details.created_at_ms) ?? (asString(legacy.created_at) ? Date.parse(asString(legacy.created_at)!) : undefined);
  const core = asObject(result.core);
  const userResults = asObject(core?.user_results);
  const userResult = asObject(userResults?.result);
  const userCore = asObject(userResult?.core);
  const screenName = asString(userCore?.screen_name) ?? asString(legacy.screen_name);

  const stats: TweetStats = {
    replies: asNumber(counts.reply_count) ?? asNumber(legacy.reply_count),
    reposts: asNumber(counts.retweet_count) ?? asNumber(legacy.retweet_count),
    likes: asNumber(counts.favorite_count) ?? asNumber(legacy.favorite_count),
    quotes: asNumber(counts.quote_count) ?? asNumber(legacy.quote_count),
    bookmarks: asNumber(counts.bookmark_count) ?? asNumber(legacy.bookmark_count),
  };

  return {
    id,
    url: `https://x.com/${screenName ?? "i"}/status/${id}`,
    text,
    createdAt: createdAtMs && Number.isFinite(createdAtMs) ? new Date(createdAtMs).toISOString() : undefined,
    stats,
    images: extractMedia(result),
    videos: extractVideos(result),
    source: "bootstrap",
  };
}

function collectTweets(value: unknown, posts: Map<string, TweetPost>, visited: Set<unknown>): void {
  const node = asObject(value);
  if (!node || visited.has(node)) return;
  visited.add(node);

  const tweetResults = asObject(node.tweet_results);
  if (tweetResults) {
    const tweet = extractTweet(tweetResults);
    if (tweet && !posts.has(tweet.id)) posts.set(tweet.id, tweet);
    return;
  }

  for (const child of Object.values(node)) {
    if (Array.isArray(child)) {
      for (const item of child) collectTweets(item, posts, visited);
    } else if (child && typeof child === "object") {
      collectTweets(child, posts, visited);
    }
  }
}

export function extractBootstrapData(html: string): BootstrapData {
  const decoded = decodeResultValues(html);
  let profile: Partial<Profile> | undefined;
  const posts = new Map<string, TweetPost>();
  const visited = new Set<unknown>();

  for (const value of decoded) {
    const obj = asObject(value);
    if (!obj) continue;
    const profileCandidate = extractProfile(obj);
    if (profileCandidate && profileCandidate.handle && !profile) profile = profileCandidate;

    const data = asObject(obj.data);
    const userResult = asObject(asObject(data?.user_result_by_screen_name)?.result);
    if (!userResult) continue;

    const timeline =
      asObject(userResult.profile_user_originals_timeline) ??
      asObject(userResult.profile_user_timeline) ??
      asObject(userResult.profile_user_replies_timeline) ??
      asObject(userResult.profile_user_media_timeline);

    if (timeline) collectTweets(timeline, posts, visited);
  }

  return {
    profile: profile ?? {},
    posts: [...posts.values()],
  };
}

export function extractMetaProfile(html: string): Partial<Profile> {
  const title = html.match(/<title>([^<]*)<\/title>/i)?.[1];
  const decodedTitle = title ? decodeHtmlEntities(title) : "";
  const titleMatch = decodedTitle.match(/^(.*?)\s*\(@([A-Za-z0-9_]+)\)/);
  const handleFromMeta = extractMeta(html, "profile:username");
  const handle = handleFromMeta ?? titleMatch?.[2] ?? "";
  const name = extractMeta(html, "og:title")?.replace(/\s+on X$/i, "").replace(/\s*\(@[^)]+\).*$/, "") ?? titleMatch?.[1] ?? handle;

  const avatarFromPreload = html.match(/<link[^>]+as=["']image["'][^>]+href=["']([^"']*profile_images[^"']*)["']/i)?.[1];
  const avatar =
    avatarFromPreload ??
    extractMeta(html, "og:image") ??
    extractLinkHref(html, "preload");

  return {
    name: name.trim(),
    handle,
    bio: extractMeta(html, "description"),
    avatarUrl: avatar ? decodeHtmlEntities(avatar) : undefined,
  };
}

export function mergeProfile(meta: Partial<Profile>, bootstrap: Partial<Profile>, fallbackHandle: string): Profile {
  return {
    name: bootstrap.name || meta.name || fallbackHandle,
    handle: bootstrap.handle || meta.handle || fallbackHandle,
    bio: bootstrap.bio ?? meta.bio,
    location: bootstrap.location,
    followers: bootstrap.followers,
    following: bootstrap.following,
    posts: bootstrap.posts,
    joinedAt: bootstrap.joinedAt,
    avatarUrl: bootstrap.avatarUrl ?? meta.avatarUrl,
    bannerUrl: bootstrap.bannerUrl,
    verified: bootstrap.verified,
  };
}

export function normalizeHandleList(values: string[]): string[] {
  return unique(values.map((value) => value.trim()).filter(Boolean));
}
