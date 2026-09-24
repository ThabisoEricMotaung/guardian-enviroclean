// Server-side photo validation for the quote-request submission. Treat
// every uploaded file as untrusted: its declared `type` and filename are
// hints only, never trusted for the actual format decision or the
// storage key (see sniffImageType and src/lib/storage.ts).
//
// HEIC/HEIF is deliberately NOT supported in this pass. Recognizing it
// reliably means parsing the ISO-BMFF container's `ftyp` box brand
// (`heic`/`heif`/`heix`/`mif1`/…), and — since browsers can't render
// HEIC previews or usually even accept it as `image/*` in older
// versions — supporting it end-to-end would also need a server-side
// decode/convert step. That's meaningfully more infrastructure than this
// pass's scope, so it's called out explicitly here rather than adding a
// conversion stack silently. JPEG/PNG/WebP covers ordinary phone photos
// (including iPhones set to "Most Compatible" camera format, and any
// photo shared through Messages/WhatsApp/Mail, which auto-convert to
// JPEG); a customer whose phone produces HEIC and shares it unconverted
// can still reach Cecil via the WhatsApp fallback.
export const MAX_PHOTOS = 4;

// Vercel Functions enforce a hard 4.5 MB total request-body ceiling
// (https://vercel.com/docs/functions/limitations#request-body-size),
// platform-side, before a request even reaches our code. These limits
// are chosen to sit safely under that ceiling with headroom for the
// text fields and multipart framing — see route.ts.
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024; // 3 MB per photo
export const MAX_TOTAL_PHOTO_BYTES = 4 * 1024 * 1024; // 4 MB combined

export type DetectedImageType = {
  ext: "jpg" | "png" | "webp";
  contentType: "image/jpeg" | "image/png" | "image/webp";
};

function matchesSignature(bytes: Uint8Array, offset: number, signature: number[]): boolean {
  if (bytes.length < offset + signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (bytes[offset + i] !== signature[i]) return false;
  }
  return true;
}

// Magic-byte sniffing for exactly the three formats this pass supports.
// Deliberately hand-rolled rather than a dependency: three fixed-offset
// signature checks don't justify a library.
export function sniffImageType(bytes: Uint8Array): DetectedImageType | null {
  if (matchesSignature(bytes, 0, [0xff, 0xd8, 0xff])) {
    return { ext: "jpg", contentType: "image/jpeg" };
  }
  if (matchesSignature(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { ext: "png", contentType: "image/png" };
  }
  if (
    matchesSignature(bytes, 0, [0x52, 0x49, 0x46, 0x46]) && // "RIFF"
    matchesSignature(bytes, 8, [0x57, 0x45, 0x42, 0x50]) // "WEBP"
  ) {
    return { ext: "webp", contentType: "image/webp" };
  }
  return null;
}

export type AcceptedPhoto = {
  bytes: Uint8Array;
  ext: DetectedImageType["ext"];
  contentType: DetectedImageType["contentType"];
};

export type PhotoBatchResult = {
  accepted: AcceptedPhoto[];
  requestedCount: number;
  rejectedCount: number;
};

// Deliberately per-file, not all-or-nothing: an enquiry with one bad
// photo among several good ones still gets the good ones attached (see
// route.ts's partial-success handling). The one exception is submitting
// more than MAX_PHOTOS files at once — treated as a single bulk
// rejection (nothing accepted) rather than an arbitrary "keep the first
// four", since silently dropping some of the customer's photos without
// telling them which is worse than clearly reporting none were attached.
export async function validatePhotoBatch(files: File[]): Promise<PhotoBatchResult> {
  const requestedCount = files.length;

  if (requestedCount > MAX_PHOTOS) {
    return { accepted: [], requestedCount, rejectedCount: requestedCount };
  }

  const accepted: AcceptedPhoto[] = [];
  let totalBytes = 0;

  for (const file of files) {
    if (file.size <= 0) continue;
    if (file.size > MAX_PHOTO_BYTES) continue;
    if (totalBytes + file.size > MAX_TOTAL_PHOTO_BYTES) continue;

    const bytes = new Uint8Array(await file.arrayBuffer());
    const detected = sniffImageType(bytes);
    if (!detected) continue;

    totalBytes += file.size;
    accepted.push({ bytes, ext: detected.ext, contentType: detected.contentType });
  }

  return {
    accepted,
    requestedCount,
    rejectedCount: requestedCount - accepted.length,
  };
}
