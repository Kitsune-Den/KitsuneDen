import { describe, expect, it } from "vitest";
import { resolveDayNightConfig, reverseDayNightConfig } from "../lib/day-night";

describe("resolveDayNightConfig", () => {
  it("converts 45 day / 15 night to DayNightLength=60, DayLightLength=18", () => {
    const result = resolveDayNightConfig({ dayMinutes: 45, nightMinutes: 15 });
    expect(result.DayNightLength).toBe(60);
    expect(result.DayLightLength).toBe(18);
  });

  it("converts 90 day / 30 night to DayNightLength=120, DayLightLength=18", () => {
    const result = resolveDayNightConfig({ dayMinutes: 90, nightMinutes: 30 });
    expect(result.DayNightLength).toBe(120);
    expect(result.DayLightLength).toBe(18);
  });

  it("converts equal day/night to DayLightLength=12", () => {
    const result = resolveDayNightConfig({ dayMinutes: 30, nightMinutes: 30 });
    expect(result.DayNightLength).toBe(60);
    expect(result.DayLightLength).toBe(12);
  });

  it("clamps total to min 10", () => {
    const result = resolveDayNightConfig({ dayMinutes: 3, nightMinutes: 2 });
    expect(result.DayNightLength).toBe(10);
  });

  it("clamps total to max 240", () => {
    const result = resolveDayNightConfig({ dayMinutes: 200, nightMinutes: 200 });
    expect(result.DayNightLength).toBe(240);
  });

  it("clamps DayLightLength to min 1", () => {
    const result = resolveDayNightConfig({ dayMinutes: 1, nightMinutes: 200 });
    expect(result.DayLightLength).toBeGreaterThanOrEqual(1);
  });

  it("clamps DayLightLength to max 23", () => {
    const result = resolveDayNightConfig({ dayMinutes: 200, nightMinutes: 1 });
    expect(result.DayLightLength).toBeLessThanOrEqual(23);
  });

  it("throws on zero dayMinutes", () => {
    expect(() => resolveDayNightConfig({ dayMinutes: 0, nightMinutes: 30 })).toThrow();
  });

  it("throws on zero nightMinutes", () => {
    expect(() => resolveDayNightConfig({ dayMinutes: 30, nightMinutes: 0 })).toThrow();
  });
});

describe("reverseDayNightConfig", () => {
  it("reverses DayNightLength=60, DayLightLength=18 to 45 day / 15 night", () => {
    const result = reverseDayNightConfig(60, 18);
    expect(result.dayMinutes).toBe(45);
    expect(result.nightMinutes).toBe(15);
  });

  it("reverses DayNightLength=120, DayLightLength=12 to 60/60", () => {
    const result = reverseDayNightConfig(120, 12);
    expect(result.dayMinutes).toBe(60);
    expect(result.nightMinutes).toBe(60);
  });

  it("ensures neither value is zero", () => {
    const result = reverseDayNightConfig(60, 23);
    expect(result.dayMinutes).toBeGreaterThan(0);
    expect(result.nightMinutes).toBeGreaterThan(0);
  });

  it("clamps inputs to valid ranges", () => {
    const result = reverseDayNightConfig(5, 25);
    expect(result.dayMinutes + result.nightMinutes).toBe(10); // clamped to min
  });
});

describe("round-trip", () => {
  it("resolve then reverse returns original values", () => {
    const config = resolveDayNightConfig({ dayMinutes: 45, nightMinutes: 15 });
    const back = reverseDayNightConfig(config.DayNightLength, config.DayLightLength);
    expect(back.dayMinutes).toBe(45);
    expect(back.nightMinutes).toBe(15);
  });

  it("round-trips 30/30", () => {
    const config = resolveDayNightConfig({ dayMinutes: 30, nightMinutes: 30 });
    const back = reverseDayNightConfig(config.DayNightLength, config.DayLightLength);
    expect(back.dayMinutes).toBe(30);
    expect(back.nightMinutes).toBe(30);
  });
});
