import "server-only";
import { and, asc, desc, eq, inArray, ne, or } from "drizzle-orm";
import { db, num } from "@/db";
import { bagClubs, holeScores, imports, rounds, shots, tees, users, type User } from "@/db/schema";
import { HttpError } from "@/lib/auth";
import { createCourseFromDraft, listCourseOptions, matchCourse, pickTee, updateCourseFromDraft } from "@/lib/courses";
import { scoreHoles } from "@/lib/golf/stableford";
import type { RoundLike } from "@/lib/golf/stats";
import type { DraftHole, Lie, RoundDraft } from "@/lib/golf/types";
import { computeWhs, courseHandicap, handicapForRound, playingHandicap, type WhsRoundInput } from "@/lib/golf/whs";

export type CourseAction = "none" | "create" | "update";

export interface SaveOptions {
  roundId?: number;
  importId?: number;
  courseAction?: CourseAction;
}

/** Slaat een gecontroleerde conceptronde op (nieuw of bijwerken). */
export async function saveRound(user: User, draft: RoundDraft, opts: SaveOptions = {}): Promise<number> {
  const options = await listCourseOptions();
  const match =
    draft.loopId || draft.combinationId
      ? (() => {
          const opt = options.find((o) =>
            draft.combinationId ? o.kind === "combination" && o.id === draft.combinationId : o.kind === "loop" && o.id === draft.loopId,
          );
          if (!opt) return null;
          const tee = draft.teeId ? (opt.tees.find((t) => t.id === draft.teeId) ?? null) : pickTee(opt.tees, draft.teeName, draft.teeGender, draft.date);
          return { option: opt, tee, holes: opt.holes };
        })()
      : await matchCourse(draft, options);

  const savedId = await db.transaction(async (tx) => {
    let clubId = match?.option.clubId ?? null;
    let loopId = match?.option.kind === "loop" ? match.option.id : null;
    let combinationId = match?.option.kind === "combination" ? match.option.id : null;
    let teeId = match?.tee?.id ?? null;
    let cr = draft.courseRating ?? match?.tee?.courseRating ?? null;
    let slope = draft.slope ?? match?.tee?.slope ?? null;
    let courseLabel = match ? match.option.label : [draft.clubName, draft.loopName].filter(Boolean).join(" – ");

    if (!match && opts.courseAction === "create") {
      const created = await createCourseFromDraft(tx, draft, user.id);
      ({ clubId, loopId, combinationId, teeId } = created);
      courseLabel = [draft.clubName, draft.loopName].filter(Boolean).join(" – ");
    } else if (match && opts.courseAction === "update") {
      await updateCourseFromDraft(tx, match, draft);
    }

    const par = draft.holes.reduce((a, h) => a + h.par, 0);
    const hi = draft.handicapIndex;
    let ch = draft.courseHandicap ?? null;
    if (ch == null && hi != null && cr != null && slope != null) ch = courseHandicap(hi, slope, cr, par, draft.holesCount);
    let ph = draft.playingHandicap;
    if (ph == null && ch != null) ph = playingHandicap(ch, user.allowance);
    const scored = scoreHoles(draft.holes, ph);

    const values = {
      userId: user.id,
      date: draft.date,
      clubId,
      loopId,
      combinationId,
      teeId,
      courseLabel: courseLabel || "Onbekende baan",
      teeLabel: [draft.teeName, draft.teeGender === "f" ? "(d)" : "(h)"].filter(Boolean).join(" "),
      holesCount: draft.holesCount,
      format: draft.format,
      handicapIndex: hi != null ? String(hi) : null,
      courseHandicap: ch,
      playingHandicap: ph,
      courseRating: cr != null ? String(cr) : null,
      slope,
      par,
      pcc: draft.pcc ?? 0,
      source: draft.source,
      qualifying: draft.qualifying ?? true,
      notes: draft.notes ?? null,
      updatedAt: new Date(),
    };

    let roundId = opts.roundId;
    if (roundId) {
      const [existing] = await tx.select().from(rounds).where(eq(rounds.id, roundId));
      if (!existing || existing.userId !== user.id) throw new Error("Ronde niet gevonden");
      await tx.update(rounds).set({ ...values, source: existing.source }).where(eq(rounds.id, roundId));
      await tx.delete(holeScores).where(eq(holeScores.roundId, roundId));
    } else {
      [{ id: roundId }] = await tx.insert(rounds).values(values).returning({ id: rounds.id });
    }

    for (let i = 0; i < draft.holes.length; i++) {
      const h = draft.holes[i];
      const [hs] = await tx
        .insert(holeScores)
        .values({
          roundId: roundId!,
          number: h.number,
          par: h.par,
          si: h.si,
          length: h.length ?? null,
          strokes: h.strokes,
          points: h.strokes == null ? null : scored[i].points,
          putts: h.putts ?? null,
          fairway: h.par === 3 ? "na" : (h.fairway ?? null),
          gir: h.gir ?? null,
          penalties: h.penalties ?? 0,
          bunker: h.bunker ?? 0,
        })
        .returning({ id: holeScores.id });
      if (h.shots?.length) {
        await tx.insert(shots).values(
          h.shots.map((s, seq) => ({
            holeScoreId: hs.id,
            seq,
            bagClubId: s.bagClubId ?? null,
            lie: s.lie,
            distance: String(s.distance),
            penalty: !!s.penalty,
          })),
        );
      }
    }

    if (opts.importId) {
      await tx
        .update(imports)
        .set({ status: "saved", roundId, draft })
        .where(and(eq(imports.id, opts.importId), eq(imports.userId, user.id)));
    }
    return roundId!;
  });
  // Handicap en punten komen altijd uit de eigen database, nooit van de kaart
  await recalcHandicaps(user.id);
  return savedId;
}

