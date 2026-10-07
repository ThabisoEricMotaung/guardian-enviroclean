import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
const verifyTurnstileToken = vi.fn();
const notifyCecilOfEnquiry = vi.fn();

vi.mock("@/lib/quote-requests", () => ({
  insertWebsiteEnquiry: (...args: unknown[]) => insertWebsiteEnquiry(...args),
  insertJobPhoto: (...args: unknown[]) => insertJobPhoto(...args),
}));

// Partial mock: keep the real buildJobPhotoKey (pure, no I/O — exercising
// it for real is how the "customer filenames" test below proves customer
// filenames can't reach the storage key) and only mock the two functions
// that actually talk to S3.
vi.mock("@/lib/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage")>();
  return {
    ...actual,
    uploadJobPhoto: (...args: unknown[]) => uploadJobPhoto(...args),
    deleteJobPhoto: (...args: unknown[]) => deleteJobPhoto(...args),
  };
});

vi.mock("@/lib/turnstile", () => ({
  verifyTurnstileToken: (...args: unknown[]) => verifyTurnstileToken(...args),
}));

vi.mock("@/lib/notifications", () => ({
  notifyCecilOfEnquiry: (...args: unknown[]) => notifyCecilOfEnquiry(...args),
}));

// vi.mock above is hoisted ahead of this import by vitest's transform.
import { POST } from "./route";

const JOB_ID = "11111111-1111-1111-1111-111111111111";

const validFields = {
  name: "Jane Doe",
  phone: "0821234567",
  service: "MATTRESS",
  area: "Menlyn, Pretoria",
  description: "Queen mattress, some staining on one side.",
  "cf-turnstile-response": "valid-test-token",
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

beforeEach(() => {
  // Default: verification and notification both "succeed", so existing
  // scenarios don't need to know about Pass 3 unless they're testing it.
  verifyTurnstileToken.mockResolvedValue({ ok: true });
  notifyCecilOfEnquiry.mockResolvedValue(undefined);
});

afterEach(() => {
  insertWebsiteEnquiry.mockReset();
  insertJobPhoto.mockReset();
  uploadJobPhoto.mockReset();
  deleteJobPhoto.mockReset();
  verifyTurnstileToken.mockReset();
  notifyCecilOfEnquiry.mockReset();
});

describe("POST /api/quote-requests — honeypot", () => {
  it("allows normal flow when the honeypot field is empty", async () => {
    insertWebsiteEnquiry.mockResolvedValueOnce({ id: JOB_ID });

    const response = await POST(multipartRequest({ ...validFields, website: "" }));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json).toEqual({ ok: true });
    expect(insertWebsiteEnquiry).toHaveBeenCalledTimes(1);
  });

  it("creates no job, uploads no photos, and sends no notification when the honeypot is populated", async () => {
    const response = await POST(
      multipartRequest({ ...validFields, website: "http://spam.example" }, [jpegFile("a.jpg")]),
    );
    const json = await response.json();

    // Same shape as a genuine no-photo success — see route.ts for why.
    expect(response.status).toBe(201);
    expect(json).toEqual({ ok: true });
    expect(insertWebsiteEnquiry).not.toHaveBeenCalled();
    expect(uploadJobPhoto).not.toHaveBeenCalled();
    expect(notifyCecilOfEnquiry).not.toHaveBeenCalled();
    // Honeypot short-circuits before Turnstile is even checked.
    expect(verifyTurnstileToken).not.toHaveBeenCalled();
  });
});

