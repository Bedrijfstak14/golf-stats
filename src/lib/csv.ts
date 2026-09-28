import type { Fairway, RoundDraft } from "@/lib/golf/types";

export const CSV_COLUMNS = [
  "date",
  "course",
  "tee",
  "holes_count",
  "format",
  "handicap_index",
  "playing_handicap",
  "course_rating",
  "slope",
  "qualifying",
  "hole",
  "par",
  "si",
  "length",
  "strokes",
  "points",
  "putts",
  "fairway",
  "gir",
  "penalties",
  "bunker",
] as const;

const esc = (v: unknown) => {
  if (v == null) return "";
  const s = String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows: Record<string, unknown>[], columns: readonly string[] = CSV_COLUMNS): string {
  return [columns.join(","), ...rows.map((r) => columns.map((c) => esc(r[c])).join(","))].join("\n") + "\n";
}

/** Eenvoudige CSV-parser (komma of puntkomma, aanhalingstekens). */
export function parseCsv(text: string): Record<string, string>[] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.some((x) => x.trim() !== ""));
  if (!header) return [];
  const keys = header.map((h) => h.trim().toLowerCase());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

const n = (v: string | undefined) => (v == null || v === "" ? null : Number(v.replace(",", ".")));
const FAIRWAYS: Fairway[] = ["hit", "left", "right", "short", "long", "na"];

/** CSV-regels (één per hole) groeperen tot conceptrondes. */
export function csvToDrafts(rows: Record<string, string>[]): RoundDraft[] {
  const groups = new Map<string, Record<string, string>[]>();
  for (const r of rows) {
    const key = `${r.date}|${r.course}|${r.tee}|${r.round_id ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.values()].map((rs) => {
    const f = rs[0];
    const [clubName, loopName] = (f.course ?? "").split(" – ");
    const teeLabel = f.tee ?? "";
    const holes = rs
      .sort((a, b) => Number(a.hole) - Number(b.hole))
      .map((r, i) => {
        const par = n(r.par) ?? 4;
        const fw = (r.fairway ?? "").toLowerCase() as Fairway;
        return {
          number: i + 1,
          par,
          si: n(r.si) ?? i + 1,
          length: n(r.length),
          strokes: n(r.strokes),
          putts: n(r.putts),
          fairway: par === 3 ? ("na" as const) : FAIRWAYS.includes(fw) ? fw : null,
          gir: r.gir === "" ? null : ["1", "true", "ja", "yes"].includes((r.gir ?? "").toLowerCase()),
          penalties: n(r.penalties) ?? 0,
          bunker: n(r.bunker) ?? 0,
        };
      });
    return {
      date: f.date,
      clubName: clubName ?? "",
      loopName: loopName ?? "",
      teeName: teeLabel.replace(/\s*\((h|d)\)$/, ""),
      teeGender: teeLabel.endsWith("(d)") ? "f" : "m",
      holesCount: holes.length > 9 ? 18 : 9,
      format: f.format === "stroke" ? "stroke" : "stableford",
      handicapIndex: n(f.handicap_index),
      playingHandicap: n(f.playing_handicap),
      courseRating: n(f.course_rating),
      slope: n(f.slope),
      qualifying: f.qualifying ? !["0", "false", "nee", "no"].includes(f.qualifying.toLowerCase()) : true,
      source: "csv",
      holes,
    } satisfies RoundDraft;
  });
}
