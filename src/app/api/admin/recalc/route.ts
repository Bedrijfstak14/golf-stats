import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { recalcAllHandicaps, recalcHandicaps } from "@/lib/rounds";
import { limiter, LIMITS } from "@/lib/rateLimit";

export const runtime = "nodejs";

/** Alleen deze interne paden als terugkeeradres (geen open redirect) */
const RETURN_TO = new Set(["/more/settings", "/stats?tab=handicap"]);

/**
 * Handicap en punten opnieuw berekenen (bijv. na correcties in de database).
 * De eigenaar rekent alle spelers door, een andere speler alleen zichzelf.
 */
export async function POST(req: Request) {
  const base = new URL(process.env.APP_URL || req.url);
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", base), 303);
  if (user.role === "viewer") return NextResponse.json({ error: "Geen rechten" }, { status: 403 });
  const form = req.headers.get("content-type")?.includes("form") ? await req.formData().catch(() => null) : null;
  const back = String(form?.get("back") ?? "");
  const to = new URL(RETURN_TO.has(back) ? back : "/more/settings", base);
  const r = limiter.hit(`recalc:${user.id}`, LIMITS.recalc);
  if (!r.ok) {
    if (!form) return NextResponse.json({ error: "Te veel verzoeken", retryAfter: r.retryAfter }, { status: 429, headers: { "Retry-After": String(r.retryAfter) } });
    to.searchParams.set("recalc", "wait");
    return NextResponse.redirect(to, 303);
  }
  if (user.role === "owner") await recalcAllHandicaps();
  else await recalcHandicaps(user.id);
  revalidatePath("/", "layout");
  if (req.headers.get("accept")?.includes("application/json")) return NextResponse.json({ ok: true });
  to.searchParams.set("recalc", "1");
  return NextResponse.redirect(to, 303);
}
