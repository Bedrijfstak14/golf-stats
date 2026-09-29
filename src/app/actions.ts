"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, count, eq, gt, isNull, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { bagClubs, clubs, combinations, holes, invites, loops, rounds, tees, users } from "@/db/schema";
import {
  canManageCourses,
  createSession,
  destroySession,
  hashPassword,
  randomToken,
  requireOwner,
  requireUser,
  verifyPassword,
} from "@/lib/auth";
import { validateCourse } from "@/lib/courses";
import { recalcAllHandicaps, recalcHandicaps } from "@/lib/rounds";
import { clientIp, limiter, LIMITS, waitText, type LimitName } from "@/lib/rateLimit";

export type FormState = { error?: string; ok?: string } | undefined;

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const optNum = (f: FormData, k: string) => {
  const v = str(f, k).replace(",", ".");
  return v === "" ? null : Number(v);
};

const tooMany = (sec: number): FormState => ({ error: `Te veel pogingen. Probeer het over ${waitText(sec)} opnieuw.` });

/** Telt een poging per IP; geeft een foutmelding terug als de limiet op is. */
async function limitByIp(name: LimitName): Promise<FormState | null> {
  const r = limiter.hit(`${name}:${clientIp(await headers())}`, LIMITS[name]);
  return r.ok ? null : tooMany(r.retryAfter);
}

// ---------- Authenticatie ----------

