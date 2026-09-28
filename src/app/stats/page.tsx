import Link from "next/link";
import Section from "@/components/Section";
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
import FilterBar from "@/components/FilterBar";
import Tip, { Term } from "@/components/Tip";

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
  approx?: string;
  wtee?: string;
  baseline?: string;
  recalc?: string;
};

const TABS = [
  ["overview", "Overzicht"],
  ["trends", "Trends"],
  ["patterns", "Patronen"],
  ["handicap", "Handicap"],
  ["sg", "Strokes gained"],
] as const;

const shortDate = (d: string) => fmtDate(d, { day: "numeric", month: "short" });
/** "Golfbaan Het Rijk van Sybrook – Noord" → "Noord (Het Rijk van Sybrook)" is te lang op mobiel: toon de lus, anders de naam. */
const shortCourse = (label?: string) => {
  if (!label) return "";
  const [club, loop] = label.split(" – ");
  return loop ? `${loop} · ${club.replace(/^Golf(baan|club)\s+/i, "")}` : label;
};

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
    const p = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([k, v]) => v && k !== "recalc") as [string, string][]);
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
        <FilterBar
          fields={[
            {
              name: "period",
              label: "Periode",
              options: [
                { value: "", label: "Alle rondes" },
                { value: "last20", label: "Laatste 20 rondes" },
                { value: "365", label: "Afgelopen jaar" },
                { value: "90", label: "Afgelopen 90 dagen" },
              ],
            },
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
            {
              name: "shots",
              label: "Slaginvoer",
              options: [
                { value: "", label: "Met en zonder" },
                { value: "with", label: "Met slaginvoer" },
                { value: "without", label: "Zonder slaginvoer" },
              ],
            },
          ]}
          toggle={{
            name: "norm",
            defaultValue: "per18",
            tip: "Per 18 holes: 9-holes rondes worden verdubbeld, zodat ze te vergelijken zijn met 18-holes rondes. Per hole: gedeeld door het aantal gespeelde holes. Percentages veranderen niet.",
            options: [
              { value: "per18", label: "Per 18 holes" },
              { value: "perHole", label: "Per hole" },
            ],
          }}
        />
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
        <Handicap all={all} user={user} sp={sp} q={q} />
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
      <Section id="stats-averages" title={`Gemiddelden · ${rounds.length} rondes`}>
        <p className="small muted" style={{ marginTop: -4 }}>
          Aantallen {norm === "perHole" ? "per hole" : "per 18 holes"}, percentages over alle holes.
        </p>
        <table className="t">
          <tbody>
            {rows.map(([k, u]) => (
              <tr key={k}>
                <td>
                  <Term k={k}>{STAT_LABELS[k]}</Term>
                </td>
                <td className="num">
                  {fmtNum(avg(k), norm === "perHole" ? 2 : 1)}
                  {u === "%" ? "%" : ""}
                </td>
              </tr>
            ))}
            <tr>
              <td>
                <Term k="puttsPerGir">Putts per GIR-hole</Term>
              </td>
              <td className="num">{fmtNum(puttsPerGir.length ? puttsPerGir.reduce((a, s) => a + (s.puttsPerGir ?? 0), 0) / puttsPerGir.length : null, 2)}</td>
            </tr>
          </tbody>
        </table>
      </Section>
      <Section id="stats-distribution" title="Scoreverdeling" tip="distribution">
        <DistributionBar dist={dist} />
        <h3 style={{ marginTop: 16 }}>
          <Term k="fairwayMiss">Gemiste fairways</Term>
        </h3>
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
      </Section>
      <Records rounds={rounds} />
    </div>
  );
}

