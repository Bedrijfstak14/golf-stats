/**
 * Statistieken worden altijd uit holescores berekend, nooit apart opgeslagen,
 * zodat een correctie overal direct doorwerkt.
 */
import { siRanks } from "./stableford";
import type { Fairway } from "./types";

export interface HoleLike {
  number: number;
  par: number;
  si: number;
  strokes: number | null;
  points?: number | null;
  putts?: number | null;
  fairway?: Fairway | string | null;
  gir?: boolean | null;
  penalties?: number | null;
  bunker?: number | null;
}

export interface RoundLike {
  id: number;
  date: string;
  courseLabel: string;
  holesCount: number;
  par: number;
  playingHandicap: number | null;
  format?: string;
  hasShots?: boolean;
  holes: HoleLike[];
}

export interface Distribution {
  eagle: number;
  birdie: number;
  par: number;
  bogey: number;
  double: number;
  worse: number;
}

export interface RoundStats {
  holesPlayed: number;
  gross: number;
  parPlayed: number;
  toPar: number;
  points: number;
  net: number | null;
  putts: number;
  puttsPerHole: number | null;
  puttsPerGir: number | null;
  fairways: { hits: number; of: number; left: number; right: number; short: number; long: number };
  fairwayPct: number | null;
  gir: { hits: number; of: number };
  girPct: number | null;
  scrambling: { success: number; of: number };
  scramblingPct: number | null;
  penalties: number;
  bunker: number;
  distribution: Distribution;
  threePutts: number;
  threePuttAfterGir: { count: number; of: number };
  front: number | null;
  back: number | null;
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);

export function scoreClass(strokes: number, par: number): keyof Distribution {
  const d = strokes - par;
  if (d <= -2) return "eagle";
  if (d === -1) return "birdie";
  if (d === 0) return "par";
  if (d === 1) return "bogey";
  if (d === 2) return "double";
  return "worse";
}

export function roundStats(r: RoundLike): RoundStats {
  const played = r.holes.filter((h) => h.strokes != null) as (HoleLike & { strokes: number })[];
  const gross = played.reduce((a, h) => a + h.strokes, 0);
  const parPlayed = played.reduce((a, h) => a + h.par, 0);
  const putts = played.reduce((a, h) => a + (h.putts ?? 0), 0);
  const withPutts = played.filter((h) => h.putts != null);
  const girHoles = played.filter((h) => h.gir === true);
  const girWithPutts = girHoles.filter((h) => h.putts != null);
  const fwHoles = played.filter((h) => h.par >= 4 && h.fairway && h.fairway !== "na");
  const fairways = {
    hits: fwHoles.filter((h) => h.fairway === "hit").length,
    of: fwHoles.length,
    left: fwHoles.filter((h) => h.fairway === "left").length,
    right: fwHoles.filter((h) => h.fairway === "right").length,
    short: fwHoles.filter((h) => h.fairway === "short").length,
    long: fwHoles.filter((h) => h.fairway === "long").length,
  };
  const girKnown = played.filter((h) => h.gir != null);
  const noGir = played.filter((h) => h.gir === false);
  const scrambling = { success: noGir.filter((h) => h.strokes <= h.par).length, of: noGir.length };
  const distribution: Distribution = { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0, worse: 0 };
  for (const h of played) distribution[scoreClass(h.strokes, h.par)]++;
  const threePutts = played.filter((h) => (h.putts ?? 0) >= 3).length;
  const front = r.holesCount > 9 ? sumStrokes(played.filter((h) => h.number <= 9)) : null;
  const back = r.holesCount > 9 ? sumStrokes(played.filter((h) => h.number > 9)) : null;
  return {
    holesPlayed: played.length,
    gross,
    parPlayed,
    toPar: gross - parPlayed,
    points: played.reduce((a, h) => a + (h.points ?? 0), 0),
    net: r.playingHandicap != null ? gross - r.playingHandicap : null,
    putts,
    puttsPerHole: withPutts.length ? round2(putts / withPutts.length) : null,
    puttsPerGir: girWithPutts.length ? round2(girWithPutts.reduce((a, h) => a + (h.putts ?? 0), 0) / girWithPutts.length) : null,
    fairways,
    fairwayPct: pct(fairways.hits, fairways.of),
    gir: { hits: girHoles.length, of: girKnown.length },
    girPct: pct(girHoles.length, girKnown.length),
    scrambling,
    scramblingPct: pct(scrambling.success, scrambling.of),
    penalties: played.reduce((a, h) => a + (h.penalties ?? 0), 0),
    bunker: played.reduce((a, h) => a + (h.bunker ?? 0), 0),
    distribution,
    threePutts,
    threePuttAfterGir: { count: girWithPutts.filter((h) => (h.putts ?? 0) >= 3).length, of: girWithPutts.length },
    front,
    back,
  };
}

