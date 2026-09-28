import { describe, expect, it } from "vitest";
import { hasBlockingIssues, runChecks, fairwayStats, girStats } from "./checks";
import { scoreHoles, strokesReceived, siRanks, suggestGir } from "./stableford";
import { roundStats, insights, trend, keyFigures, records } from "./stats";
import { expectedStrokes, holeStrokesGained, sumByCategory, clubDistances } from "./strokesGained";
import type { RoundDraft } from "./types";

/**
 * Acceptatievoorbeeld: Het Rijk van Sybrook, Oost, Blauw (h), 2552 m, P.HCP 23, 25 aug 2026.
 * Totalen uit het ontwerp: 60 slagen, 17 punten, 20 putts, FW 1/7 (14%), GIR 1/9 (11%), 0 straf, 0 bunker.
 * Hole 4 (par 4, SI 2): 3 ontvangen slagen, score 4 → 5 punten.
 * De losse holewaarden zijn een synthetische kaart die aan deze totalen voldoet.
 */
export function acceptanceDraft(): RoundDraft {
  const par = [4, 4, 3, 4, 5, 3, 4, 4, 4];
  const si = [5, 7, 9, 2, 1, 8, 3, 6, 4];
  const len = [320, 305, 140, 290, 445, 150, 310, 262, 330];
  const strokes = [8, 6, 5, 4, 11, 6, 7, 6, 7];
  const points = [1, 2, 2, 5, 0, 1, 2, 2, 2];
  const putts = [2, 2, 2, 2, 3, 3, 2, 2, 2];
  const fw = ["right", "right", "na", "hit", "left", "na", "right", "right", "right"] as const;
  return {
    date: "2026-08-25",
    clubName: "Golfbaan Het Rijk van Sybrook",
    loopName: "Oost",
    teeName: "Blauw",
    teeGender: "m",
    holesCount: 9,
    format: "stableford",
    handicapIndex: null,
    playingHandicap: 23,
    source: "ai_screenshot",
    holes: par.map((p, i) => ({
      number: i + 1,
      par: p,
      si: si[i],
      length: len[i],
      strokes: strokes[i],
      points: points[i],
      putts: putts[i],
      fairway: fw[i],
      gir: i === 3,
      penalties: 0,
      bunker: 0,
    })),
    totals: { strokes: 60, points: 17, putts: 20, par: 35, length: 2552, fairwayPct: 14, girPct: 11, penalties: 0, bunker: 0 },
  };
}

describe("acceptatievoorbeeld 25 aug 2026", () => {
  const d = acceptanceDraft();

  it("heeft geen afwijkingen", () => {
    const issues = runChecks(d);
    expect(issues).toEqual([]);
    expect(hasBlockingIssues(issues)).toBe(false);
  });

  it("hole 4: 3 ontvangen slagen, score 4, dus 5 punten", () => {
    const scored = scoreHoles(d.holes, 23);
    expect(scored[3]).toEqual({ received: 3, points: 5 });
    expect(scored.reduce((a, s) => a + s.points, 0)).toBe(17);
  });

  it("rekent totalen en percentages uit", () => {
    const s = roundStats({ id: 1, date: d.date, courseLabel: "Sybrook Oost", holesCount: 9, par: 35, playingHandicap: 23, holes: d.holes });
    expect(s.gross).toBe(60);
    expect(s.points).toBe(17);
    expect(s.putts).toBe(20);
    expect(s.penalties).toBe(0);
    expect(s.bunker).toBe(0);
    expect(fairwayStats(d)).toEqual({ hits: 1, of: 7, pct: 14 });
    expect(girStats(d)).toEqual({ hits: 1, of: 9, pct: 11 });
  });

  it("markeert een fout gelezen veld rood", () => {
    const bad = acceptanceDraft();
    bad.holes[3].points = 4;
    const issues = runChecks(bad);
    expect(issues.some((i) => i.field === "holes.3.points" && i.severity === "red")).toBe(true);
    expect(issues.some((i) => i.field === "totals.points")).toBe(true);
  });
});

