import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { imports, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canView, loadRound, loadRounds, userStartIndex, whsInputs } from "@/lib/rounds";
import { roundStats, standout } from "@/lib/golf/stats";
import { computeWhs } from "@/lib/golf/whs";
import { holeStrokesGained, sumByCategory, SG_LABELS, type BaselineKey, type SgCategory } from "@/lib/golf/strokesGained";
import { fmtDate, fmtIndex, fmtNum, fmtPct, fmtToPar, SOURCE_LABELS } from "@/lib/format";
import Scorecard from "@/components/Scorecard";
import { DistributionBar, DivergingBars } from "@/components/charts";
import { deleteRound, setRoundVisibility } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function RoundPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  const round = await loadRound(id);
  if (!round) notFound();
  const [owner] = await db.select().from(users).where(eq(users.id, round.userId));
  if (!canView(user, round, owner)) notFound();
  const mine = round.userId === user.id;

  const s = roundStats(round);
  const all = await loadRounds([round.userId]);
  const whs = computeWhs(whsInputs(all), userStartIndex(owner));
  const w = whs.rounds.find((r) => r.id === round.id);
  const inBest = whs.best.includes(round.id);
  const imgs = await db.select({ images: imports.images }).from(imports).where(eq(imports.roundId, round.id));

  const baseline = (owner.sgBaseline as BaselineKey) ?? "scratch";
  const sgHoles = round.holes.filter((h) => h.shots.length > 0);
  const sg = sgHoles.length ? sumByCategory(sgHoles.flatMap((h) => holeStrokesGained(h.shots, h.par, baseline))) : null;
  const note = standout(round);

  return (
    <>
      <Link href="/rounds" className="back">
        ‹ Rondes
      </Link>
      <div className="page-head">
        <div>
          <h1>{round.courseLabel}</h1>
          <div className="muted small">
            {fmtDate(round.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · {round.teeLabel} · {round.holesCount} holes ·{" "}
            {round.format === "stableford" ? "Stableford" : "Strokeplay"}
          </div>
        </div>
      </div>

      <div className="grid grid-3 grid-md-5" style={{ marginBottom: 12 }}>
        <div className="kpi">
          <div className="label">Bruto</div>
          <div className="value">{s.gross}</div>
          <div className="small muted">{fmtToPar(s.toPar)}</div>
        </div>
        <div className="kpi">
          <div className="label">Punten</div>
          <div className="value">{s.points}</div>
        </div>
        <div className="kpi">
          <div className="label">Netto</div>
          <div className="value">{s.net ?? "–"}</div>
          <div className="small muted">PH {round.playingHandicap ?? "–"}</div>
        </div>
        <div className="kpi">
          <div className="label">Putts</div>
          <div className="value">{s.putts}</div>
          <div className="small muted">{fmtNum(s.puttsPerGir, 2)} per GIR</div>
        </div>
        <div className="kpi">
          <div className="label">Differential</div>
          <div className="value">{w?.adjustedDifferential != null ? fmtNum(w.adjustedDifferential) : "–"}</div>
          <div className="small muted">{w?.counted ? (inBest ? "telt mee (beste)" : "buiten beste") : (w?.reason ?? "")}</div>
        </div>
      </div>

      {note && <div className="alert note">Opvallend: {note}</div>}

      <div className="card">
        <Scorecard round={round} />
      </div>

      <div className="grid grid-md-2">
        <div className="card">
          <h2>Statistieken</h2>
          <table className="t">
            <tbody>
              <tr>
                <td>Fairways</td>
                <td className="num">
                  {s.fairways.hits}/{s.fairways.of} ({fmtPct(s.fairwayPct)})
                </td>
              </tr>
              <tr>
                <td>Gemist links / rechts / kort / lang</td>
                <td className="num">
                  {s.fairways.left} / {s.fairways.right} / {s.fairways.short} / {s.fairways.long}
                </td>
              </tr>
              <tr>
                <td>GIR</td>
                <td className="num">
                  {s.gir.hits}/{s.gir.of} ({fmtPct(s.girPct)})
                </td>
              </tr>
              <tr>
                <td>Scrambling</td>
                <td className="num">
                  {s.scrambling.success}/{s.scrambling.of} ({fmtPct(s.scramblingPct)})
                </td>
              </tr>
              <tr>
                <td>Putts per hole</td>
                <td className="num">{fmtNum(s.puttsPerHole, 2)}</td>
              </tr>
              <tr>
                <td>3-putts</td>
                <td className="num">{s.threePutts}</td>
              </tr>
              <tr>
                <td>Strafslagen / bunkerslagen</td>
                <td className="num">
                  {s.penalties} / {s.bunker}
                </td>
              </tr>
              {s.front != null && (
                <tr>
                  <td>Uit / in</td>
                  <td className="num">
                    {s.front} / {s.back}
                  </td>
                </tr>
              )}
              <tr>
                <td>Handicap (index / CH / PH)</td>
                <td className="num">
                  {fmtIndex(round.handicapIndex)} / {round.courseHandicap ?? "–"} / {round.playingHandicap ?? "–"}
                </td>
              </tr>
              <tr>
                <td>CR / slope</td>
                <td className="num">
                  {round.courseRating != null ? fmtNum(round.courseRating) : "–"} / {round.slope ?? "–"}
                </td>
              </tr>
            </tbody>
          </table>
          <h3 style={{ marginTop: 16 }}>Scoreverdeling</h3>
          <DistributionBar dist={s.distribution} />
        </div>

        <div className="card">
          <h2>Strokes gained</h2>
          {sg ? (
            <>
              <p className="small muted">
                {sgHoles.length} van {round.holesCount} holes met slaginvoer · referentie {baseline}
              </p>
              <DivergingBars rows={(Object.keys(SG_LABELS) as SgCategory[]).map((k) => ({ label: SG_LABELS[k], value: sg[k] }))} />
              <p className="small" style={{ marginTop: 8 }}>
                Totaal: <strong>{fmtNum(sg.total, 2)}</strong>
              </p>
            </>
          ) : (
            <p className="muted small">Geen slaginvoer voor deze ronde. De ronde telt volledig mee voor alle andere statistieken.</p>
          )}
          {mine && (
            <Link className="btn block" href={`/rounds/${round.id}/shots`}>
              Slagen invoeren
            </Link>
          )}
        </div>
      </div>

      {imgs.some((i) => i.images.length) && (
        <details className="card">
          <summary>
            <strong>Originele afbeelding</strong>
          </summary>
          {imgs.flatMap((i) => i.images).map((src) => (
            <img key={src} src={`/api/uploads/${src}`} alt="Originele scorekaart" style={{ width: "100%", maxWidth: 520, borderRadius: 12, marginTop: 8 }} />
          ))}
        </details>
      )}

      {round.notes && (
        <div className="card">
          <h3>Notitie</h3>
          <p>{round.notes}</p>
        </div>
      )}

      {mine && (
        <div className="card">
          <div className="small muted" style={{ marginBottom: 8 }}>
            Bron: {SOURCE_LABELS[round.source] ?? round.source}
            {!round.qualifying && " · niet qualifying"}
          </div>
          <div className="row">
            <Link className="btn" href={`/rounds/${round.id}/edit`}>
              Bewerken
            </Link>
            <form action={setRoundVisibility} className="row">
              <input type="hidden" name="id" value={round.id} />
              <select name="visibility" defaultValue={round.visibility} aria-label="Zichtbaarheid" style={{ width: "auto" }}>
                <option value="default">Delen: volgens instelling</option>
                <option value="private">Privé</option>
                <option value="shared">Gedeeld met vrienden</option>
              </select>
              <button className="btn sm">Opslaan</button>
            </form>
            <form action={deleteRound}>
              <input type="hidden" name="id" value={round.id} />
              <button className="btn danger">Verwijderen</button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
