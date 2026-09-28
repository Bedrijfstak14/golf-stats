import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createImport } from "@/lib/imports";

export const runtime = "nodejs";

/** PWA share target: gedeelde screenshot → import → nakijkscherm opent meteen. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  const base = new URL(req.url);
  if (!user) return NextResponse.redirect(new URL("/login", base), 303);
  try {
    const form = await req.formData();
    const files = [...form.getAll("images"), ...form.getAll("file"), ...form.getAll("files")] as File[];
    const id = await createImport(user, files);
    return NextResponse.redirect(new URL(`/add/review/${id}`, base), 303);
  } catch (e) {
    const msg = encodeURIComponent(e instanceof Error ? e.message : "Upload mislukt");
    return NextResponse.redirect(new URL(`/add?error=${msg}`, base), 303);
  }
}
