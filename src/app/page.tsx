import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { loadRounds, userStartIndex, whsInputs } from "@/lib/rounds";
import { computeWhs } from "@/lib/golf/whs";
import { insights, keyFigures, roundStats, standout, type StatKey } from "@/lib/golf/stats";
import { fmtDate, fmtIndex, fmtNum, fmtToPar } from "@/lib/format";
import { num } from "@/db";
import { Sparkline } from "@/components/charts";
import { Term } from "@/components/Tip";

export const dynamic = "force-dynamic";

const KEYS: StatKey[] = ["gross", "putts", "fairwayPct", "girPct", "penalties"];
const ARROW = { better: "▲ beter", worse: "▼ slechter", flat: "● gelijk" } as const;

export default async function Dashboard() {
  const user = await requireUser();
  const rounds = await loadRounds([user.id]);
  const whs = computeWhs(whsInputs(rounds), userStartIndex(user));
  const indexSeries = whs.rounds.filter((r) => r.indexAfter != null).slice(-20);
  const last = rounds[0];
  const official = num(user.officialIndex);

  if (!rounds.length) {
    return (
      <>
        <div className="page-head">
          <h1>Hoi {user.name.split(" ")[0]}</h1>
        </div>
        <div className="card center">
          <h2>Nog geen rondes</h2>
          <p className="muted">Upload een Hole19-screenshot of een foto van je scorekaart, of voer een ronde handmatig in.</p>
          {user.role !== "viewer" && (
            <Link href="/add" className="btn primary">
              Eerste ronde toevoegen
            </Link>
          )}
        </div>
      </>
    );
  }

  const kf = keyFigures(rounds, KEYS, 5, "per18");
  const cards = insights(rounds).slice(0, 3);
  const ls = roundStats(last);
  const note = standout(last);
  const prevIndex = indexSeries.length > 1 ? indexSeries[indexSeries.length - 2].indexAfter : null;

  return (
    <>
      <div className="page-head">
        <h1>Hoi {user.name.split(" ")[0]}</h1>
      </div>

      <div className="grid grid-md-2">
        <Link href="/stats?tab=handicap" className="card">
          <div className="small muted">
            <Term k="index">Handicapindex (indicatief)</Term>
          </div>
          <div className="row between">
            <div>
              <div className="big num">{fmtIndex(whs.index)}</div>
              {prevIndex != null && whs.index != null && prevIndex !== whs.index && (
                <div className={`small ${whs.index < prevIndex ? "trend-better" : "trend-worse"}`}>
                  {whs.index < prevIndex ? "▼" : "▲"} {fmtNum(Math.abs(whs.index - prevIndex))} t.o.v. vorige
                </div>
              )}
              {official != null && <div className="small muted">NGF officieel: {fmtIndex(official)}</div>}
              {whs.index == null && <div className="small muted">Vanaf 3 qualifying rondes met rating en slope</div>}
            </div>
            <Sparkline values={indexSeries.map((r) => r.indexAfter)} />
          </div>
        </Link>

        <Link href={`/rounds/${last.id}`} className="card">
          <div className="small muted">Laatste ronde · {fmtDate(last.date)}</div>
          <div>
            <strong>{last.courseLabel}</strong>
          </div>
          <div className="row" style={{ gap: 16, marginTop: 4 }}>
            <span className="num">
              <span className="big" style={{ fontSize: "1.8rem" }}>
                {ls.gross}
              </span>{" "}
              <span className="muted">{fmtToPar(ls.toPar)}</span>
            </span>
            <span className="num">
              <strong style={{ fontSize: "1.3rem" }}>{ls.points}</strong> <span className="muted">
                <Term k="points">punten</Term>
              </span>
            </span>
          </div>
          {note && <div className="small" style={{ marginTop: 6 }}>{note}</div>}
        </Link>
      </div>

      <h2 style={{ marginTop: 8 }}>
        <Term k="keyFigures">Kerncijfers</Term>
      </h2>
      <p className="small muted">Gemiddelde laatste 5 rondes, genormaliseerd naar 18 holes, t.o.v. de 5 daarvoor.</p>
      <div className="grid grid-2 grid-md-5" style={{ marginBottom: 16 }}>
        {kf.map((k) => (
          <div className="kpi" key={k.key}>
            <div className="label">
              <Term k={k.key}>{k.label.replace("Bruto score", "Gem. score")}</Term>
            </div>
            <div className="value">
              {k.value == null ? "–" : fmtNum(k.value)}
              {k.key.endsWith("Pct") && k.value != null ? "%" : ""}
            </div>
            {k.direction && <div className={`small trend-${k.direction}`}>{ARROW[k.direction]}</div>}
          </div>
        ))}
      </div>

      {cards.length > 0 && (
        <>
          <h2>
            <Term k="insights">Inzichten</Term>
          </h2>
          <div className="grid grid-md-3">
            {cards.map((c) => (
              <Link key={c.id} className="card" href={c.roundIds.length === 1 ? `/rounds/${c.roundIds[0]}` : "/stats?tab=patterns"}>
                <div className="small muted">{c.title}</div>
                <div>{c.text}</div>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
