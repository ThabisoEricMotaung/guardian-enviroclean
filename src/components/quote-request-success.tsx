import { whatsappLink } from "@/lib/contact";

// Built for the next milestone — not imported/rendered anywhere yet.
// Only mount this after a real jobs-row insert succeeds; never on a
// timer, a fake async delay, or any other simulated success.
export function QuoteRequestSuccess({ name }: { name: string }) {
  return (
    <div className="py-6">
      <p className="text-lg font-semibold text-[var(--foreground)]">
        Thanks, {name}. We&apos;ve received your request.
      </p>
      <p className="mt-2 text-[var(--muted)]">
        Cecil will review the details and get back to you directly.
      </p>
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
