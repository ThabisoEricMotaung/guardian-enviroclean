export const PHONE_DISPLAY = "065 965 6991";
export const PHONE_INTL_DISPLAY = "+27 65 965 6991";

const WHATSAPP_NUMBER = "27659656991"; // +27 65 965 6991, no spaces/plus, for wa.me
const DEFAULT_MESSAGE =
  "Hi Guardian Enviroclean, I'd like to request a cleaning quote.";

export function whatsappLink(message: string = DEFAULT_MESSAGE) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
