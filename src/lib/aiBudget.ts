import "server-only";
import { and, count, eq, gt, sql, sum, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { aiCalls } from "@/db/schema";
import { HttpError } from "@/lib/auth";

/**
 * Harde limieten op Gemini-aanroepen, zodat de API-kosten begrensd blijven.
 * Elke aanroep wordt vóóraf in `ai_calls` gereserveerd (onder een advisory lock, dus ook bij
 * gelijktijdige uploads niet over de limiet) en telt mee, ook als hij mislukt.
 * Vensters zijn glijdend: de afgelopen 24 uur en de afgelopen 30 dagen.
 */
const envInt = (name: string, fallback: number) => {
  const raw = process.env[name];
  const v = raw == null || raw === "" ? NaN : Number(raw);
  return Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback;
};

export function aiLimits() {
  return {
    /** Alle spelers samen, afgelopen 24 uur */
    perDay: envInt("GEMINI_MAX_PER_DAY", 60),
    /** Alle spelers samen, afgelopen 30 dagen */
    perMonth: envInt("GEMINI_MAX_PER_MONTH", 600),
    /** Per speler, afgelopen 24 uur */
    perUserDay: envInt("GEMINI_MAX_PER_USER_DAY", 30),
    /** Per import (eerste poging + herkansing + opnieuw uitlezen) */
    perImport: envInt("GEMINI_MAX_PER_IMPORT", 6),
  };
}

const DAY_MS = 86_400_000;
const LOCK_ID = 7_190_019; // vast getal voor pg_advisory_xact_lock

type Db = Pick<typeof db, "select">;

async function aiUsage(q: Db, userId?: number, importId?: number) {
  const day = new Date(Date.now() - DAY_MS);
  const month = new Date(Date.now() - 30 * DAY_MS);
  const n = async (...conds: SQL[]) => (await q.select({ n: count() }).from(aiCalls).where(and(...conds)))[0].n;
  const [dayAll, monthAll, userDay, perImport] = await Promise.all([
    n(gt(aiCalls.createdAt, day)),
    n(gt(aiCalls.createdAt, month)),
    userId != null ? n(eq(aiCalls.userId, userId), gt(aiCalls.createdAt, day)) : 0,
    importId != null ? n(eq(aiCalls.importId, importId)) : 0,
  ]);
  return { dayAll, monthAll, userDay, perImport };
}

/** Eerste limiet die bereikt is, als melding; null als er nog ruimte is. */
function exceeded(u: Awaited<ReturnType<typeof aiUsage>>): string | null {
  const l = aiLimits();
  if (u.monthAll >= l.perMonth) return `Het maandbudget voor AI-uitlezingen is op (${l.perMonth} in 30 dagen). Voer de ronde handmatig in.`;
  if (u.dayAll >= l.perDay) return `Het dagbudget voor AI-uitlezingen is op (${l.perDay} per 24 uur). Probeer het morgen opnieuw of voer de ronde handmatig in.`;
  if (u.userDay >= l.perUserDay) return `Je hebt je ${l.perUserDay} AI-uitlezingen van de afgelopen 24 uur gebruikt. Probeer het morgen opnieuw of voer de ronde handmatig in.`;
  if (u.perImport >= l.perImport) return `Deze afbeelding is al ${u.perImport} keer uitgelezen. Pas de ronde verder handmatig aan.`;
  return null;
}

/** Controle vooraf (telt niet mee): gooit 429 als er geen ruimte meer is. */
export async function assertAiBudget(userId: number, importId: number) {
  const msg = exceeded(await aiUsage(db, userId, importId));
  if (msg) throw new HttpError(429, msg);
}

/** Reserveert één aanroep; gooit 429 als een limiet bereikt is. Geeft het id om af te ronden. */
export async function reserveAiCall(userId: number, importId: number, model: string): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${LOCK_ID})`);
    const msg = exceeded(await aiUsage(tx, userId, importId));
    if (msg) throw new HttpError(429, msg);
    const [row] = await tx.insert(aiCalls).values({ userId, importId, model }).returning({ id: aiCalls.id });
    return row.id;
  });
}

export async function finishAiCall(id: number, ok: boolean, usage?: { promptTokens?: number; outputTokens?: number }) {
  await db
    .update(aiCalls)
    .set({ ok, promptTokens: usage?.promptTokens ?? null, outputTokens: usage?.outputTokens ?? null })
    .where(eq(aiCalls.id, id));
}

/** Overzicht voor Instellingen: gebruik tegenover de limieten, plus tokens van de afgelopen 30 dagen. */
export async function aiUsageSummary() {
  const u = await aiUsage(db);
  const [tok] = await db
    .select({ prompt: sum(aiCalls.promptTokens), output: sum(aiCalls.outputTokens) })
    .from(aiCalls)
    .where(gt(aiCalls.createdAt, new Date(Date.now() - 30 * DAY_MS)));
  return { dayAll: u.dayAll, monthAll: u.monthAll, limits: aiLimits(), promptTokens: Number(tok.prompt ?? 0), outputTokens: Number(tok.output ?? 0) };
}
