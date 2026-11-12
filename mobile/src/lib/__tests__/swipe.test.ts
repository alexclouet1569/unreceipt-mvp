import { describe, expect, it } from "vitest";
import { followOffset, isSideways, swipeTarget } from "../swipe";

const both = { previous: true, next: true };

describe("period swipe", () => {
  it("starts only on a clearly sideways move, so scrolling stays scrolling", () => {
    expect(isSideways(30, 5)).toBe(true);
    expect(isSideways(30, 20)).toBe(false);
    expect(isSideways(10, 0)).toBe(false);
    expect(isSideways(-40, -10)).toBe(true);
  });

  it("goes back with the finger to the right, forward to the left", () => {
    expect(swipeTarget(80, 0.1, both)).toBe("previous");
    expect(swipeTarget(-80, -0.1, both)).toBe("next");
  });

  it("counts a short fast flick, not a short slow drag", () => {
    expect(swipeTarget(30, 0.8, both)).toBe("previous");
    expect(swipeTarget(30, 0.1, both)).toBeNull();
  });

  it("ignores a flick back against the drag", () => {
    expect(swipeTarget(30, -0.9, both)).toBeNull();
    expect(swipeTarget(-30, 0.9, both)).toBeNull();
  });

  it("never goes into the future or while a period is loading", () => {
    expect(swipeTarget(-120, -1, { previous: true, next: false })).toBeNull();
    expect(swipeTarget(120, 1, { previous: false, next: false })).toBeNull();
  });

  it("follows the finger a third of the way, barely where it can't go", () => {
    expect(followOffset(90, both)).toBeCloseTo(29.7);
    expect(followOffset(-90, { previous: true, next: false })).toBeCloseTo(-9);
  });
});
