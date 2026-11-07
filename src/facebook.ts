import axios from "axios";
import FormData from "form-data";
import fs from "fs";
import { graphUrl } from "./config";

export interface FacebookPostResult {
  id: string;
}

/**
 * Post a video to a Facebook Page using a simple multipart upload.
 * Works well for small/medium files. For very large files use the
 * resumable upload flow instead.
 */
export async function postVideoToFacebookPage(
  version: string,
  pageId: string,
  accessToken: string,
  videoPath: string,
  description: string
): Promise<FacebookPostResult> {
  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video file not found: ${videoPath}`);
  }

  const form = new FormData();
  form.append("source", fs.createReadStream(videoPath));
  form.append("description", description);
  form.append("access_token", accessToken);

  const url = graphUrl(version, `/${pageId}/videos`);

  const res = await axios.post(url, form, {
    headers: form.getHeaders(),
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: 10 * 60 * 1000,
  });

  if (!res.data || !res.data.id) {
    throw new Error(`Unexpected Facebook response: ${JSON.stringify(res.data)}`);
  }
  return { id: res.data.id };
}

/**
 * Delete a Facebook post/video (best-effort cleanup).
 */
export async function deleteFacebookPost(
  version: string,
  postId: string,
  accessToken: string
): Promise<void> {
  const url = graphUrl(version, `/${postId}`);
  await axios.delete(url, { params: { access_token: accessToken } });
}