import { apiError, apiUser } from "@/lib/auth";
import { processImport } from "@/lib/imports";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Start (of herhaal met ?force=1) de AI-uitlezing van een import. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await apiUser();
    const { id } = await params;
    const force = new URL(req.url).searchParams.get("force") === "1";
    const row = await processImport(user, Number(id), force);
    return Response.json({ id: row.id, status: row.status, error: row.error });
  } catch (e) {
    return apiError(e);
  }
}
