// Where a customer originally found Guardian ("acquisition"), kept
// separate from `jobs.source` (how the enquiry entered the system). See
// docs/handover.md, "Facebook setup".
//
// Both values are closed allowlists, not an analytics taxonomy. Anything
// absent, malformed or unrecognised resolves to null — unknown traffic is
// never inferred (there is deliberately no DIRECT), fbclid is never
// treated as attribution, and raw UTM / fbclid strings are never carried
// past this module.
//
// Shared by the browser (capture on landing, sessionStorage) and the
// server (re-validation before persistence). The server never trusts the
// browser's copy: normaliseSubmittedAcquisition is the actual gate.

// Every value the `jobs.acquisition_channel` check constraint accepts.
// OTHER is reserved for deliberate manual classification (future Job
// Manager) — the public website can only ever produce FACEBOOK.
export const ACQUISITION_CHANNELS = ["FACEBOOK", "OTHER"] as const;
export type AcquisitionChannel = (typeof ACQUISITION_CHANNELS)[number];

export const FACEBOOK_PLACEMENTS = ["page_button", "post", "bio"] as const;
export type FacebookPlacement = (typeof FACEBOOK_PLACEMENTS)[number];

// What the public website is allowed to write.
export type WebsiteAcquisition =
  | { channel: "FACEBOOK"; detail: FacebookPlacement | null }
  | { channel: null; detail: null };

export const NO_ACQUISITION: WebsiteAcquisition = { channel: null, detail: null };

function isFacebookPlacement(value: unknown): value is FacebookPlacement {
  return typeof value === "string" && FACEBOOK_PLACEMENTS.includes(value as FacebookPlacement);
}

// Landing-page URL → normalised attribution. Only our own tagged links
// count: utm_source=facebook → FACEBOOK, with utm_content as the
// placement only if it is exactly one of the approved placements.
// Everything else → null. fbclid is ignored entirely: Instagram and
// Messenger add it to outbound clicks too, so on its own it does not
// prove the visitor came from Cecil's Facebook presence.
export function acquisitionFromSearch(search: string): WebsiteAcquisition {
  const params = new URLSearchParams(search);

  const utmSource = params.get("utm_source");
  if (utmSource === null || utmSource.trim().toLowerCase() !== "facebook") {
    return NO_ACQUISITION;
  }

  const content = params.get("utm_content");
  return { channel: "FACEBOOK", detail: isFacebookPlacement(content) ? content : null };
}

// Submitted (untrusted) values → what may be persisted. Exact matches
// only; a placement is accepted only alongside FACEBOOK.
export function normaliseSubmittedAcquisition(
  channel: unknown,
  detail: unknown,
): WebsiteAcquisition {
  if (channel !== "FACEBOOK") return NO_ACQUISITION;
  return { channel: "FACEBOOK", detail: isFacebookPlacement(detail) ? detail : null };
}

// --- Browser persistence (current tab only) --------------------------------

const STORAGE_KEY = "guardian.acquisition";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

// Called on landing. Only a recognised attribution is written, so an
// untagged later page view in the same tab never erases it.
export function captureAcquisition(search: string, storage: StorageLike): void {
  const acquisition = acquisitionFromSearch(search);
  if (acquisition.channel === null) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(acquisition));
  } catch {
    // Storage unavailable (private mode, quota, blocked) — attribution is
    // a nice-to-have and must never break the page.
  }
}

export function readStoredAcquisition(storage: StorageLike): WebsiteAcquisition {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return NO_ACQUISITION;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return NO_ACQUISITION;
    const record = parsed as Record<string, unknown>;
    return normaliseSubmittedAcquisition(record.channel, record.detail);
  } catch {
    return NO_ACQUISITION;
  }
}
