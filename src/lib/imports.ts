import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { imports, type User } from "@/db/schema";
import { geminiModel, readScorecard } from "@/lib/gemini";
import { assertAiBudget, finishAiCall, reserveAiCall } from "@/lib/aiBudget";
import { listCourseOptions, matchCourse } from "@/lib/courses";
import { aiCardToDraft, guessPlayer } from "@/lib/golf/aiDraft";
import { runChecks, type CheckIssue } from "@/lib/golf/checks";
import type { RoundDraft } from "@/lib/golf/types";
import { indexOnDate, loadRounds } from "@/lib/rounds";
import { enforce } from "@/lib/rateLimit";
import { HttpError } from "@/lib/auth";

export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? "./data/uploads");
const MAX_BYTES = 15 * 1024 * 1024;
const MAX_IMAGES = 6;
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif" };

export function mimeFor(file: string) {
  const ext = path.extname(file).slice(1).toLowerCase();
  return Object.entries(EXT).find(([, e]) => e === ext)?.[0] ?? "application/octet-stream";
}

/** Slaat geüploade afbeeldingen op en maakt een import in status "pending". */
export async function createImport(user: User, files: File[]): Promise<number> {
  const images = files.filter((f) => f && typeof f === "object" && f.size > 0);
  if (!images.length) throw new Error("Geen afbeelding ontvangen");
  if (images.length > MAX_IMAGES) throw new HttpError(400, `Maximaal ${MAX_IMAGES} afbeeldingen per ronde`);
  const dir = path.join(UPLOAD_DIR, `u${user.id}`);
  await mkdir(dir, { recursive: true });
  const saved: string[] = [];
  for (const f of images) {
    if (!f.type.startsWith("image/")) throw new Error(`Geen afbeelding: ${f.name}`);
    if (f.size > MAX_BYTES) throw new Error(`Afbeelding te groot (max 15 MB): ${f.name}`);
    const name = `${Date.now()}-${randomBytes(6).toString("hex")}.${EXT[f.type] ?? "jpg"}`;
    await writeFile(path.join(dir, name), Buffer.from(await f.arrayBuffer()));
    saved.push(`u${user.id}/${name}`);
  }
  const [row] = await db.insert(imports).values({ userId: user.id, images: saved, status: "pending" }).returning({ id: imports.id });
  return row.id;
}

const DAY = 86_400_000;

/** Problemen die wijzen op een leesfout (en een tweede poging rechtvaardigen). */
export function readProblems(draft: RoundDraft, issues: CheckIssue[], today = new Date()): string[] {
  const p = issues.filter((i) => i.severity === "red").map((i) => i.message);
  const played = draft.holes.filter((h) => h.strokes != null);
  if (draft.holes.length < draft.holesCount) p.push(`Er zijn maar ${draft.holes.length} van de ${draft.holesCount} holes gelezen`);
  if (draft.format === "stableford" && played.some((h) => h.points == null)) p.push("Niet bij elke gespeelde hole zijn stablefordpunten (superscript) gelezen");
  if (draft.playingHandicap == null) p.push("P.HCP onder de spelersnaam is niet gelezen");
  if (draft.holes.some((h) => !h.si)) p.push("Niet elke hole heeft een geldige stroke index (1–9 of 1–18)");
  if (draft.holes.some((h) => h.length == null)) p.push("Niet elke hole heeft een lengte uit de teerij");
  const d = new Date(draft.date + "T12:00:00");
  if (Number.isNaN(d.getTime()) || d.getTime() > today.getTime() + DAY || d.getTime() < today.getTime() - 400 * DAY)
    p.push(`Datum ${draft.date} lijkt onwaarschijnlijk; controleer vooral het jaartal`);
  return [...new Set(p)];
}

/**
 * AI-uitlezing, baan koppelen en controles. Vindt de controle leesfouten, dan volgt één
 * tweede poging met die problemen als feedback; de beste poging blijft. Idempotent.
 */
