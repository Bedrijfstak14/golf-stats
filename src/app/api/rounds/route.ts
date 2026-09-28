import { revalidatePath } from "next/cache";
import { apiError, apiUser, canWrite, HttpError } from "@/lib/auth";
import { saveRound, type CourseAction } from "@/lib/rounds";
import { runChecks } from "@/lib/golf/checks";
import type { RoundDraft } from "@/lib/golf/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const user = await apiUser();
    if (!canWrite(user)) throw new HttpError(403, "Alleen lezen");
    const body = (await req.json()) as { draft: RoundDraft; importId?: number; courseAction?: CourseAction };
    const d = body.draft;
    if (!d?.date || !Array.isArray(d.holes) || !d.holes.length) throw new HttpError(400, "Onvolledige ronde");
    if (d.holes.length !== d.holesCount) throw new HttpError(400, `Aantal holes (${d.holes.length}) klopt niet met ${d.holesCount}`);
    // Controles lopen ook op de server; rode afwijkingen in de score zelf blokkeren opslaan niet
    // (de speler heeft ze gezien), maar onmogelijke combinaties wel.
    const hard = runChecks({ ...d, totals: undefined, lowConfidence: [] }).filter((i) => i.code === "plausibility");
    if (hard.length) throw new HttpError(422, hard.map((i) => i.message).join("; "));
    const id = await saveRound(user, d, { importId: body.importId, courseAction: body.courseAction ?? "none" });
    revalidatePath("/", "layout");
    return Response.json({ id });
  } catch (e) {
    return apiError(e);
  }
}
