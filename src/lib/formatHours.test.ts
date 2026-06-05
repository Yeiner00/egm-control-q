import { describe, expect, it } from "vitest";
import { decimalToHHMM, sumHoursToHHMM } from "./formatHours";

describe("decimalToHHMM", () => {
  it("formats whole hours without minutes", () => {
    expect(decimalToHHMM(0)).toBe("0:00");
    expect(decimalToHHMM(1)).toBe("1:00");
    expect(decimalToHHMM(12)).toBe("12:00");
  });

  it("formats fractional hours as zero-padded minutes", () => {
    expect(decimalToHHMM(0.83)).toBe("0:50");
    expect(decimalToHHMM(0.5)).toBe("0:30");
    expect(decimalToHHMM(1.5)).toBe("1:30");
    expect(decimalToHHMM(2.25)).toBe("2:15");
  });

  it("rounds minutes to the nearest whole minute", () => {
    expect(decimalToHHMM(0.0083)).toBe("0:00");
    expect(decimalToHHMM(0.0167)).toBe("0:01");
  });

  it("returns a single hyphen for null and undefined", () => {
    expect(decimalToHHMM(null)).toBe("-");
    expect(decimalToHHMM(undefined)).toBe("-");
  });
});

describe("sumHoursToHHMM", () => {
  it("sums decimal values and formats the total", () => {
    expect(sumHoursToHHMM([0.5, 0.5])).toBe("1:00");
    expect(sumHoursToHHMM([0.83, 1.5])).toBe("2:20");
  });

  it("treats null and undefined entries as zero", () => {
    expect(sumHoursToHHMM([null, 0.83])).toBe("0:50");
    expect(sumHoursToHHMM([undefined, undefined])).toBe("0:00");
  });

  it("returns 0:00 when every entry is null or undefined", () => {
    expect(sumHoursToHHMM([null, undefined])).toBe("0:00");
    expect(sumHoursToHHMM([])).toBe("0:00");
  });
});
