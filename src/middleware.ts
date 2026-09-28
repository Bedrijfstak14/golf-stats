import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/login", "/setup", "/invite", "/manifest.webmanifest", "/sw.js", "/icon.svg", "/icons", "/api/auth", "/offline"];

/** Snelle check op het sessiecookie; de echte controle gebeurt server-side per pagina/route. */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  if (req.cookies.get("gs_session")) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
