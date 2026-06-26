# CardioLog

A personal cardiovascular activity tracker and **evidence-based exercise-dosing** companion to IronLog. Logs aerobic activity, computes METs accurately, accumulates weekly MET-minutes, and doses for depression/anxiety using published effect sizes — with a mental-health-safe reinforcement layer to sustain adherence.

Single-user, mobile-first, browser-based. Data lives in `localStorage`. Vite + React, single `src/App.jsx`, no UI framework.

## The science

**MET math** (`src/met.js`, unit-tested):
- Speed: ACSM walking/running metabolic equations (`VO2 = 3.5 + 0.1·S + 1.8·S·G` walk; `0.2·S + 0.9·S·G` run), METs = VO2 / 3.5.
- Heart rate: Tanaka HRmax (`208 − 0.7·age`) + Karvonen %HRR, `METs = 1 + %HRR·(METmax − 1)`.
- MET-minutes = METs × minutes.

**Dosing** (weekly MET-minutes; 1 MET-h = 60 MET-min):
- Minimum-effective ≈ **600** MET-min/wk (~150 min moderate); optimal plateau ≈ **1800** (~30 MET-h) — capped on purpose.
- Depression treatment: Hedges *g* ≈ −0.6 (Noetel 2024 BMJ; Heissel 2023; Singh 2023). Anxiety treatment: SMD ≈ −0.42 to −0.47. Anxiety prevention (observational): 8–16% lower incident risk (2025 eClinicalMedicine; Schuch 2019). Certainty is generally **low**; intensity is the most reliable lever, but light activity still helps.

**Reinforcement** (mental-health-safe): self-monitoring + weekly goal-setting (Samdal 2017), if-then implementation intentions (Gollwitzer & Sheeran, d≈0.65), autonomy-supportive framing (SDT), forgiving weekly-dose streaks with grace weeks, informational rewards (no points dependence / overjustification), gamification as light scaffolding only (Mazéas 2022).

## ⚠️ Disclaimer

CardioLog is a **personal wellness tool — not medical advice, diagnosis, or treatment.** Exercise is an *adjunct* to, not a replacement for, therapy or medication for clinical depression or anxiety. Talk to a clinician before starting. If you're in crisis, call or text **988** (US Suicide & Crisis Lifeline) or your local emergency number. Targets reflect activity levels *associated in research* with reduced symptoms, not a guaranteed prescription; prevention figures are not treatment effects.

## Develop

```bash
npm install
npm run dev     # dev server
npm test        # MET-math unit tests
npm run build   # production build
```
