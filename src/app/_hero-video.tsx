"use client";

import { useEffect, useState } from "react";

// The English hero's silent explainer loop: one receipt through four steps
// (snap or forward, AI reads it, you confirm, your accountant has it).
// Built in video/ (composition HeroLoop); the files in public/video/ are its
// renders. With reduced motion the poster (the last step) stays still.

const LABEL =
  "How UnReceipt works: 1, snap a receipt or forward the email. 2, AI reads the merchant, date, total and VAT in seconds. 3, you check it and confirm. 4, your accountant has it, with the VAT split out.";

export function HeroVideo({ className }: { className?: string }) {
  const [still, setStill] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setStill(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return (
    <div
      className={
        "aspect-square w-full overflow-hidden rounded-[28px] bg-[#FAFAF7] ring-1 ring-black/5 " + (className ?? "")
      }
    >
      {still ? (
        // eslint-disable-next-line @next/next/no-img-element -- a static poster in place of the video
        <img src="/video/hero-loop-poster.webp" alt={LABEL} width={1080} height={1080} className="h-full w-full" />
      ) : (
        <video
          className="h-full w-full"
          src="/video/hero-loop.mp4"
          poster="/video/hero-loop-poster.webp"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-label={LABEL}
          width={1080}
          height={1080}
        />
      )}
    </div>
  );
}
