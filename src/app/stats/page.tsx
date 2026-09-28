import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { applyFilter, loadRounds, userStartIndex, whsInputs, type LoadedRound } from "@/lib/rounds";
import { listCourseOptions, teesOnDate } from "@/lib/courses";
import {
  blowUps,
  frontBack,
  holeAverages,
  parTypeScoring,
  puttingInsight,
  records,
  roundStats,
  siGroupScoring,
  statValue,
  STAT_LABELS,
  LOWER_IS_BETTER,
  trend,
  fmtSigned,
  type Normalize,
  type StatKey,
  type Distribution,
} from "@/lib/golf/stats";
import { computeWhs, whatToScore } from "@/lib/golf/whs";
import { BASELINES, clubDistances, holeStrokesGained, sumByCategory, SG_LABELS, type BaselineKey, type SgCategory } from "@/lib/golf/strokesGained";
import { fmtDate, fmtIndex, fmtNum, today } from "@/lib/format";
import { num } from "@/db";
import { DistributionBar, DivergingBars, LineChart } from "@/components/charts";

export const dynamic = "force-dynamic";

type SP = {
  tab?: string;
  period?: string;
  course?: string;
  holes?: string;
  format?: string;
  shots?: string;
  norm?: string;
  stat?: string;
  hcourse?: string;
  wopt?: string;
  wtee?: string;
  baseline?: string;
};

const TABS = [
  ["overview", "Overzicht"],
  ["trends", "Trends"],
  ["patterns", "Patronen"],
  ["handicap", "Handicap"],
  ["sg", "Strokes gained"],
] as const;

const shortDate = (d: string) => fmtDate(d, { day: "numeric", month: "short" });

