export const PHONE_DISPLAY = "065 965 6991";
export const PHONE_INTL_DISPLAY = "+27 65 965 6991";

const WHATSAPP_NUMBER = "27659656991"; // +27 65 965 6991, no spaces/plus, for wa.me
const DEFAULT_MESSAGE =
  "Hi Guardian Enviroclean, I'd like to request a cleaning quote.";

export function whatsappLink(message: string = DEFAULT_MESSAGE) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

// Cecil's existing Facebook presence, which trades as Clearview
// Deepcleaning — part of the Guardian Enviroclean business, not a separate
// one. Use this exact share URL; don't substitute a derived page URL.
export const FACEBOOK_URL = "https://www.facebook.com/share/1AmHkQWHBZ/?mibextid=wwXIfr";
export const FACEBOOK_NAME = "Clearview Deepcleaning";

// Prefilled message for the WhatsApp link Cecil places on Facebook, so
// he can recognise those chats. Not used on the website itself, and not
// attributed in the database — see docs/handover.md, "Facebook setup".
export const FACEBOOK_WHATSAPP_MESSAGE =
  "Hi Guardian Enviroclean, I found you on Facebook and would like to request a cleaning quote.";
