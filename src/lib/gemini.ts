import "server-only";
import type { AiCard } from "@/lib/golf/aiDraft";

/** Vast JSON-schema voor de uitlezing (Gemini responseSchema, OpenAPI-subset). */
const n = (type: "INTEGER" | "NUMBER" | "STRING" | "BOOLEAN", extra: object = {}) => ({ type, nullable: true, ...extra });

export const GEMINI_SCHEMA = {
  type: "OBJECT",
  properties: {
    imageKind: { type: "STRING", enum: ["screenshot", "photo"] },
    date: n("STRING", { description: "Datum van de ronde als YYYY-MM-DD" }),
    courseName: n("STRING", { description: "Naam van de golfclub/baan" }),
    loopName: n("STRING", { description: "Naam van de lus, bijv. Oost; bij 18 holes bijv. 'Oost + West'" }),
    teeName: n("STRING", { description: "Teekleur, bijv. Blauw, Geel, Rood" }),
    teeGender: n("STRING", { enum: ["m", "f"] }),
    holesCount: n("INTEGER"),
    format: n("STRING", { enum: ["stableford", "stroke"] }),
    qualifying: n("BOOLEAN", { description: "true als de kaart een HCP-badge (qualifying ronde) toont" }),
    holes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { hole: { type: "INTEGER" }, par: n("INTEGER"), si: n("INTEGER"), length: n("INTEGER") },
        required: ["hole"],
      },
    },
    courseTotals: { type: "OBJECT", nullable: true, properties: { par: n("INTEGER"), length: n("INTEGER") } },
    players: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: n("STRING"),
          playingHandicap: n("INTEGER"),
          handicapIndex: n("NUMBER"),
          scores: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                hole: { type: "INTEGER" },
                strokes: n("INTEGER"),
                points: n("INTEGER"),
                putts: n("INTEGER"),
                fairway: n("STRING", { enum: ["hit", "left", "right", "short", "long", "na"] }),
                fairwayIcon: n("STRING", {
                  enum: ["none", "circle", "arrow_straight", "arrow_curved"],
                  description: "Vorm van het fairway-icoon: rondje, rechte pijl, gebogen pijl of leeg",
                }),
                gir: n("BOOLEAN"),
                penalties: n("INTEGER"),
                bunker: n("INTEGER"),
              },
              required: ["hole"],
            },
          },
          totals: {
            type: "OBJECT",
            nullable: true,
            properties: {
              strokes: n("INTEGER"),
              points: n("INTEGER"),
              putts: n("INTEGER"),
              fairwayPct: n("NUMBER"),
              girPct: n("NUMBER"),
              penalties: n("INTEGER"),
              bunker: n("INTEGER"),
            },
          },
        },
        required: ["scores"],
      },
    },
    lowConfidence: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["holes", "players"],
};