describe("POST /api/quote-requests — Turnstile", () => {
  it("rejects when verification fails (covers missing/invalid/expired/replayed/provider-error tokens, which all collapse to the same result — see turnstile.test.ts for those cases individually)", async () => {
    verifyTurnstileToken.mockResolvedValueOnce({ ok: false });

    const response = await POST(multipartRequest(validFields, [jpegFile("a.jpg")]));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(insertWebsiteEnquiry).not.toHaveBeenCalled();
    expect(uploadJobPhoto).not.toHaveBeenCalled();
    expect(notifyCecilOfEnquiry).not.toHaveBeenCalled();
  });

  it("permits the normal flow once verification passes", async () => {
    insertWebsiteEnquiry.mockResolvedValueOnce({ id: JOB_ID });

    const response = await POST(multipartRequest(validFields));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json).toEqual({ ok: true });
    expect(verifyTurnstileToken).toHaveBeenCalledTimes(1);
  });

  it("never includes the secret or a token value in the failure response", async () => {
    verifyTurnstileToken.mockResolvedValueOnce({ ok: false });

    const response = await POST(
      multipartRequest({ ...validFields, "cf-turnstile-response": "some-token-value-xyz" }),
    );
    const json = await response.json();
    const raw = JSON.stringify(json);

    expect(raw).not.toContain("some-token-value-xyz");
    expect(raw).not.toMatch(/TURNSTILE_SECRET_KEY|secret/i);
  });
});

describe("POST /api/quote-requests — core pipeline", () => {
  // valid no-photo request persists
  it("accepts a valid enquiry with no photos", async () => {
    insertWebsiteEnquiry.mockResolvedValueOnce({ id: JOB_ID });

    const response = await POST(multipartRequest(validFields));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json).toEqual({ ok: true });
    expect(uploadJobPhoto).not.toHaveBeenCalled();
  });

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

  it("persists the enquiry but rejects a zero-byte file", async () => {
    insertWebsiteEnquiry.mockResolvedValueOnce({ id: JOB_ID });

    const empty = new File([], "empty.jpg", { type: "image/jpeg" });
    const response = await POST(multipartRequest(validFields, [empty]));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json).toEqual({ ok: true, photos: { requested: 1, accepted: 0 } });
    expect(uploadJobPhoto).not.toHaveBeenCalled();
  });

  it("persists the enquiry but rejects an oversized file", async () => {
    insertWebsiteEnquiry.mockResolvedValueOnce({ id: JOB_ID });

    const big = jpegFile("big.jpg", 3 * 1024 * 1024 + 1);
    const response = await POST(multipartRequest(validFields, [big]));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json).toEqual({ ok: true, photos: { requested: 1, accepted: 0 } });
    expect(uploadJobPhoto).not.toHaveBeenCalled();
  });

  it("rejects malformed text fields without persisting, uploading, or notifying", async () => {
    const response = await POST(
      multipartRequest({ ...validFields, name: "" }, [jpegFile("a.jpg")]),
    );
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json.ok).toBe(false);
    expect(json.fieldErrors.name).toBeTruthy();
    expect(insertWebsiteEnquiry).not.toHaveBeenCalled();
    expect(uploadJobPhoto).not.toHaveBeenCalled();
    expect(notifyCecilOfEnquiry).not.toHaveBeenCalled();
  });

  it("attempts no upload when the jobs insert fails", async () => {
    insertWebsiteEnquiry.mockRejectedValueOnce(new Error("simulated db failure"));

    const response = await POST(multipartRequest(validFields, [jpegFile("a.jpg")]));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.ok).toBe(false);
    expect(uploadJobPhoto).not.toHaveBeenCalled();
    expect(notifyCecilOfEnquiry).not.toHaveBeenCalled();
  });

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

  it("never uses the customer-supplied filename as (or within) the storage key", async () => {
    insertWebsiteEnquiry.mockResolvedValueOnce({ id: JOB_ID });
    uploadJobPhoto.mockResolvedValueOnce(undefined);
    insertJobPhoto.mockResolvedValueOnce(undefined);

    const maliciousName = "../../../etc/passwd.jpg";
    const response = await POST(multipartRequest(validFields, [jpegFile(maliciousName)]));
    await response.json();

    expect(uploadJobPhoto).toHaveBeenCalledTimes(1);
    const [key] = uploadJobPhoto.mock.calls[0];
    expect(key).not.toContain("etc/passwd");
    expect(key).not.toContain("..");
    expect(key).toMatch(new RegExp(`^quote-requests/${JOB_ID}/[0-9a-f-]+\\.jpg$`));
  });

  it("rejects a malformed (non-multipart) request without persisting, uploading, or notifying", async () => {
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
    expect(notifyCecilOfEnquiry).not.toHaveBeenCalled();
  });

  it("rejects an invalid service value, without persisting, uploading, or notifying", async () => {
    const response = await POST(
      multipartRequest({ ...validFields, service: "POOL_CLEANING" }),
    );
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json.fieldErrors.service).toBeTruthy();
    expect(insertWebsiteEnquiry).not.toHaveBeenCalled();
    expect(notifyCecilOfEnquiry).not.toHaveBeenCalled();
  });
});

