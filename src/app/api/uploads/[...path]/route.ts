import { readFile } from "node:fs/promises";
import path from "node:path";
import { apiError, apiUser, HttpError } from "@/lib/auth";
import { mimeFor, UPLOAD_DIR } from "@/lib/imports";
import { enforce } from "@/lib/rateLimit";

export const runtime = "nodejs";

/** Originele scorekaart-afbeelding; alleen voor de eigenaar ervan (of de eigenaar/admin). */
export async function GET(_: Request, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const user = await apiUser();
    enforce("read", user.id);
    const parts = (await params).path;
    const rel = parts.join("/");
    const full = path.resolve(UPLOAD_DIR, rel);
    if (!full.startsWith(UPLOAD_DIR + path.sep)) throw new HttpError(400, "Ongeldig pad");
    if (parts[0] !== `u${user.id}` && user.role !== "owner") throw new HttpError(403, "Geen toegang");
    const data = await readFile(full).catch(() => {
      throw new HttpError(404, "Niet gevonden");
    });
    return new Response(new Uint8Array(data), {
      headers: { "content-type": mimeFor(full), "cache-control": "private, max-age=31536000, immutable" },
    });
  } catch (e) {
    return apiError(e);
  }
}
