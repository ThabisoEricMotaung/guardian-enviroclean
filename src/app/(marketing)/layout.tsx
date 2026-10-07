import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { WhatsAppFloating } from "@/components/whatsapp-floating";
import { MobileActionBar } from "@/components/mobile-action-bar";
import { AcquisitionCapture } from "@/components/acquisition-capture";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <main className="flex-1 pb-20 sm:pb-0">{children}</main>
      <SiteFooter />
      <WhatsAppFloating />
      <MobileActionBar />
      <AcquisitionCapture />
    </>
  );
}