describe("POST /api/quote-requests — Cecil notification", () => {
  it("triggers exactly one notification attempt for a successfully persisted enquiry", async () => {
    insertWebsiteEnquiry.mockResolvedValueOnce({ id: JOB_ID });

    await POST(multipartRequest(validFields));

    expect(notifyCecilOfEnquiry).toHaveBeenCalledTimes(1);
  });

  it("sends no notification for a rejected (validation-failed) request", async () => {
    await POST(multipartRequest({ ...validFields, service: "POOL_CLEANING" }));

    expect(notifyCecilOfEnquiry).not.toHaveBeenCalled();
  });

  it("sends no notification when the jobs insert fails", async () => {
    insertWebsiteEnquiry.mockRejectedValueOnce(new Error("simulated db failure"));

    await POST(multipartRequest(validFields));

    expect(notifyCecilOfEnquiry).not.toHaveBeenCalled();
  });

  it("still returns enquiry success when notification fails", async () => {
    insertWebsiteEnquiry.mockResolvedValueOnce({ id: JOB_ID });
    notifyCecilOfEnquiry.mockRejectedValueOnce(new Error("simulated Resend failure"));

    const response = await POST(multipartRequest(validFields));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json).toEqual({ ok: true });
  });

  it("does not roll back or otherwise affect the persisted job when notification fails", async () => {
    insertWebsiteEnquiry.mockResolvedValueOnce({ id: JOB_ID });
    notifyCecilOfEnquiry.mockRejectedValueOnce(new Error("simulated Resend failure"));

    const response = await POST(multipartRequest(validFields));

    expect(response.status).toBe(201);
    expect(insertWebsiteEnquiry).toHaveBeenCalledTimes(1);
  });

  it("does not delete an already-successfully-attached photo when notification fails", async () => {
    insertWebsiteEnquiry.mockResolvedValueOnce({ id: JOB_ID });
    uploadJobPhoto.mockResolvedValueOnce(undefined);
    insertJobPhoto.mockResolvedValueOnce(undefined);
    notifyCecilOfEnquiry.mockRejectedValueOnce(new Error("simulated Resend failure"));

    const response = await POST(multipartRequest(validFields, [jpegFile("a.jpg")]));
    const json = await response.json();

    expect(json).toEqual({ ok: true, photos: { requested: 1, accepted: 1 } });
    expect(deleteJobPhoto).not.toHaveBeenCalled();
  });

  it("passes the expected customer/job fields to the notification", async () => {
    insertWebsiteEnquiry.mockResolvedValueOnce({ id: JOB_ID });

    await POST(multipartRequest(validFields));

    expect(notifyCecilOfEnquiry).toHaveBeenCalledWith({
      customerName: "Jane Doe",
      phone: "0821234567",
      service: "MATTRESS",
      area: "Menlyn, Pretoria",
      description: "Queen mattress, some staining on one side.",
      photosRequested: 0,
      photosAccepted: 0,
      acquisition: { channel: null, detail: null },
      details: null,
      notes: null,
    });
  });

  it("never passes a storage key/path or credential-shaped field to the notification", async () => {
    insertWebsiteEnquiry.mockResolvedValueOnce({ id: JOB_ID });
    uploadJobPhoto.mockResolvedValueOnce(undefined);
    insertJobPhoto.mockResolvedValueOnce(undefined);

    await POST(multipartRequest(validFields, [jpegFile("a.jpg")]));

    const call = notifyCecilOfEnquiry.mock.calls[0][0];
    expect(Object.keys(call).sort()).toEqual(
      [
        "acquisition",
        "area",
        "customerName",
        "description",
        "details",
        "notes",
        "phone",
        "photosAccepted",
        "photosRequested",
        "service",
      ].sort(),
    );
  });

  it("accurately reflects photo counts when one of several uploads fails", async () => {
    insertWebsiteEnquiry.mockResolvedValueOnce({ id: JOB_ID });
    uploadJobPhoto
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("simulated storage failure"));
    insertJobPhoto.mockResolvedValueOnce(undefined);

    await POST(multipartRequest(validFields, [jpegFile("a.jpg"), jpegFile("b.jpg")]));

    expect(notifyCecilOfEnquiry).toHaveBeenCalledWith(
      expect.objectContaining({ photosRequested: 2, photosAccepted: 1 }),
    );
  });
});

