import { describe, expect, it } from "vitest";
import { isOwnedStoragePath } from "../storage-path";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "99999999-9999-4999-8999-999999999999";

describe("isOwnedStoragePath", () => {
  it("accepts a path inside the user's own folder", () => {
    expect(isOwnedStoragePath(`${USER}/abc.jpg`, USER)).toBe(true);
  });

  it("rejects another user's folder", () => {
    expect(isOwnedStoragePath(`${OTHER}/abc.jpg`, USER)).toBe(false);
  });

  it("rejects a prefix match without the folder separator", () => {
    expect(isOwnedStoragePath(`${USER}-evil/abc.jpg`, USER)).toBe(false);
  });

  it("rejects traversal out of the folder", () => {
    expect(isOwnedStoragePath(`${USER}/../${OTHER}/abc.jpg`, USER)).toBe(false);
  });

  it("rejects an empty user id", () => {
    expect(isOwnedStoragePath("/abc.jpg", "")).toBe(false);
  });
});
