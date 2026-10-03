import Image from "next/image";
import { withBasePath } from "@/lib/base-path";

// Guardian's real logo, cropped (not redrawn/recolored) from the supplied
// artwork. Source: guardian-enviroclean-logo.jpeg, sampled/cropped via
// scripts/asset-prep during the real-asset-integration milestone.
const MARK_SRC = withBasePath("/images/brand/guardian-logo-mark.png");
const MARK_ASPECT = 300 / 345; // width / height of the cropped mark

export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const markHeight = size === "lg" ? 44 : size === "sm" ? 24 : 32;
  const markWidth = Math.round(markHeight * MARK_ASPECT);
  const textSize =
    size === "lg" ? "text-2xl" : size === "sm" ? "text-base" : "text-lg";

  return (
    <span className="inline-flex items-center gap-2">
      <Image
        src={MARK_SRC}
        alt="Guardian Enviroclean shield mark"
        width={markWidth}
        height={markHeight}
        priority
      />
      <span
        className={`font-semibold tracking-tight ${textSize} text-[var(--guardian-deep)]`}
      >
        Guardian Enviroclean
      </span>
    </span>
  );
}
