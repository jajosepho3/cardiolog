import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  speedMETs, tanakaHRmax, pctHRR, hrMETs, intensityZone, metsToIntensity,
  metMinutes, vo2maxToMETmax, round1,
} from "./met.js";

// ─────────────────────────────────────────────────────────────────────────────
// THEME (chic blue — matches IronLog)
// ─────────────────────────────────────────────────────────────────────────────
const T = {
  bg:"#F3F6FB", surface:"#E8EDF5", card:"#FCFDFF", cardHover:"#EFF3F9",
  border:"rgba(80,112,160,0.16)", borderAlt:"rgba(80,112,160,0.36)",
  accent:"#4F71A0", accentGlow:"rgba(79,113,160,0.07)", accentSoft:"rgba(79,113,160,0.12)",
  green:"#2E7D63", greenDim:"rgba(46,125,99,0.10)", greenBorder:"rgba(46,125,99,0.26)",
  warn:"#C87040", warnDim:"rgba(200,112,64,0.09)", warnBorder:"rgba(200,112,64,0.26)",
  text:"#151A23", textMid:"#566276", textDim:"#5E6A7C", white:"#FFFFFF",
};
const F = { serif:"'DM Serif Display',Georgia,serif", sans:"'DM Sans',sans-serif" };

// Intensity → display
const ZONE = {
  light:    { label:"Light",     color:"#8FA8C9" },
  moderate: { label:"Moderate",  color:"#4F71A0" },
  vigorous: { label:"Vigorous",  color:"#2E7D63" },
  "near-max":{ label:"Near-max", color:"#C87040" },
};
const MODALITIES = [
  { id:"walk", label:"Walk",       speed:true },
  { id:"jog",  label:"Jog",        speed:true },
  { id:"run",  label:"Run",        speed:true },
  { id:"bike", label:"Bike",       speed:false },
  { id:"elliptical", label:"Elliptical", speed:false },
  { id:"other",label:"Other",      speed:false },
];

// ─────────────────────────────────────────────────────────────────────────────
// DOSE ENGINE — evidence-based weekly targets (MET-minutes/week). 1 MET-h = 60 MET-min.
//   Minimum-effective ≈ 600 MET-min/wk (~150 min moderate / ~10 MET-h)
//   Optimal plateau   ≈ 1800 MET-min/wk (~30 MET-h) — cap; do NOT push higher.
// ─────────────────────────────────────────────────────────────────────────────
const DOSE = { FLOOR: 300, MIN: 600, OPTIMAL: 1800 };

// Label the evidence tier of a chosen weekly GOAL (not the accumulated volume).
function goalTier(goal) {
  const g = Number(goal) || 0;
  if (g >= DOSE.OPTIMAL) return { label:"Optimal plateau — capped on purpose; more isn't better", color:T.green };
  if (g >= 1200)         return { label:"Upper evidence-based range", color:T.green };
  if (g >= DOSE.MIN)     return { label:"Minimum-effective range (≈150 min moderate/wk)", color:T.green };
  return { label:"Gentle start — below the minimum-effective dose, but light activity still helps", color:T.accent };
}

const DOSE_PRESETS = [
  { v:300,  label:"Gentle" },
  { v:600,  label:"Min-effective" },
  { v:1200, label:"Build" },
  { v:1800, label:"Optimal" },
];

const CONDITIONS = {
  depression: {
    label:"Depression",
    short:"Antidepressant effect: moderate-to-large (Hedges g ≈ −0.6 vs control; walking/jogging g ≈ −0.62, Noetel 2024). Certainty: LOW.",
    guidance:"More is not better — a sustainable ~150 min/week beat higher volumes in trials. Prioritize consistency; expect benefit in ~8–12 weeks.",
    effect:"g ≈ −0.6 (moderate–large), low certainty",
    celebrate:"aerobic exercise is associated with a moderate-to-large antidepressant effect (Hedges g ≈ −0.6 vs. control)",
  },
  anxiety: {
    label:"Anxiety",
    short:"Anti-anxiety effect: moderate (SMD ≈ −0.42 to −0.47 vs control). Lower certainty than depression; small trials.",
    guidance:"Treatment effects are modest but real; moderate–vigorous movement tends to help most, though any movement counts. (Separately, observational data link higher activity to lower risk of developing anxiety — that's prevention, not symptom relief.)",
    effect:"SMD ≈ −0.45 (moderate), low certainty",
    celebrate:"aerobic exercise is associated with a moderate anti-anxiety effect (SMD ≈ −0.45 vs. control)",
  },
  general: {
    label:"General mood / prevention",
    short:"Meeting WHO activity (~600 MET-min/wk) is associated with 8–14% lower risk of developing anxiety; ~1800 MET-min/wk (~30 MET-h) with ~16% lower risk.",
    guidance:"These are prevention (risk-reduction) figures from observational studies — not a treatment effect for existing symptoms.",
    effect:"8–16% lower incident-anxiety risk (prevention)",
    celebrate:"you're in the range linked to roughly 8–16% lower risk of developing anxiety",
  },
};

// Which evidence tier has this week's volume reached?
function doseTier(metMin) {
  if (metMin >= DOSE.OPTIMAL) return { key:"optimal", label:"Optimal range", color:T.green };
  if (metMin >= DOSE.MIN)     return { key:"effective", label:"Minimum-effective dose met", color:T.green };
  if (metMin > 0)             return { key:"building", label:"Building", color:T.accent };
  return { key:"none", label:"Not started", color:T.textDim };
}

// Translate remaining MET-min into a relatable bout (brisk walk ≈ 5 METs, jog ≈ 8 METs).
function remainingBout(remainingMetMin) {
  if (remainingMetMin <= 0) return "dose met";
  const walkMin = Math.round(remainingMetMin / 4); // brisk walk ≈ 4 METs (~3.5 mph, within ACSM range)
  const jogMin = Math.round(remainingMetMin / 8);  // easy jog ≈ 8 METs (~4.6 mph)
  return `~${walkMin} min brisk walk · ~${jogMin} min jog`;
}

