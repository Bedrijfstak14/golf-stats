/**
 * Strokes gained: SG = E(start) − E(eind) − 1 (− 1 extra bij een strafslag).
 *
 * De tourbaseline is een benadering van de gepubliceerde PGA Tour-waarden (Broadie),
 * omgerekend naar meters. Handicapniveaus zijn afgeleid door het "extra" boven één slag
 * op te schalen. Vervang deze tabellen zodra een betere bron is gekozen (open punt).
 */
import type { Lie } from "./types";

type Table = [number, number][]; // [afstand in meters, verwacht aantal slagen]

const Y = 0.9144; // yard → meter
const FT = 0.3048; // voet → meter
const yards = (rows: [number, number][]): Table => rows.map(([d, e]) => [d * Y, e]);
const feet = (rows: [number, number][]): Table => rows.map(([d, e]) => [d * FT, e]);

const TOUR: Record<Exclude<Lie, "penalty">, Table> = {
  tee: yards([
    [100, 2.92], [120, 2.99], [140, 2.97], [160, 2.99], [180, 3.05], [200, 3.12], [220, 3.17], [240, 3.25],
    [260, 3.45], [280, 3.65], [300, 3.71], [320, 3.79], [340, 3.86], [360, 3.92], [380, 3.96], [400, 3.99],
    [420, 4.02], [440, 4.08], [460, 4.17], [480, 4.28], [500, 4.41], [520, 4.54], [540, 4.65], [560, 4.74],
    [580, 4.79], [600, 4.82],
  ]),
  fairway: yards([
    [0, 1.0], [10, 2.18], [20, 2.4], [40, 2.6], [60, 2.7], [80, 2.75], [100, 2.8], [120, 2.85], [140, 2.91],
    [160, 2.98], [180, 3.08], [200, 3.19], [220, 3.32], [240, 3.45], [260, 3.58], [280, 3.69], [300, 3.78],
    [350, 4.0], [400, 4.2], [500, 4.6],
  ]),
  rough: yards([
    [0, 1.0], [10, 2.34], [20, 2.59], [40, 2.78], [60, 2.91], [80, 2.96], [100, 3.02], [120, 3.08], [140, 3.15],
    [160, 3.23], [180, 3.31], [200, 3.42], [220, 3.53], [240, 3.64], [260, 3.74], [280, 3.83], [300, 3.9],
    [350, 4.1], [400, 4.3], [500, 4.7],
  ]),
  bunker: yards([
    [0, 1.0], [10, 2.43], [20, 2.53], [40, 2.82], [60, 3.15], [80, 3.24], [100, 3.23], [120, 3.21], [140, 3.22],
    [160, 3.28], [180, 3.4], [200, 3.55], [220, 3.7], [240, 3.84], [260, 3.93], [280, 4.0], [300, 4.04],
    [400, 4.4],
  ]),
  recovery: yards([
    [0, 1.0], [20, 3.1], [50, 3.4], [100, 3.8], [120, 3.78], [140, 3.8], [160, 3.81], [180, 3.82], [200, 3.87],
    [220, 3.92], [240, 3.97], [260, 4.03], [280, 4.1], [300, 4.2], [400, 4.5],
  ]),
  green: feet([
    [0, 1.0], [1, 1.001], [2, 1.01], [3, 1.04], [4, 1.13], [5, 1.23], [6, 1.34], [7, 1.42], [8, 1.5], [9, 1.56],
    [10, 1.61], [15, 1.78], [20, 1.87], [30, 1.98], [40, 2.06], [50, 2.14], [60, 2.21], [90, 2.4], [120, 2.6],
  ]),
};

export const BASELINES = {
  tour: { label: "Tourspeler", hcp: -5 },
  scratch: { label: "Scratch (hcp 0)", hcp: 0 },
  hcp10: { label: "Handicap 10", hcp: 10 },
  hcp20: { label: "Handicap 20", hcp: 20 },
  hcp30: { label: "Handicap 30", hcp: 30 },
} as const;
export type BaselineKey = keyof typeof BASELINES;