const sumStrokes = (hs: { strokes: number }[]) => (hs.length ? hs.reduce((a, h) => a + h.strokes, 0) : null);
const round2 = (x: number) => Math.round(x * 100) / 100;
const round1 = (x: number) => Math.round(x * 10) / 10;

// ---------- Trends ----------

export type StatKey =
  | "gross"
  | "toPar"
  | "points"
  | "net"
  | "putts"
  | "fairwayPct"
  | "girPct"
  | "scramblingPct"
  | "penalties"
  | "bunker"
  | "threePutts";

export const STAT_LABELS: Record<StatKey, string> = {
  gross: "Bruto score",
  toPar: "Score t.o.v. par",
  points: "Stablefordpunten",
  net: "Netto score",
  putts: "Putts",
  fairwayPct: "Fairways %",
  girPct: "GIR %",
  scramblingPct: "Scrambling %",
  penalties: "Strafslagen",
  bunker: "Bunkerslagen",
  threePutts: "3-putts",
};

/** Statistieken die bij 9/18 holes genormaliseerd moeten worden */
const COUNTING: StatKey[] = ["gross", "toPar", "points", "net", "putts", "penalties", "bunker", "threePutts"];
/** Lager is beter */
export const LOWER_IS_BETTER: Record<StatKey, boolean> = {
  gross: true,
  toPar: true,
  points: false,
  net: true,
  putts: true,
  fairwayPct: false,
  girPct: false,
  scramblingPct: false,
  penalties: true,
  bunker: true,
  threePutts: true,
};

export type Normalize = "per18" | "perHole" | "raw";

export function statValue(s: RoundStats, key: StatKey, normalize: Normalize = "per18"): number | null {
  const v = s[key] as number | null;
  if (v == null) return null;
  if (!COUNTING.includes(key) || normalize === "raw" || s.holesPlayed === 0) return v;
  if (key === "net") {
    // netto: bruto genormaliseerd minus handicap-deel; benadering via toPar
    return normalize === "perHole" ? round2(v / s.holesPlayed) : round1((v / s.holesPlayed) * 18);
  }
  return normalize === "perHole" ? round2(v / s.holesPlayed) : round1((v / s.holesPlayed) * 18);
}

export interface TrendPoint {
  id: number;
  date: string;
  value: number | null;
  rolling: number | null;
}

export function trend(rounds: RoundLike[], key: StatKey, normalize: Normalize = "per18", window = 5): TrendPoint[] {
  const sorted = [...rounds].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  const values = sorted.map((r) => statValue(roundStats(r), key, normalize));
  return sorted.map((r, i) => {
    const w = values.slice(Math.max(0, i - window + 1), i + 1).filter((v): v is number => v != null);
    return { id: r.id, date: r.date, value: values[i], rolling: w.length ? round1(w.reduce((a, b) => a + b, 0) / w.length) : null };
  });
}

export interface KeyFigure {
  key: StatKey;
  label: string;
  value: number | null;
  previous: number | null;
  /** up = beter, down = slechter, flat */
  direction: "better" | "worse" | "flat" | null;
}

