/**
 * World Handicap System — indicatieve berekening.
 * Alle WHS-regels staan in deze ene module, zodat aanpassingen op één plek gebeuren.
 * De officiële NGF-registratie blijft leidend.
 */
import { siRanks, strokesReceived } from "./stableford";

export const MAX_INDEX = 54;

export const round1 = (x: number) => Math.round((x + Number.EPSILON * Math.sign(x)) * 10) / 10;

/** Course handicap; bij 9 holes met de halve index en de 9-holesrating. */
export function courseHandicap(
  index: number,
  slope: number,
  courseRating: number,
  par: number,
  holesCount: number,
): number {
  const hi = holesCount <= 9 ? index / 2 : index;
  return Math.round(hi * (slope / 113) + (courseRating - par));
}

export function playingHandicap(courseHcp: number, allowancePct = 100): number {
  return Math.round((courseHcp * allowancePct) / 100);
}

export interface HandicapForRound {
  courseHandicap: number;
  playingHandicap: number;
  /** true als course rating/slope ontbreken en met slope 113 en rating = par is gerekend */
  approximate: boolean;
}

/**
 * Handicap voor een ronde uit de eigen index (nooit van de kaart).
 * Zonder rating/slope: benadering met slope 113 en course rating = par.
 */
export function handicapForRound(
  index: number,
  tee: { courseRating: number | null; slope: number | null; par: number },
  holesCount: number,
  allowancePct = 100,
): HandicapForRound {
  const approximate = tee.courseRating == null || tee.slope == null;
  const ch = courseHandicap(index, tee.slope ?? 113, tee.courseRating ?? tee.par, tee.par, holesCount);
  return { courseHandicap: ch, playingHandicap: playingHandicap(ch, allowancePct), approximate };
}

export interface WhsHole {
  par: number;
  si: number;
  strokes: number | null;
}

/** Adjusted gross score: per hole max netto double bogey; niet gespeelde holes als netto par. */
export function adjustedGrossScore(holes: WhsHole[], courseHcp: number): number {
  const ranks = siRanks(holes);
  const n = holes.length <= 9 ? 9 : 18;
  return holes.reduce((total, h, i) => {
    const received = strokesReceived(courseHcp, ranks[i], n);
    if (h.strokes == null) return total + h.par + received;
    return total + Math.min(h.strokes, h.par + 2 + received);
  }, 0);
}

/** Score differential = 113 / slope × (AGS − course rating − PCC) */
export function scoreDifferential(ags: number, courseRating: number, slope: number, pcc = 0): number {
  return round1((113 / slope) * (ags - courseRating - pcc));
}

/** Verwachte 9-holesdifferential op basis van de index (WHS 2024). */
export function expectedNineHoleDifferential(index: number): number {
  return 0.52 * index + 1.197;
}

/** 9-holesdifferential aanvullen tot een 18-holesdifferential. */
export function nineToEighteen(diff9: number, index: number): number {
  return round1(diff9 + expectedNineHoleDifferential(index));
}

/** WHS-tabel: aantal differentials → aantal laagste en aanpassing. */
export function indexFromDifferentials(diffs: number[]): number | null {
  const n = Math.min(diffs.length, 20);
  if (n < 3) return null;
  const recent = diffs.slice(-20);
  const sorted = [...recent].sort((a, b) => a - b);
  const table: Record<number, [number, number]> = {
    3: [1, -2],
    4: [1, -1],
    5: [1, 0],
    6: [2, -1],
    7: [2, 0],
    8: [2, 0],
    9: [3, 0],
    10: [3, 0],
    11: [3, 0],
    12: [4, 0],
    13: [4, 0],
    14: [4, 0],
    15: [5, 0],
    16: [5, 0],
    17: [6, 0],
    18: [6, 0],
    19: [7, 0],
    20: [8, 0],
  };
  const [count, adj] = table[n];
  const avg = sorted.slice(0, count).reduce((a, b) => a + b, 0) / count;
  return Math.min(MAX_INDEX, round1(avg + adj));
}

/** Welke differentials (posities in de laatste 20) tellen mee voor de index. */
export function bestPositions(diffs: number[]): number[] {
  const n = Math.min(diffs.length, 20);
  if (n < 3) return [];
  const counts = [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 6, 6, 7, 8];
  const offset = diffs.length - n;
  return diffs
    .slice(-20)
    .map((d, i) => ({ d, i: i + offset }))
    .sort((a, b) => a.d - b.d || b.i - a.i)
    .slice(0, counts[n])
    .map((x) => x.i);
}

