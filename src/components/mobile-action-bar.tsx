import { CtaButton } from "@/components/cta-button";
import { whatsappLink } from "@/lib/contact";

// Mobile-only sticky bottom actions. Replaces WhatsAppFloating below the
// sm breakpoint rather than showing both at once.
export function MobileActionBar() {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t border-[var(--line)] bg-[var(--background)]/95 p-3 backdrop-blur sm:hidden"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <CtaButton href={whatsappLink()} variant="secondary" size="sm" external className="flex-1">
        WhatsApp
      </CtaButton>
      <CtaButton href="/request-quote" size="sm" className="flex-1">
        Request a Quote
      </CtaButton>
    </div>
  );
}