const PROMPT = `Je leest een golfscorekaart uit. Dit is een screenshot uit de app Hole19 of een foto van een papieren scorekaart.
Geef ALLEEN wat je werkelijk ziet; verzin niets. Onleesbare of ontbrekende velden: null, en zet ze in lowConfidence.

Algemeen:
- De afbeelding is vaak 90° gedraaid (liggende scorekaart als staande screenshot). Lees hem in de juiste stand.
- date als YYYY-MM-DD, met het jaartal zoals het er staat (bijv. "27 JUL 2026" → 2026-07-27).
  Nederlandse maandnamen: jan, feb, mrt, apr, mei, jun, jul, aug, sep, okt, nov, dec.
- holesCount = het aantal holekolommen op de kaart (9 of 18), NIET het getal bij "N HOLES" (dat is het aantal gespeelde holes).
- Geef voor ELKE holekolom een item in holes en in scores, ook als de hole niet gespeeld is.

Hole19-kaart:
- Titel "Golfbaan X (Lus)" → courseName = "Golfbaan X", loopName = de naam tussen haakjes (bijv. "Oost").
  Een toevoeging "(9)" of "(18)" is geen lusnaam; staat er ook een lusnaam tussen haakjes, gebruik die.
- De rij met de teekleur (bijv. "Blauw (h)") bevat de lengtes per hole in meters. teeName = kleur zonder haakjes;
  teeGender "f" bij (d) of (v), anders "m".
- "S. Index" = stroke index per hole.
- Onder de titel staan badges: "HCP" betekent een qualifying ronde (qualifying = true); ontbreekt de HCP-badge
  (alleen bijv. "STBFORD" of "NO STATS"), dan qualifying = false.
- Onder de spelersnaam staat "P.HCP <getal>" = playingHandicap.
- In de scorerij staat per hole de score groot en de stablefordpunten klein erboven (superscript) → strokes en points.
  Een streepje "-" betekent: hole niet gespeeld → strokes, points, putts null.
- Putten: het getal per hole (0 betekent vaak "niet bijgehouden"; geef gewoon 0).
- Fairways: vul fairwayIcon met alleen de VORM van het icoon in de cirkel, de richting doet er niet toe:
  "circle" (rondje met een stip/kleiner rondje), "arrow_straight" (een rechte pijl, in welke richting dan ook),
  "arrow_curved" (een gebogen of omkerende pijl), of "none" (leeg). Laat fairway dan null.
  Bij par 3 is er geen icoon: "none".
- GIR: een vinkje = true, leeg = false.
- Strafslagen en Bunkerslagen: het getal per hole.
- TOT-kolom → totals (slagen, punten = het kleine superscript bij het totaal, putts, fairway% en GIR% als getal, strafslagen, bunkerslagen)
  en courseTotals (par en lengte).

Papieren kaart:
- Vul fairway direct in (hit/left/right/short/long) als dat is aangegeven, en laat fairwayIcon null.

- lowConfidence: lijst van onzekere velden in de vorm "date", "course", "hole:<nummer>:<veld>" of "total:<veld>".
- Meerdere afbeeldingen horen bij dezelfde ronde (bijv. hole 1–9 en 10–18); voeg ze samen.`;

export interface GeminiImage {
  mimeType: string;
  base64: string;
}

export class GeminiError extends Error {}

/**
 * @param feedback optioneel: problemen uit de controles van een eerdere poging, plus die uitvoer,
 *                 zodat de AI gericht opnieuw kan kijken.
 */
export async function readScorecard(
  images: GeminiImage[],
  feedback?: { problems: string[]; previous: unknown },
): Promise<{ card: AiCard; raw: unknown }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiError("GEMINI_API_KEY ontbreekt op de server");
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: PROMPT }, ...images.map((i) => ({ inline_data: { mime_type: i.mimeType, data: i.base64 } }))],
        },
        ...(feedback
          ? [
              { role: "model", parts: [{ text: JSON.stringify(feedback.previous) }] },
              {
                role: "user",
                parts: [
                  {
                    text:
                      "De controles op je uitlezing vonden deze problemen:\n- " +
                      feedback.problems.join("\n- ") +
                      "\nKijk opnieuw heel precies naar de afbeelding, per hole en per rij, en geef de volledige gecorrigeerde JSON. " +
                      "Verander alleen wat je echt anders ziet; als de kaart zelf zo is, laat het staan.",
                  },
                ],
              },
            ]
          : []),
      ],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: GEMINI_SCHEMA,
      },
    }),
    signal: AbortSignal.timeout(90_000),
  });
  const raw = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (raw as { error?: { message?: string } })?.error?.message ?? res.statusText;
    throw new GeminiError(`Gemini API-fout (${res.status}): ${msg}`);
  }
  const text: string | undefined = (raw as { candidates?: { content?: { parts?: { text?: string }[] } }[] })?.candidates?.[0]
    ?.content?.parts?.map((p) => p.text ?? "")
    .join("");
  if (!text) throw new GeminiError("Lege uitvoer van Gemini");
  let card: AiCard;
  try {
    card = JSON.parse(text);
  } catch {
    throw new GeminiError("Uitvoer van Gemini is geen geldige JSON");
  }
  card.players ??= [];
  card.holes ??= [];
  if (!card.players.length) card.players.push({ name: null, playingHandicap: null, handicapIndex: null, scores: [], totals: null });
  return { card, raw };
}