describe("POST /api/quote-requests — security", () => {
  it("ignores an arbitrary client-supplied recipient field", async () => {
    insertWebsiteEnquiry.mockResolvedValueOnce({ id: JOB_ID });

    await POST(
      multipartRequest({
        ...validFields,
        to: "attacker@evil.example",
        cecilEmail: "attacker@evil.example",
      }),
    );

    const call = notifyCecilOfEnquiry.mock.calls[0][0];
    expect(JSON.stringify(call)).not.toContain("attacker@evil.example");
  });

  it("ignores an arbitrary client-supplied sender field", async () => {
    insertWebsiteEnquiry.mockResolvedValueOnce({ id: JOB_ID });

    await POST(multipartRequest({ ...validFields, from: "attacker@evil.example" }));

    const call = notifyCecilOfEnquiry.mock.calls[0][0];
    expect(JSON.stringify(call)).not.toContain("attacker@evil.example");
  });

  it("never returns a raw notification-provider error to the client", async () => {
    insertWebsiteEnquiry.mockResolvedValueOnce({ id: JOB_ID });
    notifyCecilOfEnquiry.mockRejectedValueOnce(
      new Error("Resend API error: invalid RESEND_API_KEY re_secretvalue123"),
    );

    const response = await POST(multipartRequest(validFields));
    const json = await response.json();
    const raw = JSON.stringify(json);

    expect(raw).not.toMatch(/RESEND_API_KEY|re_secretvalue123/);
  });
});

