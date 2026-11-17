// Scene lengths in frames at 30 fps. Every caption stays on screen at least 1.5 s.
export const FPS = 30;

export type SceneId = "hook" | "snap" | "email" | "accountant" | "end";

export type Cut = { id: string; scenes: Record<SceneId, number>; short: boolean };

export const CUT_30: Cut = {
  id: "Ad30",
  short: false,
  scenes: { hook: 90, snap: 240, email: 210, accountant: 210, end: 150 },
};

export const CUT_15: Cut = {
  id: "Ad15",
  short: true,
  scenes: { hook: 60, snap: 150, email: 90, accountant: 60, end: 90 },
};

export const ORDER: SceneId[] = ["hook", "snap", "email", "accountant", "end"];

export function totalFrames(cut: Cut) {
  return ORDER.reduce((sum, id) => sum + cut.scenes[id], 0);
}

export const FORMATS = [
  { id: "9x16", width: 1080, height: 1920 },
  { id: "1x1", width: 1080, height: 1080 },
  { id: "16x9", width: 1920, height: 1080 },
] as const;
