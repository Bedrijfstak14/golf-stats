export type Fairway = "hit" | "left" | "right" | "short" | "long" | "na";
export type Lie = "tee" | "fairway" | "rough" | "bunker" | "recovery" | "green" | "penalty";
export type Format = "stableford" | "stroke";
export type Source = "ai_screenshot" | "ai_photo" | "manual" | "csv";

export const FAIRWAY_LABELS: Record<Fairway, string> = {
  hit: "Raak",
  left: "Links",
  right: "Rechts",
  short: "Kort",
  long: "Lang",
  na: "n.v.t.",
};

export const LIE_LABELS: Record<Lie, string> = {
  tee: "Tee",
  fairway: "Fairway",
  rough: "Rough",
  bunker: "Bunker",
  recovery: "Recovery",
  green: "Green",
  penalty: "Strafgebied",
};

export interface DraftShot {
  club?: string | null;
  bagClubId?: number | null;
  lie: Lie;
  /** meters tot de vlag */
  distance: number;
  penalty?: boolean;
}

export interface DraftHole {
  number: number;
  par: number;
  si: number;
  length?: number | null;
  strokes: number | null;
  points?: number | null;
  putts?: number | null;
  fairway?: Fairway | null;
  gir?: boolean | null;
  penalties?: number | null;
  bunker?: number | null;
  shots?: DraftShot[];
}

/** De TOT-kolom zoals op de kaart gelezen */
export interface CardTotals {
  strokes?: number | null;
  points?: number | null;
  putts?: number | null;
  par?: number | null;
  length?: number | null;
  fairwayPct?: number | null;
  girPct?: number | null;
  penalties?: number | null;
  bunker?: number | null;
}

/** Eén conceptronde; zowel AI-import als handmatige invoer gebruiken dit formaat. */
export interface RoundDraft {
  date: string;
  clubName: string;
  loopName: string;
  teeName: string;
  teeGender: "m" | "f";
  holesCount: number;
  format: Format;
  handicapIndex: number | null;
  courseHandicap?: number | null;
  playingHandicap: number | null;
  courseRating?: number | null;
  slope?: number | null;
  pcc?: number;
  qualifying?: boolean;
  clubId?: number | null;
  loopId?: number | null;
  combinationId?: number | null;
  teeId?: number | null;
  source: Source;
  holes: DraftHole[];
  totals?: CardTotals;
  /** Paden van velden die de AI niet zeker kon lezen, bijv. "holes.3.putts" of "date" */
  lowConfidence?: string[];
  notes?: string | null;
}

/** Baandata zoals opgeslagen, voor vergelijking met de kaart */
export interface CourseHoleRef {
  number: number;
  par: number;
  si: number;
  length?: number | null;
}
