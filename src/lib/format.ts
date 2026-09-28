export const fmtDate = (d: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) =>
  new Date(d + "T12:00:00").toLocaleDateString("nl-NL", opts);

export const fmtNum = (x: number | null | undefined, digits = 1) =>
  x == null ? "–" : x.toLocaleString("nl-NL", { maximumFractionDigits: digits, minimumFractionDigits: 0 });

export const fmtIndex = (x: number | null | undefined) =>
  x == null ? "–" : x < 0 ? "+" + Math.abs(x).toLocaleString("nl-NL", { minimumFractionDigits: 1 }) : x.toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const fmtPct = (x: number | null | undefined) => (x == null ? "–" : `${Math.round(x)}%`);

export const fmtToPar = (x: number) => (x === 0 ? "E" : x > 0 ? `+${x}` : `−${Math.abs(x)}`);

export const today = () => new Date().toISOString().slice(0, 10);

export const SOURCE_LABELS: Record<string, string> = {
  ai_screenshot: "AI-screenshot",
  ai_photo: "AI-foto",
  manual: "Handmatig",
  csv: "CSV-import",
};
