import type { Metadata } from "next";
import { RequestQuoteForm } from "@/components/request-quote-form";

export const metadata: Metadata = {
  title: "Request a Quote | Guardian Enviroclean",
};

export default function RequestQuotePage() {
  return (
    <section className="mx-auto max-w-xl px-4 py-16 sm:px-6 sm:py-24">
      <p className="text-xs font-semibold tracking-[0.16em] text-[var(--guardian-deep)] uppercase">
        Get Started
      </p>
      <h1 className="mt-3 text-3xl font-bold text-[var(--foreground)] sm:text-4xl">
        Request a Quote
      </h1>
      <p className="mt-3 text-[var(--muted)]">
        Tell us what needs cleaning and we&apos;ll get back to you with a
        quote. Adding a few photos helps us understand the job.
      </p>

      <RequestQuoteForm />
    </section>
  );
}
