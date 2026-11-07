import axios from "axios";
import fs from "fs";
import { graphUrl } from "./config";

export interface InstagramPostResult {
  id: string;
  containerId: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Post a video (as a Reel) to an Instagram professional account using the
 * resumable upload protocol.
 *
 * Steps:
 *  1. Create a resumable container (media_type=REELS, upload_type=resumable)
 *  2. Upload the bytes to rupload.facebook.com
 *  3. Poll the container until status_code === FINISHED
 *  4. Publish the container
 */
export async function postVideoToInstagram(
  version: string,
  igUserId: string,
  accessToken: string,
  videoPath: string,
  caption: string
): Promise<InstagramPostResult> {
  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video file not found: ${videoPath}`);
  }

  const stat = fs.statSync(videoPath);
  const fileSize = stat.size;

  // 1. Create resumable container
  const createUrl = graphUrl(version, `/${igUserId}/media`);
  const createRes = await axios.post(createUrl, null, {
    params: {
      media_type: "REELS",
      upload_type: "resumable",
      caption,
      access_token: accessToken,
    },
  });

  const containerId: string = createRes.data?.id;
  const uploadUri: string = createRes.data?.uri;
  if (!containerId || !uploadUri) {
    throw new Error(
      `Failed to create IG container: ${JSON.stringify(createRes.data)}`
    );
  }

  // 2. Upload bytes
  const uploadRes = await axios.post(uploadUri, fs.readFileSync(videoPath), {
    headers: {
      Authorization: `OAuth ${accessToken}`,
      offset: "0",
      "file_size": String(fileSize),
      "Content-Type": "application/octet-stream",
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: 10 * 60 * 1000,
  });

  if (!uploadRes.data?.success) {
    throw new Error(`IG upload failed: ${JSON.stringify(uploadRes.data)}`);
  }

  // 3. Poll container status
  const statusUrl = graphUrl(version, `/${containerId}`);
  const maxAttempts = 60;
  for (let i = 0; i < maxAttempts; i++) {
    const statusRes = await axios.get(statusUrl, {
      params: { fields: "status_code,status", access_token: accessToken },
    });
    const code = statusRes.data?.status_code;
    if (code === "FINISHED") break;
    if (code === "ERROR" || code === "EXPIRED") {
      throw new Error(
        `IG container failed: ${JSON.stringify(statusRes.data)}`
      );
    }
    await sleep(5000);
  }

  // 4. Publish
  const publishUrl = graphUrl(version, `/${igUserId}/media_publish`);
  const publishRes = await axios.post(publishUrl, null, {
    params: {
      creation_id: containerId,
      access_token: accessToken,
    },
  });

  const mediaId: string = publishRes.data?.id;
  if (!mediaId) {
    throw new Error(`IG publish failed: ${JSON.stringify(publishRes.data)}`);
  }

  return { id: mediaId, containerId };
}