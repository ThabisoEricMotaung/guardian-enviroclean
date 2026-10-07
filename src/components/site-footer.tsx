import Link from "next/link";
import { Logo } from "@/components/logo";
import { FACEBOOK_NAME, FACEBOOK_URL, PHONE_INTL_DISPLAY, whatsappLink } from "@/lib/contact";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-20 border-t border-[var(--line)] bg-[var(--stone)]">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Logo size="sm" />
            <p className="mt-2 text-sm italic text-[var(--muted)]">
              Clean Home. Fresh Life.
            </p>
          </div>

          <nav className="flex gap-6 text-sm text-[var(--foreground)]">
            <Link href="/" className="hover:text-[var(--guardian-deep)]">
              Home
            </Link>
            <Link
              href="/request-quote"
              className="hover:text-[var(--guardian-deep)]"
            >
              Request a Quote
            </Link>
          </nav>

          <div className="text-sm text-[var(--muted)]">
            <p>Proudly serving Pretoria and surrounding areas.</p>
            <p className="mt-1">
              <a
                href={whatsappLink()}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[var(--guardian-deep)] hover:underline"
              >
                WhatsApp {PHONE_INTL_DISPLAY}
              </a>
            </p>
            <p className="mt-1">
              <a
                href={FACEBOOK_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[var(--foreground)] hover:underline"
              >
                Facebook · {FACEBOOK_NAME}
              </a>
            </p>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-[var(--line)] pt-6 text-xs text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {year} Guardian Enviroclean. All rights reserved.</p>
          <p>
            Built by{" "}
            <a
              href="https://www.aiformstudio.co.za"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-[var(--line)] underline-offset-2 hover:text-[var(--foreground)] hover:decoration-[var(--foreground)]"
            >
              AiForm Studio
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
