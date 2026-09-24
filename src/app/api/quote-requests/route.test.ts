import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// storage.ts is partially mocked below via importOriginal, which means
// its real `import "server-only"` actually executes under vitest's
// module resolution (unlike Next's build, which strips it correctly).
// Stub it so that guard doesn't trip in tests.
vi.mock("server-only", () => ({}));

const insertWebsiteEnquiry = vi.fn();
const insertJobPhoto = vi.fn();
const uploadJobPhoto = vi.fn();
const deleteJobPhoto = vi.fn();

vi.mock("@/lib/quote-requests", () => ({
  insertWebsiteEnquiry: (...args: unknown[]) => insertWebsiteEnquiry(...args),
  insertJobPhoto: (...args: unknown[]) => insertJobPhoto(...args),
}));

// Partial mock: keep the real buildJobPhotoKey (pure, no I/O — exercising
// it for real is how test 14 below proves customer filenames can't reach
// the storage key) and only mock the two functions that actually talk to
// S3.
vi.mock("@/lib/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage")>();
  return {
    ...actual,
    uploadJobPhoto: (...args: unknown[]) => uploadJobPhoto(...args),
    deleteJobPhoto: (...args: unknown[]) => deleteJobPhoto(...args),
  };
});

// vi.mock above is hoisted ahead of this import by vitest's transform.
import { POST } from "./route";

const JOB_ID = "11111111-1111-1111-1111-111111111111";

const validFields = {
  name: "Jane Doe",
  phone: "0821234567",
  service: "MATTRESS",
  area: "Menlyn, Pretoria",
  description: "Queen mattress, some staining on one side.",
};

const JPEG_SIG = [0xff, 0xd8, 0xff];

function jpegFile(name: string, size = 1024): File {
  const bytes = new Uint8Array(new ArrayBuffer(size));
  bytes.set(JPEG_SIG, 0);
  return new File([bytes], name, { type: "image/jpeg" });
}

function multipartRequest(fields: Record<string, string>, files: File[] = []): NextRequest {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.append(key, value);
  for (const file of files) body.append("photos", file, file.name);
  return new NextRequest("http://localhost/api/quote-requests", {
    method: "POST",
    body,
  });
}

