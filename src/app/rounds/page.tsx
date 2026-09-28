import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { loadRounds, applyFilter, otherPlayers, visibleRoundsOf } from "@/lib/rounds";
import { roundStats } from "@/lib/golf/stats";
import { fmtDate, fmtToPar } from "@/lib/format";

export const dynamic = "force-dynamic";

type SP = { q?: string; holes?: string; course?: string; format?: string; player?: string };

export default async function RoundsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const playerId = sp.player ? Number(sp.player) : user.id;
  const base = playerId === user.id ? await loadRounds([user.id]) : await visibleRoundsOf(user, playerId);
  const players = await otherPlayers(user);
  const courses = [...new Set(base.map((r) => r.courseLabel))].sort();
  const list = applyFilter(base, {
    q: sp.q,
    holes: sp.holes === "9" ? 9 : sp.holes === "18" ? 18 : undefined,
    courseLabel: sp.course || undefined,
    format: sp.format || undefined,
  });

  return (
    <>
      <div className="page-head">
        <h1>Rondes</h1>
        <span className="muted small">{list.length} rondes</span>
      </div>
      <form className="card tight" method="get">
        <div className="grid grid-2 grid-md-5">
          <input name="q" placeholder="Zoeken op baan of datum" defaultValue={sp.q} aria-label="Zoeken" />
          <select name="course" defaultValue={sp.course ?? ""} aria-label="Baan">
            <option value="">Alle banen</option>
            {courses.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select name="holes" defaultValue={sp.holes ?? ""} aria-label="Holes">
            <option value="">9 en 18 holes</option>
            <option value="9">9 holes</option>
            <option value="18">18 holes</option>
          </select>
          <select name="format" defaultValue={sp.format ?? ""} aria-label="Speelvorm">
            <option value="">Alle speelvormen</option>
            <option value="stableford">Stableford</option>
            <option value="stroke">Strokeplay</option>
          </select>
          {players.length > 0 ? (
            <select name="player" defaultValue={String(playerId)} aria-label="Speler">
              <option value={user.id}>Mijn rondes</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : null}
          <button className="btn">Filteren</button>
        </div>
      </form>

      {list.length === 0 ? (
        <div className="card center">
          <p className="muted">Nog geen rondes{sp.q || sp.course || sp.holes ? " met deze filters" : ""}.</p>
          {user.role !== "viewer" && (
            <Link className="btn primary" href="/add">
              Ronde toevoegen
            </Link>
          )}
        </div>
      ) : (
        <div className="card tight">
          <ul className="list">
            {list.map((r) => {
              const s = roundStats(r);
              const complete = s.holesPlayed === r.holesCount;
              return (
                <li key={r.id}>
                  <Link className="item" href={`/rounds/${r.id}`}>
                    <div>
                      <div>
                        <strong>{r.courseLabel}</strong>
                      </div>
                      <div className="small muted">
                        {fmtDate(r.date)} · {r.holesCount} holes · {r.teeLabel}
                        {!r.qualifying && " · niet qualifying"}
                        {r.hasShots && " · slagen"}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }} className="num">
                      <div>
                        <strong>{s.gross}</strong> <span className="small muted">{complete ? fmtToPar(s.toPar) : `${s.holesPlayed} h`}</span>
                      </div>
                      <div className="small muted">{s.points} pt</div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}
