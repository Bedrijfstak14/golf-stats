import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bagClubs } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { addDefaultBag, deleteBagClub, saveBagClub } from "@/app/actions";
import { loadRounds } from "@/lib/rounds";
import { clubDistances } from "@/lib/golf/strokesGained";

export const dynamic = "force-dynamic";

const TYPES: [string, string][] = [
  ["driver", "Driver"],
  ["wood", "Hout"],
  ["hybrid", "Hybride"],
  ["iron", "IJzer"],
  ["wedge", "Wedge"],
  ["putter", "Putter"],
];

export default async function BagPage() {
  const user = await requireUser();
  const bag = await db.select().from(bagClubs).where(eq(bagClubs.userId, user.id)).orderBy(asc(bagClubs.sortOrder), asc(bagClubs.id));
  const rounds = await loadRounds([user.id], {}, true);
  const measured = new Map(clubDistances(rounds.flatMap((r) => r.holes.map((h) => h.shots))).map((c) => [c.club, c]));

  return (
    <>
      <Link href="/more" className="back">
        ‹ Meer
      </Link>
      <div className="page-head">
        <h1>Clubs in de tas</h1>
      </div>
      {bag.length === 0 && (
        <form action={addDefaultBag} className="card">
          <p className="muted">Nog leeg. Begin met een standaardset en pas die aan.</p>
          <button className="btn primary">Standaardset toevoegen</button>
        </form>
      )}
      <div className="card tight">
        <ul className="list">
          {bag.map((c) => {
            const m = measured.get(c.name);
            return (
              <li key={c.id} className="item" style={{ display: "block" }}>
                <form action={saveBagClub} className="grid" style={{ gridTemplateColumns: "1fr 110px 90px auto", alignItems: "center" }}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="sortOrder" value={c.sortOrder} />
                  <input name="name" defaultValue={c.name} aria-label="Naam" />
                  <select name="type" defaultValue={c.type} aria-label="Type">
                    {TYPES.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                  <input name="avgDistance" inputMode="numeric" defaultValue={c.avgDistance ?? ""} aria-label="Gemiddelde afstand (m)" placeholder="m" />
                  <button className="btn sm">Opslaan</button>
                </form>
                <div className="row between small muted" style={{ marginTop: 4 }}>
                  <span>{m ? `Gemeten: ${m.avg} m ± ${m.spread} (${m.shots} slagen)` : "Nog geen gemeten slagen"}</span>
                  <form action={deleteBagClub}>
                    <input type="hidden" name="id" value={c.id} />
                    <button className="btn sm danger">Verwijderen</button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="card">
        <h2>Club toevoegen</h2>
        <form action={saveBagClub} className="grid grid-md-3">
          <input name="name" placeholder="bijv. 4-ijzer" required aria-label="Naam" />
          <select name="type" defaultValue="iron" aria-label="Type">
            {TYPES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <input name="avgDistance" inputMode="numeric" placeholder="Afstand (m)" aria-label="Afstand" />
          <input type="hidden" name="sortOrder" value={bag.length} />
          <button className="btn primary">Toevoegen</button>
        </form>
      </div>
    </>
  );
}
