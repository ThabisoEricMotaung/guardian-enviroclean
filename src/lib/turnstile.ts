import "server-only";

// Server-side Cloudflare Turnstile verification. Never logs the secret
// or the full token — only Cloudflare's own error-code strings (a fixed,
// documented enum, not sensitive) and generic diagnostic text.
//
// https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// Cloudflare's own guidance: set a reasonable timeout rather than
// waiting indefinitely on a Cloudflare-side problem.
const VERIFY_TIMEOUT_MS = 5000;

export type TurnstileVerification = { ok: true } | { ok: false };

// Every non-success path — missing/invalid/expired/replayed token,
// misconfiguration, network failure, or a non-2xx/malformed response
// from Cloudflare — collapses to the same `{ ok: false }` shape. The
// caller only needs "did this pass or not"; the underlying reason is
// logged here for our own diagnosis, never returned to the customer
// (distinguishing reasons in the client response would only help an
// attacker fingerprint the check).
export async function verifyTurnstileToken(
  token: string,
  remoteIp?: string,
): Promise<TurnstileVerification> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.error("[turnstile] TURNSTILE_SECRET_KEY is not configured — failing closed.");
    return { ok: false };
  }

  if (!token) {
    return { ok: false };
  }

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);

  try {
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error("[turnstile] siteverify returned HTTP", response.status);
      return { ok: false };
    }

    const result = (await response.json()) as {
      success?: boolean;
      "error-codes"?: string[];
    };

    if (result.success === true) {
      return { ok: true };
    }

    console.error("[turnstile] verification failed:", result["error-codes"] ?? "unknown");
    return { ok: false };
  } catch (error) {
    // Covers both network failures and our own timeout abort.
    console.error("[turnstile] verification request failed:", error);
    return { ok: false };
  } finally {
    clearTimeout(timeout);
  }
}
