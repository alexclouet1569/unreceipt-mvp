"use client";

import { useEffect, useRef, useState } from "react";

// The silent explainer loop near the end of the landing page: one receipt
// through four steps (snap or forward, AI reads it, you confirm, your
// accountant has it). Built in video/ (composition HeroLoop); the files in
// public/video/ are its renders. Nothing is downloaded until the card is
// close to the screen, and it pauses when scrolled away. With reduced motion
// the poster (the last step) stays still.

const LABEL =
  "How UnReceipt works: 1, snap a receipt or forward the email. 2, AI reads the merchant, date, total and VAT in seconds. 3, you check it and confirm. 4, your accountant has it, with the VAT split out.";

export function ExplainerVideo({ className }: { className?: string }) {
  const [still, setStill] = useState(false);
  const [near, setNear] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setStill(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  // Load when within a screen of view; play only while visible.
  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const load = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: "100% 0px" });
    const play = new IntersectionObserver(([e]) => {
      const v = video.current;
      if (!v) return;
      if (e.isIntersecting) v.play().catch(() => {});
      else v.pause();
    });
    load.observe(el);
    play.observe(el);
    return () => {
      load.disconnect();
      play.disconnect();
    };
  }, []);

  return (
    <div
      ref={box}
      className={
        "aspect-square w-full overflow-hidden rounded-[28px] bg-[#FAFAF7] ring-1 ring-black/5 " + (className ?? "")
      }
    >
      {still ? (
        // eslint-disable-next-line @next/next/no-img-element -- a static poster in place of the video
        <img src="/video/hero-loop-poster.webp" alt={LABEL} width={1080} height={1080} className="h-full w-full" />
      ) : (
        <video
          ref={video}
          className="h-full w-full"
          src={near ? "/video/hero-loop.mp4" : undefined}
          poster="/video/hero-loop-poster.webp"
          autoPlay
          muted
          loop
          playsInline
          preload="none"
          aria-label={LABEL}
          width={1080}
          height={1080}
        />
      )}
    </div>
  );
}
