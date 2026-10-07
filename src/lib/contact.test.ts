import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FACEBOOK_URL, FACEBOOK_WHATSAPP_MESSAGE, whatsappLink } from "./contact";

// docs/handover.md is what Cecil is shown at handover — keep its links in
// step with the configuration the website actually uses.
const handover = readFileSync(path.resolve(__dirname, "../../docs/handover.md"), "utf8");

describe("Facebook contact configuration", () => {
  it("uses Cecil's exact Facebook share URL", () => {
    expect(FACEBOOK_URL).toBe("https://www.facebook.com/share/1AmHkQWHBZ/?mibextid=wwXIfr");
    expect(handover).toContain(FACEBOOK_URL);
  });

  it("builds the Facebook WhatsApp link from the existing Guardian number", () => {
    const link = whatsappLink(FACEBOOK_WHATSAPP_MESSAGE);
    expect(link.startsWith(whatsappLink().split("?")[0])).toBe(true);
    expect(handover).toContain(link);
  });

  it.each(["page_button", "post", "bio"])("documents the tagged %s quote URL", (placement) => {
    expect(handover).toContain(
      `/request-quote?utm_source=facebook&utm_medium=social&utm_content=${placement}`,
    );
  });
});
