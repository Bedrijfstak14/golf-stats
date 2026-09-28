import { scoreHoles } from "./stableford";
import type { CourseHoleRef, RoundDraft } from "./types";

/** red = afwijking (rood), yellow = lage zekerheid (geel), note = melding */
export type Severity = "red" | "yellow" | "note";

export interface CheckIssue {
  severity: Severity;
  code: "totals" | "stableford" | "percentage" | "plausibility" | "course" | "confidence" | "missing";
  message: string;
  /** Veldpad, bijv. "holes.3.points" of "totals.strokes" */
  field?: string;
  hole?: number;
  expected?: number | string | null;
  actual?: number | string | null;
}

const sum = (xs: (number | null | undefined)[]) => xs.reduce<number>((a, x) => a + (x ?? 0), 0);

export function fairwayStats(draft: Pick<RoundDraft, "holes">) {
  const eligible = draft.holes.filter((h) => h.par >= 4 && h.strokes != null);
  const hits = eligible.filter((h) => h.fairway === "hit").length;
  return { hits, of: eligible.length, pct: eligible.length ? Math.round((hits / eligible.length) * 100) : null };
}

export function girStats(draft: Pick<RoundDraft, "holes">) {
  const played = draft.holes.filter((h) => h.strokes != null);
  const hits = played.filter((h) => h.gir === true).length;
  return { hits, of: played.length, pct: played.length ? Math.round((hits / played.length) * 100) : null };
}

/**
 * Alle controles uit het ontwerp. De ronde telt pas mee nadat de speler
 * het nakijkscherm heeft gezien; deze functie markeert wat afwijkt.
 */
