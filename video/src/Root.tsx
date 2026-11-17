import { Composition } from "remotion";
import { Ad } from "./Ad";
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
    </>
  );
}