/**
 * Herberekent voor alle rondes van een speler, in datumvolgorde: index vóór de ronde
 * (WHS uit eerdere rondes, anders start-/officiële index), course en playing handicap
 * uit de tee (rating/slope van de tee gaat voor), en de stablefordpunten per hole.
 * Aanroepen na elke wijziging die dit kan beïnvloeden.
 */
export async function recalcHandicaps(userId: number) {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u) return;
  const rs = (await loadRounds([userId])).sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  if (!rs.length) return;
  const teeIds = [...new Set(rs.map((r) => r.teeId).filter((x): x is number => x != null))];
  const teeRows = teeIds.length ? await db.select().from(tees).where(inArray(tees.id, teeIds)) : [];
  const teeMap = new Map(teeRows.map((t) => [t.id, t]));
  for (const r of rs) {
    const t = r.teeId ? teeMap.get(r.teeId) : null;
    if (t && t.courseRating != null && t.slope != null) {
      r.courseRating = num(t.courseRating);
      r.slope = t.slope;
    }
  }
  const start = userStartIndex(u);
  const whs = computeWhs(whsInputs(rs), start);
  const before = new Map(whs.rounds.map((x) => [x.id, x.indexBefore]));
  await db.transaction(async (tx) => {
    for (const r of rs) {
      const idx = before.get(r.id) ?? start;
      const hcp = idx != null ? handicapForRound(idx, { courseRating: r.courseRating, slope: r.slope, par: r.par }, r.holesCount, u.allowance) : null;
      const ph = hcp?.playingHandicap ?? null;
      await tx
        .update(rounds)
        .set({
          handicapIndex: idx != null ? String(idx) : null,
          courseHandicap: hcp?.courseHandicap ?? null,
          playingHandicap: ph,
          courseRating: r.courseRating != null ? String(r.courseRating) : null,
          slope: r.slope,
        })
        .where(eq(rounds.id, r.id));
      const scored = scoreHoles(r.holes, ph);
      for (let i = 0; i < r.holes.length; i++) {
        const h = r.holes[i];
        const points = h.strokes == null ? null : scored[i].points;
        if (points !== h.points) await tx.update(holeScores).set({ points }).where(eq(holeScores.id, h.id));
      }
    }
  });
}

/** Herberekenen voor alle spelers (bijv. na wijziging van rating/slope van een tee). */
export async function recalcAllHandicaps() {
  for (const u of await db.select({ id: users.id }).from(users)) await recalcHandicaps(u.id);
}