export function runChecks(draft: RoundDraft, course?: CourseHoleRef[] | null): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const t = draft.totals ?? {};
  const holes = draft.holes;

  // --- Totalen: som per hole = TOT-kolom
  const totalChecks: [keyof typeof t, string, number][] = [
    ["strokes", "slagen", sum(holes.map((h) => h.strokes))],
    ["points", "punten", sum(holes.map((h) => h.points))],
    ["putts", "putts", sum(holes.map((h) => h.putts))],
    ["par", "par", sum(holes.map((h) => h.par))],
    ["length", "lengte", sum(holes.map((h) => h.length))],
    ["penalties", "strafslagen", sum(holes.map((h) => h.penalties))],
    ["bunker", "bunkerslagen", sum(holes.map((h) => h.bunker))],
  ];
  for (const [key, label, actual] of totalChecks) {
    const expected = t[key];
    if (expected != null && expected !== actual) {
      issues.push({
        severity: "red",
        code: "totals",
        field: `totals.${key}`,
        message: `Totaal ${label} klopt niet: som per hole is ${actual}, TOT-kolom zegt ${expected}`,
        expected,
        actual,
      });
    }
  }

  // --- Stablefordpunten herberekenen uit playing handicap en SI
  if (draft.playingHandicap != null) {
    const scored = scoreHoles(holes, draft.playingHandicap);
    holes.forEach((h, i) => {
      if (h.strokes == null || h.points == null) return;
      if (scored[i].points !== h.points) {
        issues.push({
          severity: "red",
          code: "stableford",
          field: `holes.${i}.points`,
          hole: h.number,
          message: `Hole ${h.number}: ${scored[i].received} ontvangen slagen, score ${h.strokes} geeft ${scored[i].points} punten (kaart: ${h.points})`,
          expected: scored[i].points,
          actual: h.points,
        });
      }
    });
  }

  // --- Percentages
  const fw = fairwayStats(draft);
  if (t.fairwayPct != null && fw.pct != null && Math.abs(t.fairwayPct - fw.pct) > 1) {
    issues.push({
      severity: "note",
      code: "percentage",
      field: "totals.fairwayPct",
      message: `Fairway% herberekend: ${fw.hits} van ${fw.of} (${fw.pct}%), kaart zegt ${t.fairwayPct}%`,
      expected: fw.pct,
      actual: t.fairwayPct,
    });
  }
  const gir = girStats(draft);
  if (t.girPct != null && gir.pct != null && Math.abs(t.girPct - gir.pct) > 1) {
    issues.push({
      severity: "note",
      code: "percentage",
      field: "totals.girPct",
      message: `GIR% herberekend: ${gir.hits} van ${gir.of} (${gir.pct}%), kaart zegt ${t.girPct}%`,
      expected: gir.pct,
      actual: t.girPct,
    });
  }

  // --- Plausibiliteit
  holes.forEach((h, i) => {
    if (h.strokes == null) return;
    if (h.putts != null && h.putts > h.strokes) {
      issues.push({
        severity: "red",
        code: "plausibility",
        field: `holes.${i}.putts`,
        hole: h.number,
        message: `Hole ${h.number}: meer putts (${h.putts}) dan slagen (${h.strokes})`,
      });
    }
    if (h.gir === true && h.putts != null && h.strokes - h.putts > h.par - 2) {
      issues.push({
        severity: "red",
        code: "plausibility",
        field: `holes.${i}.gir`,
        hole: h.number,
        message: `Hole ${h.number}: GIR kan niet met ${h.strokes} slagen en ${h.putts} putts op par ${h.par}`,
      });
    }
    if (h.par === 3 && h.fairway && h.fairway !== "na") {
      issues.push({
        severity: "red",
        code: "plausibility",
        field: `holes.${i}.fairway`,
        hole: h.number,
        message: `Hole ${h.number}: geen fairway op een par 3`,
      });
    }
    if ((h.penalties ?? 0) + (h.putts ?? 0) > h.strokes) {
      issues.push({
        severity: "red",
        code: "plausibility",
        field: `holes.${i}.penalties`,
        hole: h.number,
        message: `Hole ${h.number}: strafslagen plus putts is meer dan de score`,
      });
    }
    if (h.shots && h.shots.length > 0) {
      const count = h.shots.length + h.shots.filter((s) => s.penalty).length;
      if (count !== h.strokes) {
        issues.push({
          severity: "red",
          code: "plausibility",
          field: `holes.${i}.shots`,
          hole: h.number,
          message: `Hole ${h.number}: slagenreeks telt ${count} slagen, score is ${h.strokes}`,
        });
      }
      const onGreen = h.shots.filter((s) => s.lie === "green").length;
      if (h.putts != null && onGreen !== h.putts) {
        issues.push({
          severity: "red",
          code: "plausibility",
          field: `holes.${i}.shots`,
          hole: h.number,
          message: `Hole ${h.number}: ${onGreen} slagen op de green in de reeks, maar ${h.putts} putts`,
        });
      }
    }
  });

  holes.forEach((h, i) => {
    if (!Number.isInteger(h.si) || h.si < 1 || h.si > 18)
      issues.push({ severity: "red", code: "plausibility", field: `holes.${i}.si`, hole: h.number, message: `Hole ${h.number}: stroke index ontbreekt of is ongeldig` });
  });
  const sis = holes.map((h) => h.si);
  if (new Set(sis).size !== sis.length) {
    issues.push({ severity: "red", code: "plausibility", message: "Stroke index komt dubbel voor op de kaart" });
  }

  // --- Baandata vergelijken met de opgeslagen baan
  if (course && course.length) {
    holes.forEach((h, i) => {
      const ref = course.find((c) => c.number === h.number);
      if (!ref) return;
      for (const key of ["par", "si", "length"] as const) {
        const a = h[key];
        const b = ref[key];
        if (a != null && b != null && a !== b) {
          issues.push({
            severity: "note",
            code: "course",
            field: `holes.${i}.${key}`,
            hole: h.number,
            message: `Hole ${h.number}: ${key === "si" ? "SI" : key} op kaart ${a}, opgeslagen baan ${b}`,
            expected: b,
            actual: a,
          });
        }
      }
    });
  }

  // --- Zekerheid
  for (const field of draft.lowConfidence ?? []) {
    const m = field.match(/^holes\.(\d+)\./);
    issues.push({
      severity: "yellow",
      code: "confidence",
      field,
      hole: m ? holes[Number(m[1])]?.number : undefined,
      message: `Onzeker gelezen: ${describeField(field, draft)}`,
    });
  }

  // --- Ontbrekende basisgegevens
  if (!draft.date) issues.push({ severity: "red", code: "missing", field: "date", message: "Datum ontbreekt" });
  if (!draft.clubName) issues.push({ severity: "red", code: "missing", field: "clubName", message: "Baan ontbreekt" });

  return issues;
}

function describeField(field: string, draft: RoundDraft): string {
  const m = field.match(/^holes\.(\d+)\.(\w+)$/);
  if (m) return `hole ${draft.holes[Number(m[1])]?.number ?? Number(m[1]) + 1}, ${m[2]}`;
  return field;
}

export function hasBlockingIssues(issues: CheckIssue[]) {
  return issues.some((i) => i.severity === "red");
}
