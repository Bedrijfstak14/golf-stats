import type { DraftHole } from "./types";

/**
 * Ontvangen slagen op een hole.
 * Bij 9 holes wordt de handicap over 9 SI's verdeeld (SI 1–9), bij 18 over 18.
 * Negatieve (plus-)handicaps geven slagen terug op de makkelijkste holes.
 */
export function strokesReceived(handicap: number, siRank: number, holesCount: number): number {
  const n = holesCount;
  if (handicap >= 0) {
    const base = Math.floor(handicap / n);
    const rest = handicap - base * n;
    return base + (siRank <= rest ? 1 : 0);
  }
  const plus = -handicap;
  const base = Math.floor(plus / n);
  const rest = plus - base * n;
  // makkelijkste holes (hoogste SI) geven eerst terug
  return 0 - (base + (siRank > n - rest ? 1 : 0)) || 0;
}

/**
 * Zet de SI's van de gespeelde holes om naar een rangorde 1..n.
 * Nodig als een 9-holesronde de 18-holes SI's toont (bijv. 1,3,5,…,17).
 */
export function siRanks(holes: Pick<DraftHole, "si">[]): number[] {
  const sorted = holes.map((h, i) => ({ si: h.si, i })).sort((a, b) => a.si - b.si || a.i - b.i);
  const ranks = new Array<number>(holes.length);
  sorted.forEach((s, rank) => (ranks[s.i] = rank + 1));
  return ranks;
}

export function stablefordPoints(par: number, received: number, strokes: number | null | undefined): number {
  if (strokes == null || strokes <= 0) return 0;
  return Math.max(0, par + received - strokes + 2);
}

export interface ScoredHole {
  received: number;
  points: number;
}

/** Berekent ontvangen slagen en stablefordpunten voor alle holes. */
export function scoreHoles(holes: Pick<DraftHole, "par" | "si" | "strokes">[], playingHandicap: number | null): ScoredHole[] {
  const ph = playingHandicap ?? 0;
  const ranks = siRanks(holes);
  const n = holes.length <= 9 ? 9 : 18;
  return holes.map((h, i) => {
    const received = strokesReceived(ph, ranks[i], n);
    return { received, points: stablefordPoints(h.par, received, h.strokes) };
  });
}

/** GIR-voorstel uit slagen en putts: green bereikt in par − 2 slagen. */
export function suggestGir(par: number, strokes: number | null, putts: number | null | undefined): boolean | null {
  if (strokes == null || putts == null) return null;
  return strokes - putts <= par - 2;
}
