import Link from "next/link";
import { Logo } from "@/components/logo";
import { CtaButton } from "@/components/cta-button";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-[var(--line)] bg-[var(--background)]/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="shrink-0">
          <Logo size="sm" />
        </Link>
        <CtaButton href="/request-quote" size="sm">
          Request a Quote
        </CtaButton>
      </div>
    </header>
  );
}