export function applyCaps(calculated: number, lowIndex: number | null): { index: number; capped: "soft" | "hard" | null } {
  if (lowIndex == null) return { index: calculated, capped: null };
  const diff = calculated - lowIndex;
  if (diff <= 3) return { index: calculated, capped: null };
  const soft = round1(lowIndex + 3 + (diff - 3) / 2);
  const hard = round1(lowIndex + 5);
  if (soft > hard) return { index: hard, capped: "hard" };
  return { index: soft, capped: "soft" };
}

export function exceptionalReduction(differential: number, indexBefore: number | null): number {
  if (indexBefore == null) return 0;
  const below = indexBefore - differential;
  if (below >= 10) return 2;
  if (below >= 7) return 1;
  return 0;
}

export interface WhsRoundInput {
  id: number | string;
  date: string;
  holesCount: number;
  qualifying: boolean;
  courseRating: number | null;
  slope: number | null;
  par: number;
  pcc?: number;
  holes: WhsHole[];
  /** Optioneel: al berekende AGS (voor simulaties) */
  ags?: number;
}

export interface WhsRoundResult {
  id: number | string;
  date: string;
  counted: boolean;
  reason?: string;
  indexBefore: number | null;
  courseHandicap: number | null;
  ags: number | null;
  /** 9-holesdifferential vóór aanvulling (alleen bij 9 holes) */
  differential9: number | null;
  /** Differential zoals die meetelt (18-holesbasis) */
  differential: number | null;
  /** Na correctie voor uitzonderlijke scores */
  adjustedDifferential: number | null;
  exceptional: number;
  indexAfter: number | null;
  capped: "soft" | "hard" | null;
}

export interface WhsSummary {
  rounds: WhsRoundResult[];
  index: number | null;
  lowIndex: number | null;
  /** id's van rondes die nu in de laatste 20 zitten */
  lastTwenty: (number | string)[];
  /** id's van rondes die nu tot de beste set horen */
  best: (number | string)[];
}

const DAY = 86_400_000;

/**
 * Rekent de index na elke ronde uit, chronologisch.
 * startIndex wordt gebruikt voor course handicap en 9-holesaanvulling zolang er nog geen index is.
 */
export function computeWhs(input: WhsRoundInput[], startIndex: number | null = null): WhsSummary {
  const rounds = [...input].sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));

  const results: WhsRoundResult[] = [];
  const counted: { id: number | string; date: string; diff: number; adj: number }[] = [];
  const indexHistory: { date: string; index: number }[] = [];
  let current: number | null = startIndex;

  for (const r of rounds) {
    const base: WhsRoundResult = {
      id: r.id,
      date: r.date,
      counted: false,
      indexBefore: current,
      courseHandicap: null,
      ags: null,
      differential9: null,
      differential: null,
      adjustedDifferential: null,
      exceptional: 0,
      indexAfter: current,
      capped: null,
    };
    if (!r.qualifying) {
      results.push({ ...base, reason: "Niet qualifying" });
      continue;
    }
    if (r.courseRating == null || r.slope == null) {
      results.push({ ...base, reason: "Course rating of slope ontbreekt" });
      continue;
    }
    const nine = r.holesCount <= 9;
    const hiForCalc = current ?? MAX_INDEX;
    const ch = courseHandicap(hiForCalc, r.slope, r.courseRating, r.par, r.holesCount);
    const ags = r.ags ?? adjustedGrossScore(r.holes, ch);
    let diff: number;
    let diff9: number | null = null;
    if (nine) {
      diff9 = scoreDifferential(ags, r.courseRating, r.slope, r.pcc ?? 0);
      diff = nineToEighteen(diff9, hiForCalc);
    } else {
      diff = scoreDifferential(ags, r.courseRating, r.slope, r.pcc ?? 0);
    }

    counted.push({ id: r.id, date: r.date, diff, adj: 0 });

    // Correctie bij een uitzonderlijk goede score: geldt voor de laatste 20 differentials
    const esr = exceptionalReduction(diff, current);
    if (esr > 0) {
      for (const c of counted.slice(-20)) c.adj -= esr;
    }

    const diffs = counted.map((c) => round1(c.diff + c.adj));
    let calc = indexFromDifferentials(diffs);
    let capped: "soft" | "hard" | null = null;
    if (calc != null && counted.length >= 20) {
      const since = new Date(r.date).getTime() - 365 * DAY;
      const window = indexHistory.filter((h) => new Date(h.date).getTime() >= since);
      const low = window.length ? Math.min(...window.map((h) => h.index)) : null;
      const capRes = applyCaps(calc, low);
      calc = capRes.index;
      capped = capRes.capped;
    }
    if (calc != null) {
      current = calc;
      indexHistory.push({ date: r.date, index: calc });
    }

    results.push({
      ...base,
      counted: true,
      courseHandicap: ch,
      ags,
      differential9: diff9,
      differential: diff,
      adjustedDifferential: diff,
      exceptional: esr,
      indexAfter: current,
      capped,
    });
  }

  // Definitieve aangepaste differentials (ESR van latere rondes kan eerdere raken)
  const byId = new Map(counted.map((c) => [c.id, round1(c.diff + c.adj)]));
  for (const res of results) if (res.counted) res.adjustedDifferential = byId.get(res.id) ?? res.differential;

  const lastTwentyRows = counted.slice(-20);
  const pos = bestPositions(counted.map((c) => round1(c.diff + c.adj)));
  const lastDate = rounds.length ? rounds[rounds.length - 1].date : null;
  let lowIndex: number | null = null;
  if (lastDate) {
    const since = new Date(lastDate).getTime() - 365 * DAY;
    const w = indexHistory.filter((h) => new Date(h.date).getTime() >= since);
    lowIndex = w.length ? Math.min(...w.map((h) => h.index)) : null;
  }

  return {
    rounds: results,
    index: current,
    lowIndex,
    lastTwenty: lastTwentyRows.map((c) => c.id),
    best: pos.map((p) => counted[p].id),
  };
}