/** Kerncijfers: gemiddelde van de laatste 5 rondes vs de 5 daarvoor. */
export function keyFigures(rounds: RoundLike[], keys: StatKey[], n = 5, normalize: Normalize = "per18"): KeyFigure[] {
  const sorted = [...rounds].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const stats = sorted.map(roundStats);
  const avg = (xs: RoundStats[], k: StatKey) => {
    const v = xs.map((s) => statValue(s, k, normalize)).filter((x): x is number => x != null);
    return v.length ? round1(v.reduce((a, b) => a + b, 0) / v.length) : null;
  };
  return keys.map((key) => {
    const value = avg(stats.slice(0, n), key);
    const previous = avg(stats.slice(n, 2 * n), key);
    let direction: KeyFigure["direction"] = null;
    if (value != null && previous != null) {
      const delta = value - previous;
      if (Math.abs(delta) < 0.05 * Math.max(1, Math.abs(previous))) direction = "flat";
      else direction = (delta < 0) === LOWER_IS_BETTER[key] ? "better" : "worse";
    }
    return { key, label: STAT_LABELS[key], value, previous, direction };
  });
}

// ---------- Records ----------

export interface CourseRecord {
  courseLabel: string;
  holesCount: number;
  bestGross: { value: number; roundId: number; date: string } | null;
  mostPoints: { value: number; roundId: number; date: string } | null;
  fewestPutts: { value: number; roundId: number; date: string } | null;
  rounds: number;
}

