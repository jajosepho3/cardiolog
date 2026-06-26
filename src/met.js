// ─────────────────────────────────────────────────────────────────────────────
// MET MATH — pure functions, unit-tested (see met.test.js)
//
// Speed-based: ACSM metabolic equations (Walking / Running). VO2 in mL·kg⁻¹·min⁻¹.
//   1 MET = 3.5 mL·kg⁻¹·min⁻¹ resting O2 uptake → METs = VO2 / 3.5.
// HR-based: %HRR ≈ %VO2-reserve (Karvonen), METmax from VO2max (Tanaka HRmax default).
//
// References: ACSM's Guidelines for Exercise Testing and Prescription; Tanaka et al.
// 2001 (HRmax = 208 − 0.7·age); Karvonen heart-rate-reserve method.
// ─────────────────────────────────────────────────────────────────────────────

export const REST_VO2 = 3.5;            // mL/kg/min = 1 MET
export const MPH_TO_M_PER_MIN = 26.8;   // 1 mph ≈ 26.8 m/min

export function mphToMetersPerMin(mph) {
  return (Number(mph) || 0) * MPH_TO_M_PER_MIN;
}

// Grade may be entered as a percent (e.g. 2 → 2%) or a fraction (0.02). Normalize.
export function normalizeGrade(grade) {
  const g = Number(grade) || 0;
  return Math.abs(g) > 1 ? g / 100 : g;
}

// ACSM walking equation. Valid roughly 1.9–4.0 mph.
export function walkingVO2(mph, grade = 0) {
  const S = mphToMetersPerMin(mph);
  const G = normalizeGrade(grade);
  return REST_VO2 + 0.1 * S + 1.8 * S * G;
}

// ACSM running equation. Valid roughly ≥4–5 mph (and treadmill jogging ≥3 mph).
export function runningVO2(mph, grade = 0) {
  const S = mphToMetersPerMin(mph);
  const G = normalizeGrade(grade);
  return REST_VO2 + 0.2 * S + 0.9 * S * G;
}

// METs from speed + modality. Walking eq for walking; running eq for jog/run.
// Other equipment modalities fall back to the equation closest to the chosen speed.
export function speedMETs(modality, mph, grade = 0) {
  const useRun = modality === "jog" || modality === "run";
  const vo2 = useRun ? runningVO2(mph, grade) : walkingVO2(mph, grade);
  return vo2 / REST_VO2;
}

// Tanaka age-predicted maximum heart rate (more accurate than 220 − age).
export function tanakaHRmax(age) {
  return 208 - 0.7 * (Number(age) || 0);
}

export function hrReserve(hrMax, hrRest) {
  return Math.max(1, (Number(hrMax) || 0) - (Number(hrRest) || 0));
}

// Fraction of heart-rate reserve at a given HR, clamped to [0, 1].
export function pctHRR(hr, hrRest, hrMax) {
  const num = (Number(hr) || 0) - (Number(hrRest) || 0);
  const frac = num / hrReserve(hrMax, hrRest);
  return Math.min(1, Math.max(0, frac));
}

// METs from %HRR using %HRR ≈ %VO2-reserve: METs = 1 + pHRR·(METmax − 1).
export function hrMETs(pHRR, metMax = 10) {
  const p = Math.min(1, Math.max(0, Number(pHRR) || 0));
  return 1 + p * ((Number(metMax) || 10) - 1);
}

export function vo2maxToMETmax(vo2max) {
  return (Number(vo2max) || 0) / REST_VO2;
}

// Intensity zone from %HRR (ACSM intensity classification).
export function intensityZone(pHRR) {
  const p = Number(pHRR) || 0;
  if (p < 0.40) return "light";
  if (p < 0.60) return "moderate";
  if (p < 0.90) return "vigorous";
  return "near-max";
}

// Map a computed MET value to an intensity bucket when logging by speed
// (3–6 METs ≈ moderate; ≥6 METs ≈ vigorous; <3 light) — for dose weighting.
export function metsToIntensity(mets) {
  const m = Number(mets) || 0;
  if (m < 3) return "light";
  if (m < 6) return "moderate";
  return "vigorous";
}

export function metMinutes(mets, durationMin) {
  return (Number(mets) || 0) * (Number(durationMin) || 0);
}

export const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