function interpolate(table: Table, d: number): number {
  if (d <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [d1, e1] = table[i];
    if (d <= d1) {
      const [d0, e0] = table[i - 1];
      return e0 + ((e1 - e0) * (d - d0)) / (d1 - d0);
    }
  }
  // extrapoleren met de laatste helling
  const [d0, e0] = table[table.length - 2];
  const [d1, e1] = table[table.length - 1];
  return e1 + ((e1 - e0) * (d - d1)) / (d1 - d0);
}

/** Verwacht aantal slagen tot de hole vanaf een ligging en afstand (meters). */
export function expectedStrokes(lie: Lie, distance: number, baseline: BaselineKey = "scratch"): number {
  const table = TOUR[lie === "penalty" ? "recovery" : lie];
  const tour = interpolate(table, Math.max(0, distance));
  const factor = 1 + 0.018 * (BASELINES[baseline].hcp - BASELINES.tour.hcp);
  return 1 + (tour - 1) * factor;
}

export type SgCategory = "offTheTee" | "approach" | "aroundGreen" | "putting";

export const SG_LABELS: Record<SgCategory, string> = {
  offTheTee: "Off the tee",
  approach: "Approach",
  aroundGreen: "Around the green",
  putting: "Putting",
};

export interface SgShotInput {
  lie: Lie;
  distance: number;
  penalty?: boolean;
  club?: string | null;
}

export function categorize(shot: SgShotInput, index: number, par: number): SgCategory {
  if (shot.lie === "green") return "putting";
  if (index === 0 && shot.lie === "tee" && par >= 4) return "offTheTee";
  if (shot.distance > 30) return "approach";
  return "aroundGreen";
}

export interface SgShotResult extends SgShotInput {
  category: SgCategory;
  sg: number;
}

/** SG per slag voor een hole. De laatste slag eindigt in de hole (E = 0). */
export function holeStrokesGained(shots: SgShotInput[], par: number, baseline: BaselineKey = "scratch"): SgShotResult[] {
  return shots.map((s, i) => {
    const start = expectedStrokes(s.lie, s.distance, baseline);
    const next = shots[i + 1];
    const end = next ? expectedStrokes(next.lie, next.distance, baseline) : 0;
    const sg = start - end - 1 - (s.penalty ? 1 : 0);
    return { ...s, category: categorize(s, i, par), sg: Math.round(sg * 1000) / 1000 };
  });
}

export type SgTotals = Record<SgCategory, number> & { total: number };

export function sumByCategory(results: SgShotResult[]): SgTotals {
  const t: SgTotals = { offTheTee: 0, approach: 0, aroundGreen: 0, putting: 0, total: 0 };
  for (const r of results) {
    t[r.category] += r.sg;
    t.total += r.sg;
  }
  for (const k of Object.keys(t) as (keyof SgTotals)[]) t[k] = Math.round(t[k] * 100) / 100;
  return t;
}

export interface ClubDistance {
  club: string;
  shots: number;
  avg: number;
  spread: number;
}

/** Gemiddelde afstand en spreiding per club, uit de slagenreeksen (afstand = start − eind). */
export function clubDistances(holes: SgShotInput[][]): ClubDistance[] {
  const acc = new Map<string, number[]>();
  for (const shots of holes)
    shots.forEach((s, i) => {
      if (!s.club || s.lie === "green" || s.penalty) return;
      const next = shots[i + 1];
      const carried = next ? s.distance - next.distance : s.distance;
      if (carried <= 0) return;
      acc.set(s.club, [...(acc.get(s.club) ?? []), carried]);
    });
  return [...acc.entries()]
    .map(([club, ds]) => {
      const avg = ds.reduce((a, b) => a + b, 0) / ds.length;
      const sd = Math.sqrt(ds.reduce((a, d) => a + (d - avg) ** 2, 0) / ds.length);
      return { club, shots: ds.length, avg: Math.round(avg), spread: Math.round(sd) };
    })
    .sort((a, b) => b.avg - a.avg);
}

/** Snelinvoer: "2 putts, eerste van 8 m" → putts met geschatte afstanden. */
export function quickPutts(count: number, firstDistance: number): SgShotInput[] {
  const out: SgShotInput[] = [];
  for (let i = 0; i < count; i++) {
    const d = i === 0 ? firstDistance : i === count - 1 ? Math.min(1, firstDistance / 4) : Math.max(0.5, firstDistance / (3 * i));
    out.push({ lie: "green", distance: Math.round(d * 10) / 10 });
  }
  return out;
}
