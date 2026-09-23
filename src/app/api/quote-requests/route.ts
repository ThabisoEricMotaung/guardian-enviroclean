import { NextResponse, type NextRequest } from "next/server";
import { insertWebsiteEnquiry } from "@/lib/quote-requests";
import { validateQuoteRequest } from "@/lib/validation/quote-request";

// Public endpoint — prospective customers must reach this without an
// account. Pass 1's anti-abuse posture is deliberately minimal (strict
// validation + a request-size cap only). Honeypot + Turnstile land in
// Pass 3 — do not treat this endpoint as production-hardened until then.
// See docs/neon-foundation.md, "Quote Request Pipeline — Pass 1".

// Five short text fields; this is a generous cap, not a tuned limit.
// content-length is attacker-suppliable and not always present (e.g.
// chunked transfer), so this is a best-effort guard, not the real
// defense against abuse — that's Pass 3.
const MAX_BODY_BYTES = 20_000;

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "Request too large." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Malformed request." }, { status: 400 });
  }

  const result = validateQuoteRequest(body);
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

  try {
    await insertWebsiteEnquiry(result.data);
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

  // Deliberately minimal — the client doesn't need the new row's id or
  // any other database detail to show a success state.
  return NextResponse.json({ ok: true }, { status: 201 });
}
