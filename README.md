# nextclip

Post a video to an Instagram professional account (as a Reel) using the Facebook Graph API, with the caption:

> A man spotted people trespassing on his private riverfront property near his home and decided to drive them away by firing at them with an airsoft rifle

(Facebook Page posting is intentionally disabled.)

## Setup

```bash
npm install
```

1. Copy `.env.example` to `.env` and fill in your credentials (already done).
2. Drop your video file into `./videos/video.mp4` (or set `VIDEO_PATH` in `.env` / pass a path as a CLI arg).

## Run

```bash
# development (ts via tsx)
npm run dev

# or with a specific video file
npm run dev -- /path/to/your/video.mp4

# production
npm run build
npm start
```

## Environment variables

| Var | Description |
| --- | --- |
| `FACEBOOK_ACCESS_TOKEN` | Page access token with `instagram_content_publish` (page-scoped token works). |
| `INSTAGRAM_ACCOUNT_ID` | (required) Instagram professional account ID to post to. |
| `GRAPH_API_VERSION` | Graph API version (default `v21.0`). |
| `VIDEO_PATH` | Path to the video file (default `./videos/video.mp4`). |
| `POST_DESCRIPTION` | Caption for the post. |

## Notes

- Posting uses the Instagram resumable upload protocol (container -> upload -> poll -> publish).
- The access token is a page-scoped token for page `1337638566091036`; the linked IG account is `17841413933467391` (`thenextclip.hq`).
- A successful run prints the resulting Instagram media ID.