describe("POST /api/quote-requests", () => {
  afterEach(() => {
    insertWebsiteEnquiry.mockReset();
    insertJobPhoto.mockReset();
    uploadJobPhoto.mockReset();
    deleteJobPhoto.mockReset();
  });

  // 1. valid enquiry without photos
  it("accepts a valid enquiry with no photos", async () => {
    insertWebsiteEnquiry.mockResolvedValueOnce({ id: JOB_ID });

    const response = await POST(multipartRequest(validFields));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json).toEqual({ ok: true });
    expect(uploadJobPhoto).not.toHaveBeenCalled();
  });

  // 2. valid enquiry with one valid photo
  it("accepts a valid enquiry with one valid photo", async () => {
    insertWebsiteEnquiry.mockResolvedValueOnce({ id: JOB_ID });
    uploadJobPhoto.mockResolvedValueOnce(undefined);
    insertJobPhoto.mockResolvedValueOnce(undefined);

    const response = await POST(multipartRequest(validFields, [jpegFile("a.jpg")]));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json).toEqual({ ok: true, photos: { requested: 1, accepted: 1 } });
    expect(uploadJobPhoto).toHaveBeenCalledTimes(1);
    expect(insertJobPhoto).toHaveBeenCalledWith(JOB_ID, expect.any(String));
  });

  // 3. valid enquiry with four valid photos
  it("accepts a valid enquiry with four valid photos", async () => {
    insertWebsiteEnquiry.mockResolvedValueOnce({ id: JOB_ID });
    uploadJobPhoto.mockResolvedValue(undefined);
    insertJobPhoto.mockResolvedValue(undefined);

    const files = [1, 2, 3, 4].map((n) => jpegFile(`photo-${n}.jpg`));
    const response = await POST(multipartRequest(validFields, files));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json).toEqual({ ok: true, photos: { requested: 4, accepted: 4 } });
    expect(uploadJobPhoto).toHaveBeenCalledTimes(4);
  });

  // 4. more than four files rejected appropriately — job still persists
  it("persists the enquiry but attaches nothing when more than four files are submitted", async () => {
    insertWebsiteEnquiry.mockResolvedValueOnce({ id: JOB_ID });

    const files = [1, 2, 3, 4, 5].map((n) => jpegFile(`photo-${n}.jpg`));
    const response = await POST(multipartRequest(validFields, files));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json).toEqual({ ok: true, photos: { requested: 5, accepted: 0 } });
    expect(insertWebsiteEnquiry).toHaveBeenCalledTimes(1);
    expect(uploadJobPhoto).not.toHaveBeenCalled();
  });

  // 5. unsupported file type — job still persists
  it("persists the enquiry but rejects an unsupported file type", async () => {
    insertWebsiteEnquiry.mockResolvedValueOnce({ id: JOB_ID });

    const bogus = new File([new Uint8Array(new ArrayBuffer(1024))], "not-an-image.jpg", {
      type: "image/jpeg",
    });
    const response = await POST(multipartRequest(validFields, [bogus]));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json).toEqual({ ok: true, photos: { requested: 1, accepted: 0 } });
    expect(uploadJobPhoto).not.toHaveBeenCalled();
  });

  // 6. zero-byte file — job still persists
  it("persists the enquiry but rejects a zero-byte file", async () => {
    insertWebsiteEnquiry.mockResolvedValueOnce({ id: JOB_ID });

    const empty = new File([], "empty.jpg", { type: "image/jpeg" });
    const response = await POST(multipartRequest(validFields, [empty]));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json).toEqual({ ok: true, photos: { requested: 1, accepted: 0 } });
    expect(uploadJobPhoto).not.toHaveBeenCalled();
  });

  // 7. oversized individual file — job still persists
  it("persists the enquiry but rejects an oversized file", async () => {
    insertWebsiteEnquiry.mockResolvedValueOnce({ id: JOB_ID });

    const big = jpegFile("big.jpg", 3 * 1024 * 1024 + 1);
    const response = await POST(multipartRequest(validFields, [big]));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json).toEqual({ ok: true, photos: { requested: 1, accepted: 0 } });
    expect(uploadJobPhoto).not.toHaveBeenCalled();
  });

  // 8. malformed text fields still rejected — nothing persisted, nothing uploaded
  it("rejects malformed text fields without persisting or uploading anything", async () => {
    const response = await POST(
      multipartRequest({ ...validFields, name: "" }, [jpegFile("a.jpg")]),
    );
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json.ok).toBe(false);
    expect(json.fieldErrors.name).toBeTruthy();
    expect(insertWebsiteEnquiry).not.toHaveBeenCalled();
    expect(uploadJobPhoto).not.toHaveBeenCalled();
  });

  // 9. jobs insert failure → no upload attempted
  it("attempts no upload when the jobs insert fails", async () => {
    insertWebsiteEnquiry.mockRejectedValueOnce(new Error("simulated db failure"));

    const response = await POST(multipartRequest(validFields, [jpegFile("a.jpg")]));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.ok).toBe(false);
    expect(uploadJobPhoto).not.toHaveBeenCalled();
  });

  // 10. upload failure after job persistence → job considered received
  it("still reports the enquiry as received when the only photo's upload fails", async () => {
    insertWebsiteEnquiry.mockResolvedValueOnce({ id: JOB_ID });
    uploadJobPhoto.mockRejectedValueOnce(new Error("simulated storage failure"));

    const response = await POST(multipartRequest(validFields, [jpegFile("a.jpg")]));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.ok).toBe(true);
    expect(json.photos).toEqual({ requested: 1, accepted: 0 });
    expect(insertJobPhoto).not.toHaveBeenCalled();
  });

  // 11. one of multiple uploads fails → partial attachment result
  it("reports a partial attachment result when one of several uploads fails", async () => {
    insertWebsiteEnquiry.mockResolvedValueOnce({ id: JOB_ID });
    uploadJobPhoto
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("simulated storage failure"));
    insertJobPhoto.mockResolvedValueOnce(undefined);

    const files = [jpegFile("a.jpg"), jpegFile("b.jpg")];
    const response = await POST(multipartRequest(validFields, files));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json).toEqual({ ok: true, photos: { requested: 2, accepted: 1 } });
  });

  // 12. upload succeeds but job_photos insert fails → cleanup attempted
  it("attempts to delete the uploaded object when the job_photos insert fails", async () => {
    insertWebsiteEnquiry.mockResolvedValueOnce({ id: JOB_ID });
    uploadJobPhoto.mockResolvedValueOnce(undefined);
    insertJobPhoto.mockRejectedValueOnce(new Error("simulated db failure"));
    deleteJobPhoto.mockResolvedValueOnce(undefined);

    const response = await POST(multipartRequest(validFields, [jpegFile("a.jpg")]));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json).toEqual({ ok: true, photos: { requested: 1, accepted: 0 } });
    expect(deleteJobPhoto).toHaveBeenCalledTimes(1);
    expect(deleteJobPhoto).toHaveBeenCalledWith(expect.any(String));
  });

  // 13. storage/internal error details never returned to client
  it("never leaks raw storage/database error detail to the client", async () => {
    insertWebsiteEnquiry.mockResolvedValueOnce({ id: JOB_ID });
    uploadJobPhoto.mockRejectedValueOnce(
      new Error(
        'S3 error: AccessDenied for key "quote-requests/secret/real-path.jpg" using AKIAEXAMPLESECRET',
      ),
    );

    const response = await POST(multipartRequest(validFields, [jpegFile("a.jpg")]));
    const json = await response.json();
    const raw = JSON.stringify(json);

    expect(response.status).toBe(201);
    expect(raw).not.toMatch(/AccessDenied|AKIA|S3 error/i);
  });

  // 14. customer filenames cannot control storage object paths
  it("never uses the customer-supplied filename as (or within) the storage key", async () => {
    insertWebsiteEnquiry.mockResolvedValueOnce({ id: JOB_ID });
    uploadJobPhoto.mockResolvedValueOnce(undefined);
    insertJobPhoto.mockResolvedValueOnce(undefined);

    const maliciousName = "../../../etc/passwd.jpg";
    const response = await POST(
      multipartRequest(validFields, [jpegFile(maliciousName)]),
    );
    await response.json();

    expect(uploadJobPhoto).toHaveBeenCalledTimes(1);
    const [key] = uploadJobPhoto.mock.calls[0];
    expect(key).not.toContain("etc/passwd");
    expect(key).not.toContain("..");
    expect(key).toMatch(new RegExp(`^quote-requests/${JOB_ID}/[0-9a-f-]+\\.jpg$`));
  });

  // Preserved from Pass 1: malformed body, invalid service.
  it("rejects a malformed (non-multipart) request without persisting or uploading anything", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/quote-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not valid",
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(insertWebsiteEnquiry).not.toHaveBeenCalled();
  });

  it("rejects an invalid service value, without persisting or uploading anything", async () => {
    const response = await POST(
      multipartRequest({ ...validFields, service: "POOL_CLEANING" }),
    );
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json.fieldErrors.service).toBeTruthy();
    expect(insertWebsiteEnquiry).not.toHaveBeenCalled();
  });
});
