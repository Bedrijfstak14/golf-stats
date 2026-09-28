import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser, canWrite } from "@/lib/auth";
import { csvToDrafts, parseCsv } from "@/lib/csv";
import { saveRound } from "@/lib/rounds";

export const runtime = "nodejs";

/** Historische rondes uit CSV; formulier-post vanuit Instellingen. */
export async function POST(req: Request) {
  const base = new URL(req.url);
  const back = (q: string) => NextResponse.redirect(new URL(`/more/settings?${q}#csv`, base), 303);
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", base), 303);
  if (!canWrite(user)) return back("error=Alleen+lezen");
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return back("error=Geen+bestand");
    const drafts = csvToDrafts(parseCsv(await file.text())).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date) && d.holes.length);
    for (const d of drafts) await saveRound(user, d, { courseAction: "none" });
    revalidatePath("/", "layout");
    return back(`imported=${drafts.length}`);
  } catch (e) {
    return back(`error=${encodeURIComponent(e instanceof Error ? e.message : "Import mislukt")}`);
  }
}
