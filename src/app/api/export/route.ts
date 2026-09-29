import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bagClubs, imports } from "@/db/schema";
import { apiError, apiUser } from "@/lib/auth";
import { loadRounds } from "@/lib/rounds";
import { toCsv } from "@/lib/csv";
import { enforce } from "@/lib/rateLimit";

export const runtime = "nodejs";

/** Volledige export van de eigen data als JSON of CSV (één regel per hole). */
export async function GET(req: Request) {
  try {
    const user = await apiUser();
    enforce("export", user.id);
    const format = new URL(req.url).searchParams.get("format") === "csv" ? "csv" : "json";
    const rounds = (await loadRounds([user.id], {}, true)).reverse();
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "csv") {
      const rows = rounds.flatMap((r) =>
        r.holes.map((h) => ({
          round_id: r.id,
          date: r.date,
          course: r.courseLabel,
          tee: r.teeLabel,
          holes_count: r.holesCount,
          format: r.format,
          handicap_index: r.handicapIndex,
          playing_handicap: r.playingHandicap,
          course_rating: r.courseRating,
          slope: r.slope,
          qualifying: r.qualifying ? 1 : 0,
          hole: h.number,
          par: h.par,
          si: h.si,
          length: h.length,
          strokes: h.strokes,
          points: h.points,
          putts: h.putts,
          fairway: h.fairway,
          gir: h.gir == null ? "" : h.gir ? 1 : 0,
          penalties: h.penalties,
          bunker: h.bunker,
        })),
      );
      const cols = ["round_id", "date", "course", "tee", "holes_count", "format", "handicap_index", "playing_handicap", "course_rating", "slope", "qualifying", "hole", "par", "si", "length", "strokes", "points", "putts", "fairway", "gir", "penalties", "bunker"];
      return new Response("﻿" + toCsv(rows, cols), {
        headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="golf-stats-${stamp}.csv"` },
      });
    }
    const bag = await db.select().from(bagClubs).where(eq(bagClubs.userId, user.id)).orderBy(asc(bagClubs.sortOrder));
    const imp = await db.select({ id: imports.id, images: imports.images, status: imports.status, roundId: imports.roundId, createdAt: imports.createdAt, rawOutput: imports.rawOutput }).from(imports).where(eq(imports.userId, user.id));
    const { passwordHash: _pw, ...profile } = user;
    return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), profile, bag, rounds, imports: imp }, null, 2), {
      headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="golf-stats-${stamp}.json"` },
    });
  } catch (e) {
    return apiError(e);
  }
}
