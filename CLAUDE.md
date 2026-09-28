# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Golf Stats: a personal, mobile-first PWA (Dutch UI) built from `Golf Stats – Functioneel ontwerp.pdf`. The user uploads a Hole19 screenshot or a scorecard photo, Gemini reads it into a fixed JSON schema, the app runs checks, and after the player reviews it the round is saved and counts towards the statistics, the WHS handicap and strokes gained. The stack is Next.js 15 (App Router, `output: "standalone"`), TypeScript, Drizzle ORM and PostgreSQL 16, deployed with Docker Compose.

## Commands

```bash
npm test                                  # vitest; the tests are the calculation rules in src/lib/golf
npx vitest run src/lib/golf/whs.test.ts   # a single file
npx vitest run -t "acceptatievoorbeeld"   # a single test by name
npm run typecheck                         # tsc --noEmit (there is no linter)
npm run dev                               # http://localhost:3470, needs a local Postgres (see README)
npm run db:generate                       # after editing src/db/schema.ts: generates SQL into drizzle/
docker compose up -d --build              # production; migrations run automatically on app start
```

Local Node is 18; the Docker image uses Node 22. TypeScript is pinned to 5 and Vitest to 3 for Node 18.

## Architecture

- **`src/lib/golf/`: pure calculation modules with no DB or IO, all unit-tested.** These are the domain rules:
  - `stableford`: strokes received and points.
  - `checks`: every check on the review screen.
  - `whs`: all WHS rules in one place (course and playing handicap, AGS, differentials, 9-hole top-up, caps, exceptional score reduction, "Wat moet ik scoren?").
  - `stats`: statistics, trends, patterns and records.
  - `strokesGained`: baseline tables and categories.
  - `aiDraft`: Gemini JSON to `RoundDraft`.

  `RoundDraft` (`types.ts`) is the single interchange format for AI import, manual entry and editing.
- **Handicap and points always come from our own DB, never from the card.** `recalcHandicaps(userId)` in `src/lib/rounds.ts` walks all of a player's rounds in date order: index before the round (from `computeWhs`, otherwise start or official index), then course handicap from the tee's CR/slope, then playing handicap with the user's allowance, then points per hole. Without CR/slope it approximates with slope 113 and CR = par (`handicapForRound`). It must run after anything that can change the result: save or delete a round, settings, or tee changes. `saveRound` already calls it. The card's `P.HCP` (`draft.playingHandicap` in import mode) is used only to validate the card points the AI read.
- **Stats are never stored.** They are computed from `hole_scores` (and `shots`) when a page loads. The only derived values stored are `rounds.handicap_index/course_handicap/playing_handicap` and `hole_scores.points`, and `recalcHandicaps` maintains those.
- **Rounds snapshot the course data they were played with** (par, SI, length, CR, slope and label on `rounds`/`hole_scores`), so course edits don't rewrite history. Tees are versioned by `valid_from`. Courses (clubs → 9-hole `loops` → `holes`; `combinations` for 18 holes; `tees` on a loop or a combination) are shared between users. Everything player-specific carries `user_id`.
- **AI import flow** (`src/lib/imports.ts`, `src/lib/gemini.ts`):
  1. Upload creates a `pending` import.
  2. `POST /api/imports/[id]` runs `processImport`: Gemini call with `responseSchema`, match the course, fill missing SI and lengths from the stored course, then run `runChecks` and `readProblems`.
  3. If problems remain, it makes one retry with the problems passed back as feedback, and the better attempt wins.
  4. The review page (`/add/review/[id]`) renders `RoundEditor` next to the image.
  5. Saving goes through `POST /api/rounds`, which hard-blocks only on `plausibility` issues.
- **Hole19 quirks (verified on real cards):**
  - Screenshots are rotated 90°.
  - The superscript number is the stableford points.
  - `-` means the hole wasn't played.
  - 0 putts means not tracked, so putts and GIR become `null`.
  - The AI reads fairway icons only as a shape (`fairwayIcon`): circle = hit, straight arrow = right, curved arrow = left. Arrow direction is unreliable on rotated images, so don't switch back to direction enums.
- **`RoundEditor`** (`src/components/RoundEditor.tsx`) is the one review screen, with modes `import`, `manual` and `edit`. It re-runs the same `runChecks` live on the client. In edit mode the draft must include `shots`, because `saveRound` replaces `hole_scores` and that cascades to delete the shots.
- **Auth** (`src/lib/auth.ts`): e-mail and password with bcrypt. Sessions live in the DB, and the cookie stores a random token whose SHA-256 is the session id. `/setup` works only while no users exist; after that, sign-up is invite-only. `middleware.ts` does only a cheap cookie check; real checks happen per page (`requireUser`) and per route (`apiUser`). The cookie `secure` flag follows `X-Forwarded-Proto` so that both the Cloudflare tunnel (https) and plain http on the LAN work.
- **Server actions** for CRUD live in `src/app/actions.ts`. Interactive and offline-capable saves use JSON route handlers, via `sendJson` in `src/components/offline.ts`, which queues to IndexedDB when offline.
- **Deleting courses:** rounds must be detached first (`detachRounds` in actions). Postgres fails on the multiple cascade paths club→loop→tee and club→round.
- **Instrumentation:** `src/instrumentation.ts` must import `./migrate` only inside the `NEXT_RUNTIME === "nodejs"` branch, otherwise the edge bundle breaks.

## Deployment notes

- **Shared server:** another project's Caddy already holds 80/443. The app binds `${APP_BIND:-0.0.0.0}:${APP_PORT:-3470}` and is published via a Cloudflare tunnel at `APP_URL`. The bundled Caddy sits behind the optional `proxy` compose profile.
- **Build-time `APP_URL`:** it is passed as the build arg `ALLOWED_ORIGINS` for server actions. After changing it, run `docker compose up -d --build`.
- **Gemini model:** `GEMINI_MODEL` defaults to `gemini-3.8-flash` (`gemini-2.5-flash` was retired for new users). The API key is server-only.
- **`.env`:** a `$` in a value is interpolated by Compose, so avoid it in passwords.
- **Icons:** regenerate with `npm i --no-save sharp && node scripts/generate-icons.mjs`.