/** Alleen de slagenreeks van één hole vervangen. */
export async function saveShots(user: User, roundId: number, holeNumber: number, list: DraftHole["shots"]) {
  const [r] = await db.select().from(rounds).where(eq(rounds.id, roundId));
  if (!r || r.userId !== user.id) throw new Error("Ronde niet gevonden");
  const [hs] = await db
    .select()
    .from(holeScores)
    .where(and(eq(holeScores.roundId, roundId), eq(holeScores.number, holeNumber)));
  if (!hs) throw new Error("Hole niet gevonden");
  if (list?.length) {
    const count = list.length + list.filter((s) => s.penalty).length;
    if (hs.strokes != null && count !== hs.strokes) throw new HttpError(422, `Slagenreeks telt ${count} slagen, score is ${hs.strokes}`);
    const onGreen = list.filter((s) => s.lie === "green").length;
    if (hs.putts != null && onGreen !== hs.putts) throw new HttpError(422, `${onGreen} slagen op de green, maar ${hs.putts} putts`);
  }
  await db.transaction(async (tx) => {
    await tx.delete(shots).where(eq(shots.holeScoreId, hs.id));
    if (list?.length)
      await tx.insert(shots).values(
        list.map((s, seq) => ({
          holeScoreId: hs.id,
          seq,
          bagClubId: s.bagClubId ?? null,
          lie: s.lie,
          distance: String(s.distance),
          penalty: !!s.penalty,
        })),
      );
  });
}

export interface LoadedRound extends RoundLike {
  userId: number;
  teeLabel: string | null;
  handicapIndex: number | null;
  courseHandicap: number | null;
  courseRating: number | null;
  slope: number | null;
  pcc: number;
  source: string;
  qualifying: boolean;
  visibility: string;
  notes: string | null;
  clubId: number | null;
  loopId: number | null;
  combinationId: number | null;
  teeId: number | null;
  holes: (RoundLike["holes"][number] & {
    id: number;
    length: number | null;
    shots: { lie: Lie; distance: number; penalty: boolean; bagClubId: number | null; club: string | null }[];
  })[];
}

export interface RoundFilter {
  from?: string;
  to?: string;
  courseLabel?: string;
  holes?: 9 | 18;
  format?: string;
  withShots?: boolean;
  q?: string;
}

/** Laadt rondes met holescores (en slagen), nieuwste eerst. */
export async function loadRounds(userIds: number[], filter: RoundFilter = {}, withShotData = false): Promise<LoadedRound[]> {
  if (!userIds.length) return [];
  const rs = await db
    .select()
    .from(rounds)
    .where(inArray(rounds.userId, userIds))
    .orderBy(desc(rounds.date), desc(rounds.id));
  if (!rs.length) return [];
  const hs = await db
    .select()
    .from(holeScores)
    .where(inArray(holeScores.roundId, rs.map((r) => r.id)))
    .orderBy(asc(holeScores.number));
  const shotRows = await db
    .select({ shot: shots, clubName: bagClubs.name })
    .from(shots)
    .innerJoin(holeScores, eq(holeScores.id, shots.holeScoreId))
    .leftJoin(bagClubs, eq(bagClubs.id, shots.bagClubId))
    .where(inArray(holeScores.roundId, rs.map((r) => r.id)))
    .orderBy(asc(shots.seq));
  const shotsByHole = new Map<number, LoadedRound["holes"][number]["shots"]>();
  for (const { shot, clubName } of shotRows) {
    const list = shotsByHole.get(shot.holeScoreId) ?? [];
    list.push({ lie: shot.lie as Lie, distance: Number(shot.distance), penalty: shot.penalty, bagClubId: shot.bagClubId, club: clubName });
    shotsByHole.set(shot.holeScoreId, list);
  }
  const byRound = new Map<number, LoadedRound["holes"]>();
  for (const h of hs) {
    const list = byRound.get(h.roundId) ?? [];
    list.push({
      id: h.id,
      number: h.number,
      par: h.par,
      si: h.si,
      length: h.length,
      strokes: h.strokes,
      points: h.points,
      putts: h.putts,
      fairway: h.fairway,
      gir: h.gir,
      penalties: h.penalties,
      bunker: h.bunker,
      shots: withShotData ? (shotsByHole.get(h.id) ?? []) : [],
    });
    byRound.set(h.roundId, list);
  }
  const out: LoadedRound[] = rs.map((r) => {
    const hls = byRound.get(r.id) ?? [];
    return {
      id: r.id,
      userId: r.userId,
      date: r.date,
      courseLabel: r.courseLabel,
      teeLabel: r.teeLabel,
      holesCount: r.holesCount,
      par: r.par,
      playingHandicap: r.playingHandicap,
      format: r.format,
      hasShots: hls.some((h) => shotsByHole.has(h.id)),
      handicapIndex: num(r.handicapIndex),
      courseHandicap: r.courseHandicap,
      courseRating: num(r.courseRating),
      slope: r.slope,
      pcc: r.pcc,
      source: r.source,
      qualifying: r.qualifying,
      visibility: r.visibility,
      notes: r.notes,
      clubId: r.clubId,
      loopId: r.loopId,
      combinationId: r.combinationId,
      teeId: r.teeId,
      holes: hls,
    };
  });
  return applyFilter(out, filter);
}

