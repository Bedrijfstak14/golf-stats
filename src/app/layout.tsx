import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth";
import NavShell from "@/components/NavShell";
import SwRegister from "@/components/SwRegister";

export const metadata: Metadata = {
  title: "Golf Stats",
  description: "Je golfrondes, statistieken en handicapverloop",
  appleWebApp: { capable: true, title: "Golf Stats", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: { url: "/icons/apple-touch-icon.png", sizes: "180x180" },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f3ee" },
    { media: "(prefers-color-scheme: dark)", color: "#111411" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="nl">
      <body>
        {user ? (
          <NavShell name={user.name} role={user.role}>
            {children}
          </NavShell>
        ) : (
          children
        )}
        <SwRegister />
      </body>
    </html>
  );
}