export async function processImport(user: User, id: number, force = false) {
  const [imp] = await db.select().from(imports).where(and(eq(imports.id, id), eq(imports.userId, user.id)));
  if (!imp) throw new Error("Import niet gevonden");
  if (imp.status === "saved") return imp;
  if (imp.status === "parsed" && !force) return imp;
  // Vóór de try: bij een limiet blijft de import staan zoals hij was (niet "failed") en krijgt de client 429
  enforce("aiBurst", user.id);
  await assertAiBudget(user.id, imp.id);

  try {
    const imgs = await Promise.all(
      imp.images.map(async (p) => ({ mimeType: mimeFor(p), base64: (await readFile(path.join(UPLOAD_DIR, p))).toString("base64") })),
    );
    const options = await listCourseOptions();

    const attempt = async (feedback?: { problems: string[]; previous: unknown }) => {
      // Elke aanroep telt tegen het AI-budget; is dat op, dan faalt deze poging (bij de herkansing blijft de eerste staan)
      const callId = await reserveAiCall(user.id, imp.id, geminiModel());
      const { card, raw, usage } = await readScorecard(imgs, feedback).catch(async (e) => {
        await finishAiCall(callId, false);
        throw e;
      });
      await finishAiCall(callId, true, usage);
      const draft = aiCardToDraft(card, guessPlayer(card, user.name), card.imageKind === "photo" ? "ai_photo" : "ai_screenshot");
      const match = await matchCourse(draft, options);
      if (match) {
        draft.clubId = match.option.clubId;
        draft.loopId = match.option.kind === "loop" ? match.option.id : null;
        draft.combinationId = match.option.kind === "combination" ? match.option.id : null;
        draft.teeId = match.tee?.id ?? null;
        draft.courseRating = match.tee?.courseRating ?? null;
        draft.slope = match.tee?.slope ?? null;
        // Ontbrekende of ongeldige baandata aanvullen uit de opgeslagen baan
        draft.holes.forEach((h, i) => {
          const ref = match.holes[i];
          if (!ref) return;
          if (!h.si) h.si = ref.si;
          if (h.length == null && ref.length != null) h.length = ref.length;
        });
      }
      const issues = runChecks(draft, match?.holes);
      return { card, raw, draft, issues, problems: readProblems(draft, issues) };
    };

    let best = await attempt();
    const attempts: { problems: string[] }[] = [{ problems: best.problems }];
    if (best.problems.length) {
      const second = await attempt({ problems: best.problems, previous: best.card }).catch(() => null);
      if (second) {
        attempts.push({ problems: second.problems });
        if (second.problems.length < best.problems.length) best = second;
      }
    }
    const { card, raw, draft } = best;
    if (best.problems.some((p) => p.startsWith("Datum")) && !draft.lowConfidence?.includes("date")) draft.lowConfidence = [...(draft.lowConfidence ?? []), "date"];
    draft.handicapIndex = await indexOnDate(user, draft.date);
    const checks = runChecks(draft, null);
    const [row] = await db
      .update(imports)
      .set({ status: "parsed", rawOutput: { card, response: raw, attempts }, draft, checks, error: null })
      .where(eq(imports.id, id))
      .returning();
    return row;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const [row] = await db.update(imports).set({ status: "failed", error: msg }).where(eq(imports.id, id)).returning();
    return row;
  }
}

/** Bestaat er al een ronde met dezelfde datum, baan en score? (waarschuwing op het nakijkscherm) */
export async function findDuplicates(userId: number, draft: RoundDraft) {
  const strokes = draft.holes.reduce((a, h) => a + (h.strokes ?? 0), 0);
  const rs = (await loadRounds([userId])).filter((r) => r.date === draft.date);
  return rs.filter((r) => r.holes.reduce((a, h) => a + (h.strokes ?? 0), 0) === strokes).map((r) => ({ id: r.id, courseLabel: r.courseLabel }));
}
