import { describe, expect, it } from "vitest";
import {
  adjustedGrossScore,
  applyCaps,
  computeWhs,
  courseHandicap,
  exceptionalReduction,
  indexFromDifferentials,
  nineToEighteen,
  playingHandicap,
  scoreDifferential,
  whatToScore,
  type WhsRoundInput,
} from "./whs";

describe("course en playing handicap", () => {
  it("18 holes", () => {
    // 23,4 × 130/113 + (71,2 − 72) = 26,12 → 26
    expect(courseHandicap(23.4, 130, 71.2, 72, 18)).toBe(26);
  });
  it("9 holes met de halve index", () => {
    // 10 × 125/113 + (35,0 − 36) = 10,06 → 10
    expect(courseHandicap(20, 125, 35.0, 36, 9)).toBe(10);
  });
  it("allowance", () => {
    expect(playingHandicap(26, 100)).toBe(26);
    expect(playingHandicap(26, 95)).toBe(25);
  });
});

describe("adjusted gross score", () => {
  it("max netto double bogey per hole", () => {
    const holes = Array.from({ length: 18 }, (_, i) => ({ par: 4, si: i + 1, strokes: 5 }));
    holes[0].strokes = 9; // SI 1, CH 18 → 1 slag → max 7
    expect(adjustedGrossScore(holes, 18)).toBe(17 * 5 + 7);
  });
  it("niet gespeelde hole als netto par", () => {
    const holes = Array.from({ length: 18 }, (_, i) => ({ par: 4, si: i + 1, strokes: 4 as number | null }));
    holes[0].strokes = null; // SI 1, CH 20 → 2 slagen → 6
    expect(adjustedGrossScore(holes, 20)).toBe(17 * 4 + 6);
  });
});

describe("score differential", () => {
  it("113/slope × (AGS − CR − PCC)", () => {
    expect(scoreDifferential(95, 71.2, 130)).toBe(20.7);
    expect(scoreDifferential(95, 71.2, 130, 1)).toBe(19.8);
  });
  it("9 holes aangevuld met verwachte score", () => {
    // 18,0 + 0,52 × 20 + 1,197 = 29,597 → 29,6
    expect(nineToEighteen(18.0, 20)).toBe(29.6);
  });
});

describe("handicapindex uit differentials (WHS-tabel)", () => {
  it("minder dan 3: geen index", () => {
    expect(indexFromDifferentials([20, 21])).toBeNull();
  });
  it("3 rondes: laagste − 2,0", () => {
    expect(indexFromDifferentials([20, 25, 30])).toBe(18);
  });
  it("6 rondes: gemiddelde laagste 2 − 1,0", () => {
    expect(indexFromDifferentials([20, 22, 30, 30, 30, 30])).toBe(20);
  });
  it("20 rondes: gemiddelde van 8 laagste", () => {
    const diffs = [10, 11, 12, 13, 14, 15, 16, 17, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30];
    expect(indexFromDifferentials(diffs)).toBe(13.5);
  });
  it("alleen de laatste 20 tellen", () => {
    const diffs = [1, ...Array(20).fill(30)];
    expect(indexFromDifferentials(diffs)).toBe(30);
  });
  it("maximaal 54", () => {
    expect(indexFromDifferentials([70, 70, 70, 70, 70])).toBe(54);
  });
});

describe("caps en uitzonderlijke scores", () => {
  it("soft cap halveert boven +3", () => {
    expect(applyCaps(15, 10)).toEqual({ index: 14, capped: "soft" });
  });
  it("hard cap op +5", () => {
    expect(applyCaps(20, 10)).toEqual({ index: 15, capped: "hard" });
  });
  it("geen cap onder +3", () => {
    expect(applyCaps(12.5, 10)).toEqual({ index: 12.5, capped: null });
  });
  it("uitzonderlijke score", () => {
    expect(exceptionalReduction(12.9, 20)).toBe(1);
    expect(exceptionalReduction(10, 20)).toBe(2);
    expect(exceptionalReduction(14, 20)).toBe(0);
  });
});

function round18(id: number, date: string, gross: number): WhsRoundInput {
  // alle holes par 4, gelijk verdeeld; CR 72, slope 113 → differential ≈ AGS − 72
  const per = Math.floor(gross / 18);
  const extra = gross - per * 18;
  return {
    id,
    date,
    holesCount: 18,
    qualifying: true,
    courseRating: 72,
    slope: 113,
    par: 72,
    holes: Array.from({ length: 18 }, (_, i) => ({ par: 4, si: i + 1, strokes: per + (i < extra ? 1 : 0) })),
  };
}

describe("verloop over rondes", () => {
  it("bouwt index op vanaf 3 rondes", () => {
    const rs = [round18(1, "2026-05-01", 92), round18(2, "2026-05-08", 94), round18(3, "2026-05-15", 96)];
    const res = computeWhs(rs);
    expect(res.rounds[0].indexAfter).toBeNull();
    expect(res.rounds[1].indexAfter).toBeNull();
    // laagste differential 20 − 2 = 18
    expect(res.index).toBe(18);
    expect(res.best).toEqual([1]);
  });

  it("slaat niet-qualifying rondes en rondes zonder rating over", () => {
    const r = round18(1, "2026-05-01", 90);
    const res = computeWhs([{ ...r, qualifying: false }, { ...r, id: 2, courseRating: null }]);
    expect(res.rounds.every((x) => !x.counted)).toBe(true);
  });

  it("past correctie voor uitzonderlijke score toe", () => {
    const rs = [1, 2, 3, 4, 5].map((i) => round18(i, `2026-05-0${i}`, 100)); // diff 28 → index 28
    rs.push(round18(6, "2026-05-10", 85)); // diff 13, 15 onder index → −2 op alle 6
    const res = computeWhs(rs);
    expect(res.rounds[5].exceptional).toBe(2);
    expect(res.rounds[5].adjustedDifferential).toBe(11);
    expect(res.rounds[0].adjustedDifferential).toBe(26);
  });

  it("wat moet ik scoren? (20 rondes)", () => {
    const rs = Array.from({ length: 20 }, (_, i) => round18(i + 1, `2026-01-${String(i + 1).padStart(2, "0")}`, 92)); // diff 20
    expect(computeWhs(rs).index).toBe(20);
    const w = whatToScore(rs, { courseRating: 72, slope: 113, par: 72, holesCount: 18, date: "2026-02-01" });
    // beste 8 van 19×20 + d: (140 + d)/8 < 20 ⇒ d < 20 ⇒ bruto ≤ 91
    expect(w.maxGross).toBe(91);
    expect(w.anyScore).toBe(false);
    expect(w.newIndexAtMax).toBe(19.9);
    // stableford: 36 + par 72 + PH 20 − 91 = 37 punten
    expect(w.minPoints).toBe(37);
  });

  it("wat moet ik scoren? (6 rondes: elke score verlaagt door de −1,0-aanpassing)", () => {
    const rs = [1, 2, 3, 4, 5].map((i) => round18(i, `2026-05-0${i}`, 100 - i));
    const w = whatToScore(rs, { courseRating: 72, slope: 113, par: 72, holesCount: 18, date: "2026-06-01" });
    expect(w.anyScore).toBe(true);
  });
});
