import { describe, expect, it } from "vitest";
import { formatGpa, formatHeightImperial, formatWeightImperial } from "./units";

describe("units helpers", () => {
  it("formats height in imperial", () => {
    expect(formatHeightImperial(185)).toBe("6'1\"");
    expect(formatHeightImperial(null)).toBeNull();
  });

  it("formats weight in imperial", () => {
    expect(formatWeightImperial(75)).toBe("165 lbs");
    expect(formatWeightImperial(null)).toBeNull();
  });

  it("formats GPA guaranteeing at least 1 decimal place without truncating higher precision", () => {
    expect(formatGpa(4)).toBe("4.0");
    expect(formatGpa(4.0)).toBe("4.0");
    expect(formatGpa(3)).toBe("3.0");
    expect(formatGpa(2)).toBe("2.0");
    expect(formatGpa(1)).toBe("1.0");
    expect(formatGpa(3.85)).toBe("3.85");
    expect(formatGpa(3.75)).toBe("3.75");
    expect(formatGpa(3.8)).toBe("3.8");
    expect(formatGpa(null)).toBeNull();
    expect(formatGpa(undefined)).toBeNull();
    expect(formatGpa(0)).toBeNull();
  });
});
