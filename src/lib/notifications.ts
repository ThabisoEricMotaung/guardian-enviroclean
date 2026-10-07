import "server-only";

import { Resend } from "resend";
import type { FacebookPlacement, WebsiteAcquisition } from "./acquisition";
import { SERVICE_LABELS, type DetailAnswer } from "./quote-details";
import type { JobService } from "./validation/quote-request";

// Best-effort email notification to Cecil after an enquiry is already
// safely persisted. Every failure path here is logged and swallowed —
// nothing in this module may ever cause a caller to treat a persisted
// enquiry as failed. No queue/retry: one attempt, once, per enquiry.

export type EnquiryNotification = {
  customerName: string;
  phone: string;
  service: string;
  area: string;
  description: string;
  // Validated structured answers + the customer's notes, or null for an
  // unstructured (OTHER / legacy) request, which shows `description`.
  details: readonly DetailAnswer[] | null;
  notes: string | null;
  photosRequested: number;
  photosAccepted: number;
  // Server-normalised (see src/lib/acquisition.ts) — never raw request input.
  acquisition: WebsiteAcquisition;
};

const PLACEMENT_LABELS: Record<FacebookPlacement, string> = {
  page_button: "Page button",
  post: "Post",
  bio: "Bio",
};

// Omitted entirely when unknown — never "NULL"/"Unknown"/"Direct".
function acquisitionLine({ channel, detail }: WebsiteAcquisition): string | null {
  if (channel !== "FACEBOOK") return null;
  return detail ? `Acquisition: Facebook · ${PLACEMENT_LABELS[detail]}` : "Acquisition: Facebook";
}

function buildEmail(input: EnquiryNotification): { subject: string; text: string } {
  const photosLine =
    input.photosRequested === 0
      ? "Photos: none attached."
      : `Photos: ${input.photosAccepted} of ${input.photosRequested} received successfully.`;

  // Structured details stay out of the subject so it remains short in
  // mobile notifications; they're listed in the body.
  const serviceLabel = SERVICE_LABELS[input.service as JobService] ?? input.service;
  const subject = `New Guardian quote request — ${serviceLabel}`;
  const acquisition = acquisitionLine(input.acquisition);

  const text = [
    `New quote request from ${input.customerName}`,
    "",
    `Phone: ${input.phone}`,
    `Service: ${serviceLabel}`,
    ...(input.details ?? []).map((answer) => `${answer.label}: ${answer.value}`),
    `Area: ${input.area}`,
    "",
    ...(input.details
      ? ["Notes:", input.notes ?? "None given."]
      : ["Description:", input.description]),
    "",
    photosLine,
    // Source (how the enquiry arrived) and acquisition (where the
    // customer found Guardian) are different things — both are shown.
    "Source: Website",
    ...(acquisition ? [acquisition] : []),
  ].join("\n");

  return { subject, text };
}

// Recipient and sender are read from server-only env config, never from
// request input — nothing the client submits can redirect or spoof this
// email (see src/app/api/quote-requests/route.ts, which never passes
// client-supplied fields here beyond the enquiry's own content).
export async function notifyCecilOfEnquiry(input: EnquiryNotification): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.CECIL_NOTIFICATION_EMAIL;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !to || !from) {
    console.error(
      "[notifications] Resend not fully configured (RESEND_API_KEY / CECIL_NOTIFICATION_EMAIL / RESEND_FROM_EMAIL) — skipping notification.",
    );
    return;
  }

  const { subject, text } = buildEmail(input);

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({ from, to: [to], subject, text });
    if (error) {
      console.error("[notifications] Resend reported an error sending Cecil's notification:", error);
    }
  } catch (error) {
    console.error("[notifications] failed to send Cecil's notification:", error);
  }
}