export function records(rounds: RoundLike[]): CourseRecord[] {
  const groups = new Map<string, RoundLike[]>();
  for (const r of rounds) {
    const complete = r.holes.filter((h) => h.strokes != null).length === r.holesCount;
    if (!complete) continue;
    const k = `${r.courseLabel}|${r.holesCount}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return [...groups.entries()].map(([k, rs]) => {
    const [courseLabel, holes] = k.split("|");
    const pick = (f: (s: RoundStats) => number | null, lower: boolean) => {
      let best: CourseRecord["bestGross"] = null;
      for (const r of rs) {
        const v = f(roundStats(r));
        if (v == null) continue;
        if (!best || (lower ? v < best.value : v > best.value)) best = { value: v, roundId: r.id, date: r.date };
      }
      return best;
    };
    return {
      courseLabel,
      holesCount: Number(holes),
      bestGross: pick((s) => s.gross, true),
      mostPoints: pick((s) => s.points, false),
      fewestPutts: pick((s) => (s.putts > 0 ? s.putts : null), true),
      rounds: rs.length,
    };
  });
}

// ---------- Patronen en inzichten ----------

export interface Insight {
  id: string;
  title: string;
  text: string;
  /** Hoe opvallend, voor sortering op het dashboard */
  weight: number;
  roundIds: number[];
}

const nlDate = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });

const SIDE_LABEL: Record<string, string> = { left: "links", right: "rechts", short: "kort", long: "lang" };

export function teeMisses(r: RoundLike): Insight | null {
  const s = roundStats(r);
  const missed = s.fairways.of - s.fairways.hits;
  if (missed < 3) return null;
  const sides = (["left", "right", "short", "long"] as const).map((k) => [k, s.fairways[k]] as const).sort((a, b) => b[1] - a[1]);
  const [side, count] = sides[0];
  if (count / missed < 0.6) return null;
  return {
    id: `tee-${r.id}`,
    title: "Missers van de tee",
    text: `${count} van de ${missed} gemiste fairways naar ${SIDE_LABEL[side]} (ronde ${nlDate(r.date)})`,
    weight: (count / missed) * missed,
    roundIds: [r.id],
  };
}

export function parTypeScoring(rounds: RoundLike[]) {
  const acc: Record<number, { total: number; n: number }> = {};
  for (const r of rounds)
    for (const h of r.holes) {
      if (h.strokes == null) continue;
      acc[h.par] ??= { total: 0, n: 0 };
      acc[h.par].total += h.strokes - h.par;
      acc[h.par].n++;
    }
  return Object.entries(acc)
    .map(([par, v]) => ({ par: Number(par), avgToPar: round2(v.total / v.n), holes: v.n }))
    .sort((a, b) => a.par - b.par);
}

/** Moeilijke holes (bovenste derde qua SI, bij 18 holes SI 1–6) vs de rest */
export function siGroupScoring(rounds: RoundLike[]) {
  const hard = { total: 0, n: 0 };
  const easy = { total: 0, n: 0 };
  for (const r of rounds) {
    const ranks = siRanks(r.holes);
    const n = r.holes.length;
    r.holes.forEach((h, i) => {
      if (h.strokes == null) return;
      const g = ranks[i] <= Math.round(n / 3) ? hard : easy;
      g.total += h.strokes - h.par;
      g.n++;
    });
  }
  return {
    hard: hard.n ? round2(hard.total / hard.n) : null,
    easy: easy.n ? round2(easy.total / easy.n) : null,
    hardHoles: hard.n,
    easyHoles: easy.n,
  };
}

export interface BlowUp {
  roundId: number;
  date: string;
  courseLabel: string;
  hole: number;
  par: number;
  strokes: number;
  putts: number | null;
  penalties: number;
  fairway: string | null;
}

export function blowUps(rounds: RoundLike[]): BlowUp[] {
  const out: BlowUp[] = [];
  for (const r of rounds)
    for (const h of r.holes)
      if (h.strokes != null && h.strokes - h.par >= 3)
        out.push({
          roundId: r.id,
          date: r.date,
          courseLabel: r.courseLabel,
          hole: h.number,
          par: h.par,
          strokes: h.strokes,
          putts: h.putts ?? null,
          penalties: h.penalties ?? 0,
          fairway: (h.fairway as string) ?? null,
        });
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export function holeAverages(rounds: RoundLike[], courseLabel: string) {
  const acc = new Map<number, { par: number; total: number; n: number; points: number }>();
  for (const r of rounds) {
    if (r.courseLabel !== courseLabel) continue;
    for (const h of r.holes) {
      if (h.strokes == null) continue;
      const a = acc.get(h.number) ?? { par: h.par, total: 0, n: 0, points: 0 };
      a.total += h.strokes;
      a.points += h.points ?? 0;
      a.n++;
      acc.set(h.number, a);
    }
  }
  return [...acc.entries()]
    .map(([number, a]) => ({ number, par: a.par, avg: round2(a.total / a.n), avgToPar: round2(a.total / a.n - a.par), avgPoints: round2(a.points / a.n), n: a.n }))
    .sort((a, b) => a.number - b.number);
}

export function frontBack(rounds: RoundLike[]) {
  const full = rounds.filter((r) => r.holesCount > 9);
  const fs = full.map(roundStats).filter((s) => s.front != null && s.back != null);
  if (!fs.length) return null;
  const f = fs.reduce((a, s) => a + (s.front ?? 0), 0) / fs.length;
  const b = fs.reduce((a, s) => a + (s.back ?? 0), 0) / fs.length;
  return { front: round1(f), back: round1(b), diff: round1(b - f), rounds: fs.length };
}

export function puttingInsight(rounds: RoundLike[]) {
  const stats = rounds.map(roundStats);
  const withPutts = stats.filter((s) => s.putts > 0);
  if (!withPutts.length) return null;
  const threePerRound = withPutts.reduce((a, s) => a + s.threePutts, 0) / withPutts.length;
  const afterGir = withPutts.reduce((a, s) => ({ c: a.c + s.threePuttAfterGir.count, o: a.o + s.threePuttAfterGir.of }), { c: 0, o: 0 });
  return { threePerRound: round1(threePerRound), afterGirPct: afterGir.o ? pct(afterGir.c, afterGir.o) : null, girHoles: afterGir.o };
}

/** Inzichtkaarten met vaste regels; sorteert op opvallendheid. */
export function insights(rounds: RoundLike[]): Insight[] {
  const sorted = [...rounds].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const out: Insight[] = [];
  const recent = sorted.slice(0, 10);
  if (!recent.length) return out;

  const tm = recent.map(teeMisses).filter((x): x is Insight => !!x);
  if (tm[0]) out.push(tm[0]);

  const pt = parTypeScoring(recent);
  if (pt.length >= 2) {
    const worst = [...pt].sort((a, b) => b.avgToPar - a.avgToPar)[0];
    const best = [...pt].sort((a, b) => a.avgToPar - b.avgToPar)[0];
    out.push({
      id: "par-type",
      title: "Scoring per par-type",
      text: `${pt.map((p) => `par ${p.par}: ${fmtSigned(p.avgToPar)}`).join(" · ")}. Par ${worst.par}'s kosten je het meest.`,
      weight: worst.avgToPar - best.avgToPar,
      roundIds: recent.map((r) => r.id),
    });
  }

  const sg = siGroupScoring(recent);
  if (sg.hard != null && sg.easy != null) {
    out.push({
      id: "si-group",
      title: "Moeilijke vs makkelijke holes",
      text: `Moeilijke holes (laagste SI's) gemiddeld ${fmtSigned(sg.hard)}, de rest ${fmtSigned(sg.easy)} t.o.v. par.`,
      weight: Math.abs(sg.hard - sg.easy) * 0.8,
      roundIds: recent.map((r) => r.id),
    });
  }

  const bu = blowUps(recent);
  if (bu.length) {
    const withPen = bu.filter((b) => b.penalties > 0).length;
    const threePutt = bu.filter((b) => (b.putts ?? 0) >= 3).length;
    const offFairway = bu.filter((b) => b.fairway && b.fairway !== "hit" && b.fairway !== "na").length;
    const parts = [
      withPen ? `${withPen}× met strafslag` : null,
      threePutt ? `${threePutt}× met 3-putt` : null,
      offFairway ? `${offFairway}× fairway gemist` : null,
    ].filter(Boolean);
    out.push({
      id: "blowups",
      title: "Grote uitschieters",
      text: `${bu.length} holes met triple bogey of slechter in de laatste ${recent.length} rondes${parts.length ? ": " + parts.join(", ") : ""}.`,
      weight: bu.length / recent.length + 1,
      roundIds: [...new Set(bu.map((b) => b.roundId))],
    });
  }

  const fb = frontBack(recent);
  if (fb && Math.abs(fb.diff) >= 1.5) {
    out.push({
      id: "front-back",
      title: "Voor- en tweede negen",
      text: `Tweede negen gemiddeld ${fmtSigned(fb.diff)} slagen t.o.v. de eerste negen (${fb.rounds} rondes).`,
      weight: Math.abs(fb.diff) / 2,
      roundIds: recent.filter((r) => r.holesCount > 9).map((r) => r.id),
    });
  }

  const pi = puttingInsight(recent);
  if (pi && pi.threePerRound > 0) {
    out.push({
      id: "putting",
      title: "Putten",
      text: `${pi.threePerRound.toLocaleString("nl-NL")} 3-putts per ronde${pi.afterGirPct != null ? `, ${pi.afterGirPct.toLocaleString("nl-NL")}% kans op een 3-putt na GIR` : ""}.`,
      weight: pi.threePerRound,
      roundIds: recent.map((r) => r.id),
    });
  }

  // Lastigste hole van de meest gespeelde baan
  const counts = new Map<string, number>();
  for (const r of sorted) counts.set(r.courseLabel, (counts.get(r.courseLabel) ?? 0) + 1);
  const topCourse = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topCourse && topCourse[1] >= 2) {
    const ha = holeAverages(sorted, topCourse[0]).sort((a, b) => b.avgToPar - a.avgToPar);
    if (ha[0]) {
      out.push({
        id: "course-holes",
        title: `Lastigste hole · ${topCourse[0]}`,
        text: `Hole ${ha[0].number} (par ${ha[0].par}) speel je gemiddeld in ${ha[0].avg.toLocaleString("nl-NL")}, ${fmtSigned(ha[0].avgToPar)} t.o.v. par.`,
        weight: ha[0].avgToPar / 2,
        roundIds: sorted.filter((r) => r.courseLabel === topCourse[0]).map((r) => r.id),
      });
    }
  }

  return out.sort((a, b) => b.weight - a.weight);
}

/** De opvallendste afwijking in een ronde, voor de laatste-rondekaart. */
export function standout(r: RoundLike): string | null {
  const tm = teeMisses(r);
  if (tm) return tm.text.replace(/ \(ronde .*\)$/, "");
  const bu = blowUps([r]);
  if (bu.length) return `${bu.length}× triple bogey of slechter (hole ${bu.map((b) => b.hole).join(", ")})`;
  const s = roundStats(r);
  if (s.threePutts >= 2) return `${s.threePutts} keer een 3-putt`;
  if (s.distribution.birdie + s.distribution.eagle > 0) return `${s.distribution.birdie + s.distribution.eagle}× birdie of beter`;
  if (s.penalties >= 2) return `${s.penalties} strafslagen`;
  return null;
}

export const fmtSigned = (x: number) => (x > 0 ? "+" : x < 0 ? "−" : "±") + Math.abs(x).toLocaleString("nl-NL");