describe("stableford", () => {
  it("verdeelt slagen over 18 holes", () => {
    expect(strokesReceived(20, 1, 18)).toBe(2);
    expect(strokesReceived(20, 2, 18)).toBe(2);
    expect(strokesReceived(20, 3, 18)).toBe(1);
    expect(strokesReceived(18, 18, 18)).toBe(1);
  });
  it("plus-handicap geeft terug op de makkelijkste holes", () => {
    expect(strokesReceived(-2, 18, 18)).toBe(-1);
    expect(strokesReceived(-2, 17, 18)).toBe(-1);
    expect(strokesReceived(-2, 16, 18)).toBe(0);
  });
  it("rangschikt 18-holes SI's op een 9-holesronde", () => {
    expect(siRanks([{ si: 9 }, { si: 1 }, { si: 17 }])).toEqual([2, 1, 3]);
  });
  it("stelt GIR voor uit slagen en putts", () => {
    expect(suggestGir(4, 4, 2)).toBe(true);
    expect(suggestGir(4, 5, 2)).toBe(false);
    expect(suggestGir(3, 3, 2)).toBe(true);
  });
});

describe("controles", () => {
  it("vangt plausibiliteitsfouten", () => {
    const d = acceptanceDraft();
    d.holes[2].fairway = "hit"; // par 3
    d.holes[0].putts = 9; // meer dan slagen
    d.holes[1].gir = true; // 6 slagen, 2 putts op par 4
    d.totals = undefined;
    const codes = runChecks(d).filter((i) => i.code === "plausibility").map((i) => i.hole);
    expect(codes).toEqual(expect.arrayContaining([1, 2, 3]));
  });
  it("vergelijkt met opgeslagen baandata", () => {
    const d = acceptanceDraft();
    const course = d.holes.map((h) => ({ number: h.number, par: h.par, si: h.si, length: h.length }));
    course[4] = { ...course[4], si: 3 };
    const issues = runChecks(d, course);
    expect(issues.filter((i) => i.code === "course")).toHaveLength(1);
  });
  it("markeert lage zekerheid geel", () => {
    const d = acceptanceDraft();
    d.lowConfidence = ["holes.2.putts"];
    const issues = runChecks(d);
    expect(issues).toEqual([expect.objectContaining({ severity: "yellow", hole: 3 })]);
  });
});

describe("statistieken", () => {
  const d = acceptanceDraft();
  const r = { id: 1, date: d.date, courseLabel: "Sybrook Oost", holesCount: 9, par: 35, playingHandicap: 23, holes: d.holes };
  it("scoreverdeling en scrambling", () => {
    const s = roundStats(r);
    expect(s.distribution).toEqual({ eagle: 0, birdie: 0, par: 1, bogey: 0, double: 3, worse: 5 });
    expect(s.scrambling).toEqual({ success: 0, of: 8 });
    expect(s.fairways.right).toBe(5);
  });
  it("vindt het tee-patroon en uitschieters", () => {
    const ids = insights([r]).map((i) => i.id);
    expect(ids).toContain("tee-1");
    expect(ids).toContain("blowups");
  });
  it("normaliseert 9 holes naar 18", () => {
    const t = trend([r], "gross", "per18");
    expect(t[0].value).toBe(120);
  });
  it("kerncijfers en records", () => {
    const k = keyFigures([r], ["putts"], 5, "raw");
    expect(k[0].value).toBe(20);
    expect(records([r])[0].bestGross?.value).toBe(60);
  });
});

