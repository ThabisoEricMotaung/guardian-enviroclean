import "server-only";

import { Resend } from "resend";

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
  photosRequested: number;
  photosAccepted: number;
};

function buildEmail(input: EnquiryNotification): { subject: string; text: string } {
  const photosLine =
    input.photosRequested === 0
      ? "Photos: none attached."
      : `Photos: ${input.photosAccepted} of ${input.photosRequested} received successfully.`;

  const subject = `New Guardian quote request — ${input.service}`;

  const text = [
    `New quote request from ${input.customerName}`,
    "",
    `Phone: ${input.phone}`,
    `Service: ${input.service}`,
    `Area: ${input.area}`,
    "",
    "Description:",
    input.description,
    "",
    photosLine,
    "Source: Website",
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
