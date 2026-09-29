import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users, type User } from "@/db/schema";
import { RateLimitError } from "@/lib/rateLimit";

export const SESSION_COOKIE = "gs_session";
const SESSION_DAYS = 60;

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export async function createSession(userId: number) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt });
  const jar = await cookies();
  // Secure alleen via HTTPS (Cloudflare tunnel zet X-Forwarded-Proto), zodat ook http op het LAN werkt
  const proto = (await headers()).get("x-forwarded-proto")?.split(",")[0].trim();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: proto === "https",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
  jar.delete(SESSION_COOKIE);
}

export const getCurrentUser = cache(async (): Promise<User | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return rows[0]?.user ?? null;
});

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireOwner(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "owner") redirect("/");
  return user;
}

/** Mag deze gebruiker rondes invoeren? Flightgenoten (viewer) alleen lezen. */
export const canWrite = (u: User) => u.role === "owner" || u.role === "player";
/** Banen beheren: eigenaar; spelers mogen aanmaken (later: voorstellen ter keuring). */
export const canManageCourses = (u: User) => u.role === "owner" || u.role === "player";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Voor API-routes: gooit 401 in plaats van redirect */
export async function apiUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "Niet ingelogd");
  return user;
}

export function apiError(e: unknown) {
  if (e instanceof RateLimitError)
    return Response.json({ error: e.message, retryAfter: e.retryAfter }, { status: 429, headers: { "Retry-After": String(e.retryAfter) } });
  if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
  console.error(e);
  return Response.json({ error: e instanceof Error ? e.message : "Onbekende fout" }, { status: 500 });
}