export async function login(_: FormState, f: FormData): Promise<FormState> {
  const email = str(f, "email").toLowerCase();
  // Per account alleen mislukte pogingen: zo helpt wisselen van IP niet bij het raden van een wachtwoord
  const failKey = `loginFail:${email}`;
  const wait = limiter.blocked(failKey, LIMITS.loginFail);
  if (wait) return tooMany(wait);
  const ipLimited = await limitByIp("loginIp");
  if (ipLimited) return ipLimited;
  const [u] = await db.select().from(users).where(eq(users.email, email));
  if (!u || !(await verifyPassword(str(f, "password"), u.passwordHash))) {
    limiter.hit(failKey, LIMITS.loginFail);
    return { error: "Onjuist e-mailadres of wachtwoord" };
  }
  limiter.reset(failKey);
  await createSession(u.id);
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

/** Eerste installatie: alleen mogelijk zolang er nog geen gebruikers zijn. */
export async function setupOwner(_: FormState, f: FormData): Promise<FormState> {
  const limited = await limitByIp("signup");
  if (limited) return limited;
  const [{ n }] = await db.select({ n: count() }).from(users);
  if (n > 0) return { error: "De eigenaar is al aangemaakt" };
  const pw = str(f, "password");
  if (pw.length < 10) return { error: "Kies een wachtwoord van minimaal 10 tekens" };
  const [u] = await db
    .insert(users)
    .values({
      email: str(f, "email").toLowerCase(),
      name: str(f, "name") || "Eigenaar",
      passwordHash: await hashPassword(pw),
      role: "owner",
      gender: str(f, "gender") === "f" ? "f" : "m",
      officialIndex: optNum(f, "officialIndex")?.toString() ?? null,
    })
    .returning();
  await createSession(u.id);
  redirect("/");
}

export async function acceptInvite(_: FormState, f: FormData): Promise<FormState> {
  const limited = await limitByIp("signup");
  if (limited) return limited;
  const token = str(f, "token");
  const [inv] = await db
    .select()
    .from(invites)
    .where(and(eq(invites.token, token), isNull(invites.usedAt), gt(invites.expiresAt, new Date())));
  if (!inv) return { error: "Deze uitnodiging is ongeldig of verlopen" };
  const pw = str(f, "password");
  if (pw.length < 10) return { error: "Kies een wachtwoord van minimaal 10 tekens" };
  const [exists] = await db.select().from(users).where(eq(users.email, inv.email));
  if (exists) return { error: "Er bestaat al een account met dit e-mailadres" };
  const [u] = await db
    .insert(users)
    .values({
      email: inv.email,
      name: str(f, "name") || inv.email,
      passwordHash: await hashPassword(pw),
      role: inv.role,
      gender: str(f, "gender") === "f" ? "f" : "m",
    })
    .returning();
  await db.update(invites).set({ usedAt: new Date() }).where(eq(invites.token, token));
  await createSession(u.id);
  redirect("/");
}

export async function createInvite(_: FormState, f: FormData): Promise<FormState> {
  const owner = await requireOwner();
  const r = limiter.hit(`invite:${owner.id}`, LIMITS.invite);
  if (!r.ok) return tooMany(r.retryAfter);
  const email = str(f, "email").toLowerCase();
  if (!email.includes("@")) return { error: "Vul een geldig e-mailadres in" };
  const role = ["player", "viewer"].includes(str(f, "role")) ? str(f, "role") : "player";
  const token = randomToken(24);
  await db.insert(invites).values({ token, email, role, createdBy: owner.id, expiresAt: new Date(Date.now() + 14 * 86_400_000) });
  revalidatePath("/more/users");
  const base = process.env.APP_URL ?? "";
  return { ok: `${base}/invite/${token}` };
}

export async function revokeInvite(f: FormData) {
  await requireOwner();
  await db.delete(invites).where(eq(invites.token, str(f, "token")));
  revalidatePath("/more/users");
}

// ---------- Instellingen ----------

export async function updateSettings(_: FormState, f: FormData): Promise<FormState> {
  const u = await requireUser();
  const allowance = Number(str(f, "allowance") || 100);
  if (!(allowance > 0 && allowance <= 100)) return { error: "Allowance moet tussen 1 en 100% liggen" };
  await db
    .update(users)
    .set({
      name: str(f, "name") || u.name,
      gender: str(f, "gender") === "f" ? "f" : "m",
      officialIndex: optNum(f, "officialIndex")?.toString() ?? null,
      startIndex: optNum(f, "startIndex")?.toString() ?? null,
      allowance,
      puttUnit: str(f, "puttUnit") === "ft" ? "ft" : "m",
      sgBaseline: ["tour", "scratch", "hcp10", "hcp20", "hcp30"].includes(str(f, "sgBaseline")) ? str(f, "sgBaseline") : "scratch",
      sharing: str(f, "sharing") === "friends" ? "friends" : "private",
    })
    .where(eq(users.id, u.id));
  const pw = str(f, "newPassword");
  if (pw) {
    if (pw.length < 10) return { error: "Nieuw wachtwoord moet minimaal 10 tekens zijn" };
    await db.update(users).set({ passwordHash: await hashPassword(pw) }).where(eq(users.id, u.id));
  }
  // index/allowance kunnen gewijzigd zijn: handicap en punten van alle rondes herberekenen
  await recalcHandicaps(u.id);
  revalidatePath("/", "layout");
  return { ok: "Opgeslagen" };
}

// ---------- Tas ----------

export async function saveBagClub(f: FormData) {
  const u = await requireUser();
  const id = Number(str(f, "id") || 0);
  const values = {
    userId: u.id,
    type: str(f, "type") || "iron",
    name: str(f, "name") || "Club",
    avgDistance: optNum(f, "avgDistance"),
    sortOrder: Number(str(f, "sortOrder") || 0),
  };
  if (id) await db.update(bagClubs).set(values).where(and(eq(bagClubs.id, id), eq(bagClubs.userId, u.id)));
  else await db.insert(bagClubs).values(values);
  revalidatePath("/more/bag");
}

export async function deleteBagClub(f: FormData) {
  const u = await requireUser();
  await db.delete(bagClubs).where(and(eq(bagClubs.id, Number(str(f, "id"))), eq(bagClubs.userId, u.id)));
  revalidatePath("/more/bag");
}

export async function addDefaultBag() {
  const u = await requireUser();
  const set: [string, string, number][] = [
    ["driver", "Driver", 200],
    ["wood", "3-hout", 180],
    ["hybrid", "Hybride", 165],
    ["iron", "5-ijzer", 150],
    ["iron", "6-ijzer", 140],
    ["iron", "7-ijzer", 130],
    ["iron", "8-ijzer", 120],
    ["iron", "9-ijzer", 110],
    ["wedge", "PW", 100],
    ["wedge", "SW", 75],
    ["putter", "Putter", 0],
  ];
  await db.insert(bagClubs).values(set.map(([type, name, avgDistance], i) => ({ userId: u.id, type, name, avgDistance, sortOrder: i })));
  revalidatePath("/more/bag");
}

// ---------- Banen ----------

/**
 * Rondes loskoppelen vóór het verwijderen van baandata. Nodig omdat Postgres bij meerdere
 * cascade-paden (club → lus → tee én club → ronde) anders op een al verwijderde tee stuit.
 * De ronde houdt haar momentopname (baannaam, par, SI, rating) en blijft dus volledig bruikbaar.
 */
async function detachRounds(where: SQL) {
  await db.update(rounds).set({ clubId: null, loopId: null, combinationId: null, teeId: null }).where(where);
}

async function courseEditor() {
  const u = await requireUser();
  if (!canManageCourses(u)) throw new Error("Geen rechten voor banenbeheer");
  return u;
}

export async function saveClub(_: FormState, f: FormData): Promise<FormState> {
  const u = await courseEditor();
  const id = Number(str(f, "id") || 0);
  const values = { name: str(f, "name"), city: str(f, "city") || null, website: str(f, "website") || null };
  if (!values.name) return { error: "Naam is verplicht" };
  if (id) {
    await db.update(clubs).set(values).where(eq(clubs.id, id));
    revalidatePath(`/more/courses/${id}`);
    return { ok: "Opgeslagen" };
  }
  const [c] = await db.insert(clubs).values({ ...values, createdBy: u.id }).returning();
  redirect(`/more/courses/${c.id}`);
}

export async function deleteClub(f: FormData) {
  const u = await courseEditor();
  if (u.role !== "owner") throw new Error("Alleen de eigenaar kan banen verwijderen");
  const id = Number(str(f, "id"));
  await detachRounds(eq(rounds.clubId, id));
  await db.delete(clubs).where(eq(clubs.id, id));
  redirect("/more/courses");
}

/** Lus met holes (par + SI) opslaan. */
export async function saveLoop(_: FormState, f: FormData): Promise<FormState> {
  await courseEditor();
  const clubId = Number(str(f, "clubId"));
  const id = Number(str(f, "id") || 0);
  const n = Number(str(f, "holesCount") || 9);
  const hs = Array.from({ length: n }, (_, i) => ({ par: Number(str(f, `par${i}`)), si: Number(str(f, `si${i}`)) }));
  const errors = validateCourse(hs);
  if (!str(f, "name")) errors.unshift("Naam is verplicht");
  if (errors.length) return { error: errors.join(". ") };
  await db.transaction(async (tx) => {
    let loopId = id;
    if (id) await tx.update(loops).set({ name: str(f, "name"), holesCount: n }).where(eq(loops.id, id));
    else [{ id: loopId }] = await tx.insert(loops).values({ clubId, name: str(f, "name"), holesCount: n }).returning({ id: loops.id });
    await tx.delete(holes).where(eq(holes.loopId, loopId));
    await tx.insert(holes).values(hs.map((h, i) => ({ loopId, number: i + 1, par: h.par, si: h.si })));
  });
  revalidatePath(`/more/courses/${clubId}`);
  return { ok: "Lus opgeslagen" };
}

export async function deleteLoop(f: FormData) {
  await courseEditor();
  const id = Number(str(f, "id"));
  const combs = await db.select({ id: combinations.id }).from(combinations).where(or(eq(combinations.firstLoopId, id), eq(combinations.secondLoopId, id)));
  await detachRounds(or(eq(rounds.loopId, id), ...combs.map((c) => eq(rounds.combinationId, c.id)))!);
  await db.delete(loops).where(eq(loops.id, id));
  revalidatePath(`/more/courses/${str(f, "clubId")}`);
}

export async function saveCombination(_: FormState, f: FormData): Promise<FormState> {
  await courseEditor();
  const clubId = Number(str(f, "clubId"));
  const id = Number(str(f, "id") || 0);
  const first = Number(str(f, "firstLoopId"));
  const second = Number(str(f, "secondLoopId"));
  const lh1 = await db.select().from(holes).where(eq(holes.loopId, first));
  const lh2 = await db.select().from(holes).where(eq(holes.loopId, second));
  const all = [...lh1.sort((a, b) => a.number - b.number), ...lh2.sort((a, b) => a.number - b.number)];
  const si = all.map((_, i) => Number(str(f, `si${i}`)));
  const errors = validateCourse(all.map((h, i) => ({ par: h.par, si: si[i] })));
  if (!first || !second) errors.unshift("Kies twee lussen");
  if (errors.length) return { error: errors.join(". ") };
  const values = { clubId, name: str(f, "name") || "18 holes", firstLoopId: first, secondLoopId: second, si };
  if (id) await db.update(combinations).set(values).where(eq(combinations.id, id));
  else await db.insert(combinations).values(values);
  revalidatePath(`/more/courses/${clubId}`);
  return { ok: "Combinatie opgeslagen" };
}

export async function deleteCombination(f: FormData) {
  await courseEditor();
  const id = Number(str(f, "id"));
  await detachRounds(eq(rounds.combinationId, id));
  await db.delete(combinations).where(eq(combinations.id, id));
  revalidatePath(`/more/courses/${str(f, "clubId")}`);
}

/** Tee opslaan; met "nieuwe versie" blijft de oude rij bestaan voor oudere rondes. */
export async function saveTee(_: FormState, f: FormData): Promise<FormState> {
  await courseEditor();
  const clubId = Number(str(f, "clubId"));
  const id = Number(str(f, "id") || 0);
  const loopId = Number(str(f, "loopId") || 0) || null;
  const combinationId = Number(str(f, "combinationId") || 0) || null;
  const n = Number(str(f, "holesCount"));
  const lengths = Array.from({ length: n }, (_, i) => Number(str(f, `len${i}`) || 0));
  const par = Number(str(f, "par"));
  const cr = optNum(f, "courseRating");
  const slope = optNum(f, "slope");
  if (slope != null && (slope < 55 || slope > 155)) return { error: "Slope ligt tussen 55 en 155" };
  // par-controle tegen de holes
  const holePars = loopId
    ? (await db.select().from(holes).where(eq(holes.loopId, loopId))).map((h) => h.par)
    : await (async () => {
        const [c] = await db.select().from(combinations).where(eq(combinations.id, combinationId!));
        const a = await db.select().from(holes).where(eq(holes.loopId, c.firstLoopId));
        const b = await db.select().from(holes).where(eq(holes.loopId, c.secondLoopId));
        return [...a, ...b].map((h) => h.par);
      })();
  const parSum = holePars.reduce((a, b) => a + b, 0);
  if (par !== parSum) return { error: `Par (${par}) klopt niet met de holes (${parSum})` };
  const values = {
    loopId,
    combinationId,
    name: str(f, "name") || "Tee",
    gender: str(f, "gender") === "f" ? "f" : "m",
    courseRating: cr != null ? String(cr) : null,
    slope,
    par,
    lengths,
    validFrom: str(f, "validFrom") || "2000-01-01",
  };
  if (id && str(f, "newVersion") !== "on") await db.update(tees).set(values).where(eq(tees.id, id));
  else await db.insert(tees).values(values);
  await recalcAllHandicaps();
  revalidatePath("/", "layout");
  return { ok: `Tee opgeslagen (totale lengte ${lengths.reduce((a, b) => a + b, 0)} m)` };
}

export async function deleteTee(f: FormData) {
  await courseEditor();
  await db.delete(tees).where(eq(tees.id, Number(str(f, "id"))));
  await recalcAllHandicaps();
  revalidatePath("/", "layout");
}

// ---------- Rondes ----------

export async function deleteRound(f: FormData) {
  const u = await requireUser();
  await db.delete(rounds).where(and(eq(rounds.id, Number(str(f, "id"))), eq(rounds.userId, u.id)));
  await recalcHandicaps(u.id);
  revalidatePath("/", "layout");
  redirect("/rounds");
}

export async function setRoundVisibility(f: FormData) {
  const u = await requireUser();
  const v = ["default", "private", "shared"].includes(str(f, "visibility")) ? str(f, "visibility") : "default";
  await db.update(rounds).set({ visibility: v }).where(and(eq(rounds.id, Number(str(f, "id"))), eq(rounds.userId, u.id)));
  revalidatePath(`/rounds/${str(f, "id")}`);
}