export default async function StatsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : "overview";
  const all = await loadRounds([user.id], {}, true);
  const norm: Normalize = sp.norm === "perHole" ? "perHole" : "per18";

  // Filters: periode, baan, 9/18, speelvorm, met/zonder slaginvoer
  let from: string | undefined;
  if (sp.period === "90" || sp.period === "365") {
    const d = new Date();
    d.setDate(d.getDate() - Number(sp.period));
    from = d.toISOString().slice(0, 10);
  }
  let rounds = applyFilter(all, {
    from,
    courseLabel: sp.course || undefined,
    holes: sp.holes === "9" ? 9 : sp.holes === "18" ? 18 : undefined,
    format: sp.format || undefined,
    withShots: sp.shots === "with" ? true : sp.shots === "without" ? false : undefined,
  });
  if (sp.period === "last20") rounds = rounds.slice(0, 20);
  const courses = [...new Set(all.map((r) => r.courseLabel))].sort();

  const q = (patch: Partial<SP>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/stats?${p.toString()}`;
  };

  return (
    <>
      <div className="page-head">
        <h1>Statistieken</h1>
      </div>

      <div className="table-wrap" style={{ marginBottom: 12 }}>
        <div className="seg">
          {TABS.map(([k, label]) => (
            <Link key={k} href={q({ tab: k })} className={tab === k ? "on" : ""}>
              {label}
            </Link>
          ))}
        </div>
      </div>

      {tab !== "handicap" && (
        <form className="card tight" method="get">
          <input type="hidden" name="tab" value={tab} />
          {sp.stat && <input type="hidden" name="stat" value={sp.stat} />}
          <div className="grid grid-2 grid-md-5">
            <select name="period" defaultValue={sp.period ?? ""} aria-label="Periode">
              <option value="">Alle rondes</option>
              <option value="last20">Laatste 20 rondes</option>
              <option value="365">Afgelopen jaar</option>
              <option value="90">Afgelopen 90 dagen</option>
            </select>
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
            <select name="shots" defaultValue={sp.shots ?? ""} aria-label="Slaginvoer">
              <option value="">Met en zonder slaginvoer</option>
              <option value="with">Met slaginvoer</option>
              <option value="without">Zonder slaginvoer</option>
            </select>
            <select name="norm" defaultValue={norm} aria-label="Normalisatie">
              <option value="per18">Genormaliseerd naar 18 holes</option>
              <option value="perHole">Gemiddeld per hole</option>
            </select>
            <button className="btn">Toepassen</button>
          </div>
        </form>
      )}

      {rounds.length === 0 && tab !== "handicap" ? (
        <div className="card muted">Geen rondes voor deze selectie.</div>
      ) : tab === "overview" ? (
        <Overview rounds={rounds} norm={norm} />
      ) : tab === "trends" ? (
        <Trends rounds={rounds} norm={norm} stat={(sp.stat as StatKey) ?? "gross"} q={q} />
      ) : tab === "patterns" ? (
        <Patterns rounds={rounds} hcourse={sp.hcourse ?? courses[0]} courses={courses} sp={sp} />
      ) : tab === "handicap" ? (
        <Handicap all={all} user={user} sp={sp} />
      ) : (
        <StrokesGained rounds={rounds} baseline={(sp.baseline as BaselineKey) || (user.sgBaseline as BaselineKey) || "scratch"} q={q} />
      )}
    </>
  );
}

// ---------- Overzicht ----------

function Overview({ rounds, norm }: { rounds: LoadedRound[]; norm: Normalize }) {
  const stats = rounds.map(roundStats);
  const avg = (k: StatKey) => {
    const v = stats.map((s) => statValue(s, k, norm)).filter((x): x is number => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const dist = stats.reduce<Distribution>(
    (a, s) => {
      for (const k of Object.keys(a) as (keyof Distribution)[]) a[k] += s.distribution[k];
      return a;
    },
    { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0, worse: 0 },
  );
  const fw = stats.reduce((a, s) => ({ l: a.l + s.fairways.left, r: a.r + s.fairways.right, k: a.k + s.fairways.short, g: a.g + s.fairways.long }), { l: 0, r: 0, k: 0, g: 0 });
  const unit = norm === "perHole" ? "per hole" : "per 18 holes";
  const rows: [StatKey, string][] = [
    ["gross", unit],
    ["toPar", unit],
    ["points", unit],
    ["net", unit],
    ["putts", unit],
    ["fairwayPct", "%"],
    ["girPct", "%"],
    ["scramblingPct", "%"],
    ["penalties", unit],
    ["bunker", unit],
    ["threePutts", unit],
  ];
  const puttsPerGir = stats.filter((s) => s.puttsPerGir != null);
  return (
    <div className="grid grid-md-2">
      <div className="card">
        <h2>Gemiddelden · {rounds.length} rondes</h2>
        <table className="t">
          <tbody>
            {rows.map(([k, u]) => (
              <tr key={k}>
                <td>{STAT_LABELS[k]}</td>
                <td className="num">
                  {fmtNum(avg(k), norm === "perHole" ? 2 : 1)}
                  {u === "%" ? "%" : ""}
                </td>
                <td className="small muted">{u === "%" ? "" : u}</td>
              </tr>
            ))}
            <tr>
              <td>Putts per GIR-hole</td>
              <td className="num">{fmtNum(puttsPerGir.length ? puttsPerGir.reduce((a, s) => a + (s.puttsPerGir ?? 0), 0) / puttsPerGir.length : null, 2)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <div className="card">
        <h2>Scoreverdeling</h2>
        <DistributionBar dist={dist} />
        <h3 style={{ marginTop: 16 }}>Gemiste fairways</h3>
        <table className="t">
          <tbody>
            <tr>
              <td>Links</td>
              <td className="num">{fw.l}</td>
            </tr>
            <tr>
              <td>Rechts</td>
              <td className="num">{fw.r}</td>
            </tr>
            <tr>
              <td>Kort</td>
              <td className="num">{fw.k}</td>
            </tr>
            <tr>
              <td>Lang</td>
              <td className="num">{fw.g}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <Records rounds={rounds} />
    </div>
  );
}

function Records({ rounds }: { rounds: LoadedRound[] }) {
  const rec = records(rounds);
  if (!rec.length) return null;
  return (
    <div className="card" style={{ gridColumn: "1 / -1" }}>
      <h2>Persoonlijke records per baan</h2>
      <div className="table-wrap">
        <table className="t">
          <thead>
            <tr>
              <th>Baan</th>
              <th>Rondes</th>
              <th>Beste score</th>
              <th>Meeste punten</th>
              <th>Minste putts</th>
            </tr>
          </thead>
          <tbody>
            {rec.map((r) => (
              <tr key={r.courseLabel + r.holesCount}>
                <td>
                  {r.courseLabel} <span className="small muted">({r.holesCount})</span>
                </td>
                <td className="num">{r.rounds}</td>
                {[r.bestGross, r.mostPoints, r.fewestPutts].map((x, i) => (
                  <td key={i} className="num">
                    {x ? (
                      <Link href={`/rounds/${x.roundId}`}>
                        {x.value} <span className="small muted">{shortDate(x.date)}</span>
                      </Link>
                    ) : (
                      "–"
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- Trends ----------

function Trends({ rounds, norm, stat, q }: { rounds: LoadedRound[]; norm: Normalize; stat: StatKey; q: (p: Partial<SP>) => string }) {
  const key = (Object.keys(STAT_LABELS) as StatKey[]).includes(stat) ? stat : "gross";
  const t = trend(rounds, key, norm, 5);
  return (
    <div className="card">
      <div className="table-wrap" style={{ marginBottom: 12 }}>
        <div className="seg">
          {(Object.keys(STAT_LABELS) as StatKey[]).map((k) => (
            <Link key={k} href={q({ stat: k })} className={k === key ? "on" : ""}>
              {STAT_LABELS[k]}
            </Link>
          ))}
        </div>
      </div>
      <h2>{STAT_LABELS[key]}</h2>
      <p className="small muted">
        Per ronde {key.endsWith("Pct") ? "" : norm === "perHole" ? "(per hole)" : "(genormaliseerd naar 18 holes)"}, met voortschrijdend gemiddelde over 5 rondes.
        {LOWER_IS_BETTER[key] ? " Lager is beter." : " Hoger is beter."}
      </p>
      <LineChart
        points={t.map((p) => ({ label: shortDate(p.date), value: p.value, rolling: p.rolling, href: `/rounds/${p.id}` }))}
        valueLabel={STAT_LABELS[key]}
        rollingLabel="Gemiddelde (5)"
      />
      <details style={{ marginTop: 12 }}>
        <summary className="small muted">Tabel</summary>
        <table className="t">
          <tbody>
            {[...t].reverse().map((p) => (
              <tr key={p.id}>
                <td>{fmtDate(p.date)}</td>
                <td className="num">{fmtNum(p.value, 2)}</td>
                <td className="num muted">{fmtNum(p.rolling, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

// ---------- Patronen ----------

function Patterns({ rounds, hcourse, courses, sp }: { rounds: LoadedRound[]; hcourse?: string; courses: string[]; sp: SP }) {
  const pt = parTypeScoring(rounds);
  const sg = siGroupScoring(rounds);
  const fb = frontBack(rounds);
  const pi = puttingInsight(rounds);
  const bu = blowUps(rounds).slice(0, 15);
  const ha = hcourse ? holeAverages(rounds, hcourse) : [];
  const worst = [...ha].sort((a, b) => b.avgToPar - a.avgToPar).slice(0, 3).map((h) => h.number);
  return (
    <div className="grid grid-md-2">
      <div className="card">
        <h2>Scoring per par-type</h2>
        <table className="t">
          <thead>
            <tr>
              <th>Par</th>
              <th>Gem. t.o.v. par</th>
              <th>Holes</th>
            </tr>
          </thead>
          <tbody>
            {pt.map((p) => (
              <tr key={p.par}>
                <td>Par {p.par}</td>
                <td className="num">{fmtSigned(p.avgToPar)}</td>
                <td className="num muted">{p.holes}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3 style={{ marginTop: 16 }}>Moeilijke vs makkelijke holes</h3>
        <p className="small">
          Laagste SI's (bij 18 holes SI 1–6): <strong>{sg.hard != null ? fmtSigned(sg.hard) : "–"}</strong> · overige: <strong>{sg.easy != null ? fmtSigned(sg.easy) : "–"}</strong> t.o.v. par
        </p>
        {fb && (
          <>
            <h3>Voor- en tweede negen</h3>
            <p className="small">
              Gemiddeld {fmtNum(fb.front)} uit, {fmtNum(fb.back)} in ({fmtSigned(fb.diff)}) over {fb.rounds} rondes van 18 holes.
            </p>
          </>
        )}
        {pi && (
          <>
            <h3>Putten</h3>
            <p className="small">
              {fmtNum(pi.threePerRound)} 3-putts per ronde · kans op 3-putt na GIR: {pi.afterGirPct != null ? `${fmtNum(pi.afterGirPct)}%` : "–"} ({pi.girHoles} GIR-holes)
            </p>
          </>
        )}
      </div>

      <div className="card">
        <h2>Grote uitschieters</h2>
        <p className="small muted">Holes met triple bogey of slechter, en wat daar gebeurde.</p>
        {bu.length === 0 ? (
          <p className="muted small">Geen. Mooi zo.</p>
        ) : (
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Hole</th>
                  <th>Score</th>
                  <th>Putts</th>
                  <th>Straf</th>
                  <th>FW</th>
                </tr>
              </thead>
              <tbody>
                {bu.map((b, i) => (
                  <tr key={i}>
                    <td>
                      <Link href={`/rounds/${b.roundId}`}>{shortDate(b.date)}</Link>
                    </td>
                    <td>
                      {b.hole} <span className="muted small">(par {b.par})</span>
                    </td>
                    <td className="num">{b.strokes}</td>
                    <td className="num">{b.putts ?? "–"}</td>
                    <td className="num">{b.penalties}</td>
                    <td>{b.fairway === "hit" ? "raak" : b.fairway === "na" ? "" : (b.fairway ?? "–")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ gridColumn: "1 / -1" }}>
        <div className="row between">
          <h2 style={{ margin: 0 }}>Per baan en per hole</h2>
          <form method="get" className="row">
            {Object.entries(sp)
              .filter(([k, v]) => k !== "hcourse" && v)
              .map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
            <select name="hcourse" defaultValue={hcourse} aria-label="Baan" style={{ width: "auto" }}>
              {courses.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <button className="btn sm">Tonen</button>
          </form>
        </div>
        {ha.length === 0 ? (
          <p className="muted small">Geen rondes op deze baan in de selectie.</p>
        ) : (
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="t">
              <thead>
                <tr>
                  <th>Hole</th>
                  <th>Par</th>
                  <th>Gem. score</th>
                  <th>t.o.v. par</th>
                  <th>Gem. punten</th>
                  <th>Keer</th>
                </tr>
              </thead>
              <tbody>
                {ha.map((h) => (
                  <tr key={h.number} style={worst.includes(h.number) ? { background: "var(--red-soft)" } : undefined}>
                    <td>{h.number}</td>
                    <td>{h.par}</td>
                    <td className="num">{fmtNum(h.avg, 2)}</td>
                    <td className="num">{fmtSigned(h.avgToPar)}</td>
                    <td className="num">{fmtNum(h.avgPoints, 2)}</td>
                    <td className="num muted">{h.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="small muted">Gemarkeerd: je drie lastigste holes op deze baan.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Handicap ----------

async function Handicap({ all, user, sp }: { all: LoadedRound[]; user: Awaited<ReturnType<typeof requireUser>>; sp: SP }) {
  const whs = computeWhs(whsInputs(all), userStartIndex(user));
  const counted = whs.rounds.filter((r) => r.counted);
  const last20 = new Set(whs.lastTwenty);
  const best = new Set(whs.best);
  const byId = new Map(all.map((r) => [r.id, r]));
  const official = num(user.officialIndex);

  const options = (await listCourseOptions()).filter((o) => o.tees.some((t) => t.courseRating != null && t.slope != null));
  const wopt = options.find((o) => `${o.kind}:${o.id}` === sp.wopt) ?? options[0];
  const tees = wopt ? teesOnDate(wopt.tees, today()).filter((t) => t.courseRating != null && t.slope != null) : [];
  const wtee = tees.find((t) => String(t.id) === sp.wtee) ?? tees.find((t) => t.gender === user.gender) ?? tees[0];
  const what = wtee
    ? whatToScore(whsInputs(all), { courseRating: wtee.courseRating!, slope: wtee.slope!, par: wtee.par, holesCount: wopt!.holesCount }, userStartIndex(user), user.allowance)
    : null;

  return (
    <div className="stack">
      <div className="grid grid-2 grid-md-3">
        <div className="kpi">
          <div className="label">Index (indicatief, WHS)</div>
          <div className="value">{fmtIndex(whs.index)}</div>
        </div>
        <div className="kpi">
          <div className="label">NGF officieel</div>
          <div className="value">{fmtIndex(official)}</div>
          {official != null && whs.index != null && <div className="small muted">verschil {fmtNum(whs.index - official)}</div>}
        </div>
        <div className="kpi">
          <div className="label">Laagste index 12 mnd</div>
          <div className="value">{fmtIndex(whs.lowIndex)}</div>
        </div>
      </div>

      <div className="card">
        <h2>Verloop</h2>
        {counted.length < 3 ? (
          <p className="muted small">
            Nog {3 - counted.length} qualifying ronde{3 - counted.length === 1 ? "" : "s"} met course rating en slope nodig voor een index. Leg rating en slope vast bij{" "}
            <Link href="/more/courses">Banen</Link>.
          </p>
        ) : (
          <LineChart
            points={counted
              .filter((r) => r.indexAfter != null)
              .map((r) => ({
                label: shortDate(r.date),
                value: r.indexAfter,
                mark: best.has(r.id) ? "best" : last20.has(r.id) ? null : "out",
                href: `/rounds/${r.id}`,
              }))}
            valueLabel="Handicapindex"
            invert
          />
        )}
      </div>

      <div className="card">
        <h2>Score differentials</h2>
        <p className="small muted">De laatste 20 tellen; de beste {whs.best.length} bepalen de index. PCC staat standaard op 0.</p>
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Baan</th>
                <th>AGS</th>
                <th>Diff.</th>
                <th>Telt</th>
                <th>Index na</th>
              </tr>
            </thead>
            <tbody>
              {[...whs.rounds].reverse().slice(0, 30).map((r) => {
                const round = byId.get(r.id as number);
                return (
                  <tr key={r.id} style={best.has(r.id) ? { background: "var(--accent-soft)" } : undefined}>
                    <td>
                      <Link href={`/rounds/${r.id}`}>{shortDate(r.date)}</Link>
                    </td>
                    <td className="small">
                      {round?.courseLabel} {round && round.holesCount <= 9 ? <span className="chip">9</span> : null}
                    </td>
                    <td className="num">{r.ags ?? "–"}</td>
                    <td className="num">
                      {r.adjustedDifferential != null ? fmtNum(r.adjustedDifferential) : <span className="small muted">{r.reason}</span>}
                      {r.differential9 != null && <div className="small muted">9h: {fmtNum(r.differential9)}</div>}
                      {r.exceptional > 0 && <div className="small muted">uitzonderlijk −{r.exceptional}</div>}
                    </td>
                    <td>{best.has(r.id) ? "✓ beste" : last20.has(r.id) ? "laatste 20" : ""}</td>
                    <td className="num">
                      {fmtIndex(r.indexAfter)}
                      {r.capped && <div className="small muted">{r.capped} cap</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Wat moet ik scoren?</h2>
        {!options.length ? (
          <p className="muted small">Leg eerst course rating en slope van een tee vast.</p>
        ) : (
          <>
            <form method="get" className="grid grid-md-3">
              <input type="hidden" name="tab" value="handicap" />
              <select name="wopt" defaultValue={wopt ? `${wopt.kind}:${wopt.id}` : ""} aria-label="Baan">
                {options.map((o) => (
                  <option key={`${o.kind}:${o.id}`} value={`${o.kind}:${o.id}`}>
                    {o.label} ({o.holesCount})
                  </option>
                ))}
              </select>
              <select name="wtee" defaultValue={wtee?.id} aria-label="Tee">
                {tees.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.gender === "f" ? "d" : "h"}) · CR {fmtNum(t.courseRating)} / {t.slope}
                  </option>
                ))}
              </select>
              <button className="btn">Berekenen</button>
            </form>
            {what && (
              <div style={{ marginTop: 12 }}>
                {what.currentIndex == null ? (
                  <p className="muted">Nog geen index om te verlagen.</p>
                ) : what.anyScore ? (
                  <div className="alert ok">Elke qualifying score op deze tee verlaagt je index (door de aanpassing bij weinig rondes).</div>
                ) : what.maxGross == null ? (
                  <div className="alert note">Op deze tee is een lagere index niet haalbaar met één ronde.</div>
                ) : (
                  <div className="alert ok">
                    Speel <strong>{what.maxGross} bruto of beter</strong> (ongeveer <strong>{what.minPoints} stablefordpunten</strong> of meer) om je index van{" "}
                    {fmtIndex(what.currentIndex)} naar {fmtIndex(what.newIndexAtMax)} of lager te krijgen. Course hcp {what.courseHandicap}, playing hcp {what.playingHandicap}.
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Strokes gained ----------

function StrokesGained({ rounds, baseline, q }: { rounds: LoadedRound[]; baseline: BaselineKey; q: (p: Partial<SP>) => string }) {
  const withShots = rounds.filter((r) => r.hasShots);
  const perRound = withShots.map((r) => {
    const hs = r.holes.filter((h) => h.shots.length);
    return { r, holes: hs.length, sg: sumByCategory(hs.flatMap((h) => holeStrokesGained(h.shots, h.par, baseline))) };
  });
  const cats = Object.keys(SG_LABELS) as SgCategory[];
  // gemiddelde per 18 holes met slaginvoer
  const totalHoles = perRound.reduce((a, p) => a + p.holes, 0);
  const avg = cats.map((c) => ({ label: SG_LABELS[c], value: totalHoles ? Math.round((perRound.reduce((a, p) => a + p.sg[c], 0) / totalHoles) * 18 * 100) / 100 : 0 }));
  const clubs = clubDistances(withShots.flatMap((r) => r.holes.map((h) => h.shots.map((s) => ({ ...s, club: s.club })))));
  const biggest = [...avg].sort((a, b) => a.value - b.value)[0];

  return (
    <div className="stack">
      <div className="card tight">
        <div className="table-wrap">
          <div className="seg">
            {(Object.keys(BASELINES) as BaselineKey[]).map((k) => (
              <Link key={k} href={q({ baseline: k })} className={k === baseline ? "on" : ""}>
                {BASELINES[k].label}
              </Link>
            ))}
          </div>
        </div>
        <p className="small muted" style={{ margin: "8px 0 0" }}>
          Referentieniveau: kies een niveau net boven het jouwe om te zien waar je het meest verliest.
        </p>
      </div>
      {!perRound.length ? (
        <div className="card muted">
          Nog geen rondes met slaginvoer. Open een ronde en kies <em>Slagen invoeren</em>.
        </div>
      ) : (
        <>
          <div className="card">
            <h2>Gemiddeld per 18 holes</h2>
            <p className="small muted">
              {perRound.length} rondes, {totalHoles} holes met slaginvoer.
              {biggest && biggest.value < 0 && (
                <>
                  {" "}
                  Grootste verbeterkans: <strong>{biggest.label}</strong>.
                </>
              )}
            </p>
            <DivergingBars rows={avg} />
          </div>
          <div className="card">
            <h2>Per ronde</h2>
            <div className="table-wrap">
              <table className="t">
                <thead>
                  <tr>
                    <th>Datum</th>
                    {cats.map((c) => (
                      <th key={c}>{SG_LABELS[c]}</th>
                    ))}
                    <th>Totaal</th>
                  </tr>
                </thead>
                <tbody>
                  {perRound.map(({ r, sg, holes }) => (
                    <tr key={r.id}>
                      <td>
                        <Link href={`/rounds/${r.id}`}>{shortDate(r.date)}</Link> <span className="small muted">{holes}h</span>
                      </td>
                      {cats.map((c) => (
                        <td key={c} className="num">
                          {fmtNum(sg[c], 2)}
                        </td>
                      ))}
                      <td className="num">
                        <strong>{fmtNum(sg.total, 2)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card">
            <h2>Clubs</h2>
            {clubs.length === 0 ? (
              <p className="muted small">Kies clubs bij de slaginvoer om afstanden te zien.</p>
            ) : (
              <table className="t">
                <thead>
                  <tr>
                    <th>Club</th>
                    <th>Gem. afstand</th>
                    <th>Spreiding (±)</th>
                    <th>Slagen</th>
                  </tr>
                </thead>
                <tbody>
                  {clubs.map((c) => (
                    <tr key={c.club}>
                      <td>{c.club}</td>
                      <td className="num">{c.avg} m</td>
                      <td className="num">{c.spread} m</td>
                      <td className="num muted">{c.shots}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

