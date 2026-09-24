import { NextResponse, type NextRequest } from "next/server";
import { insertJobPhoto, insertWebsiteEnquiry } from "@/lib/quote-requests";
import { validateQuoteRequest } from "@/lib/validation/quote-request";
import { validatePhotoBatch } from "@/lib/validation/photo";
import { buildJobPhotoKey, deleteJobPhoto, uploadJobPhoto } from "@/lib/storage";

// Public endpoint — prospective customers must reach this without an
// account. Pass 2's anti-abuse posture is still minimal (strict
// validation + a request-size cap only). Honeypot + Turnstile land in
// Pass 3 — do not treat this endpoint as production-hardened until then.
// See docs/neon-foundation.md, "Quote Request Pipeline — Pass 2".
//
// Vercel Functions enforce a hard 4.5 MB total request-body ceiling
// (https://vercel.com/docs/functions/limitations#request-body-size),
// enforced by the platform before a request reaches this code at all.
// This is our own pre-check, kept safely under that ceiling so we return
// a clear 413 instead of relying solely on the platform's generic one —
// it is not itself the reason photos are capped at 3 MB / 4 MB
// aggregate (see src/lib/validation/photo.ts for that).
const MAX_REQUEST_BYTES = 4.4 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return NextResponse.json({ ok: false, error: "Request too large." }, { status: 413 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Malformed request." }, { status: 400 });
  }

  const result = validateQuoteRequest({
    name: formData.get("name"),
    phone: formData.get("phone"),
    service: formData.get("service"),
    area: formData.get("area"),
    description: formData.get("description"),
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "Please check the highlighted fields.",
        fieldErrors: result.errors,
      },
      { status: 422 },
    );
  }

  let jobId: string;
  try {
    const inserted = await insertWebsiteEnquiry(result.data);
    jobId = inserted.id;
  } catch (error) {
    // Server-side diagnostic detail only — never forwarded to the client.
    console.error("[quote-requests] failed to persist enquiry:", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Something went wrong on our end. Please try WhatsApp instead.",
      },
      { status: 500 },
    );
  }

  // From here on, the enquiry is safely persisted. Nothing below may
  // cause it to be reported as lost to the customer, even if every
  // photo fails — see docs/neon-foundation.md, "Critical failure
  // semantics".
  const files = formData.getAll("photos").filter((value): value is File => value instanceof File);
  const { accepted, requestedCount } = await validatePhotoBatch(files);

  let acceptedCount = 0;
  for (const photo of accepted) {
    const key = buildJobPhotoKey(jobId, photo.ext);

    try {
      await uploadJobPhoto(key, photo.bytes, photo.contentType);
    } catch (error) {
      console.error("[quote-requests] photo upload failed:", error);
      continue;
    }

    try {
      await insertJobPhoto(jobId, key);
      acceptedCount++;
    } catch (error) {
      console.error(
        "[quote-requests] job_photos insert failed after a successful upload; attempting cleanup:",
        error,
      );
      try {
        await deleteJobPhoto(key);
      } catch (cleanupError) {
        console.error("[quote-requests] cleanup delete also failed:", cleanupError);
      }
    }
  }

  if (requestedCount === 0) {
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  return NextResponse.json(
    { ok: true, photos: { requested: requestedCount, accepted: acceptedCount } },
    { status: 201 },
  );
}
