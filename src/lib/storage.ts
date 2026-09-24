import "server-only";

import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

// Private Neon Object Storage access — server-only. The `uploads` bucket
// (declared in neon.ts) never allows anonymous reads; nothing here is
// ever exposed to the browser. Credentials, endpoint, and region come
// from the standard AWS env chain (AWS_ACCESS_KEY_ID,
// AWS_SECRET_ACCESS_KEY, AWS_REGION, AWS_ENDPOINT_URL_S3), injected by
// Neon — the only setting we pass explicitly is `forcePathStyle`, which
// Neon's S3-compatible endpoint requires. See docs/neon-foundation.md.
const BUCKET = "uploads";

const s3 = new S3Client({ forcePathStyle: true });

// Server-generated key only — never the customer's filename. Grouped by
// job so a job's photos are easy to reason about/clean up together;
// nothing PII-derived (name/phone/area) appears in the key.
export function buildJobPhotoKey(jobId: string, ext: string): string {
  return `quote-requests/${jobId}/${randomUUID()}.${ext}`;
}

export async function uploadJobPhoto(
  key: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: bytes,
      ContentType: contentType,
    }),
  );
}

// Best-effort cleanup for the "uploaded but job_photos insert failed"
// case. Callers treat a failure here as a logged, non-fatal event — see
// docs/neon-foundation.md, "Quote Request Pipeline — Pass 2" for the
// accepted limitation (a rare orphaned object with no DB row).
export async function deleteJobPhoto(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
