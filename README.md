# Golf Stats

Persoonlijke, mobile-first webapp (PWA) om golfrondes op te slaan en te analyseren. Upload een Hole19-screenshot of een foto van een scorekaart; AI (Gemini) leest de kaart uit, de app controleert alles en na jouw akkoord telt de ronde mee voor statistieken, WHS-handicapverloop en strokes gained.

Gebouwd volgens *Golf Stats – Functioneel ontwerp* (fase 1 t/m 4, en de basis voor fase 5).

## Starten

```bash
cp .env.example .env        # vul POSTGRES_PASSWORD en GEMINI_API_KEY in
docker compose up -d --build
```

De app luistert op `0.0.0.0:${APP_PORT:-3470}` (bereikbaar op het netwerk; `APP_BIND=127.0.0.1` beperkt dit tot de server zelf). Zet `APP_URL` op het adres waarmee je de app opent, dan kloppen de uitnodigingslinks. Open die URL en maak via `/setup` het eigenaarsaccount aan. Registreren gaat daarna alleen via een uitnodigingslink (menu → Spelers en uitnodigingen).

- **HTTPS**: zet de bestaande reverse proxy voor poort 3470, of start de meegeleverde Caddy met `docker compose --profile proxy up -d` (vereist `DOMAIN` en vrije poorten 80/443). De reverse proxy moet uploads tot ~50 MB toestaan.
- **Cloudflare tunnel / proxy**: zet `APP_URL` op het publieke https-adres en bouw opnieuw (`docker compose up -d --build`); het domein wordt dan toegestaan voor formulieren (server actions). Het inlogcookie is `Secure` zodra het verzoek via https binnenkomt (`X-Forwarded-Proto`), zodat http op het LAN ook blijft werken.
- **Migraties** draaien automatisch bij het opstarten van de app.
- **Backups**: de `backup`-container maakt bij de start en daarna elke nacht om 03:00 een `pg_dump` plus een tar van de afbeeldingen in `./backups`, en bewaart 30 dagen.
- **`.env`**: een `$` in een waarde wordt door Docker Compose als variabele gelezen. Gebruik `$$` of vermijd `$` in wachtwoorden.

## Ontwikkelen

```bash
npm install
docker run -d --name golf-stats-devdb -e POSTGRES_USER=golf -e POSTGRES_PASSWORD=golf -e POSTGRES_DB=golf -p 127.0.0.1:5439:5432 postgres:16-alpine
npm run dev          # http://localhost:3470
npm test             # rekenregels (stableford, controles, WHS, stats, strokes gained)
npm run db:generate  # na wijzigingen in src/db/schema.ts
```

## Opbouw

| Pad | Inhoud |
|---|---|
| `src/lib/golf/` | Losse, geteste rekenmodules zonder database: `stableford`, `checks` (controles van het nakijkscherm), `whs` (alle WHS-regels op één plek), `stats` (statistieken, trends, patronen, records), `strokesGained` (baselines en categorieën), `aiDraft` (AI-JSON → conceptronde) |
| `src/lib/gemini.ts` | Gemini-aanroep met vast JSON-schema; de API-sleutel staat alleen op de server |
| `src/lib/rounds.ts`, `courses.ts`, `imports.ts` | Opslaan en laden van rondes, banen koppelen en aanmaken, uploads |
| `src/components/RoundEditor.tsx` | Het nakijkscherm; wordt ook gebruikt voor handmatige invoer en bewerken (één scherm, één set controles) |
| `src/db/schema.ts` | Datamodel, multi-user vanaf dag één (`user_id` op alle spelerdata) |
| `public/sw.js`, `src/app/manifest.ts` | PWA: installeerbaar, share target, offline bekijken; opslaan gaat bij geen netwerk in een wachtrij |

Het acceptatievoorbeeld uit het ontwerp (25 aug 2026, Sybrook Oost, 60 slagen / 17 punten / 20 putts, hole 4 → 5 punten) is een vaste test in `src/lib/golf/golf.test.ts`. De losse holewaarden daarin zijn synthetisch: ze voldoen aan de totalen, maar komen niet van de echte kaart.

## Keuzes en beperkingen

- **Handicap** is indicatief. De NGF-registratie blijft leidend. Index = beste 8 van de laatste 20, met WHS-tabel voor minder rondes, 9-holesaanvulling (0,52 × index + 1,197), soft/hard cap, correctie bij uitzonderlijke scores, max 54 en PCC standaard 0. De index wordt steeds uit de rondes berekend en niet apart opgeslagen.
- **Oude rondes** bewaren een momentopname van par, SI, lengte, CR en slope. Tees hebben een geldig-vanaf-datum ("opslaan als nieuwe versie").
- **Strokes gained**: de baseline is een benadering van de PGA Tour-waarden (Broadie), met handicapniveaus afgeleid via schaling. Vervang de tabellen in `strokesGained.ts` zodra de bron gekozen is (open punt).
- **CSV-import** gebruikt voorlopig het eigen exportformaat. Het formaat van de Hole19-AVG-export is nog een open punt.
- **Passkeys** zijn nog niet geïmplementeerd; inloggen gaat met e-mail en wachtwoord.
