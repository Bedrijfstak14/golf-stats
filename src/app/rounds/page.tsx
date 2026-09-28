import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { loadRounds, applyFilter, otherPlayers, visibleRoundsOf } from "@/lib/rounds";
import { roundStats } from "@/lib/golf/stats";
import { fmtDate, fmtToPar } from "@/lib/format";
import FilterBar from "@/components/FilterBar";

export const dynamic = "force-dynamic";

type SP = { q?: string; holes?: string; course?: string; format?: string; player?: string };

export default async function RoundsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const playerId = sp.player && Number(sp.player) !== user.id ? Number(sp.player) : user.id;
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
      <FilterBar
        search={{ name: "q", placeholder: "Baan of datum" }}
        fields={[
          ...(players.length
            ? [{ name: "player", label: "Speler", options: [{ value: "", label: "Mijn rondes" }, ...players.map((p) => ({ value: String(p.id), label: p.name }))] }]
            : []),
          { name: "course", label: "Baan", options: [{ value: "", label: "Alle banen" }, ...courses.map((c) => ({ value: c, label: c }))] },
          {
            name: "holes",
            label: "Holes",
            options: [
              { value: "", label: "9 en 18 holes" },
              { value: "9", label: "9 holes" },
              { value: "18", label: "18 holes" },
            ],
          },
          {
            name: "format",
            label: "Speelvorm",
            options: [
              { value: "", label: "Alle speelvormen" },
              { value: "stableford", label: "Stableford" },
              { value: "stroke", label: "Strokeplay" },
            ],
          },
        ]}
      />

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
              const [club, loop] = r.courseLabel.split(" – ");
              return (
                <li key={r.id}>
                  <Link className="item round-item" href={`/rounds/${r.id}`}>
                    <div className="round-item-main">
                      <strong>{loop || r.courseLabel}</strong>
                      <div className="small muted ellipsis">{loop ? club : ""}</div>
                      <div className="small muted">
                        {fmtDate(r.date)} · {r.teeLabel}
                        {!r.qualifying && " · niet qualifying"}
                        {r.hasShots && " · slagen"}
                      </div>
                    </div>
                    <div className="round-item-score num">
                      <div>
                        <strong>{s.gross}</strong> <span className="small muted">{complete ? fmtToPar(s.toPar) : ""}</span>
                      </div>
                      <div className="small muted">{s.points} pt</div>
                      {!complete && (
                        <div className="small muted">
                          {s.holesPlayed}/{r.holesCount} holes
                        </div>
                      )}
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
