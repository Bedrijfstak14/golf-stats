import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, num } from "@/db";
import { clubs, combinations, holes, loops, tees } from "@/db/schema";
import { siRanks } from "@/lib/golf/stableford";
import type { CourseHoleRef, RoundDraft } from "@/lib/golf/types";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Db = typeof db | Tx;

export interface TeeInfo {
  id: number;
  name: string;
  gender: string;
  courseRating: number | null;
  slope: number | null;
  par: number;
  lengths: number[];
  validFrom: string;
}

export interface CourseOption {
  kind: "loop" | "combination";
  id: number;
  clubId: number;
  clubName: string;
  name: string;
  label: string;
  holesCount: number;
  holes: CourseHoleRef[];
  /** Alle versies; kies met pickTee() */
  tees: TeeInfo[];
}

const teeInfo = (t: typeof tees.$inferSelect): TeeInfo => ({
  id: t.id,
  name: t.name,
  gender: t.gender,
  courseRating: num(t.courseRating),
  slope: t.slope,
  par: t.par,
  lengths: t.lengths,
  validFrom: t.validFrom,
});

/** Tees die op een datum geldig zijn: per naam+geslacht de laatste geldig-vanaf ≤ datum. */
export function teesOnDate(all: TeeInfo[], date: string): TeeInfo[] {
  const map = new Map<string, TeeInfo>();
  for (const t of [...all].sort((a, b) => a.validFrom.localeCompare(b.validFrom))) {
    if (t.validFrom <= date) map.set(`${t.name}|${t.gender}`, t);
  }
  // Als er nog geen geldige is (datum vóór eerste versie), neem de oudste
  for (const t of all) if (!map.has(`${t.name}|${t.gender}`)) map.set(`${t.name}|${t.gender}`, t);
  return [...map.values()];
}

export function pickTee(all: TeeInfo[], name: string, gender: string, date: string): TeeInfo | null {
  const valid = teesOnDate(all, date);
  const n = name.trim().toLowerCase();
  return (
    valid.find((t) => t.name.toLowerCase() === n && t.gender === gender) ??
    valid.find((t) => t.name.toLowerCase() === n) ??
    null
  );
}

