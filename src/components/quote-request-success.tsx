import { whatsappLink } from "@/lib/contact";

// Only mount this after a real jobs-row insert succeeds; never on a
// timer, a fake async delay, or any other simulated success.
//
// `photoIssue` reflects the server's partial-attachment outcome (some or
// all submitted photos couldn't be attached) — the enquiry itself is
// never affected by this, so the copy must not suggest otherwise.
export function QuoteRequestSuccess({
  name,
  photoIssue = false,
}: {
  name: string;
  photoIssue?: boolean;
}) {
  return (
    <div className="py-6">
      <p className="text-lg font-semibold text-[var(--foreground)]">
        Thanks, {name}. We&apos;ve received your request.
      </p>
      <p className="mt-2 text-[var(--muted)]">
        Cecil will review the details and get back to you directly.
      </p>
      {photoIssue && (
        <p className="mt-4 rounded-[3px] border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          We couldn&apos;t attach one or more of your photos this time — no
          need to resend the form, your request is already received.
          Feel free to send the photos directly via WhatsApp instead.
        </p>
      )}
      <p className="mt-6 text-sm text-[var(--muted)]">
        Need to speak to us now?{" "}
        <a
          href={whatsappLink()}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-[var(--guardian-deep)] underline underline-offset-2"
        >
          Chat on WhatsApp.
        </a>
      </p>
    </div>
  );
}
