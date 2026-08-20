import { describe, expect, it } from "vitest";
import { cmToFeetAndInches, formatHeightImperial, formatWeightImperial, kgToLbs } from "./units";

describe("units conversion", () => {
  it("converts cm to feet and inches correctly", () => {
    expect(cmToFeetAndInches(null)).toBeNull();
    expect(cmToFeetAndInches(0)).toBeNull();
    expect(cmToFeetAndInches(-10)).toBeNull();

    // 180 cm = 70.866 inches -> 71 inches = 5 ft 11 in
    expect(cmToFeetAndInches(180)).toEqual({ feet: 5, inches: 11 });
    expect(formatHeightImperial(180)).toBe("5'11\"");

    // 183 cm = 72.047 inches -> 72 inches = 6 ft 0 in
    expect(cmToFeetAndInches(183)).toEqual({ feet: 6, inches: 0 });
    expect(formatHeightImperial(183)).toBe("6'0\"");

    // 195 cm = 76.77 inches -> 77 inches = 6 ft 5 in
    expect(cmToFeetAndInches(195)).toEqual({ feet: 6, inches: 5 });
    expect(formatHeightImperial(195)).toBe("6'5\"");

    // 170 cm = 66.9 inches -> 67 inches = 5 ft 7 in
    expect(cmToFeetAndInches(170)).toEqual({ feet: 5, inches: 7 });
    expect(formatHeightImperial(170)).toBe("5'7\"");
  });

  it("converts kg to lbs correctly", () => {
    expect(kgToLbs(null)).toBeNull();
    expect(kgToLbs(0)).toBeNull();

    // 70 kg * 2.20462 = 154.32 -> 154 lbs
    expect(kgToLbs(70)).toBe(154);
    expect(formatWeightImperial(70)).toBe("154 lbs");

    // 80 kg * 2.20462 = 176.36 -> 176 lbs
    expect(kgToLbs(80)).toBe(176);
    expect(formatWeightImperial(80)).toBe("176 lbs");
  });
});
