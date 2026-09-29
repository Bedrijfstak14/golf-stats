import { revalidatePath } from "next/cache";
import { apiError, apiUser, HttpError } from "@/lib/auth";
import { saveShots } from "@/lib/rounds";
import type { DraftShot, Lie } from "@/lib/golf/types";
import { enforce } from "@/lib/rateLimit";

export const runtime = "nodejs";

const LIES: Lie[] = ["tee", "fairway", "rough", "bunker", "recovery", "green", "penalty"];

/** Slagenreeks van één hole opslaan: { hole, shots: [{ lie, distance, penalty, bagClubId }] } */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await apiUser();
    enforce("write", user.id);
    const id = Number((await params).id);
    const body = (await req.json()) as { hole: number; shots: DraftShot[] };
    for (const s of body.shots ?? []) {
      if (!LIES.includes(s.lie)) throw new HttpError(400, `Onbekende ligging: ${s.lie}`);
      if (!(s.distance >= 0 && s.distance < 1000)) throw new HttpError(400, "Afstand ongeldig");
    }
    await saveShots(user, id, body.hole, body.shots ?? []);
    revalidatePath(`/rounds/${id}`);
    revalidatePath("/stats");
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
