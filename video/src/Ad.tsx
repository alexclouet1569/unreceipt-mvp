import { Html5Audio, Sequence, staticFile } from "remotion";
import { loadFonts } from "./fonts";
import { Accountant } from "./scenes/Accountant";
import { Email } from "./scenes/Email";
import { End } from "./scenes/End";
import { Hook } from "./scenes/Hook";
import { Snap } from "./scenes/Snap";
import { ORDER, type Cut, type SceneId } from "./timings";

loadFonts();

export function Ad({ cut }: { cut: Cut }) {
  let from = 0;
  return (
    <>
      {/* Original soundtrack made by scripts/music.py, timed to this cut's scenes. */}
      <Html5Audio src={staticFile(`audio/${cut.id}.m4a`)} />
      {ORDER.map((id) => {
        const duration = cut.scenes[id];
        const start = from;
        from += duration;
        return (
          <Sequence key={id} from={start} durationInFrames={duration} name={id}>
            {renderScene(id, duration, cut.short)}
          </Sequence>
        );
      })}
    </>
  );
}

function renderScene(id: SceneId, duration: number, short: boolean) {
  switch (id) {
    case "hook":
      return <Hook duration={duration} />;
    case "snap":
      return <Snap duration={duration} />;
    case "email":
      return <Email duration={duration} />;
    case "accountant":
      return <Accountant duration={duration} short={short} />;
    case "end":
      return <End duration={duration} />;
  }
}
