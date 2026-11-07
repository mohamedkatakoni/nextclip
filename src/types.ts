export interface TweetStats {
  replies?: number;
  reposts?: number;
  likes?: number;
  views?: number;
  quotes?: number;
  bookmarks?: number;
}

export interface TweetImage {
  mediaId: string;
  url: string;
  width?: number;
  height?: number;
}

export interface TweetVideo {
  mediaId: string;
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  duration?: number;
  format?: string;
}

export interface TweetPost {
  id: string;
  url: string;
  text: string;
  createdAt?: string;
  createdAtLabel?: string;
  stats: TweetStats;
  images: TweetImage[];
  videos: TweetVideo[];
  source: "bootstrap" | "dom" | "merged" | "fxtwitter";
}

export interface Profile {
  name: string;
  handle: string;
  bio?: string;
  location?: string;
  followers?: number;
  following?: number;
  posts?: number;
  joinedAt?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  verified?: boolean;
}

export interface BootstrapData {
  profile: Partial<Profile>;
  posts: TweetPost[];
}

export interface ScrapeResult {
  profile: Profile;
  posts: TweetPost[];
  loginWallReached: boolean;
  authUsed: boolean;
  warnings: string[];
}
