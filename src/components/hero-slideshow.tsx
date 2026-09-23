"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type Slide = { src: string; alt: string };

// Slow crossfade between a few strong authentic photos. No dots, no arrows,
// no autoplay controls — the image quietly changes on its own.
export function HeroSlideshow({
  slides,
  intervalMs = 5500,
}: {
  slides: Slide[];
  intervalMs?: number;
}) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (slides.length <= 1) return;
    const id = setInterval(() => {
      setActive((i) => (i + 1) % slides.length);
    }, intervalMs);
    return () => clearInterval(id);
  }, [slides.length, intervalMs]);

  return (
    <div className="relative h-[46vh] max-h-[560px] min-h-[320px] w-full overflow-hidden">
      {slides.map((slide, index) => (
        <div
          key={slide.src}
          className={`absolute inset-0 transition-opacity duration-[1400ms] ease-in-out ${
            index === active ? "opacity-100" : "opacity-0"
          }`}
          aria-hidden={index === active ? undefined : true}
        >
          <div className="animate-kenburns h-full w-full">
            <Image
              src={slide.src}
              alt={slide.alt}
              fill
              priority={index === 0}
              sizes="100vw"
              className="object-cover"
            />
          </div>
        </div>
      ))}
    </div>
  );
}
