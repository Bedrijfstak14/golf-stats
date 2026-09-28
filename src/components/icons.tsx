/** Lijn-iconen (24×24, stroke 2), gedeeld door onderbalk, app-balk, menu en toevoeg-sheet. */
export const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

export const icons = {
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "M6 6l12 12M18 6L6 18",
  home: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  rounds: "M4 5h16M4 12h16M4 19h10",
  plus: "M12 5v14M5 12h14",
  stats: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  handicap: "M3 17l6-6 4 4 8-8M15 7h6v6",
  courses: "M5 21V4M5 4h11l-2 4 2 4H5",
  bag: "M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3M6 7h12l-1 14H7zM10 11v6M14 11v6",
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  settings: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
  import: "M12 3v12M7 10l5 5 5-5M5 21h14",
  export: "M12 15V3M7 8l5-5 5 5M5 21h14",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  camera:
    "M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  image:
    "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21",
  pencil: "M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z",
  file: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h8",
  chevron: "M9 6l6 6-6 6",
} as const;

/** Welk navigatie-item hoort bij de huidige route. */
export type NavKey = "home" | "rounds" | "stats" | "handicap" | "courses" | "bag" | "users" | "settings" | null;

export function navKey(path: string, tab: string | null): NavKey {
  if (path === "/") return "home";
  if (path.startsWith("/rounds")) return "rounds";
  if (path.startsWith("/stats")) return tab === "handicap" ? "handicap" : "stats";
  if (path.startsWith("/more/courses")) return "courses";
  if (path.startsWith("/more/bag")) return "bag";
  if (path.startsWith("/more/users")) return "users";
  if (path.startsWith("/more/settings")) return "settings";
  return null;
}