describe("strokes gained", () => {
  it("tourwaarde vanaf de tee op 400 yard ≈ 3,99", () => {
    expect(expectedStrokes("tee", 400 * 0.9144, "tour")).toBeCloseTo(3.99, 2);
  });
  it("som van SG op een hole = E(tee) − score", () => {
    const shots = [
      { lie: "tee" as const, distance: 350, club: "Driver" },
      { lie: "rough" as const, distance: 130, club: "7-ijzer" },
      { lie: "green" as const, distance: 8 },
      { lie: "green" as const, distance: 1 },
    ];
    const res = holeStrokesGained(shots, 4, "scratch");
    const total = sumByCategory(res).total;
    expect(total).toBeCloseTo(expectedStrokes("tee", 350, "scratch") - 4, 1);
    expect(res.map((r) => r.category)).toEqual(["offTheTee", "approach", "putting", "putting"]);
  });
  it("strafslag kost een extra slag", () => {
    const a = holeStrokesGained([{ lie: "tee", distance: 150 }, { lie: "green", distance: 3 }], 3, "hcp20");
    const b = holeStrokesGained([{ lie: "tee", distance: 150, penalty: true }, { lie: "green", distance: 3 }], 3, "hcp20");
    expect(a[0].sg - b[0].sg).toBeCloseTo(1, 5);
    expect(a[0].category).toBe("approach");
  });
  it("hoger handicapniveau verwacht meer slagen", () => {
    expect(expectedStrokes("fairway", 100, "hcp20")).toBeGreaterThan(expectedStrokes("fairway", 100, "scratch"));
  });
  it("clubafstanden", () => {
    const cd = clubDistances([[{ lie: "tee", distance: 350, club: "Driver" }, { lie: "fairway", distance: 140 }]]);
    expect(cd).toEqual([{ club: "Driver", shots: 1, avg: 210, spread: 0 }]);
  });
});

import { aiCardToDraft, type AiCard } from "./aiDraft";
import { handicapForRound } from "./whs";

describe("AI-omzetting (Hole19)", () => {
  const card = (): AiCard => ({
    date: "2026-08-25",
    courseName: "Golfbaan Het Rijk van Sybrook",
    loopName: "Oost",
    teeName: "Blauw",
    teeGender: "m",
    holesCount: 9,
    format: "stableford",
    holes: [4, 3, 5, 4, 3, 5, 4, 4, 4].map((par, i) => ({ hole: i + 1, par, si: i === 0 ? 3.7e99 : i + 1, length: 300 })),
    players: [
      {
        name: "Mick",
        playingHandicap: 23,
        handicapIndex: null,
        scores: [4, 3, 5, 4, 3, 5, 4, 4, 4].map((par, i) => ({
          hole: i + 1,
          strokes: par + 2,
          points: 2,
          putts: i === 1 ? 0 : 2,
          fairway: i === 2 ? ("short" as const) : null,
          fairwayIcon: (["circle", "none", "arrow_straight", "arrow_curved"] as const)[i] ?? "none",
          gir: false,
          penalties: 0,
          bunker: 0,
        })),
      },
    ],
  });

  it("vertaalt fairway-iconen: rondje = raak, rechte pijl = rechts, gebogen pijl = links", () => {
    const d = aiCardToDraft(card());
    expect(d.holes.slice(0, 4).map((h) => h.fairway)).toEqual(["hit", "na", "right", "left"]);
  });
  it("0 putts = niet bijgehouden, dan ook GIR onbekend", () => {
    const d = aiCardToDraft(card());
    expect(d.holes[1].putts).toBeNull();
    expect(d.holes[1].gir).toBeNull();
    expect(d.holes[2].putts).toBe(2);
  });
  it("ongeldige SI wordt 0 (en daarna aangevuld of rood gemarkeerd)", () => {
    const d = aiCardToDraft(card());
    expect(d.holes[0].si).toBe(0);
    expect(runChecks(d).some((i) => i.field === "holes.0.si" && i.severity === "red")).toBe(true);
  });
});

describe("handicap uit de eigen database", () => {
  it("met rating en slope", () => {
    // 9 holes: 46,2/2 × 125/113 + (34,9 − 36) = 24,45 → 24
    expect(handicapForRound(46.2, { courseRating: 34.9, slope: 125, par: 36 }, 9)).toEqual({ courseHandicap: 24, playingHandicap: 24, approximate: false });
  });
  it("zonder rating/slope: benadering met slope 113 en rating = par", () => {
    expect(handicapForRound(46.2, { courseRating: null, slope: null, par: 36 }, 9)).toEqual({ courseHandicap: 23, playingHandicap: 23, approximate: true });
  });
  it("allowance", () => {
    expect(handicapForRound(20, { courseRating: 72, slope: 113, par: 72 }, 18, 90).playingHandicap).toBe(18);
  });
});
