import { whatsappLink } from "@/lib/contact";
import { WhatsAppIcon } from "@/components/whatsapp-icon";

// Desktop-only restrained floating action. Mobile gets the sticky bottom
// bar instead (MobileActionBar) rather than stacking both.
export function WhatsAppFloating() {
  return (
    <a
      href={whatsappLink()}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with Guardian Enviroclean on WhatsApp"
      className="fixed right-6 bottom-6 z-20 hidden h-14 w-14 items-center justify-center rounded-full bg-[var(--guardian-deep)] text-white shadow-md transition hover:bg-[var(--guardian-deep-dark)] sm:flex"
    >
      <WhatsAppIcon className="h-6 w-6" />
    </a>
  );
}
