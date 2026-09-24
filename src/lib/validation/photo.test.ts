import { describe, expect, it } from "vitest";
import {
  MAX_PHOTO_BYTES,
  MAX_PHOTOS,
  MAX_TOTAL_PHOTO_BYTES,
  sniffImageType,
  validatePhotoBatch,
} from "./photo";

const JPEG_SIG = [0xff, 0xd8, 0xff];
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP_SIG = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];

function bytesOfSize(signature: number[], size: number): Uint8Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(Math.max(size, signature.length));
  const bytes = new Uint8Array(buffer);
  bytes.set(signature, 0);
  return bytes;
}

function fileOf(signature: number[], size: number, name: string, claimedType: string): File {
  const bytes = bytesOfSize(signature, size);
  return new File([bytes], name, { type: claimedType });
}

describe("sniffImageType", () => {
  it("detects JPEG by magic bytes", () => {
    expect(sniffImageType(bytesOfSize(JPEG_SIG, 16))).toEqual({
      ext: "jpg",
      contentType: "image/jpeg",
    });
  });

  it("detects PNG by magic bytes", () => {
    expect(sniffImageType(bytesOfSize(PNG_SIG, 16))).toEqual({
      ext: "png",
      contentType: "image/png",
    });
  });

  it("detects WebP by magic bytes (RIFF....WEBP)", () => {
    expect(sniffImageType(bytesOfSize(WEBP_SIG, 16))).toEqual({
      ext: "webp",
      contentType: "image/webp",
    });
  });

  it("returns null for unrecognized bytes regardless of claimed type", () => {
    const bytes = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);
    expect(sniffImageType(bytes)).toBeNull();
  });
});

describe("validatePhotoBatch", () => {
  it("accepts a single valid photo", async () => {
    const files = [fileOf(JPEG_SIG, 1024, "a.jpg", "image/jpeg")];
    const result = await validatePhotoBatch(files);

    expect(result.requestedCount).toBe(1);
    expect(result.rejectedCount).toBe(0);
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0].ext).toBe("jpg");
  });

  it(`accepts up to ${MAX_PHOTOS} valid photos`, async () => {
    const files = Array.from({ length: MAX_PHOTOS }, (_, i) =>
      fileOf(JPEG_SIG, 1024, `photo-${i}.jpg`, "image/jpeg"),
    );
    const result = await validatePhotoBatch(files);

    expect(result.accepted).toHaveLength(MAX_PHOTOS);
    expect(result.rejectedCount).toBe(0);
  });

  it(`rejects the whole batch when more than ${MAX_PHOTOS} files are submitted`, async () => {
    const files = Array.from({ length: MAX_PHOTOS + 1 }, (_, i) =>
      fileOf(JPEG_SIG, 1024, `photo-${i}.jpg`, "image/jpeg"),
    );
    const result = await validatePhotoBatch(files);

    expect(result.requestedCount).toBe(MAX_PHOTOS + 1);
    expect(result.accepted).toHaveLength(0);
    expect(result.rejectedCount).toBe(MAX_PHOTOS + 1);
  });

  it("rejects a zero-byte file", async () => {
    const files = [new File([], "empty.jpg", { type: "image/jpeg" })];
    const result = await validatePhotoBatch(files);

    expect(result.accepted).toHaveLength(0);
    expect(result.rejectedCount).toBe(1);
  });

  it("rejects an oversized individual file", async () => {
    const files = [fileOf(JPEG_SIG, MAX_PHOTO_BYTES + 1, "big.jpg", "image/jpeg")];
    const result = await validatePhotoBatch(files);

    expect(result.accepted).toHaveLength(0);
    expect(result.rejectedCount).toBe(1);
  });

  it("rejects a file once the running aggregate would exceed the total cap", async () => {
    const eachSize = Math.floor(MAX_TOTAL_PHOTO_BYTES / 2) + 1024;
    const files = [
      fileOf(JPEG_SIG, eachSize, "one.jpg", "image/jpeg"),
      fileOf(JPEG_SIG, eachSize, "two.jpg", "image/jpeg"),
    ];
    const result = await validatePhotoBatch(files);

    expect(result.accepted).toHaveLength(1);
    expect(result.rejectedCount).toBe(1);
  });

  it("rejects a file whose bytes don't match any supported image signature, even if labeled image/jpeg", async () => {
    const bogus = new Uint8Array(new ArrayBuffer(1024)); // all zeros — no recognizable signature
    const files = [new File([bogus], "not-really-a.jpg", { type: "image/jpeg" })];
    const result = await validatePhotoBatch(files);

    expect(result.accepted).toHaveLength(0);
    expect(result.rejectedCount).toBe(1);
  });

  it("accepts nothing and rejects nothing for an empty batch", async () => {
    const result = await validatePhotoBatch([]);
    expect(result.requestedCount).toBe(0);
    expect(result.accepted).toHaveLength(0);
    expect(result.rejectedCount).toBe(0);
  });
});
