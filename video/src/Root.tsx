import { Composition } from "remotion";
import { Ad } from "./Ad";
import { HERO_FRAMES, HeroLoop } from "./hero/HeroLoop";
import { CUT_15, CUT_30, FORMATS, FPS, totalFrames } from "./timings";

export function RemotionRoot() {
  return (
    <>
      {[CUT_30, CUT_15].flatMap((cut) =>
        FORMATS.map((f) => (
          <Composition
            key={`${cut.id}-${f.id}`}
            id={`${cut.id}-${f.id}`}
            component={Ad}
            durationInFrames={totalFrames(cut)}
            fps={FPS}
            width={f.width}
            height={f.height}
            defaultProps={{ cut }}
          />
        )),
      )}
      {/* The website's silent hero loop (src/app/_hero-video.tsx). */}
      <Composition id="HeroLoop" component={HeroLoop} durationInFrames={HERO_FRAMES} fps={FPS} width={1080} height={1080} />
    </>
  );
}
