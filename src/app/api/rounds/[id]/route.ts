import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { rounds } from "@/db/schema";
import { apiError, apiUser, HttpError } from "@/lib/auth";
import { recalcHandicaps, saveRound, type CourseAction } from "@/lib/rounds";
import { runChecks } from "@/lib/golf/checks";
import type { RoundDraft } from "@/lib/golf/types";

export const runtime = "nodejs";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await apiUser();
    const id = Number((await params).id);
    const body = (await req.json()) as { draft: RoundDraft; courseAction?: CourseAction };
    const hard = runChecks({ ...body.draft, totals: undefined, lowConfidence: [] }).filter((i) => i.code === "plausibility");
    if (hard.length) throw new HttpError(422, hard.map((i) => i.message).join("; "));
    await saveRound(user, body.draft, { roundId: id, courseAction: body.courseAction ?? "none" });
    revalidatePath("/", "layout");
    return Response.json({ id });
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await apiUser();
    const id = Number((await params).id);
    await db.delete(rounds).where(and(eq(rounds.id, id), eq(rounds.userId, user.id)));
    await recalcHandicaps(user.id);
    revalidatePath("/", "layout");
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