// ─────────────────────────────────────────────────────────────────────────────
// DATE / WEEK UTILITIES (local-noon math, DST-safe — mirrors IronLog)
// ─────────────────────────────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, "0");
const formatDate = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const today = () => formatDate(new Date());
const uid = () => Math.random().toString(36).slice(2,10) + Date.now().toString(36);
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function getWeekMonday(dateStr) {
  const d = new Date(typeof dateStr === "string" ? dateStr + "T12:00:00" : dateStr);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
const currentWeekMonday = () => getWeekMonday(new Date());

function addDaysStr(dateStr, n) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return formatDate(d);
}
function weekLabelOf(mondayStr) {
  const mon = new Date(mondayStr + "T12:00:00");
  const sun = new Date(mondayStr + "T12:00:00"); sun.setDate(sun.getDate()+6);
  const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${m[mon.getMonth()]} ${mon.getDate()} – ${m[sun.getMonth()]} ${sun.getDate()}`;
}
function daysLeftInWeek() {
  const day = new Date().getDay();
  return day === 0 ? 0 : 7 - day; // days remaining after today through Sunday
}

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS / DATA DEFAULTS
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  age: 35, sex: "", weightLb: 160, unit: "lb",
  restingHR: 60, maxHR: null, vo2max: null, metMax: 10,
  condition: "general", reminderTime: "", reminderEnabled: false,
  daysPerWeek: 5, // active days/week → drives the daily MET-min target
};
const INITIAL_DATA = {
  sessions: [],
  weekStartDate: null,
  weeklyGoalMetMin: DOSE.MIN,
  ifThenPlan: { cue: "", action: "" },
  streak: { current: 0, best: 0, freezes: 1, history: {} },
  lastCelebratedWeek: null,
  lastCelebratedDay: null,
  settings: { ...DEFAULT_SETTINGS },
};

// Daily MET-min target = weekly goal spread across the user's active days/week.
function dailyTargetOf(weeklyGoal, daysPerWeek) {
  const dpw = Math.min(7, Math.max(1, Number(daysPerWeek) || 5));
  return Math.max(1, Math.round((Number(weeklyGoal) || DOSE.MIN) / dpw));
}

// ─────────────────────────────────────────────────────────────────────────────
// SESSION → METs/MET-min  (compute from stored inputs using settings)
// ─────────────────────────────────────────────────────────────────────────────
function computeSession(input, settings) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const dur = Math.min(1440, Math.max(0, Number(input.durationMin) || 0));
  let mets = 0, zone = null;
  if (input.inputMode === "hr") {
    const hrMax = s.maxHR ? Number(s.maxHR) : tanakaHRmax(s.age);
    // Average ONLY the bounds actually provided, so a single value isn't halved.
    const provided = [input.hrLow, input.hrHigh].map(Number).filter((v) => v > 0);
    const avg = (input.hrAvg != null && input.hrAvg !== "")
      ? Number(input.hrAvg)
      : (provided.length ? provided.reduce((a, b) => a + b, 0) / provided.length : 0);
    const p = pctHRR(avg, s.restingHR, hrMax);
    const metMax = s.vo2max ? vo2maxToMETmax(s.vo2max) : (Number(s.metMax) || 10);
    mets = hrMETs(p, metMax);
    zone = intensityZone(p);
  } else {
    const mph = Math.min(25, Math.max(0, Number(input.mph) || 0));
    const grade = Math.max(-40, Math.min(40, Number(input.grade) || 0));
    mets = Math.max(0, speedMETs(input.modality, mph, grade));
    zone = metsToIntensity(mets);
  }
  return { mets: round1(mets), zone, metMinutes: Math.round(metMinutes(mets, dur)) };
}

// ─────────────────────────────────────────────────────────────────────────────
// WEEKLY AGGREGATES
// ─────────────────────────────────────────────────────────────────────────────
function sessionsInWeek(sessions, mondayStr) {
  const end = addDaysStr(mondayStr, 7);
  return sessions.filter((x) => x.date >= mondayStr && x.date < end);
}
function weekMetMin(sessions, mondayStr) {
  return sessionsInWeek(sessions, mondayStr).reduce((sum, x) => sum + (Number(x.metMinutes)||0), 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// PERSISTENCE
// ─────────────────────────────────────────────────────────────────────────────
const STORAGE_KEY = "cardiolog-v1";

const storageAdapter = (() => {
  const hasLS = (() => {
    try { localStorage.setItem("__cl__","1"); localStorage.removeItem("__cl__"); return true; }
    catch { return false; }
  })();
  return {
    get: (k) => { try { return hasLS ? localStorage.getItem(k) : null; } catch { return null; } },
    set: (k, v) => { try { if (hasLS) localStorage.setItem(k, v); } catch { /* quota */ } },
  };
})();

// Evaluate the just-ended week into streak state, then advance to the current week.
function rolloverIfNeeded(data) {
  const cur = currentWeekMonday();
  if (!data.weekStartDate) return { ...data, weekStartDate: cur };
  if (data.weekStartDate === cur) return data;
  // Clock rolled back / stored week is in the future → protect data, don't roll.
  const storedT = new Date(data.weekStartDate + "T12:00:00").getTime();
  const curT = new Date(cur + "T12:00:00").getTime();
  if (storedT > curT) return data;

  const goal = data.weeklyGoalMetMin || DOSE.MIN;
  let { current = 0, best = 0, freezes = 1, history = {} } = data.streak || {};
  history = { ...history };
  // Score EVERY ended week from the stored week up to (but not including) the
  // current week — so multi-week gaps are graded correctly and backdated
  // sessions in skipped weeks still earn credit.
  let wk = data.weekStartDate;
  let guard = 0;
  while (wk !== cur && guard++ < 520) {
    const mm = weekMetMin(data.sessions || [], wk);
    const met = mm >= goal && mm > 0;
    history[wk] = met;
    if (met) {
      current += 1;
      best = Math.max(best, current);
      if (current % 4 === 0) freezes = Math.min(2, freezes + 1); // earn a grace week
    } else if (freezes > 0) {
      freezes -= 1; // grace: streak survives a missed week
    } else {
      current = 0;
    }
    wk = addDaysStr(wk, 7);
  }
  return { ...data, weekStartDate: cur, streak: { current, best, freezes, history }, lastCelebratedWeek: null };
}

function migrate(raw) {
  if (!raw || typeof raw !== "object") return INITIAL_DATA;
  return {
    ...INITIAL_DATA, ...raw,
    settings: { ...DEFAULT_SETTINGS, ...(raw.settings || {}) },
    streak: { ...INITIAL_DATA.streak, ...(raw.streak || {}) },
    ifThenPlan: { ...INITIAL_DATA.ifThenPlan, ...(raw.ifThenPlan || {}) },
  };
}

function usePersistedState() {
  const [data, setData] = useState(INITIAL_DATA);
  const [loaded, setLoaded] = useState(false);
  const latest = useRef(INITIAL_DATA);

  useEffect(() => {
    const rawStr = storageAdapter.get(STORAGE_KEY);
    let parsed = INITIAL_DATA;
    try { if (rawStr) parsed = migrate(JSON.parse(rawStr)); } catch { parsed = INITIAL_DATA; }
    const rolled = rolloverIfNeeded(parsed);
    latest.current = rolled;
    setData(rolled);
    setLoaded(true);
    storageAdapter.set(STORAGE_KEY, JSON.stringify(rolled));
  }, []);

  // Resolve the updater synchronously so callers can read the resulting state
  // immediately (e.g. celebration crossing) and storage is always current.
  const persist = useCallback((next) => {
    const resolved = typeof next === "function" ? next(latest.current) : next;
    latest.current = resolved;
    storageAdapter.set(STORAGE_KEY, JSON.stringify(resolved));
    setData(resolved);
  }, []);

  useEffect(() => {
    const flush = () => storageAdapter.set(STORAGE_KEY, JSON.stringify(latest.current));
    const onVisible = () => {
      // Returning to the foreground across a week boundary → roll the week over
      // (the hydration effect only runs once, so a long-open tab needs this).
      if (latest.current.weekStartDate && latest.current.weekStartDate !== currentWeekMonday()) {
        const rolled = rolloverIfNeeded(latest.current);
        latest.current = rolled;
        storageAdapter.set(STORAGE_KEY, JSON.stringify(rolled));
        setData(rolled);
      }
    };
    const vis = () => { if (document.visibilityState === "hidden") flush(); else onVisible(); };
    window.addEventListener("beforeunload", flush);
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", vis);
    };
  }, []);

  return [data, persist, loaded];
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV — Raw Session Log (export ↔ import, de-duped by id)
// ─────────────────────────────────────────────────────────────────────────────
const CSV_HEADERS = [
  "Session ID","Saved At","Week Start","Date","Modality","Input Mode","MPH","Grade %",
  "Duration (min)","HR Low","HR High","HR Avg","Intensity Zone","METs","MET-minutes","Notes",
];
function csvEscape(v) {
  if (v == null) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function buildCSV(sessions) {
  const sorted = [...sessions].sort((a,b) => a.date.localeCompare(b.date) || (a.timestamp||"").localeCompare(b.timestamp||""));
  const lines = [CSV_HEADERS.join(",")];
  for (const x of sorted) {
    lines.push([
      x.id, x.timestamp || "", getWeekMonday(x.date), x.date, x.modality, x.inputMode,
      x.mph ?? "", x.grade ?? "", x.durationMin ?? "", x.hrLow ?? "", x.hrHigh ?? "", x.hrAvg ?? "",
      x.intensityZone ?? "", x.mets ?? "", x.metMinutes ?? "", x.notes ?? "",
    ].map(csvEscape).join(","));
  }
  return lines.join("\r\n");
}
function parseCSVRows(text) {
  const rows = []; let row = [], field = "", q = false, i = 0;
  const endF = () => { row.push(field); field = ""; };
  const endR = () => { endF(); rows.push(row); row = []; };
  while (i < text.length) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i+1] === '"') { field += '"'; i += 2; continue; } q = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"') { q = true; i++; continue; }
    if (c === ",") { endF(); i++; continue; }
    if (c === "\n") { endR(); i++; continue; }
    if (c === "\r") { i++; continue; }
    field += c; i++;
  }
  if (field.length || row.length) endR();
  return rows;
}
function parseSessionCSV(text) {
  if (!text || !text.trim()) return { sessions: [], error: "The file is empty." };
  const rows = parseCSVRows(text).filter((r) => r.some((c) => String(c).trim() !== ""));
  const hi = rows.findIndex((r) => r.map((c) => String(c).trim()).includes("Session ID"));
  if (hi < 0) return { sessions: [], error: 'No "Session ID" column found — is this a Raw Session Log CSV?' };
  const header = rows[hi].map((c) => String(c).trim());
  const col = (n) => header.indexOf(n);
  const ci = {
    id: col("Session ID"), saved: col("Saved At"), date: col("Date"), modality: col("Modality"),
    mode: col("Input Mode"), mph: col("MPH"), grade: col("Grade %"), dur: col("Duration (min)"),
    hrLow: col("HR Low"), hrHigh: col("HR High"), hrAvg: col("HR Avg"), zone: col("Intensity Zone"),
    mets: col("METs"), metMin: col("MET-minutes"), notes: col("Notes"),
  };
  const g = (r, k) => (ci[k] >= 0 && ci[k] < r.length ? String(r[ci[k]]).trim() : "");
  const num = (v) => (v === "" ? null : Number(v));
  const sessions = [];
  for (const r of rows.slice(hi + 1)) {
    const id = g(r, "id"); const date = g(r, "date").slice(0, 10);
    if (!id || !date) continue;
    sessions.push({
      id, date, timestamp: g(r, "saved") || new Date(date + "T12:00:00").toISOString(),
      modality: g(r, "modality") || "other", inputMode: g(r, "mode") || "speed",
      mph: num(g(r, "mph")), grade: num(g(r, "grade")), durationMin: num(g(r, "dur")),
      hrLow: num(g(r, "hrLow")), hrHigh: num(g(r, "hrHigh")), hrAvg: num(g(r, "hrAvg")),
      intensityZone: g(r, "zone") || null, mets: num(g(r, "mets")), metMinutes: num(g(r, "metMin")) || 0,
      notes: g(r, "notes"),
    });
  }
  return { sessions, error: null };
}
function downloadCSV(filename, text) {
  const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─────────────────────────────────────────────────────────────────────────────
// SMALL UI PRIMITIVES
// ─────────────────────────────────────────────────────────────────────────────
function Card({ children, style }) {
  return <div style={{ background:T.card, borderRadius:14, padding:"20px", marginBottom:12, boxShadow:"0 1px 4px rgba(30,50,90,0.05)", border:`1px solid ${T.border}`, ...style }}>{children}</div>;
}
function SectionLabel({ children, color }) {
  return <p style={{ margin:"0 0 14px", fontSize:11, fontWeight:600, color:color||T.textDim, textTransform:"uppercase", letterSpacing:"0.06em" }}>{children}</p>;
}
function SCard({ label, value, sub, tone }) {
  const c = tone === "green" ? T.green : tone === "accent" ? T.accent : T.text;
  return (
    <div style={{ background:T.card, borderRadius:14, padding:"18px 20px", boxShadow:"0 1px 4px rgba(30,50,90,0.05)", border:`1px solid ${T.border}` }}>
      <p style={{ margin:0, fontSize:26, fontFamily:F.serif, color:c, lineHeight:1.05 }}>{value}</p>
      <p style={{ margin:"4px 0 0", fontSize:12, color:T.textDim }}>{label}</p>
      {sub && <p style={{ margin:"2px 0 0", fontSize:11, color:T.textDim }}>{sub}</p>}
    </div>
  );
}
function GhostBtn({ onClick, children, style }) {
  return <button onClick={onClick} style={{ padding:"10px 14px", background:T.surface, border:`1px solid ${T.borderAlt}`, borderRadius:10, color:T.textMid, cursor:"pointer", fontSize:13, fontWeight:600, minHeight:44, fontFamily:F.sans, ...style }}>{children}</button>;
}
function PrimaryBtn({ onClick, children, disabled, style }) {
  return <button onClick={onClick} disabled={disabled} style={{ padding:"12px 16px", background:disabled?"rgba(79,113,160,0.4)":T.accent, color:T.white, border:"none", borderRadius:10, cursor:disabled?"not-allowed":"pointer", fontSize:14, fontWeight:600, minHeight:46, fontFamily:F.sans, ...style }}>{children}</button>;
}
function Ring({ pct, size=72, stroke=7, color=T.accent, children }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const off = circ * (1 - Math.min(1, Math.max(0, pct)));
  return (
    <div style={{ position:"relative", width:size, height:size, flexShrink:0 }}>
      <svg width={size} height={size} style={{ transform:"rotate(-90deg)" }} aria-hidden="true">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={T.surface} strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round" style={{ transition:"stroke-dashoffset 0.6s ease" }} />
      </svg>
      <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>{children}</div>
    </div>
  );
}
function Sparkline({ series, color=T.accent, width=70, height=26 }) {
  if (!series || series.length === 0) return null;
  const p = 3;
  if (series.length === 1) {
    const y = height/2;
    return <svg width={width} height={height} aria-hidden="true" style={{ display:"block" }}><circle cx={width-p} cy={y} r="2.4" fill={color} /></svg>;
  }
  const min = Math.min(...series), max = Math.max(...series), range = (max-min)||1, n = series.length;
  const pt = (v,i) => [p + (i/(n-1))*(width-p*2), (height-p) - ((v-min)/range)*(height-p*2)];
  const pts = series.map(pt);
  const line = pts.map((q,i)=>(i===0?"M":"L")+q[0].toFixed(1)+" "+q[1].toFixed(1)).join(" ");
  const area = `M${pts[0][0].toFixed(1)} ${(height-p).toFixed(1)} ` + pts.map((q)=>`L${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(" ") + ` L${pts[n-1][0].toFixed(1)} ${(height-p).toFixed(1)} Z`;
  const last = pts[n-1];
  return (
    <svg width={width} height={height} aria-hidden="true" style={{ display:"block", overflow:"visible" }}>
      <path d={area} fill={color} opacity="0.10" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.4" fill={color} />
    </svg>
  );
}
const INP = { background:T.card, border:`1px solid ${T.border}`, borderRadius:10, padding:"11px 12px", color:T.text, fontSize:15, outline:"none", width:"100%", minHeight:46, fontFamily:F.sans };
const LBL = { fontSize:12, fontWeight:600, color:T.textMid, marginBottom:6, display:"block" };
function Field({ label, children }) {
  return <div style={{ marginBottom:14 }}><label style={LBL}>{label}</label>{children}</div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// DISCLAIMER (persistent, mandatory)
// ─────────────────────────────────────────────────────────────────────────────
function Disclaimer({ compact }) {
  return (
    <div style={{ background:T.warnDim, border:`1px solid ${T.warnBorder}`, borderRadius:12, padding:"12px 14px", marginBottom:12 }}>
      <p style={{ margin:0, fontSize:11.5, color:T.textMid, lineHeight:1.55 }}>
        <strong style={{ color:T.warn }}>Wellness tool, not medical care.</strong> CardioLog is for personal tracking and is <strong>not</strong> medical advice, diagnosis, or treatment. Exercise is an <strong>adjunct</strong> to — not a replacement for — therapy or medication for clinical depression or anxiety. Talk to a clinician before starting.
        {!compact && <> Targets reflect <em>activity levels associated in research with reduced symptoms</em>, not a guaranteed prescription. If you’re in crisis, call or text <strong>988</strong> (US Suicide &amp; Crisis Lifeline) or your local emergency number.</>}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// APP
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [data, persist, loaded] = usePersistedState();
  const [page, setPage] = useState("overview");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [celebrate, setCelebrate] = useState(null);

  const settings = useMemo(() => ({ ...DEFAULT_SETTINGS, ...(data.settings || {}) }), [data.settings]);
  const weekStart = data.weekStartDate || currentWeekMonday();
  const goal = data.weeklyGoalMetMin || DOSE.MIN;
  const weekMM = useMemo(() => weekMetMin(data.sessions, weekStart), [data.sessions, weekStart]);
  const condition = CONDITIONS[settings.condition] || CONDITIONS.general;

  const showToast = (msg, tone = "green") => {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 3400);
  };

  // Save a session; fire a daily toast and a weekly celebration pop-up on first crossing.
  const saveSession = (sess) => {
    const mm = Number(sess.metMinutes) || 0;
    let weeklyCrossed = false, dailyCrossed = false, weekTotal = 0;
    persist((prev) => {
      const ws = prev.weekStartDate || currentWeekMonday();
      const g = prev.weeklyGoalMetMin || DOSE.MIN;
      const beforeW = weekMetMin(prev.sessions, ws);
      weekTotal = beforeW + mm;
      weeklyCrossed = beforeW < g && weekTotal >= g && prev.lastCelebratedWeek !== ws;
      const dTarget = dailyTargetOf(g, prev.settings?.daysPerWeek);
      let lastDay = prev.lastCelebratedDay;
      if (sess.date === today()) {
        const beforeD = prev.sessions.filter((x) => x.date === sess.date).reduce((s, x) => s + (Number(x.metMinutes)||0), 0);
        dailyCrossed = beforeD < dTarget && (beforeD + mm) >= dTarget && prev.lastCelebratedDay !== sess.date;
        if (dailyCrossed) lastDay = sess.date;
      }
      return { ...prev, sessions: [...prev.sessions, sess], lastCelebratedWeek: weeklyCrossed ? ws : prev.lastCelebratedWeek, lastCelebratedDay: lastDay };
    });
    if (weeklyCrossed) setCelebrate({ weekTotal });
    else if (dailyCrossed) showToast("✓ Daily dose met — nice work today. 💙");
    else showToast(`Logged ${Math.round(mm)} MET-min · ${sess.mets} METs`);
    setPage("overview");
  };
  const deleteSession = (id) => persist((prev) => ({ ...prev, sessions: prev.sessions.filter((x) => x.id !== id) }));

  const importSessions = (incoming) => {
    let added = 0, skipped = 0;
    persist((prev) => {
      const have = new Set(prev.sessions.map((x) => x.id));
      const fresh = incoming.filter((x) => x.id && !have.has(x.id));
      added = fresh.length; skipped = incoming.length - fresh.length;
      return fresh.length ? { ...prev, sessions: [...prev.sessions, ...fresh] } : prev;
    });
    return { added, skipped };
  };

  const navItems = [
    { id:"overview", label:"Overview", icon:(a)=><svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={a?2:1.5}><rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1"/><rect x="9" y="1.5" width="5.5" height="5.5" rx="1"/><rect x="1.5" y="9" width="5.5" height="5.5" rx="1"/><rect x="9" y="9" width="5.5" height="5.5" rx="1"/></svg> },
    { id:"log", label:"Log", icon:(a)=><svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={a?2:1.5}><path d="M8 3v10M3 8h10"/></svg> },
    { id:"analytics", label:"Analytics", icon:(a)=><svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={a?2:1.5}><path d="M1.5 14l4-5 3.5 2.5L14 4"/></svg> },
    { id:"history", label:"History", icon:(a)=><svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={a?2:1.5}><rect x="1.5" y="2.5" width="13" height="12" rx="1.5"/><path d="M1.5 6.5h13M5 1.5v2M11 1.5v2"/></svg> },
  ];

  if (!loaded) return <div style={{ minHeight:"100vh", background:T.bg }} />;

  return (
    <div style={{ minHeight:"100vh", background:T.bg, color:T.text, paddingBottom:88, fontFamily:F.sans }}>
      <header style={{ position:"sticky", top:0, zIndex:20, background:T.surface, borderBottom:`1px solid ${T.border}`, padding:"16px 20px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <span style={{ fontFamily:F.serif, fontSize:22, color:T.text }}>Cardio<span style={{ color:T.accent }}>Log</span></span>
        <button onClick={() => setSettingsOpen(true)} aria-label="Settings" style={{ background:"none", border:"none", cursor:"pointer", color:T.textMid, minWidth:44, minHeight:44, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="10" cy="10" r="2.5"/><path d="M10 1.5v2M10 16.5v2M3 10H1.5M18.5 10H17M4.8 4.8L3.7 3.7M16.3 16.3l-1.1-1.1M4.8 15.2l-1.1 1.1M16.3 3.7l-1.1 1.1"/></svg>
        </button>
      </header>

      <main style={{ maxWidth:560, margin:"0 auto", padding:"20px 16px 0" }}>
        {page === "overview" && <OverviewPage data={data} persist={persist} settings={settings} condition={condition} weekStart={weekStart} goal={goal} weekMM={weekMM} setPage={setPage} onAbout={() => setAboutOpen(true)} onAdjust={() => setAdjustOpen(true)} />}
        {page === "log" && <LogPage settings={settings} onSave={saveSession} />}
        {page === "analytics" && <AnalyticsPage data={data} settings={settings} weekStart={weekStart} goal={goal} weekMM={weekMM} onImport={importSessions} toast={showToast} />}
        {page === "history" && <HistoryPage data={data} settings={settings} onDelete={deleteSession} />}
      </main>

      <nav style={{ position:"fixed", bottom:0, left:0, right:0, background:T.surface, borderTop:`1px solid ${T.border}`, display:"flex", padding:"6px 0 max(6px, env(safe-area-inset-bottom))", zIndex:20 }}>
        {navItems.map((item) => {
          const active = page === item.id;
          return (
            <button key={item.id} onClick={() => setPage(item.id)} aria-current={active ? "page" : undefined} aria-label={item.label}
              style={{ flex:1, background:"none", border:"none", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:3, padding:"6px 0", color:active?T.accent:T.textDim, minHeight:48 }}>
              {item.icon(active)}
              <span style={{ fontSize:11, fontWeight:active?600:500 }}>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {settingsOpen && <SettingsModal data={data} persist={persist} settings={settings} onClose={() => setSettingsOpen(false)} onAbout={() => { setSettingsOpen(false); setAboutOpen(true); }} />}
      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
      {adjustOpen && <AdjustDoseModal data={data} persist={persist} settings={settings} onClose={() => setAdjustOpen(false)} />}
      {celebrate && <CelebrateModal weekTotal={celebrate.weekTotal} goal={goal} condition={condition} onClose={() => setCelebrate(null)} />}

      {toast && (
        <div role="status" aria-live="polite" style={{ position:"fixed", bottom:96, left:"50%", transform:"translateX(-50%)", zIndex:50, animation:"toastUp 0.25s ease", background:toast.tone==="green"?T.green:T.accent, color:T.white, borderRadius:12, padding:"12px 18px", maxWidth:340, width:"90%", textAlign:"center", fontSize:13, fontWeight:500, boxShadow:"0 8px 24px rgba(30,50,90,0.25)", lineHeight:1.45 }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OVERVIEW
// ─────────────────────────────────────────────────────────────────────────────
function OverviewPage({ data, persist, settings, condition, weekStart, goal, weekMM, setPage, onAbout, onAdjust }) {
  const pct = goal > 0 ? weekMM / goal : 0;
  const remaining = Math.max(0, goal - weekMM);
  const tier = doseTier(weekMM);
  const weeklyMet = weekMM >= goal;
  const streak = data.streak || { current:0, best:0, freezes:0 };
  const hr = new Date().getHours();
  const greet = hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";

  // Daily dose = weekly goal spread across active days/week.
  const dailyTarget = dailyTargetOf(goal, settings.daysPerWeek);
  const todayMM = data.sessions.filter((x) => x.date === today()).reduce((s, x) => s + (Number(x.metMinutes)||0), 0);
  const dailyMet = todayMM >= dailyTarget;
  const dailyPct = dailyTarget > 0 ? todayMM / dailyTarget : 0;

  const days = useMemo(() => Array.from({ length:7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const ds = formatDate(d);
    const mm = data.sessions.filter((x) => x.date === ds).reduce((s, x) => s + (Number(x.metMinutes)||0), 0);
    return { ds, day: DAYS[d.getDay()].slice(0,1), mm, isToday: ds === today(), met: mm >= dailyTarget };
  }), [data.sessions, today(), dailyTarget]);
  const maxBar = Math.max(...days.map((d) => d.mm), 1);
  const daysAria = "Last 7 days, MET-minutes: " + days.map((d) => `${DAYS[new Date(d.ds+"T12:00:00").getDay()]} ${Math.round(d.mm)}`).join(", ");

  const [editPlan, setEditPlan] = useState(!data.ifThenPlan?.action);
  const [cue, setCue] = useState(data.ifThenPlan?.cue || "");
  const [action, setAction] = useState(data.ifThenPlan?.action || "");
  const savePlan = () => { persist((p) => ({ ...p, ifThenPlan: { cue, action } })); setEditPlan(false); };

  return (
    <div style={{ animation:"fadeUp 0.4s ease" }}>
      <p style={{ margin:"0 0 4px", fontSize:12, fontWeight:600, color:T.accent, letterSpacing:"0.08em", textTransform:"uppercase" }}>{greet}</p>
      <h1 style={{ margin:"0 0 4px", fontSize:32, fontFamily:F.serif, fontWeight:400, color:T.text }}>This Week</h1>
      <p style={{ margin:"0 0 20px", fontSize:13, color:T.textDim }}>{weekLabelOf(weekStart)} · {daysLeftInWeek() === 0 ? "last day" : `${daysLeftInWeek()} day${daysLeftInWeek()!==1?"s":""} left`}</p>

      <Disclaimer compact />

      <Card>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
          <p style={{ margin:0, fontSize:11, fontWeight:600, color:T.textDim, textTransform:"uppercase", letterSpacing:"0.06em" }}>Weekly dose</p>
          <button onClick={onAdjust} style={{ background:T.surface, border:`1px solid ${T.borderAlt}`, borderRadius:20, color:T.accent, cursor:"pointer", fontSize:12, fontWeight:600, padding:"8px 14px", minHeight:36, fontFamily:F.sans }}>Adjust dose ⚙</button>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:18 }}>
          <Ring pct={pct} size={92} stroke={9} color={weekMM >= goal ? T.green : T.accent}>
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:18, fontWeight:700, fontFamily:F.serif, color:T.text, lineHeight:1 }}>{Math.round(pct*100)}<span style={{ fontSize:11 }}>%</span></div>
            </div>
          </Ring>
          <div style={{ flex:1, minWidth:0 }}>
            <p style={{ margin:0, fontSize:22, fontFamily:F.serif, color:T.text, lineHeight:1.1 }}>{Math.round(weekMM)}<span style={{ fontSize:13, color:T.textDim, fontFamily:F.sans }}> / {goal} MET-min</span></p>
            <p style={{ margin:"4px 0 0", fontSize:12.5, fontWeight:600, color:tier.color }}>{weeklyMet ? "✓ " : ""}{tier.label}</p>
            <p style={{ margin:"3px 0 0", fontSize:12, color:T.textDim }}>{remaining > 0 ? <>Dose remaining → <strong style={{ color:T.textMid }}>{remainingBout(remaining)}</strong></> : "Weekly dose met for your goal 💙"}</p>
          </div>
        </div>
        <button onClick={onAbout} style={{ marginTop:14, width:"100%", background:T.accentGlow, border:`1px solid ${T.border}`, borderRadius:10, padding:"10px 12px", cursor:"pointer", textAlign:"left", fontFamily:F.sans }}>
          <p style={{ margin:0, fontSize:11, fontWeight:600, color:T.accent, textTransform:"uppercase", letterSpacing:"0.05em" }}>{condition.label} · {condition.effect}</p>
          <p style={{ margin:"4px 0 0", fontSize:12, color:T.textMid, lineHeight:1.45 }}>{condition.guidance} <span style={{ color:T.accent, fontWeight:600 }}>About the dose →</span></p>
        </button>
      </Card>

      <Card>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
          <div style={{ minWidth:0 }}>
            <p style={{ margin:0, fontSize:11, fontWeight:600, color:T.textDim, textTransform:"uppercase", letterSpacing:"0.06em" }}>Today</p>
            <p style={{ margin:"4px 0 0", fontSize:18, fontFamily:F.serif, color:T.text }}>{Math.round(todayMM)} <span style={{ fontSize:12, color:T.textDim, fontFamily:F.sans }}>/ {dailyTarget} MET-min</span></p>
          </div>
          {dailyMet
            ? <span style={{ display:"inline-flex", alignItems:"center", gap:6, background:T.greenDim, border:`1px solid ${T.greenBorder}`, color:T.green, borderRadius:20, padding:"7px 13px", fontSize:12.5, fontWeight:700, flexShrink:0 }}>✓ Daily dose met</span>
            : <span style={{ fontSize:12, color:T.textDim, textAlign:"right", flexShrink:0 }}>{Math.max(0, dailyTarget - Math.round(todayMM))} MET-min to go</span>}
        </div>
        <div style={{ marginTop:10, height:6, background:T.surface, borderRadius:3 }} role="img" aria-label={`Today ${Math.round(todayMM)} of ${dailyTarget} MET-minutes${dailyMet ? ", daily dose met" : ""}`}>
          <div style={{ height:"100%", width:`${Math.min(100, dailyPct*100)}%`, background:dailyMet?T.green:T.accent, borderRadius:3, transition:"width 0.4s ease" }} />
        </div>
      </Card>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
        <SCard label="Week streak (dose met)" value={`${streak.current||0}🔥`} sub={streak.freezes ? `${streak.freezes} grace week${streak.freezes!==1?"s":""} banked` : "no shame in resting"} tone="green" />
        <SCard label="Best streak" value={streak.best || 0} tone="accent" />
      </div>

      <Card>
        <SectionLabel color={T.accent}>This week, I will…</SectionLabel>
        {editPlan ? (
          <div>
            <Field label="When / where (cue)"><input style={INP} value={cue} placeholder="After my morning coffee" onChange={(e)=>setCue(e.target.value)} /></Field>
            <Field label="I will (action)"><input style={INP} value={action} placeholder="walk 25 minutes around the block" onChange={(e)=>setAction(e.target.value)} /></Field>
            <PrimaryBtn onClick={savePlan} disabled={!action.trim()} style={{ width:"100%" }}>Save my plan</PrimaryBtn>
          </div>
        ) : (
          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12 }}>
            <p style={{ margin:0, fontSize:15, color:T.text, lineHeight:1.5 }}>
              <span style={{ color:T.textDim }}>When</span> {data.ifThenPlan.cue || "—"}, <span style={{ color:T.textDim }}>I will</span> {data.ifThenPlan.action}.
            </p>
            <button onClick={() => setEditPlan(true)} style={{ background:"none", border:"none", color:T.accent, cursor:"pointer", fontSize:12, fontWeight:600, flexShrink:0, minHeight:44, padding:"0 6px" }}>Edit</button>
          </div>
        )}
      </Card>

      <Card>
        <SectionLabel>Activity — last 7 days (MET-min)</SectionLabel>
        <div role="img" aria-label={daysAria} style={{ display:"flex", gap:6, alignItems:"flex-end", height:64 }}>
          {days.map((d) => (
            <div key={d.ds} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:5 }}>
              <div style={{ width:"100%", height:`${Math.max((d.mm/maxBar)*48, d.mm>0?8:3)}px`, background:d.met?T.green:d.isToday?T.accent:d.mm>0?"rgba(79,113,160,0.35)":T.surface, borderRadius:4, transition:"height 0.3s ease", minHeight:3 }} />
              <span style={{ fontSize:10, fontWeight:d.isToday?700:400, color:d.isToday?T.accent:T.textDim, textTransform:"uppercase" }}>{d.day}</span>
            </div>
          ))}
        </div>
      </Card>

      <PrimaryBtn onClick={() => setPage("log")} style={{ width:"100%", padding:"16px", fontSize:15, borderRadius:12, boxShadow:"0 4px 16px rgba(79,113,160,0.25)" }}>
        Log a session →
      </PrimaryBtn>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LOG
// ─────────────────────────────────────────────────────────────────────────────
function LogPage({ settings, onSave }) {
  const [modality, setModality] = useState("walk");
  const [inputMode, setInputMode] = useState("speed");
  const [mph, setMph] = useState("3.0");
  const [grade, setGrade] = useState("0");
  const [hrLow, setHrLow] = useState("");
  const [hrHigh, setHrHigh] = useState("");
  const [duration, setDuration] = useState("30");
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState("");

  const modalityDef = MODALITIES.find((m) => m.id === modality) || MODALITIES[0];
  const effectiveMode = modalityDef.speed ? inputMode : "hr";

  const preview = useMemo(() => computeSession({
    modality, inputMode: effectiveMode, mph, grade, durationMin: duration, hrLow, hrHigh,
  }, settings), [modality, effectiveMode, mph, grade, duration, hrLow, hrHigh, settings]);

  const canSave = (Number(duration) > 0) && (effectiveMode === "speed" ? Number(mph) > 0 : (Number(hrLow) > 0 || Number(hrHigh) > 0));

  const save = () => {
    const provided = [hrLow, hrHigh].map(Number).filter((v) => v > 0);
    const hrAvg = effectiveMode === "hr" ? (provided.length ? provided.reduce((a,b)=>a+b,0)/provided.length : null) : null;
    onSave({
      id: uid(), date, timestamp: new Date().toISOString(),
      modality, inputMode: effectiveMode,
      mph: effectiveMode === "speed" ? Math.min(25, Math.max(0, Number(mph)||0)) : null,
      grade: effectiveMode === "speed" ? Math.max(-40, Math.min(40, Number(grade)||0)) : null,
      durationMin: Math.min(1440, Math.max(0, Number(duration)||0)),
      hrLow: effectiveMode === "hr" ? (Number(hrLow)||null) : null,
      hrHigh: effectiveMode === "hr" ? (Number(hrHigh)||null) : null,
      hrAvg,
      intensityZone: preview.zone, mets: preview.mets, metMinutes: preview.metMinutes,
      notes: notes.trim(),
    });
  };

  const zoneInfo = ZONE[preview.zone] || ZONE.moderate;

  return (
    <div style={{ animation:"fadeUp 0.4s ease" }}>
      <h1 style={{ margin:"0 0 20px", fontSize:32, fontFamily:F.serif, fontWeight:400, color:T.text }}>Log a session</h1>

      <Card>
        <Field label="Activity">
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {MODALITIES.map((m) => (
              <button key={m.id} onClick={() => setModality(m.id)} style={{ padding:"9px 14px", borderRadius:20, border:`1px solid ${modality===m.id?T.accent:T.border}`, background:modality===m.id?T.accentSoft:T.card, color:modality===m.id?T.accent:T.textMid, fontWeight:600, fontSize:13, cursor:"pointer", minHeight:44 }}>{m.label}</button>
            ))}
          </div>
        </Field>

        {modalityDef.speed && (
          <Field label="Measure by">
            <div style={{ display:"flex", background:T.surface, borderRadius:10, padding:3 }}>
              {[["speed","Speed (mph)"],["hr","Heart rate"]].map(([id,lab]) => (
                <button key={id} onClick={() => setInputMode(id)} style={{ flex:1, padding:"9px 0", borderRadius:8, border:"none", background:inputMode===id?T.card:"transparent", color:inputMode===id?T.accent:T.textMid, fontWeight:600, fontSize:13, cursor:"pointer", minHeight:44, boxShadow:inputMode===id?"0 1px 3px rgba(30,50,90,0.1)":"none" }}>{lab}</button>
              ))}
            </div>
          </Field>
        )}
        {!modalityDef.speed && <p style={{ margin:"-4px 0 14px", fontSize:12, color:T.textDim }}>Equipment activities are logged by heart rate.</p>}

        {effectiveMode === "speed" ? (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <Field label="Speed (mph)"><input style={INP} inputMode="decimal" value={mph} onChange={(e)=>setMph(e.target.value)} /></Field>
            <Field label="Incline / grade (%)"><input style={INP} inputMode="decimal" value={grade} onChange={(e)=>setGrade(e.target.value)} /></Field>
          </div>
        ) : (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <Field label="Avg HR low (bpm)"><input style={INP} inputMode="numeric" value={hrLow} placeholder="120" onChange={(e)=>setHrLow(e.target.value)} /></Field>
            <Field label="Avg HR high (bpm)"><input style={INP} inputMode="numeric" value={hrHigh} placeholder="140" onChange={(e)=>setHrHigh(e.target.value)} /></Field>
          </div>
        )}

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <Field label="Duration (min)"><input style={INP} inputMode="numeric" value={duration} onChange={(e)=>setDuration(e.target.value)} /></Field>
          <Field label="Date"><input style={INP} type="date" value={date} min="2000-01-01" max={today()} onChange={(e)=>setDate(e.target.value)} /></Field>
        </div>
        <Field label="Notes (optional)"><input style={INP} value={notes} placeholder="how did it feel?" onChange={(e)=>setNotes(e.target.value)} /></Field>
      </Card>

      <Card style={{ background:T.accentGlow }}>
        <SectionLabel color={T.accent}>Live estimate</SectionLabel>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-around", textAlign:"center" }}>
          <div><p style={{ margin:0, fontSize:26, fontFamily:F.serif, color:T.text }}>{preview.mets}</p><p style={{ margin:0, fontSize:11, color:T.textDim }}>METs</p></div>
          <div><p style={{ margin:0, fontSize:26, fontFamily:F.serif, color:T.accent }}>{preview.metMinutes}</p><p style={{ margin:0, fontSize:11, color:T.textDim }}>MET-min</p></div>
          <div><span style={{ display:"inline-block", padding:"6px 12px", borderRadius:20, background:T.card, border:`1px solid ${zoneInfo.color}`, color:zoneInfo.color, fontWeight:600, fontSize:13 }}>{zoneInfo.label}</span><p style={{ margin:"4px 0 0", fontSize:11, color:T.textDim }}>intensity</p></div>
        </div>
      </Card>

      <PrimaryBtn onClick={save} disabled={!canSave} style={{ width:"100%", padding:"16px", fontSize:15, borderRadius:12 }}>Save session</PrimaryBtn>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────
function AnalyticsPage({ data, settings, weekStart, goal, weekMM, onImport, toast }) {
  const sessions = data.sessions;

  const weekly = useMemo(() => {
    const map = {};
    sessions.forEach((x) => { const w = getWeekMonday(x.date); map[w] = (map[w]||0) + (Number(x.metMinutes)||0); });
    return Object.entries(map).sort((a,b) => a[0].localeCompare(b[0])).slice(-10);
  }, [sessions]);

  const zoneDist = useMemo(() => {
    const m = { light:0, moderate:0, vigorous:0, "near-max":0 };
    sessions.forEach((x) => { if (x.intensityZone && m[x.intensityZone] != null) m[x.intensityZone] += (Number(x.metMinutes)||0); });
    return m;
  }, [sessions]);
  const zoneTotal = Object.values(zoneDist).reduce((a,b)=>a+b,0) || 1;

  const totalMM = sessions.reduce((s,x)=>s+(Number(x.metMinutes)||0),0);
  const avgWeek = weekly.length ? Math.round(weekly.reduce((s,[,v])=>s+v,0)/weekly.length) : 0;

  return (
    <div style={{ animation:"fadeUp 0.4s ease" }}>
      <h1 style={{ margin:"0 0 20px", fontSize:32, fontFamily:F.serif, fontWeight:400, color:T.text }}>Insights</h1>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))", gap:12, marginBottom:12 }}>
        <SCard label="Sessions" value={sessions.length} />
        <SCard label="This week" value={Math.round(weekMM)} sub={`/ ${goal} MET-min`} tone={weekMM>=goal?"green":undefined} />
        <SCard label="Avg / week" value={avgWeek} sub="MET-min" tone="accent" />
        <SCard label="Total MET-min" value={Math.round(totalMM)} />
      </div>

      {weekly.length > 0 && (
        <Card>
          <SectionLabel color={T.accent}>Weekly MET-minutes vs target</SectionLabel>
          <div role="img" aria-label={`Weekly MET-minutes, last ${weekly.length} weeks (goal ${goal}): ${weekly.map(([,v])=>Math.round(v)).join(", ")}`} style={{ display:"flex", alignItems:"flex-end", gap:5, height:90, marginBottom:6 }}>
            {weekly.map(([w, v]) => {
              const maxV = Math.max(...weekly.map(([,vv])=>vv), goal);
              const met = v >= goal;
              return (
                <div key={w} style={{ flex:1, display:"flex", flexDirection:"column", justifyContent:"flex-end", alignItems:"center", height:"100%" }}>
                  <div style={{ width:"100%", height:`${Math.max((v/maxV)*78, v>0?6:2)}px`, background:met?T.green:"rgba(79,113,160,0.4)", borderRadius:4, transition:"height 0.4s ease" }} />
                </div>
              );
            })}
          </div>
          <div style={{ height:1, background:T.borderAlt, marginBottom:6 }} />
          <p style={{ margin:0, fontSize:11, color:T.textDim }}>Bars over the line cleared your {goal} MET-min goal · last {weekly.length} week{weekly.length!==1?"s":""}</p>
        </Card>
      )}

      {totalMM > 0 && (
        <Card>
          <SectionLabel>Intensity distribution (MET-min)</SectionLabel>
          {Object.entries(zoneDist).filter(([,v])=>v>0).map(([z,v]) => {
            const zi = ZONE[z];
            return (
              <div key={z} style={{ marginBottom:12 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                  <span style={{ display:"flex", alignItems:"center", gap:7, fontSize:13, color:T.textMid, fontWeight:500 }}><span style={{ width:8, height:8, borderRadius:"50%", background:zi.color }} />{zi.label}</span>
                  <span style={{ fontSize:12, color:T.textDim }}>{Math.round(v)} · {Math.round(v/zoneTotal*100)}%</span>
                </div>
                <div style={{ height:5, background:T.surface, borderRadius:3 }}><div style={{ height:"100%", width:`${(v/zoneTotal)*100}%`, background:zi.color, borderRadius:3, opacity:0.8 }} /></div>
              </div>
            );
          })}
          <p style={{ margin:"8px 0 0", fontSize:11, color:T.textDim, lineHeight:1.5 }}>Moderate–vigorous activity carries the largest mood benefit, but light activity still counts.</p>
        </Card>
      )}

      <ExportImportCard sessions={sessions} onImport={onImport} toast={toast} />
    </div>
  );
}

function ExportImportCard({ sessions, onImport, toast }) {
  const fileRef = useRef(null);
  const [msg, setMsg] = useState(null);
  const doExport = () => {
    if (!sessions.length) return;
    downloadCSV(`cardiolog-sessions-${today()}.csv`, buildCSV(sessions));
    if (toast) toast("Exported your session log", "accent");
  };
  const onFile = async (e) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const { sessions: parsed, error } = parseSessionCSV(text);
      if (error) { setMsg({ ok:false, text:error }); return; }
      if (!parsed.length) { setMsg({ ok:false, text:"No sessions found in that file." }); return; }
      const { added, skipped } = onImport(parsed);
      setMsg({ ok:true, text:`Imported ${added} session${added!==1?"s":""}${skipped?`, skipped ${skipped} already logged`:""}.` });
    } catch (err) { setMsg({ ok:false, text:"Couldn't read that file: " + (err?.message || err) }); }
  };
  return (
    <Card>
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:14, flexWrap:"wrap" }}>
        <div style={{ flex:1, minWidth:170 }}>
          <p style={{ margin:"0 0 4px", fontSize:13, fontWeight:600, color:T.text }}>Export raw data</p>
          <p style={{ margin:0, fontSize:12, color:T.textDim, lineHeight:1.5 }}>Download every session as a CSV (Raw Session Log). {sessions.length ? `${sessions.length} session${sessions.length!==1?"s":""}.` : "No sessions yet."}</p>
        </div>
        <GhostBtn onClick={doExport} style={{ background:sessions.length?T.accent:"rgba(79,113,160,0.4)", color:T.white, border:"none" }}>Export CSV</GhostBtn>
      </div>
      <div style={{ marginTop:16, paddingTop:16, borderTop:`1px solid ${T.border}`, display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:14, flexWrap:"wrap" }}>
        <div style={{ flex:1, minWidth:170 }}>
          <p style={{ margin:"0 0 4px", fontSize:13, fontWeight:600, color:T.text }}>Import raw data</p>
          <p style={{ margin:0, fontSize:12, color:T.textDim, lineHeight:1.5 }}>Load a Raw Session Log CSV. Merged into your history; duplicates skipped.</p>
        </div>
        <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} style={{ display:"none" }} />
        <GhostBtn onClick={() => fileRef.current?.click()}>Import CSV</GhostBtn>
      </div>
      {msg && <p style={{ margin:"12px 0 0", fontSize:12, fontWeight:500, color:msg.ok?T.green:T.warn, lineHeight:1.5 }}>{msg.text}</p>}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HISTORY
// ─────────────────────────────────────────────────────────────────────────────
function HistoryPage({ data, settings, onDelete }) {
  const [confirmId, setConfirmId] = useState(null);
  const sorted = useMemo(() => [...data.sessions].sort((a,b) => b.date.localeCompare(a.date) || (b.timestamp||"").localeCompare(a.timestamp||"")), [data.sessions]);
  return (
    <div style={{ animation:"fadeUp 0.4s ease" }}>
      <h1 style={{ margin:"0 0 20px", fontSize:32, fontFamily:F.serif, fontWeight:400, color:T.text }}>History</h1>
      {sorted.length === 0 && <Card><p style={{ margin:0, fontSize:13, color:T.textDim }}>No sessions yet. Your logged cardio will appear here.</p></Card>}
      {sorted.map((x) => {
        const zi = ZONE[x.intensityZone] || ZONE.moderate;
        const mod = MODALITIES.find((m) => m.id === x.modality);
        const detail = x.inputMode === "speed" ? `${x.mph} mph${x.grade ? ` · ${x.grade}%` : ""}` : `HR ${x.hrLow||"–"}–${x.hrHigh||"–"}`;
        return (
          <Card key={x.id} style={{ marginBottom:10 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
              <div style={{ minWidth:0 }}>
                <p style={{ margin:0, fontSize:14, fontWeight:600, color:T.text }}>{mod?.label || x.modality} <span style={{ color:T.textDim, fontWeight:400, fontSize:13 }}>· {x.durationMin} min</span></p>
                <p style={{ margin:"3px 0 0", fontSize:12, color:T.textDim }}>{new Date(x.date+"T12:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})} · {detail} · <span style={{ color:zi.color, fontWeight:600 }}>{zi.label}</span></p>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ textAlign:"right" }}>
                  <p style={{ margin:0, fontSize:18, fontFamily:F.serif, color:T.accent }}>{x.metMinutes}</p>
                  <p style={{ margin:0, fontSize:10, color:T.textDim }}>MET-min</p>
                </div>
                {confirmId === x.id ? (
                  <button onClick={() => { onDelete(x.id); setConfirmId(null); }} style={{ background:T.warnDim, border:`1px solid ${T.warnBorder}`, color:T.warn, borderRadius:8, padding:"8px 12px", fontSize:12, fontWeight:600, cursor:"pointer", minHeight:44 }}>Delete?</button>
                ) : (
                  <button onClick={() => setConfirmId(x.id)} aria-label="Delete session" style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:8, color:T.textDim, minWidth:44, minHeight:44, cursor:"pointer", fontSize:18 }}>×</button>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// DOSE ADJUSTER — presets + slider for the weekly MET-min goal.
// Daily target derives live (goal ÷ active days); every dose-driven element
// (ring, remaining bout, daily card, green bars, streak grading) follows.
// ─────────────────────────────────────────────────────────────────────────────
function DoseAdjuster({ goal, onGoal, daysPerWeek, onDaysPerWeek }) {
  const g = Math.min(DOSE.OPTIMAL, Math.max(DOSE.FLOOR, Number(goal) || DOSE.MIN));
  const tier = goalTier(g);
  const daily = dailyTargetOf(g, daysPerWeek);
  return (
    <div>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:12 }}>
        {DOSE_PRESETS.map((p) => {
          const active = g === p.v;
          return (
            <button key={p.v} onClick={() => onGoal(p.v)}
              style={{ flex:"1 1 auto", padding:"9px 10px", borderRadius:12, border:`1px solid ${active?T.accent:T.border}`, background:active?T.accentSoft:T.card, color:active?T.accent:T.textMid, fontWeight:600, fontSize:12, cursor:"pointer", minHeight:44, textAlign:"center" }}>
              <span style={{ display:"block", fontSize:15, fontFamily:F.serif, color:active?T.accent:T.text }}>{p.v}</span>
              {p.label}
            </button>
          );
        })}
      </div>
      <input type="range" min={DOSE.FLOOR} max={DOSE.OPTIMAL} step={30} value={g}
        onChange={(e) => onGoal(Number(e.target.value))} aria-label="Weekly MET-minute goal"
        style={{ width:"100%", accentColor:T.accent, minHeight:44, cursor:"pointer" }} />
      <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", gap:10, marginTop:2 }}>
        <p style={{ margin:0, fontSize:20, fontFamily:F.serif, color:T.text }}>{g} <span style={{ fontSize:12, color:T.textDim, fontFamily:F.sans }}>MET-min / week</span></p>
        <p style={{ margin:0, fontSize:13, fontWeight:600, color:T.accent }}>≈ {daily} / day</p>
      </div>
      <p style={{ margin:"6px 0 12px", fontSize:11.5, fontWeight:600, color:tier.color, lineHeight:1.45 }}>{tier.label}</p>
      {onDaysPerWeek && (
        <div>
          <label style={LBL}>Active days / week (sets the daily dose)</label>
          <div style={{ display:"flex", gap:6 }}>
            {[3,4,5,6,7].map((n) => (
              <button key={n} onClick={() => onDaysPerWeek(n)}
                style={{ flex:1, minHeight:44, borderRadius:10, border:`1px solid ${Number(daysPerWeek)===n?T.accent:T.border}`, background:Number(daysPerWeek)===n?T.accentSoft:T.card, color:Number(daysPerWeek)===n?T.accent:T.textMid, fontWeight:600, fontSize:14, cursor:"pointer" }}>{n}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AdjustDoseModal({ data, persist, settings, onClose }) {
  const [goal, setGoal] = useState(Math.min(DOSE.OPTIMAL, Math.max(DOSE.FLOOR, Number(data.weeklyGoalMetMin) || DOSE.MIN)));
  const [dpw, setDpw] = useState(Math.min(7, Math.max(1, Number(settings.daysPerWeek) || 5)));
  const save = () => {
    persist((p) => ({ ...p, weeklyGoalMetMin: goal, settings: { ...p.settings, daysPerWeek: dpw } }));
    onClose();
  };
  return (
    <Modal title="Adjust your dose" onClose={onClose}>
      <p style={{ margin:"0 0 14px", fontSize:12.5, color:T.textMid, lineHeight:1.55 }}>Pick the weekly MET-minute dose that feels sustainable — the daily target, ring, and streak grading all follow. Consistency beats volume.</p>
      <DoseAdjuster goal={goal} onGoal={setGoal} daysPerWeek={dpw} onDaysPerWeek={setDpw} />
      <div style={{ display:"flex", gap:10, marginTop:16 }}>
        <GhostBtn onClick={onClose} style={{ flex:1 }}>Cancel</GhostBtn>
        <PrimaryBtn onClick={save} style={{ flex:2 }}>Save dose</PrimaryBtn>
      </div>
    </Modal>
  );
}

function SettingsModal({ data, persist, settings, onClose, onAbout }) {
  const [s, setS] = useState(settings);
  const [goal, setGoal] = useState(data.weeklyGoalMetMin || DOSE.MIN);
  const set = (k, v) => setS((p) => ({ ...p, [k]: v }));
  const clamp = (v, lo, hi, dflt) => { const n = Number(v); return isNaN(n) ? dflt : Math.min(hi, Math.max(lo, n)); };
  const save = () => {
    const cleanGoal = Math.min(DOSE.OPTIMAL, Math.max(DOSE.FLOOR, Number(goal) || DOSE.MIN));
    persist((p) => ({ ...p, settings: { ...p.settings, ...s,
      age: clamp(s.age,1,120,35), restingHR: clamp(s.restingHR,30,120,60),
      maxHR: s.maxHR ? clamp(s.maxHR,100,230,null) : null, vo2max: s.vo2max ? clamp(s.vo2max,10,90,null) : null,
      metMax: clamp(s.metMax,1,25,10), weightLb: clamp(s.weightLb,50,600,160),
      daysPerWeek: clamp(s.daysPerWeek,1,7,5),
    }, weeklyGoalMetMin: cleanGoal }));
    onClose();
  };
  return (
    <Modal title="Settings" onClose={onClose}>
      <Field label="Condition focus">
        <select style={INP} value={s.condition} onChange={(e)=>set("condition", e.target.value)}>
          <option value="general">General mood / prevention</option>
          <option value="depression">Depression</option>
          <option value="anxiety">Anxiety</option>
        </select>
      </Field>
      <Field label={`Weekly dose (MET-min) · ${DOSE.FLOOR}–${DOSE.OPTIMAL}`}>
        <DoseAdjuster goal={goal} onGoal={setGoal} daysPerWeek={s.daysPerWeek} onDaysPerWeek={(n)=>set("daysPerWeek", n)} />
      </Field>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Field label="Age"><input style={INP} inputMode="numeric" value={s.age} onChange={(e)=>set("age", e.target.value)} /></Field>
        <Field label="Resting HR (bpm)"><input style={INP} inputMode="numeric" value={s.restingHR} onChange={(e)=>set("restingHR", e.target.value)} /></Field>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Field label="Max HR (optional)"><input style={INP} inputMode="numeric" value={s.maxHR ?? ""} placeholder={`Tanaka: ${Math.round(tanakaHRmax(Number(s.age)||35))}`} onChange={(e)=>set("maxHR", e.target.value)} /></Field>
        <Field label="VO₂max (optional)"><input style={INP} inputMode="decimal" value={s.vo2max ?? ""} placeholder="if known" onChange={(e)=>set("vo2max", e.target.value)} /></Field>
      </div>
      <Field label="Max METs (est. fitness, used if no VO₂max)"><input style={INP} inputMode="decimal" value={s.metMax} onChange={(e)=>set("metMax", e.target.value)} /></Field>
      <p style={{ margin:"-4px 0 16px", fontSize:11, color:T.textDim, lineHeight:1.5 }}>Max METs powers the heart-rate estimate. Default 10 (~VO₂max 35) is a rough average — set your VO₂max if you know it for accuracy.</p>

      <button onClick={onAbout} style={{ width:"100%", textAlign:"left", background:T.accentGlow, border:`1px solid ${T.border}`, borderRadius:10, padding:"12px 14px", cursor:"pointer", marginBottom:14, fontFamily:F.sans }}>
        <p style={{ margin:0, fontSize:13, fontWeight:600, color:T.accent }}>About the dose · the evidence →</p>
        <p style={{ margin:"3px 0 0", fontSize:12, color:T.textMid }}>Effect sizes, citations, and the safety framing.</p>
      </button>

      <Disclaimer />
      <div style={{ display:"flex", gap:10 }}>
        <GhostBtn onClick={onClose} style={{ flex:1 }}>Cancel</GhostBtn>
        <PrimaryBtn onClick={save} style={{ flex:2 }}>Save</PrimaryBtn>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ABOUT / EVIDENCE
// ─────────────────────────────────────────────────────────────────────────────
function AboutModal({ onClose }) {
  const Cite = ({ children }) => <span style={{ color:T.textDim, fontSize:11 }}>{children}</span>;
  return (
    <Modal title="About the dose" onClose={onClose}>
      <Disclaimer />
      <p style={{ margin:"0 0 14px", fontSize:13, color:T.textMid, lineHeight:1.6 }}>
        CardioLog targets weekly <strong>MET-minutes</strong> (METs × minutes) — the standard way to quantify an aerobic “dose.” Tiers below are anchored to peer-reviewed, adversarially fact-checked evidence.
      </p>

      <Section title="Depression (treatment)">
        Moderate-to-large antidepressant effect: <strong>Hedges g ≈ −0.6</strong> vs control (walking/jogging g ≈ −0.62). Benefit typically within <strong>8–12 weeks</strong>. <em>More volume is not better</em> — a sustainable ~150 min/week outperformed higher volumes. <Cite>Noetel 2024 BMJ (218 RCTs); Heissel 2023 BJSM; Singh 2023 BJSM. GRADE: low.</Cite>
      </Section>
      <Section title="Anxiety (treatment)">
        Moderate effect, lower certainty than depression: <strong>SMD ≈ −0.42 to −0.47</strong> vs control, from smaller trials. <Cite>Aylett 2018 BMC; Singh 2023 BJSM; Stubbs 2017/2021.</Cite>
      </Section>
      <Section title="Anxiety (prevention — not treatment)">
        Observational risk-reduction, labeled separately: ~600 MET-min/wk → <strong>8–14% lower</strong> risk of developing anxiety; ~1800 MET-min/wk (~30 MET-h) → <strong>~16% lower</strong>; benefit flattens and may reverse above ~50 MET-h/wk. <Cite>2025 eClinicalMedicine; Schuch 2019 (OR 0.74).</Cite>
      </Section>
      <Section title="Intensity">
        The most reliable lever. Moderate–vigorous (40–89% HRR) gives the largest effect, but <strong>light activity still helps</strong> (depression g ≈ −0.58). Any movement counts.
      </Section>
      <Section title="Dose tiers (MET-min/week)">
        Minimum-effective ≈ <strong>600</strong> (≈150 min moderate). Optimal plateau ≈ <strong>1800</strong> (~30 MET-h) — the app caps here on purpose.
      </Section>
      <Section title="Sticking with it">
        The design favors a <em>sustainable</em> dose over a maximal one, because lower-burden programs produced larger real-world effects. Weekly streaks are forgiving (grace weeks, no shame), rewards are informational (your own progress), and you set your own goals — autonomy and consistency beat pressure. <Cite>Samdal 2017; Gollwitzer &amp; Sheeran (if-then d≈0.65); Mazéas 2022; Self-Determination Theory.</Cite>
      </Section>

      <p style={{ margin:"6px 0 14px", fontSize:11, color:T.textDim, lineHeight:1.6 }}>
        <strong>Honest limits:</strong> headline effect sizes are inflated by risk-of-bias and publication bias; certainty is generally low; anxiety evidence is weaker than depression; prevention (risk) ≠ treatment (symptom) effects. Reinforcement findings come from named primary sources but were not all independently re-verified. This is a wellness tool, not a treatment.
      </p>
      <PrimaryBtn onClick={onClose} style={{ width:"100%" }}>Got it</PrimaryBtn>
    </Modal>
  );
}
function Section({ title, children }) {
  return (
    <div style={{ marginBottom:14, paddingBottom:14, borderBottom:`1px solid ${T.border}` }}>
      <p style={{ margin:"0 0 5px", fontSize:13, fontWeight:700, color:T.text }}>{title}</p>
      <p style={{ margin:0, fontSize:12.5, color:T.textMid, lineHeight:1.6 }}>{children}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CELEBRATION — weekly dose reached (names the associated effect size)
// ─────────────────────────────────────────────────────────────────────────────
function CelebrateModal({ weekTotal, goal, condition, onClose }) {
  return (
    <Modal title="Weekly dose reached" onClose={onClose}>
      <div style={{ textAlign:"center", padding:"4px 0 6px" }}>
        <div style={{ fontSize:46, marginBottom:6 }}>🎉</div>
        <p style={{ margin:"0 0 4px", fontSize:30, fontFamily:F.serif, color:T.green, lineHeight:1.1 }}>{Math.round(weekTotal)} <span style={{ fontSize:15, color:T.textDim, fontFamily:F.sans }}>MET-min</span></p>
        <p style={{ margin:"0 0 16px", fontSize:13, color:T.textMid }}>You cleared this week's {goal} MET-min goal.</p>
      </div>
      <div style={{ background:T.greenDim, border:`1px solid ${T.greenBorder}`, borderRadius:12, padding:"14px 16px", marginBottom:16 }}>
        <p style={{ margin:0, fontSize:13, color:T.textMid, lineHeight:1.6 }}>
          At this level, {condition.celebrate}. That's an <strong>association from research, not a guarantee</strong> — and consistency is what compounds. Keep going. 💙
        </p>
      </div>
      <PrimaryBtn onClick={onClose} style={{ width:"100%" }}>Keep it up</PrimaryBtn>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL SHELL
// ─────────────────────────────────────────────────────────────────────────────
function Modal({ title, children, onClose }) {
  const panelRef = useRef(null);
  const prevFocus = useRef(null);
  useEffect(() => {
    prevFocus.current = document.activeElement;
    const node = panelRef.current;
    const focusables = () => [...(node?.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') || [])]
      .filter((el) => !el.disabled && el.offsetParent !== null);
    // Move focus into the dialog on open.
    const first = focusables()[0];
    (first || node)?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "Tab") {
        const els = focusables();
        if (!els.length) return;
        const idx = els.indexOf(document.activeElement);
        if (e.shiftKey && idx <= 0) { e.preventDefault(); els[els.length - 1].focus(); }
        else if (!e.shiftKey && idx === els.length - 1) { e.preventDefault(); els[0].focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      if (prevFocus.current && prevFocus.current.focus) prevFocus.current.focus();
    };
  }, [onClose]);
  return (
    <div onClick={onClose} role="dialog" aria-modal="true" aria-label={title}
      style={{ position:"fixed", inset:0, zIndex:60, background:"rgba(21,26,35,0.45)", display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
      <div ref={panelRef} tabIndex={-1} onClick={(e)=>e.stopPropagation()} style={{ background:T.bg, width:"100%", maxWidth:560, maxHeight:"92vh", overflowY:"auto", borderRadius:"20px 20px 0 0", padding:"20px 18px max(20px, env(safe-area-inset-bottom))", animation:"toastUp 0.28s ease", outline:"none" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
          <h2 style={{ margin:0, fontSize:24, fontFamily:F.serif, fontWeight:400, color:T.text }}>{title}</h2>
          <button onClick={onClose} aria-label="Close" style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, color:T.textMid, minWidth:44, minHeight:44, cursor:"pointer", fontSize:18 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