export interface WhatIfTee {
  courseRating: number;
  slope: number;
  par: number;
  holesCount: number;
  date?: string;
}

export interface WhatIfResult {
  currentIndex: number | null;
  /** true als elke score de index verlaagt */
  anyScore?: boolean;
  /** Hoogste bruto (adjusted) score waarmee de index daalt; null als dat niet haalbaar is */
  maxGross: number | null;
  /** Minimaal benodigde stablefordpunten (bij benadering, uitgaande van geen blow-up holes) */
  minPoints: number | null;
  courseHandicap: number | null;
  playingHandicap: number | null;
  newIndexAtMax: number | null;
}

/** "Wat moet ik scoren?" — benodigde score op een gekozen tee om de index te verlagen. */
export function whatToScore(
  history: WhsRoundInput[],
  tee: WhatIfTee,
  startIndex: number | null = null,
  allowancePct = 100,
): WhatIfResult {
  const now = computeWhs(history, startIndex);
  const current = now.index;
  const hi = current ?? startIndex ?? MAX_INDEX;
  const ch = courseHandicap(hi, tee.slope, tee.courseRating, tee.par, tee.holesCount);
  const ph = playingHandicap(ch, allowancePct);
  if (current == null) {
    return { currentIndex: null, maxGross: null, minPoints: null, courseHandicap: ch, playingHandicap: ph, newIndexAtMax: null };
  }
  const date = tee.date ?? new Date().toISOString().slice(0, 10);
  let best: { gross: number; idx: number } | null = null;
  const lo = tee.par - (tee.holesCount <= 9 ? 10 : 20);
  const hiGross = tee.par + (tee.holesCount <= 9 ? 40 : 80);
  for (let g = lo; g <= hiGross; g++) {
    const sim = computeWhs(
      [
        ...history,
        {
          id: "__whatif__",
          date: date > (history.at(-1)?.date ?? "") ? date : "9999-12-31",
          holesCount: tee.holesCount,
          qualifying: true,
          courseRating: tee.courseRating,
          slope: tee.slope,
          par: tee.par,
          holes: [],
          ags: g,
        },
      ],
      startIndex,
    );
    if (sim.index == null) continue;
    if (sim.index < current) best = { gross: g, idx: sim.index };
    else break;
  }
  if (!best) return { currentIndex: current, maxGross: null, minPoints: null, courseHandicap: ch, playingHandicap: ph, newIndexAtMax: null };
  const holes = tee.holesCount <= 9 ? 9 : 18;
  return {
    currentIndex: current,
    anyScore: best.gross === hiGross,
    maxGross: best.gross,
    minPoints: Math.max(0, holes * 2 + tee.par + ph - best.gross),
    courseHandicap: ch,
    playingHandicap: ph,
    newIndexAtMax: best.idx,
  };
}
