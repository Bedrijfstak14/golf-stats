import type { Fairway, RoundDraft, Source } from "./types";

/** Vast JSON-formaat dat de AI teruggeeft (zie GEMINI_SCHEMA in lib/gemini.ts). */
export interface AiCard {
  imageKind?: "screenshot" | "photo" | null;
  date: string | null;
  courseName: string | null;
  loopName: string | null;
  teeName: string | null;
  teeGender: "m" | "f" | null;
  holesCount: number | null;
  format: "stableford" | "stroke" | null;
  holes: { hole: number; par: number | null; si: number | null; length: number | null }[];
  courseTotals?: { par: number | null; length: number | null } | null;
  players: {
    name: string | null;
    playingHandicap: number | null;
    handicapIndex: number | null;
    scores: {
      hole: number;
      strokes: number | null;
      points: number | null;
      putts: number | null;
      fairway: Fairway | null;
      fairwayIcon?: "none" | "circle" | "arrow_straight" | "arrow_curved" | null;
      gir: boolean | null;
      penalties: number | null;
      bunker: number | null;
    }[];
    totals?: {
      strokes: number | null;
      points: number | null;
      putts: number | null;
      fairwayPct: number | null;
      girPct: number | null;
      penalties: number | null;
      bunker: number | null;
    } | null;
  }[];
  /** Onzekere velden: "date", "course", "hole:4:putts", "total:points" … */
  lowConfidence?: string[] | null;
}

const FAIRWAYS: Fairway[] = ["hit", "left", "right", "short", "long", "na"];

/**
 * Hole19-fairway-iconen (vastgesteld op 21 echte kaarten): rondje = raak, rechte pijl = rechts,
 * gebogen pijl = links. De AI leest de richting van een pijl op gedraaide screenshots niet
 * betrouwbaar (rechts komt terug als omlaag of links), de vorm wel; daarom vertalen we hier de vorm.
 */
const ICON_TO_FAIRWAY: Record<string, Fairway | null> = {
  none: null,
  circle: "hit",
  arrow_straight: "right",
  arrow_curved: "left",
};

/** Zet de AI-uitvoer om naar een conceptronde voor één speler. */
export function aiCardToDraft(card: AiCard, playerIndex = 0, source: Source = "ai_screenshot"): RoundDraft {
  const player = card.players[playerIndex] ?? card.players[0];
  const holeNumbers = [...new Set([...card.holes.map((h) => h.hole), ...(player?.scores ?? []).map((s) => s.hole)])]
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 18)
    .sort((a, b) => a - b);
  const holesCount = card.holesCount === 18 || holeNumbers.length > 9 ? 18 : 9;

  // Hole-nummering binnen de ronde: 1..n (een lus die als 10–18 gespeeld is wordt 1–9)
  const holes = holeNumbers.map((n, i) => {
    const c = card.holes.find((h) => h.hole === n);
    const s = player?.scores.find((x) => x.hole === n);
    const valid = (x: number | null | undefined, lo: number, hi: number) => (x != null && Number.isInteger(x) && x >= lo && x <= hi ? x : null);
    const par = valid(c?.par, 3, 6) ?? 4;
    let fairway: Fairway | null =
      s?.fairwayIcon && s.fairwayIcon in ICON_TO_FAIRWAY
        ? ICON_TO_FAIRWAY[s.fairwayIcon]
        : s?.fairway && FAIRWAYS.includes(s.fairway)
          ? s.fairway
          : null;
    if (par === 3) fairway = "na";
    // Hole19 toont 0 putts als putts niet zijn bijgehouden; dan is ook GIR onbekend
    const putts = s?.putts === 0 && (s?.strokes ?? 0) > 0 ? null : (s?.putts ?? null);
    const gir = putts == null && s?.gir !== true ? null : (s?.gir ?? null);
    return {
      number: i + 1,
      par,
      si: valid(c?.si, 1, 18) ?? 0,
      length: valid(c?.length, 30, 700),
      strokes: s?.strokes ?? null,
      points: s?.points ?? null,
      putts,
      fairway,
      gir,
      penalties: s?.penalties ?? 0,
      bunker: s?.bunker ?? 0,
    };
  });
  const indexOf = (hole: number) => holeNumbers.indexOf(hole);

  const lowConfidence: string[] = [];
  for (const f of card.lowConfidence ?? []) {
    const m = f.match(/^hole:(\d+):(\w+)$/);
    if (m) {
      const i = indexOf(Number(m[1]));
      if (i >= 0) lowConfidence.push(`holes.${i}.${m[2]}`);
    } else if (f.startsWith("total:")) lowConfidence.push(`totals.${f.slice(6)}`);
    else if (f === "course") lowConfidence.push("clubName");
    else lowConfidence.push(f);
  }

  const t = player?.totals;
  return {
    date: card.date ?? new Date().toISOString().slice(0, 10),
    clubName: card.courseName ?? "",
    loopName: card.loopName ?? "",
    teeName: card.teeName ?? "",
    teeGender: card.teeGender ?? "m",
    holesCount,
    format: card.format ?? "stableford",
    handicapIndex: player?.handicapIndex ?? null,
    playingHandicap: player?.playingHandicap ?? null,
    source,
    holes,
    totals: {
      strokes: t?.strokes ?? null,
      points: t?.points ?? null,
      putts: t?.putts ?? null,
      par: card.courseTotals?.par ?? null,
      length: card.courseTotals?.length ?? null,
      fairwayPct: t?.fairwayPct ?? null,
      girPct: t?.girPct ?? null,
      penalties: t?.penalties ?? null,
      bunker: t?.bunker ?? null,
    },
    lowConfidence,
    qualifying: true,
    pcc: 0,
  };
}

/** Kies de speler die het best bij de gebruikersnaam past. */
export function guessPlayer(card: AiCard, userName: string): number {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const u = norm(userName);
  const first = norm(userName.split(" ")[0] ?? "");
  const i = card.players.findIndex((p) => {
    const n = norm(p.name ?? "");
    return n && (n === u || n.includes(first) || u.includes(n));
  });
  return i >= 0 ? i : 0;
}