describe("POST /api/quote-requests — acquisition attribution", () => {
  const facebook = { acquisition_channel: "FACEBOOK" };

  it.each(["page_button", "post", "bio"])("persists FACEBOOK + %s", async (placement) => {
    insertWebsiteEnquiry.mockResolvedValueOnce({ id: JOB_ID });

    const response = await POST(
      multipartRequest({ ...validFields, ...facebook, acquisition_detail: placement }),
    );

    expect(response.status).toBe(201);
    expect(insertWebsiteEnquiry).toHaveBeenCalledWith(expect.any(Object), {
      channel: "FACEBOOK",
      detail: placement,
    });
  });

  it("persists NULL attribution for an ordinary unattributed enquiry, otherwise unchanged", async () => {
    insertWebsiteEnquiry.mockResolvedValueOnce({ id: JOB_ID });

    const response = await POST(multipartRequest(validFields));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true });
    expect(insertWebsiteEnquiry).toHaveBeenCalledWith(
      {
        customerName: "Jane Doe",
        phone: "0821234567",
        service: "MATTRESS",
        area: "Menlyn, Pretoria",
        description: "Queen mattress, some staining on one side.",
      },
      { channel: null, detail: null },
    );
  });

  it.each([
    ["OTHER", "post"],
    ["DIRECT", ""],
    ["GOOGLE", "bio"],
    ["facebook", "post"],
    ["FACEBOOK; drop table jobs", "post"],
  ])("rejects a manipulated channel %j (with detail %j) as NULL", async (channel, detail) => {
    insertWebsiteEnquiry.mockResolvedValueOnce({ id: JOB_ID });

    const response = await POST(
      multipartRequest({ ...validFields, acquisition_channel: channel, acquisition_detail: detail }),
    );

    expect(response.status).toBe(201);
    expect(insertWebsiteEnquiry).toHaveBeenCalledWith(expect.any(Object), {
      channel: null,
      detail: null,
    });
  });

  it("drops a manipulated placement but keeps FACEBOOK", async () => {
    insertWebsiteEnquiry.mockResolvedValueOnce({ id: JOB_ID });

    await POST(multipartRequest({ ...validFields, ...facebook, acquisition_detail: "paid_ad" }));

    expect(insertWebsiteEnquiry).toHaveBeenCalledWith(expect.any(Object), {
      channel: "FACEBOOK",
      detail: null,
    });
  });

  it("never persists raw UTM fields or fbclid submitted alongside the form", async () => {
    insertWebsiteEnquiry.mockResolvedValueOnce({ id: JOB_ID });

    await POST(
      multipartRequest({
        ...validFields,
        ...facebook,
        acquisition_detail: "post",
        utm_source: "facebook",
        utm_campaign: "spring-sale",
        utm_term: "mattress",
        fbclid: "IwAR0rawclickid",
      }),
    );

    const persisted = JSON.stringify(insertWebsiteEnquiry.mock.calls[0]);
    expect(persisted).not.toMatch(/spring-sale|IwAR0rawclickid|utm_|fbclid/);
    expect(insertWebsiteEnquiry.mock.calls[0][1]).toEqual({ channel: "FACEBOOK", detail: "post" });
  });

  it("passes the server-normalised attribution to Cecil's notification", async () => {
    insertWebsiteEnquiry.mockResolvedValueOnce({ id: JOB_ID });

    await POST(multipartRequest({ ...validFields, ...facebook, acquisition_detail: "bio" }));

    expect(notifyCecilOfEnquiry.mock.calls[0][0].acquisition).toEqual({
      channel: "FACEBOOK",
      detail: "bio",
    });
  });

  it("passes NULL attribution to the notification for a manipulated channel", async () => {
    insertWebsiteEnquiry.mockResolvedValueOnce({ id: JOB_ID });

    await POST(
      multipartRequest({ ...validFields, acquisition_channel: "OTHER", acquisition_detail: "post" }),
    );

    expect(notifyCecilOfEnquiry.mock.calls[0][0].acquisition).toEqual({
      channel: null,
      detail: null,
    });
  });
});