/** Alle banen als keuzelijst, inclusief holes en tees. */
export async function listCourseOptions(d: Db = db): Promise<CourseOption[]> {
  const cl = await d.select().from(clubs).orderBy(asc(clubs.name));
  if (!cl.length) return [];
  const lp = await d.select().from(loops).orderBy(asc(loops.name));
  const hs = await d.select().from(holes).orderBy(asc(holes.number));
  const cb = await d.select().from(combinations).orderBy(asc(combinations.name));
  const ts = await d.select().from(tees).orderBy(asc(tees.name));
  const clubName = new Map(cl.map((c) => [c.id, c.name]));
  const out: CourseOption[] = [];
  for (const l of lp) {
    const lh = hs.filter((h) => h.loopId === l.id);
    const lt = ts.filter((t) => t.loopId === l.id).map(teeInfo);
    out.push({
      kind: "loop",
      id: l.id,
      clubId: l.clubId,
      clubName: clubName.get(l.clubId) ?? "",
      name: l.name,
      label: `${clubName.get(l.clubId)} – ${l.name}`,
      holesCount: l.holesCount,
      holes: lh.map((h) => ({ number: h.number, par: h.par, si: h.si, length: null })),
      tees: lt,
    });
  }
  for (const c of cb) {
    const h1 = hs.filter((h) => h.loopId === c.firstLoopId);
    const h2 = hs.filter((h) => h.loopId === c.secondLoopId);
    const all = [...h1, ...h2];
    out.push({
      kind: "combination",
      id: c.id,
      clubId: c.clubId,
      clubName: clubName.get(c.clubId) ?? "",
      name: c.name,
      label: `${clubName.get(c.clubId)} – ${c.name}`,
      holesCount: all.length,
      holes: all.map((h, i) => ({ number: i + 1, par: h.par, si: c.si[i] ?? i + 1, length: null })),
      tees: ts.filter((t) => t.combinationId === c.id).map(teeInfo),
    });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

/** Baandata van een optie met lengtes van een tee. */
export function courseHolesWithTee(opt: CourseOption, tee: TeeInfo | null): CourseHoleRef[] {
  return opt.holes.map((h, i) => ({ ...h, length: tee?.lengths[i] ?? null }));
}

const STOP = /\b(golfbaan|golfclub|golf|club|g&cc|gcc|gc|country|de|het|the|en|and)\b/g;
export const normalizeName = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(STOP, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function nameScore(a: string, b: string) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 3;
  if (na.includes(nb) || nb.includes(na)) return 2;
  const wa = new Set(na.split(" "));
  const common = nb.split(" ").filter((w) => wa.has(w) && w.length > 2).length;
  return common ? 1 + common / 10 : 0;
}

export interface CourseMatch {
  option: CourseOption;
  tee: TeeInfo | null;
  holes: CourseHoleRef[];
}

/** Zoek de baan op naam en lus. Bekend: baandata om te vergelijken. Onbekend: null. */
export async function matchCourse(draft: RoundDraft, options?: CourseOption[]): Promise<CourseMatch | null> {
  const opts = options ?? (await listCourseOptions());
  let best: { opt: CourseOption; score: number } | null = null;
  for (const opt of opts) {
    if (opt.holesCount !== draft.holesCount) continue;
    const club = nameScore(draft.clubName, opt.clubName);
    if (!club) continue;
    const loop = draft.loopName ? nameScore(draft.loopName, opt.name) : 0.5;
    const score = club * 2 + loop;
    if (!best || score > best.score) best = { opt, score };
  }
  if (!best) return null;
  const tee = pickTee(best.opt.tees, draft.teeName, draft.teeGender, draft.date);
  return { option: best.opt, tee, holes: courseHolesWithTee(best.opt, tee) };
}

/** Nieuwe baan aanmaken uit uitgelezen of handmatige baandata. */
export async function createCourseFromDraft(
  tx: Tx,
  draft: RoundDraft,
  userId: number,
): Promise<{ clubId: number; loopId: number | null; combinationId: number | null; teeId: number }> {
  const allClubs = await tx.select().from(clubs);
  let club = allClubs.find((c) => nameScore(c.name, draft.clubName) >= 3);
  if (!club) {
    [club] = await tx.insert(clubs).values({ name: draft.clubName || "Onbekende baan", createdBy: userId }).returning();
  }
  const teeBase = {
    name: draft.teeName || "Onbekend",
    gender: draft.teeGender,
    courseRating: draft.courseRating != null ? String(draft.courseRating) : null,
    slope: draft.slope ?? null,
  };

  const makeLoop = async (name: string, hs: RoundDraft["holes"]) => {
    const existing = (await tx.select().from(loops).where(eq(loops.clubId, club!.id))).find(
      (l) => normalizeName(l.name) === normalizeName(name),
    );
    if (existing) return existing.id;
    const [l] = await tx.insert(loops).values({ clubId: club!.id, name, holesCount: hs.length }).returning();
    const ranks = siRanks(hs);
    await tx.insert(holes).values(hs.map((h, i) => ({ loopId: l.id, number: i + 1, par: h.par, si: ranks[i] })));
    await tx.insert(tees).values({
      ...teeBase,
      loopId: l.id,
      courseRating: null,
      slope: null,
      par: hs.reduce((a, h) => a + h.par, 0),
      lengths: hs.map((h) => h.length ?? 0),
    });
    return l.id;
  };

  if (draft.holesCount <= 9) {
    const loopId = await makeLoop(draft.loopName || "Baan", draft.holes);
    let [t] = await tx
      .select()
      .from(tees)
      .where(and(eq(tees.loopId, loopId), eq(tees.name, teeBase.name), eq(tees.gender, teeBase.gender)))
      .limit(1);
    if (!t) {
      [t] = await tx
        .insert(tees)
        .values({
          ...teeBase,
          loopId,
          par: draft.holes.reduce((a, h) => a + h.par, 0),
          lengths: draft.holes.map((h) => h.length ?? 0),
        })
        .returning();
    } else if (teeBase.courseRating) {
      await tx.update(tees).set({ courseRating: teeBase.courseRating, slope: teeBase.slope }).where(eq(tees.id, t.id));
    }
    return { clubId: club.id, loopId, combinationId: null, teeId: t.id };
  }

  const parts = (draft.loopName || "").split(/\s*(?:\+|\/|&|,| en )\s*/).filter(Boolean);
  const first = await makeLoop(parts[0] ?? "Holes 1–9", draft.holes.slice(0, 9));
  const second = await makeLoop(parts[1] ?? "Holes 10–18", draft.holes.slice(9, 18));
  const [comb] = await tx
    .insert(combinations)
    .values({
      clubId: club.id,
      name: draft.loopName || "18 holes",
      firstLoopId: first,
      secondLoopId: second,
      si: draft.holes.map((h) => h.si),
    })
    .returning();
  const [t] = await tx
    .insert(tees)
    .values({
      ...teeBase,
      combinationId: comb.id,
      par: draft.holes.reduce((a, h) => a + h.par, 0),
      lengths: draft.holes.map((h) => h.length ?? 0),
    })
    .returning();
  return { clubId: club.id, loopId: null, combinationId: comb.id, teeId: t.id };
}

/** "Baan bijwerken": par, SI en lengtes van de kaart overnemen in de opgeslagen baan. */
export async function updateCourseFromDraft(tx: Tx, match: CourseMatch, draft: RoundDraft) {
  const opt = match.option;
  if (opt.kind === "loop") {
    for (const h of draft.holes) {
      await tx.update(holes).set({ par: h.par, si: h.si }).where(and(eq(holes.loopId, opt.id), eq(holes.number, h.number)));
    }
  } else {
    const [c] = await tx.select().from(combinations).where(eq(combinations.id, opt.id));
    await tx.update(combinations).set({ si: draft.holes.map((h) => h.si) }).where(eq(combinations.id, opt.id));
    const loopHoles = [
      ...(await tx.select().from(holes).where(eq(holes.loopId, c.firstLoopId)).orderBy(asc(holes.number))),
      ...(await tx.select().from(holes).where(eq(holes.loopId, c.secondLoopId)).orderBy(asc(holes.number))),
    ];
    for (let i = 0; i < loopHoles.length; i++) {
      const h = draft.holes[i];
      if (h) await tx.update(holes).set({ par: h.par }).where(eq(holes.id, loopHoles[i].id));
    }
  }
  if (match.tee && draft.holes.every((h) => h.length != null)) {
    await tx
      .update(tees)
      .set({ lengths: draft.holes.map((h) => h.length ?? 0), par: draft.holes.reduce((a, h) => a + h.par, 0) })
      .where(eq(tees.id, match.tee.id));
  }
}

/** Controle bij banenbeheer: SI 1..n precies één keer, par-totaal en lengte-totaal kloppen. */
export function validateCourse(hs: { par: number; si: number }[], tee?: { par: number; lengths: number[] } | null): string[] {
  const errors: string[] = [];
  const n = hs.length;
  const sis = hs.map((h) => h.si).sort((a, b) => a - b);
  if (sis.some((s, i) => s !== i + 1)) errors.push(`SI 1 t/m ${n} moet elk precies één keer voorkomen`);
  if (hs.some((h) => h.par < 3 || h.par > 6)) errors.push("Par moet tussen 3 en 6 liggen");
  if (tee) {
    const parSum = hs.reduce((a, h) => a + h.par, 0);
    if (tee.par !== parSum) errors.push(`Par van de tee (${tee.par}) klopt niet met de holes (${parSum})`);
    if (tee.lengths.length !== n) errors.push(`Tee heeft ${tee.lengths.length} lengtes, verwacht ${n}`);
  }
  return errors;
}

export async function clubsWithChildren() {
  const cl = await db.select().from(clubs).orderBy(asc(clubs.name));
  const ids = cl.map((c) => c.id);
  const lp = ids.length ? await db.select().from(loops).where(inArray(loops.clubId, ids)).orderBy(asc(loops.name)) : [];
  const cb = ids.length ? await db.select().from(combinations).where(inArray(combinations.clubId, ids)) : [];
  return cl.map((c) => ({
    ...c,
    loops: lp.filter((l) => l.clubId === c.id),
    combinations: cb.filter((x) => x.clubId === c.id),
  }));
}
