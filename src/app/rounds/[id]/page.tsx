import Link from "next/link";
import Section from "@/components/Section";
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
import Tip, { Term } from "@/components/Tip";

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
          <div className="label">
            <Term k="gross">Bruto</Term>
          </div>
          <div className="value">{s.gross}</div>
          <div className="small muted">{fmtToPar(s.toPar)}</div>
        </div>
        <div className="kpi">
          <div className="label">
            <Term k="points">Punten</Term>
          </div>
          <div className="value">{s.points}</div>
        </div>
        <div className="kpi">
          <div className="label">
            <Term k="net">Netto</Term>
          </div>
          <div className="value">{s.net ?? "–"}</div>
          <div className="small muted">
            <Term k="ph">PH</Term> {round.playingHandicap ?? "–"}
          </div>
        </div>
        <div className="kpi">
          <div className="label">
            <Term k="putts">Putts</Term>
          </div>
          <div className="value">{s.putts}</div>
          <div className="small muted">{fmtNum(s.puttsPerGir, 2)} per GIR</div>
        </div>
        <div className="kpi">
          <div className="label">
            <Term k="differential">Differential</Term>
          </div>
          <div className="value">{w?.adjustedDifferential != null ? fmtNum(w.adjustedDifferential) : "–"}</div>
          <div className="small muted">{w?.counted ? (inBest ? "telt mee (beste)" : "buiten beste") : (w?.reason ?? "")}</div>
        </div>
      </div>

      {note && <div className="alert note">Opvallend: {note}</div>}

      <Section id="round-card" title="Scorekaart" wide>
        <Scorecard round={round} />
      </Section>

      <div className="grid grid-md-2">
        <Section id="round-stats" title="Statistieken">
          <table className="t">
            <tbody>
              <tr>
                <td>
                  <Term k="fairwayPct">Fairways</Term>
                </td>
                <td className="num">
                  {s.fairways.hits}/{s.fairways.of} ({fmtPct(s.fairwayPct)})
                </td>
              </tr>
              <tr>
                <td>
                  <Term k="fairwayMiss">Gemist links / rechts / kort / lang</Term>
                </td>
                <td className="num">
                  {s.fairways.left} / {s.fairways.right} / {s.fairways.short} / {s.fairways.long}
                </td>
              </tr>
              <tr>
                <td>
                  <Term k="girPct">GIR</Term>
                </td>
                <td className="num">
                  {s.gir.hits}/{s.gir.of} ({fmtPct(s.girPct)})
                </td>
              </tr>
              <tr>
                <td>
                  <Term k="scramblingPct">Scrambling</Term>
                </td>
                <td className="num">
                  {s.scrambling.success}/{s.scrambling.of} ({fmtPct(s.scramblingPct)})
                </td>
              </tr>
              <tr>
                <td>Putts per hole</td>
                <td className="num">{fmtNum(s.puttsPerHole, 2)}</td>
              </tr>
              <tr>
                <td>
                  <Term k="threePutts">3-putts</Term>
                </td>
                <td className="num">{s.threePutts}</td>
              </tr>
              <tr>
                <td>
                  <Term text="Strafslagen (water, out of bounds, onspeelbaar) en slagen vanuit een bunker.">Strafslagen / bunkerslagen</Term>
                </td>
                <td className="num">
                  {s.penalties} / {s.bunker}
                </td>
              </tr>
              {s.front != null && (
                <tr>
                  <td>
                      <Term k="frontBack">Uit / in</Term>
                    </td>
                  <td className="num">
                    {s.front} / {s.back}
                  </td>
                </tr>
              )}
              <tr>
                <td>
                  <Term k="hcpTriple">Handicap (index / CH / PH)</Term>
                </td>
                <td className="num">
                  {fmtIndex(round.handicapIndex)} / {round.courseHandicap ?? "–"} / {round.playingHandicap ?? "–"}
                </td>
              </tr>
              <tr>
                <td>
                  <Term text="Course rating en slope van de tee waarop je speelde. Samen bepalen ze je course handicap en differential.">CR / slope</Term>
                </td>
                <td className="num">
                  {round.courseRating != null ? fmtNum(round.courseRating) : "–"} / {round.slope ?? "–"}
                </td>
              </tr>
            </tbody>
          </table>
          <h3 style={{ marginTop: 16 }}>
            <Term k="distribution">Scoreverdeling</Term>
          </h3>
          <DistributionBar dist={s.distribution} />
        </Section>

        <Section id="round-sg" title="Strokes gained" tip="sg">
          {sg ? (
            <>
              <p className="small muted">
                {sgHoles.length} van {round.holesCount} holes met slaginvoer · <Term k="baseline">referentie</Term> {baseline}
              </p>
              <DivergingBars rows={(Object.keys(SG_LABELS) as SgCategory[]).map((k) => ({ label: SG_LABELS[k], value: sg[k] }))} />
              <p className="small" style={{ marginTop: 8 }}>
                <Term k="sgTotal">Totaal</Term>: <strong>{fmtNum(sg.total, 2)}</strong>
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
        </Section>
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
        <Section id="round-notes" title="Notitie">
          <p>{round.notes}</p>
        </Section>
      )}

      {mine && (
        <Section id="round-manage" title="Beheer">
          <div className="small muted" style={{ marginBottom: 8 }}>
            <Term k="source">Bron</Term>: {SOURCE_LABELS[round.source] ?? round.source}
            {!round.qualifying && (
              <>
                {" · "}
                <Term k="qualifying">niet qualifying</Term>
              </>
            )}
          </div>
          <div className="row">
            <Link className="btn" href={`/rounds/${round.id}/edit`}>
              Bewerken
            </Link>
            <form action={setRoundVisibility} className="row">
              <Tip k="visibility" label="Zichtbaarheid" />
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
        </Section>
      )}
    </>
  );
}