export function applyFilter<T extends LoadedRound>(rs: T[], f: RoundFilter): T[] {
  return rs.filter(
    (r) =>
      (!f.from || r.date >= f.from) &&
      (!f.to || r.date <= f.to) &&
      (!f.courseLabel || r.courseLabel === f.courseLabel) &&
      (!f.holes || (f.holes === 9 ? r.holesCount <= 9 : r.holesCount > 9)) &&
      (!f.format || r.format === f.format) &&
      (f.withShots == null || !!r.hasShots === f.withShots) &&
      (!f.q || r.courseLabel.toLowerCase().includes(f.q.toLowerCase()) || r.date.includes(f.q)),
  );
}

export async function loadRound(id: number): Promise<LoadedRound | null> {
  const [r] = await db.select({ userId: rounds.userId }).from(rounds).where(eq(rounds.id, id));
  if (!r) return null;
  const all = await loadRounds([r.userId], {}, true);
  return all.find((x) => x.id === id) ?? null;
}

// ---------- Zichtbaarheid (fase 5) ----------

/** Mag viewer deze ronde zien? Eigen rondes altijd; anders alleen gedeeld. */
export function canView(viewer: User, round: { userId: number; visibility: string }, owner: Pick<User, "sharing">) {
  if (viewer.id === round.userId) return true;
  if (round.visibility === "private") return false;
  if (round.visibility === "shared") return true;
  return owner.sharing === "friends";
}

/** Andere spelers van wie deze gebruiker (mogelijk) gedeelde rondes kan bekijken. */
export async function otherPlayers(viewer: User) {
  return db
    .select({ id: users.id, name: users.name, sharing: users.sharing })
    .from(users)
    .where(and(ne(users.id, viewer.id), or(eq(users.role, "owner"), eq(users.role, "player"))))
    .orderBy(asc(users.name));
}

/** Rondes van een andere speler die zichtbaar zijn voor viewer. */
export async function visibleRoundsOf(viewer: User, playerId: number) {
  const [owner] = await db.select().from(users).where(eq(users.id, playerId));
  if (!owner) return [];
  return (await loadRounds([playerId])).filter((r) => canView(viewer, r, owner));
}

// ---------- WHS ----------

export function whsInputs(rs: LoadedRound[]): WhsRoundInput[] {
  return rs.map((r) => ({
    id: r.id,
    date: r.date,
    holesCount: r.holesCount,
    qualifying: r.qualifying,
    courseRating: r.courseRating,
    slope: r.slope,
    par: r.par,
    pcc: r.pcc,
    holes: r.holes.map((h) => ({ par: h.par, si: h.si, strokes: h.strokes })),
  }));
}

export function userStartIndex(u: User): number | null {
  return num(u.startIndex) ?? num(u.officialIndex);
}

/** Handicapindex op een datum: berekend uit rondes vóór die datum, anders de startindex. */
export async function indexOnDate(u: User, date: string, excludeRoundId?: number): Promise<number | null> {
  const rs = (await loadRounds([u.id])).filter((r) => r.date < date && r.id !== excludeRoundId);
  return computeWhs(whsInputs(rs), userStartIndex(u)).index;
}
