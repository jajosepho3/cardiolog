import { describe, it, expect } from "vitest";
import {
  speedMETs, walkingVO2, runningVO2, tanakaHRmax, pctHRR, hrMETs,
  intensityZone, metMinutes, vo2maxToMETmax, normalizeGrade,
} from "./met.js";

describe("ACSM speed-based METs (reference values, ±0.2)", () => {
  it("walk 3.0 mph flat ≈ 3.3 METs", () => {
    expect(speedMETs("walk", 3.0, 0)).toBeCloseTo(3.3, 1);
  });
  it("walk 2.0 mph flat ≈ 2.5 METs", () => {
    expect(speedMETs("walk", 2.0, 0)).toBeCloseTo(2.5, 1);
  });
  it("jog 5.0 mph flat ≈ 8.7 METs", () => {
    expect(speedMETs("jog", 5.0, 0)).toBeCloseTo(8.7, 1);
  });
  it("run 6.0 mph flat ≈ 10.2 METs", () => {
    expect(speedMETs("run", 6.0, 0)).toBeCloseTo(10.2, 1);
  });
});

describe("grade increases work", () => {
  it("walking uphill costs more than flat", () => {
    expect(walkingVO2(3.0, 0.05)).toBeGreaterThan(walkingVO2(3.0, 0));
  });
  it("running uphill costs more than flat", () => {
    expect(runningVO2(6.0, 0.05)).toBeGreaterThan(runningVO2(6.0, 0));
  });
  it("grade accepts percent or fraction equivalently", () => {
    expect(normalizeGrade(2)).toBeCloseTo(0.02, 5);
    expect(normalizeGrade(0.02)).toBeCloseTo(0.02, 5);
  });
});

describe("HR-based METs (Tanaka + Karvonen %HRR)", () => {
  it("Tanaka HRmax for age 30 = 187", () => {
    expect(tanakaHRmax(30)).toBeCloseTo(187, 5);
  });
  it("%HRR midpoint maps correctly", () => {
    // rest 60, max 190 → HRR 130; HR 125 → (125-60)/130 = 0.5
    expect(pctHRR(125, 60, 190)).toBeCloseTo(0.5, 5);
  });
  it("%HRR clamps to [0,1]", () => {
    expect(pctHRR(40, 60, 190)).toBe(0);
    expect(pctHRR(220, 60, 190)).toBe(1);
  });
  it("METs at 50% HRR with METmax 12 = 6.5", () => {
    // 1 + 0.5*(12-1) = 6.5
    expect(hrMETs(0.5, 12)).toBeCloseTo(6.5, 5);
  });
  it("METmax from VO2max 42 ≈ 12", () => {
    expect(vo2maxToMETmax(42)).toBeCloseTo(12, 1);
  });
});

describe("intensity zones from %HRR", () => {
  it("classifies the ACSM bands", () => {
    expect(intensityZone(0.3)).toBe("light");
    expect(intensityZone(0.45)).toBe("moderate");
    expect(intensityZone(0.7)).toBe("vigorous");
    expect(intensityZone(0.95)).toBe("near-max");
  });
});

describe("MET-minutes", () => {
  it("multiplies METs by minutes", () => {
    expect(metMinutes(5, 30)).toBe(150);
  });
});
