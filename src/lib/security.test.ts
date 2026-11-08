import { describe, expect, it } from "vitest";
import { pinLockoutDurationMs } from "./security";

describe("local PIN retry throttling", () => {
  it("allows the initial retries without a delay", () => {
    for (let attempts = 0; attempts < 5; attempts += 1) {
      expect(pinLockoutDurationMs(attempts)).toBe(0);
    }
  });

  it("increases delays after repeated incorrect PIN attempts", () => {
    expect(pinLockoutDurationMs(5)).toBe(30_000);
    expect(pinLockoutDurationMs(6)).toBe(60_000);
    expect(pinLockoutDurationMs(7)).toBe(5 * 60_000);
    expect(pinLockoutDurationMs(8)).toBe(15 * 60_000);
    expect(pinLockoutDurationMs(100)).toBe(15 * 60_000);
  });

  it("rejects invalid attempt counts", () => {
    expect(() => pinLockoutDurationMs(-1)).toThrow();
    expect(() => pinLockoutDurationMs(1.5)).toThrow();
  });
});