function Records({ rounds }: { rounds: LoadedRound[] }) {
  const rec = records(rounds);
  if (!rec.length) return null;
  return (
    <Section id="stats-records" title="Persoonlijke records per baan" tip="records" wide>
      <ul className="list">
        {rec.map((r) => (
          <li key={r.courseLabel + r.holesCount} className="record-row">
            <div className="row between" style={{ marginBottom: 6 }}>
              <strong className="ellipsis">{shortCourse(r.courseLabel)}</strong>
              <span className="small muted">
                {r.rounds} rondes · {r.holesCount} holes
              </span>
            </div>
            <div className="grid grid-3 num">
              {(
                [
                  ["Beste score", r.bestGross],
                  ["Meeste punten", r.mostPoints],
                  ["Minste putts", r.fewestPutts],
                ] as const
              ).map(([label, x]) => (
                <div key={label}>
                  <div className="small muted">{label}</div>
                  {x ? (
                    <Link href={`/rounds/${x.roundId}`}>
                      <strong>{x.value}</strong> <span className="small muted">{shortDate(x.date)}</span>
                    </Link>
                  ) : (
                    "–"
                  )}
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ---------- Trends ----------

function Trends({ rounds, norm, stat, q }: { rounds: LoadedRound[]; norm: Normalize; stat: StatKey; q: (p: Partial<SP>) => string }) {
  const key = (Object.keys(STAT_LABELS) as StatKey[]).includes(stat) ? stat : "gross";
  const t = trend(rounds, key, norm, 5);
  return (
    <Section id="stats-trend" title={STAT_LABELS[key]} tip={key}>
      <div className="table-wrap" style={{ marginBottom: 12 }}>
        <div className="seg">
          {(Object.keys(STAT_LABELS) as StatKey[]).map((k) => (
            <Link key={k} href={q({ stat: k })} className={k === key ? "on" : ""}>
              {STAT_LABELS[k]}
            </Link>
          ))}
        </div>
      </div>
      <p className="small muted">
        Per ronde {key.endsWith("Pct") ? "" : norm === "perHole" ? "(per hole)" : "(genormaliseerd naar 18 holes)"}, met voortschrijdend gemiddelde over 5 rondes <Tip k="rolling" label="Voortschrijdend gemiddelde" />.
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
    </Section>
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
      <Section id="stats-partype" title="Scoring per par-type" tip="parType">
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
        <h3 style={{ marginTop: 16 }}>
          <Term k="hardEasy">Moeilijke vs makkelijke holes</Term>
        </h3>
        <p className="small">
          Laagste SI's (bij 18 holes SI 1–6): <strong>{sg.hard != null ? fmtSigned(sg.hard) : "–"}</strong> · overige: <strong>{sg.easy != null ? fmtSigned(sg.easy) : "–"}</strong> t.o.v. par
        </p>
        {fb && (
          <>
            <h3>
              <Term k="frontBack">Voor- en tweede negen</Term>
            </h3>
            <p className="small">
              Gemiddeld {fmtNum(fb.front)} uit, {fmtNum(fb.back)} in ({fmtSigned(fb.diff)}) over {fb.rounds} rondes van 18 holes.
            </p>
          </>
        )}
        {pi && (
          <>
            <h3>
              <Term k="threePutts">Putten</Term>
            </h3>
            <p className="small">
              {fmtNum(pi.threePerRound)} 3-putts per ronde · kans op 3-putt na GIR: {pi.afterGirPct != null ? `${fmtNum(pi.afterGirPct)}%` : "–"} ({pi.girHoles} GIR-holes)
            </p>
          </>
        )}
      </Section>

      <Section id="stats-blowups" title="Grote uitschieters" tip="blowUps">
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
                  <th>
                    <Term k="penalties">Straf</Term>
                  </th>
                  <th>
                    <Term text="Fairway: raak, of de kant waar je de fairway miste.">FW</Term>
                  </th>
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
      </Section>

      <Section id="stats-perhole" title="Per baan en per hole" tip="perHole" wide>
        <div className="row between">
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
                  <th>
                    <Term k="points">Gem. punten</Term>
                  </th>
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
      </Section>
    </div>
  );
}

// ---------- Handicap ----------

async function Handicap({ all, user, sp, q }: { all: LoadedRound[]; user: Awaited<ReturnType<typeof requireUser>>; sp: SP; q: (p: Partial<SP>) => string }) {
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
  // "Wat als alle rondes qualifying waren?" — optioneel met benaderde rating/slope waar die ontbreekt
  const approx = sp.approx === "1";
  const fill = (xs: ReturnType<typeof whsInputs>) =>
    approx ? xs.map((r) => ({ ...r, courseRating: r.courseRating ?? r.par, slope: r.slope ?? 113 })) : xs;
  const actualCmp = computeWhs(fill(whsInputs(all)), userStartIndex(user));
  const allQ = computeWhs(fill(whsInputs(all).map((r) => ({ ...r, qualifying: true }))), userStartIndex(user));
  const nonQualifying = all.filter((r) => !r.qualifying).length;
  const missingRating = all.filter((r) => r.courseRating == null || r.slope == null).length;
  const cmpPoints = allQ.rounds
    .filter((r) => r.indexAfter != null)
    .map((r) => ({
      label: shortDate(r.date),
      value: r.indexAfter,
      rolling: actualCmp.rounds.find((a) => a.id === r.id)?.indexAfter ?? null,
      href: `/rounds/${r.id}`,
    }));

  const what = wtee
    ? whatToScore(whsInputs(all), { courseRating: wtee.courseRating!, slope: wtee.slope!, par: wtee.par, holesCount: wopt!.holesCount }, userStartIndex(user), user.allowance)
    : null;

  return (
    <div className="stack">
      <div className="grid grid-2 grid-md-3">
        <div className="kpi">
          <div className="label">
            <Term k="index">Index (indicatief, WHS)</Term>
          </div>
          <div className="value">{fmtIndex(whs.index)}</div>
        </div>
        <div className="kpi">
          <div className="label">
            <Term k="official">NGF officieel</Term>
          </div>
          <div className="value">{fmtIndex(official)}</div>
          {official != null && whs.index != null && <div className="small muted">verschil {fmtNum(whs.index - official)}</div>}
        </div>
        <div className="kpi">
          <div className="label">
            <Term k="lowIndex">Laagste index 12 mnd</Term>
          </div>
          <div className="value">{fmtIndex(whs.lowIndex)}</div>
        </div>
      </div>

      {sp.recalc && <div className="alert ok">Index, course en playing handicap en punten van alle rondes zijn opnieuw berekend.</div>}
      {user.role !== "viewer" && (
        <form action="/api/admin/recalc" method="post" className="row">
          <input type="hidden" name="back" value="/stats?tab=handicap" />
          <button className="btn">Handicap herberekenen</button>
          <Tip k="recalc" label="Handicap herberekenen" />
        </form>
      )}

      <Section
        id="hcp-allq"
        title="Als alle rondes qualifying waren"
        tip="allQualifying"
        aside={allQ.index != null ? fmtIndex(allQ.index) : undefined}
      >
        <p className="small muted">
          {nonQualifying === 0
            ? "Al je rondes staan nu als qualifying, dus deze index is gelijk aan je werkelijke index."
            : `${nonQualifying} van je ${all.length} rondes ${nonQualifying === 1 ? "is" : "zijn"} niet qualifying. Hier tellen ze wel mee.`}
        </p>
        <div className="grid grid-2" style={{ marginBottom: 12 }}>
          <div className="kpi">
            <div className="label">Werkelijk</div>
            <div className="value">{fmtIndex(actualCmp.index)}</div>
            <div className="small muted">{actualCmp.rounds.filter((r) => r.counted).length} rondes tellen</div>
          </div>
          <div className="kpi">
            <div className="label">Alles qualifying</div>
            <div className="value">{fmtIndex(allQ.index)}</div>
            <div className="small muted">
              {allQ.rounds.filter((r) => r.counted).length} rondes tellen
              {allQ.index != null && actualCmp.index != null && allQ.index !== actualCmp.index ? ` · ${allQ.index < actualCmp.index ? "−" : "+"}${fmtNum(Math.abs(allQ.index - actualCmp.index))}` : ""}
            </div>
          </div>
        </div>
        {missingRating > 0 && (
          <div className={`alert ${approx ? "yellow" : "note"}`}>
            {approx
              ? `Benaderd: bij ${missingRating} rondes ontbreken course rating en slope; daar is gerekend met slope 113 en rating = par. Alleen een indicatie.`
              : `Bij ${missingRating} rondes ontbreken course rating en slope, daardoor tellen ze nergens mee.`}{" "}
            <Link href={q({ approx: approx ? undefined : "1" })}>{approx ? "Benadering uitzetten" : "Ontbrekende rating/slope benaderen"}</Link>
          </div>
        )}
        {cmpPoints.length > 1 && allQ.rounds.some((r) => r.counted) ? (
          <LineChart points={cmpPoints} valueLabel="Alles qualifying" rollingLabel="Werkelijk" invert />
        ) : (
          allQ.index == null && <p className="small muted">Nog te weinig rondes met rating en slope voor een index (minimaal 3).</p>
        )}
      </Section>

      <Section id="hcp-trend" title="Verloop" tip="index">
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
      </Section>

      <Section id="hcp-diffs" title="Score differentials" tip="differential">
        <p className="small muted">
          {whs.best.length
            ? `De laatste 20 tellen; de beste ${whs.best.length} bepalen de index (groen). PCC staat standaard op 0.`
            : "Nog geen differentials: daarvoor zijn qualifying rondes met course rating en slope nodig."}
        </p>
        <p className="small muted row" style={{ gap: 12 }}>
          <Term k="ags">AGS</Term>
          <Term k="nineHole">9h</Term>
          <Term k="exceptional">uitzonderlijk</Term>
          <Term k="best">beste</Term>
          <Term k="cap">cap</Term>
          <Term k="pcc">PCC</Term>
        </p>
        <ul className="list">
          {[...whs.rounds].reverse().slice(0, 30).map((r) => {
            const round = byId.get(r.id as number);
            const status = best.has(r.id) ? "beste" : last20.has(r.id) ? "laatste 20" : null;
            return (
              <li key={r.id} className={best.has(r.id) ? "diff-row best" : "diff-row"}>
                <Link className="item" href={`/rounds/${r.id}`}>
                  <div className="round-item-main">
                    <strong>
                      {shortDate(r.date)} · {round?.courseLabel.split(" – ")[1] ?? shortCourse(round?.courseLabel)}
                    </strong>
                    <div className="small muted">
                      {r.counted
                        ? [`AGS ${r.ags}`, r.differential9 != null ? `9h ${fmtNum(r.differential9)}` : null, r.exceptional > 0 ? `uitzonderlijk −${r.exceptional}` : null, status]
                            .filter(Boolean)
                            .join(" · ")
                        : r.reason === "Niet qualifying"
                          ? "niet qualifying"
                          : "geen rating/slope"}
                    </div>
                  </div>
                  <div className="round-item-score num">
                    <strong>{r.adjustedDifferential != null ? fmtNum(r.adjustedDifferential) : "–"}</strong>
                    <div className="small muted">
                      index {fmtIndex(r.indexAfter)}
                      {r.capped ? ` (${r.capped} cap)` : ""}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section id="hcp-whatif" title="Wat moet ik scoren?" tip="whatToScore">
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
                    {fmtIndex(what.currentIndex)} naar {fmtIndex(what.newIndexAtMax)} of lager te krijgen. <Term k="ch">Course hcp</Term> {what.courseHandicap}, <Term k="ph">playing hcp</Term> {what.playingHandicap}.
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </Section>
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
          <Term k="sg">Strokes gained</Term> · <Term k="baseline">Referentieniveau</Term>: kies een niveau net boven het jouwe om te zien waar je het meest verliest.
        </p>
      </div>
      {!perRound.length ? (
        <div className="card muted">
          Nog geen rondes met slaginvoer. Open een ronde en kies <em>Slagen invoeren</em>.
        </div>
      ) : (
        <>
          <Section id="sg-avg" title="Gemiddeld per 18 holes" tip="sg">
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
          </Section>
          <Section id="sg-rounds" title="Per ronde">
            <div className="table-wrap">
              <table className="t">
                <thead>
                  <tr>
                    <th>Datum</th>
                    {cats.map((c) => (
                      <th key={c}>
                        <Term k={c}>{SG_LABELS[c]}</Term>
                      </th>
                    ))}
                    <th>
                      <Term k="sgTotal">Totaal</Term>
                    </th>
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
          </Section>
          <Section id="sg-clubs" title="Clubs" tip="clubDistance">
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
          </Section>
        </>
      )}
    </div>
  );
}

