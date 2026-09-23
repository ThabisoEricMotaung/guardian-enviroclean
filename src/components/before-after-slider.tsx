"use client";

import Image from "next/image";
import { useState } from "react";

type Props = {
  beforeSrc: string;
  afterSrc: string;
  beforeAlt: string;
  afterAlt: string;
};

// Drag (or tap-and-drag on touch) to compare. The native range input is the
// actual control — full-size and transparent — so touch dragging works for
// free; the visible line/handle is purely decorative and follows its value.
export function BeforeAfterSlider({ beforeSrc, afterSrc, beforeAlt, afterAlt }: Props) {
  const [value, setValue] = useState(50);

  return (
    <div className="relative aspect-[4/3] w-full touch-none overflow-hidden rounded-sm select-none sm:aspect-[16/10]">
      {/* Base layer: always fully visible, showing through on the right of
          the handle — must be the AFTER photo so the right side reads
          "after" to match the fixed label. */}
      <Image
        src={afterSrc}
        alt={afterAlt}
        fill
        sizes="(min-width: 640px) 60vw, 100vw"
        className="object-cover"
      />
      {/* Overlay: clipped to the left `value`% — must be the BEFORE photo
          so the left side reads "before" to match the fixed label. */}
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - value}% 0 0)` }}>
        <Image
          src={beforeSrc}
          alt={beforeAlt}
          fill
          sizes="(min-width: 640px) 60vw, 100vw"
          className="object-cover"
        />
      </div>

      <div
        className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-white/90"
        style={{ left: `${value}%` }}
      >
        <div className="absolute top-1/2 left-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-sm">
          <span aria-hidden className="text-xs font-semibold text-[var(--foreground)]">
            ↔
          </span>
        </div>
      </div>

      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(event) => setValue(Number(event.target.value))}
        aria-label="Drag to compare before and after"
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
      />

      <span className="pointer-events-none absolute top-3 left-3 rounded-[2px] bg-black/60 px-2 py-1 text-[10px] font-medium tracking-wide text-white uppercase">
        Before
      </span>
      <span className="pointer-events-none absolute top-3 right-3 rounded-[2px] bg-[var(--guardian-deep)]/90 px-2 py-1 text-[10px] font-medium tracking-wide text-white uppercase">
        After
      </span>
    </div>
  );
}