describe("POST /api/quote-requests — structured quote details", () => {
  const sofaFields = {
    ...validFields,
    service: "SOFA_COUCH",
    sofa_type: "three_seater",
    sofa_material: "leather",
    description: "Red wine stain on one cushion.",
  };

  it("persists the composed description through the unchanged persistence call", async () => {
    insertWebsiteEnquiry.mockResolvedValueOnce({ id: JOB_ID });

    const response = await POST(multipartRequest(sofaFields));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true });
    expect(insertWebsiteEnquiry).toHaveBeenCalledWith(
      {
        customerName: "Jane Doe",
        phone: "0821234567",
        service: "SOFA_COUCH",
        area: "Menlyn, Pretoria",
        description: "Sofa type: 3 seater\nMaterial: Leather\nNotes: Red wine stain on one cushion.",
      },
      { channel: null, detail: null },
    );
  });

  it("passes validated details and notes to Cecil's notification", async () => {
    insertWebsiteEnquiry.mockResolvedValueOnce({ id: JOB_ID });

    await POST(multipartRequest({ ...sofaFields, description: "" }));

    const call = notifyCecilOfEnquiry.mock.calls[0][0];
    expect(call.details.map((d: { label: string; value: string }) => `${d.label}: ${d.value}`)).toEqual([
      "Sofa type: 3 seater",
      "Material: Leather",
    ]);
    expect(call.notes).toBeNull();
    expect(call.description).toBe("Sofa type: 3 seater\nMaterial: Leather");
  });

  it.each([
    ["a tampered code", { sofa_type: "throne" }, "sofa_type"],
    ["a missing answer", { sofa_material: "" }, "sofa_material"],
    ["a stale detail from another service", { car_vehicle: "sedan" }, "service"],
  ])("rejects %s with 422 and persists nothing", async (_label, override, errorKey) => {
    const response = await POST(multipartRequest({ ...sofaFields, ...override }));

    expect(response.status).toBe(422);
    const payload = await response.json();
    expect(payload.ok).toBe(false);
    expect(payload.fieldErrors[errorKey]).toBeTruthy();
    expect(insertWebsiteEnquiry).not.toHaveBeenCalled();
    expect(notifyCecilOfEnquiry).not.toHaveBeenCalled();
  });

  it("does not let a partially structured request use the legacy fallback", async () => {
    const partial: Record<string, string> = { ...sofaFields };
    delete partial.sofa_material;

    const response = await POST(multipartRequest(partial));

    expect(response.status).toBe(422);
    expect((await response.json()).fieldErrors).toEqual({ sofa_material: "Please choose the material." });
    expect(insertWebsiteEnquiry).not.toHaveBeenCalled();
  });

  it("requires notes when an answer is Other", async () => {
    const response = await POST(
      multipartRequest({ ...validFields, mattress_size: "other", description: "" }),
    );

    expect(response.status).toBe(422);
    expect((await response.json()).fieldErrors).toEqual({
      description: "Please tell us a bit more about the job.",
    });
  });

  it("accepts a legacy-shaped request (old browser session) unchanged", async () => {
    insertWebsiteEnquiry.mockResolvedValueOnce({ id: JOB_ID });

    const response = await POST(multipartRequest({ ...validFields, service: "CAR_INTERIOR" }));

    expect(response.status).toBe(201);
    expect(insertWebsiteEnquiry.mock.calls[0][0].description).toBe(
      "Queen mattress, some staining on one side.",
    );
    expect(notifyCecilOfEnquiry.mock.calls[0][0]).toMatchObject({ details: null, notes: null });
  });

  it("keeps Facebook attribution alongside structured details", async () => {
    insertWebsiteEnquiry.mockResolvedValueOnce({ id: JOB_ID });

    await POST(
      multipartRequest({ ...sofaFields, acquisition_channel: "FACEBOOK", acquisition_detail: "post" }),
    );

    expect(insertWebsiteEnquiry.mock.calls[0][1]).toEqual({ channel: "FACEBOOK", detail: "post" });
    expect(notifyCecilOfEnquiry.mock.calls[0][0].acquisition).toEqual({
      channel: "FACEBOOK",
      detail: "post",
    });
  });

  it("still short-circuits on a populated honeypot before validating details", async () => {
    const response = await POST(
      multipartRequest({ ...sofaFields, sofa_type: "throne", website: "http://spam.example" }),
    );

    expect(response.status).toBe(201);
    expect(insertWebsiteEnquiry).not.toHaveBeenCalled();
    expect(notifyCecilOfEnquiry).not.toHaveBeenCalled();
  });

  it("still rejects a failed Turnstile check before validating details", async () => {
    verifyTurnstileToken.mockResolvedValueOnce({ ok: false });

    const response = await POST(multipartRequest(sofaFields));

    expect(response.status).toBe(400);
    expect(insertWebsiteEnquiry).not.toHaveBeenCalled();
  });

  it("still attaches photos to a structured enquiry", async () => {
    insertWebsiteEnquiry.mockResolvedValueOnce({ id: JOB_ID });
    uploadJobPhoto.mockResolvedValueOnce(undefined);
    insertJobPhoto.mockResolvedValueOnce(undefined);

    const response = await POST(multipartRequest(sofaFields, [jpegFile("couch.jpg")]));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true, photos: { requested: 1, accepted: 1 } });
    expect(insertJobPhoto).toHaveBeenCalledWith(JOB_ID, expect.stringMatching(`^quote-requests/${JOB_ID}/`));
  });
});
