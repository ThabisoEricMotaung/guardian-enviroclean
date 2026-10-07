import { ipAddress } from "@vercel/functions";
import { NextResponse, type NextRequest } from "next/server";
import { insertJobPhoto, insertWebsiteEnquiry } from "@/lib/quote-requests";
import { validateQuoteRequest } from "@/lib/validation/quote-request";
import { validatePhotoBatch } from "@/lib/validation/photo";
import { buildJobPhotoKey, deleteJobPhoto, uploadJobPhoto } from "@/lib/storage";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { notifyCecilOfEnquiry } from "@/lib/notifications";
import { normaliseSubmittedAcquisition } from "@/lib/acquisition";
import { DETAIL_FIELDS } from "@/lib/quote-details";

// Public endpoint — prospective customers must reach this without an
// account. See docs/neon-foundation.md, "Quote Request Pipeline — Pass 3"
// for the full honeypot/Turnstile/notification design and its
// intentional limits (still no rate limiting or queue/retry infra).
//
// Vercel Functions enforce a hard 4.5 MB total request-body ceiling
// (https://vercel.com/docs/functions/limitations#request-body-size),
// enforced by the platform before a request reaches this code at all.
// This is our own pre-check, kept safely under that ceiling so we return
// a clear 413 instead of relying solely on the platform's generic one —
// it is not itself the reason photos are capped at 3 MB / 4 MB
// aggregate (see src/lib/validation/photo.ts for that).
const MAX_REQUEST_BYTES = 4.4 * 1024 * 1024;

// Bait field name deliberately unremarkable (a plausible "company
// website" field, not literally named "honeypot") — see
// docs/neon-foundation.md for why, and why a populated honeypot gets the
// same response shape as a genuine empty-photo success rather than a
// distinct rejection: a bot that can tell it was caught can adjust and
// retry; one that just sees "success" has no signal to learn from.
const HONEYPOT_FIELD = "website";

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

  const honeypotValue = formData.get(HONEYPOT_FIELD);
  if (typeof honeypotValue === "string" && honeypotValue.trim() !== "") {
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  const turnstileToken = formData.get("cf-turnstile-response");
  const verification = await verifyTurnstileToken(
    typeof turnstileToken === "string" ? turnstileToken : "",
    ipAddress(request),
  );
  if (!verification.ok) {
    return NextResponse.json(
      { ok: false, error: "We couldn't verify your request. Please try again." },
      { status: 400 },
    );
  }

  const result = validateQuoteRequest({
    name: formData.get("name"),
    phone: formData.get("phone"),
    service: formData.get("service"),
    area: formData.get("area"),
    description: formData.get("description"),
    // Absent keys stay null — that's how a legacy (pre-structured) request
    // is recognised. See src/lib/quote-details.ts.
    details: Object.fromEntries(DETAIL_FIELDS.map((field) => [field, formData.get(field)])),
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

  // Client-supplied attribution is untrusted: anything outside the
  // allowlists (including OTHER, raw UTM strings or an fbclid) becomes NULL.
  const acquisition = normaliseSubmittedAcquisition(
    formData.get("acquisition_channel"),
    formData.get("acquisition_detail"),
  );

  let jobId: string;
  try {
    const inserted = await insertWebsiteEnquiry(result.data, acquisition);
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
  // photo fails, or notifying Cecil fails — see docs/neon-foundation.md,
  // "Critical failure semantics".
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

  // Best-effort, single attempt — a failure here must never change the
  // response below. notifyCecilOfEnquiry is designed to never throw (it
  // catches and logs internally), but this try/catch is defense-in-depth
  // for the one guarantee that matters most in this route: a
  // notification problem can never turn a persisted enquiry into a
  // failure response.
  try {
    await notifyCecilOfEnquiry({
      customerName: result.data.customerName,
      phone: result.data.phone,
      service: result.data.service,
      area: result.data.area,
      description: result.data.description,
      details: result.details,
      notes: result.notes,
      photosRequested: requestedCount,
      photosAccepted: acceptedCount,
      acquisition,
    });
  } catch (error) {
    console.error("[quote-requests] Cecil notification threw unexpectedly:", error);
  }

  if (requestedCount === 0) {
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  return NextResponse.json(
    { ok: true, photos: { requested: requestedCount, accepted: acceptedCount } },
    { status: 201 },
  );
}
