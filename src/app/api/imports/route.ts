import { apiError, apiUser, canWrite, HttpError } from "@/lib/auth";
import { createImport } from "@/lib/imports";
import { enforce } from "@/lib/rateLimit";

export const runtime = "nodejs";

/** Upload van één of meer afbeeldingen voor één ronde. */
export async function POST(req: Request) {
  try {
    const user = await apiUser();
    enforce("upload", user.id);
    if (!canWrite(user)) throw new HttpError(403, "Alleen lezen");
    const form = await req.formData();
    const id = await createImport(user, form.getAll("images") as File[]);
    return Response.json({ id });
  } catch (e) {
    return apiError(e);
  }
}
