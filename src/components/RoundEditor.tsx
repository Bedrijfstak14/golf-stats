"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { runChecks, fairwayStats, girStats, type CheckIssue } from "@/lib/golf/checks";
import { scoreHoles, suggestGir } from "@/lib/golf/stableford";
import { handicapForRound } from "@/lib/golf/whs";
import { aiCardToDraft, type AiCard } from "@/lib/golf/aiDraft";
import { FAIRWAY_LABELS, type CourseHoleRef, type DraftHole, type Fairway, type RoundDraft } from "@/lib/golf/types";
import { sendJson } from "./offline";

/** Serialiseerbare versie van CourseOption (lib/courses) */
export interface EditorCourseOption {
  kind: "loop" | "combination";
  id: number;
  clubId: number;
  clubName: string;
  name: string;
  label: string;
  holesCount: number;
  holes: CourseHoleRef[];
  tees: { id: number; name: string; gender: string; courseRating: number | null; slope: number | null; par: number; lengths: number[]; validFrom: string }[];
}

type Mode = "import" | "manual" | "edit";
type CourseAction = "none" | "create" | "update";

const FW_ORDER: Fairway[] = ["hit", "left", "right", "short", "long"];

function teesOnDate(all: EditorCourseOption["tees"], date: string) {
  const map = new Map<string, EditorCourseOption["tees"][number]>();
  for (const t of [...all].sort((a, b) => a.validFrom.localeCompare(b.validFrom))) if (t.validFrom <= date) map.set(`${t.name}|${t.gender}`, t);
  for (const t of all) if (!map.has(`${t.name}|${t.gender}`)) map.set(`${t.name}|${t.gender}`, t);
  return [...map.values()];
}

const keyOf = (o: { kind: string; id: number }) => `${o.kind}:${o.id}`;

function emptyHoles(n: number): DraftHole[] {
  return Array.from({ length: n }, (_, i) => ({ number: i + 1, par: 4, si: i + 1, length: null, strokes: null, putts: null, fairway: null, gir: null, penalties: 0, bunker: 0 }));
}

export default function RoundEditor(props: {
  mode: Mode;
  initialDraft: RoundDraft;
  options: EditorCourseOption[];
  importId?: number;
  roundId?: number;
  images?: string[];
  card?: AiCard | null;
  allowance: number;
  currentIndex: number | null;
}) {
  const { mode, options } = props;
  const router = useRouter();
  const [draft, setDraft] = useState<RoundDraft>(props.initialDraft);
  const [girManual, setGirManual] = useState<Set<number>>(() => new Set(mode === "manual" ? [] : props.initialDraft.holes.map((_, i) => i)));
  const [playerIdx, setPlayerIdx] = useState(0);
  const initialKey = draft.combinationId ? `combination:${draft.combinationId}` : draft.loopId ? `loop:${draft.loopId}` : "";
  const [courseKey, setCourseKey] = useState(initialKey);
  const [courseAction, setCourseAction] = useState<CourseAction>(!initialKey && mode === "import" ? "create" : "none");
  const [ack, setAck] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "red" | "ok"; text: string } | null>(null);

  const opt = options.find((o) => keyOf(o) === courseKey) ?? null;
  const validTees = opt ? teesOnDate(opt.tees, draft.date) : [];
  const tee = opt ? (validTees.find((t) => t.id === draft.teeId) ?? null) : null;
  const courseHoles: CourseHoleRef[] | null = opt ? opt.holes.map((h, i) => ({ ...h, length: tee?.lengths[i] ?? null })) : null;

  // Handicap altijd uit de eigen database: index op de datum → course/playing handicap van de tee
  const parTotal = draft.holes.reduce((a, h) => a + h.par, 0);
  const appHcp =
    props.currentIndex != null
      ? handicapForRound(props.currentIndex, { courseRating: draft.courseRating ?? null, slope: draft.slope ?? null, par: parTotal }, draft.holesCount, props.allowance)
      : null;
  const appPh = appHcp?.playingHandicap ?? null;
  const scored = useMemo(() => scoreHoles(draft.holes, appPh), [draft.holes, appPh]);
  const issues = useMemo(() => {
    // Import: kaartpunten controleren tegen de P.HCP op de kaart (leesfouten opsporen).
    // Handmatig/bewerken: punten komen uit de eigen berekening.
    const d =
      mode === "import"
        ? draft
        : { ...draft, playingHandicap: appPh, holes: draft.holes.map((h, i) => ({ ...h, points: h.strokes == null ? null : scored[i].points })) };
    return runChecks(d, courseHoles);
  }, [draft, courseHoles, scored, mode, appPh]);

  const byField = useMemo(() => {
    const m = new Map<string, CheckIssue["severity"]>();
    for (const i of issues) if (i.field && (m.get(i.field) !== "red" || i.severity === "red")) m.set(i.field, i.severity);
    return m;
  }, [issues]);
  const cls = (field: string) => {
    const s = byField.get(field);
    return s === "red" ? "bad" : s === "yellow" ? "unsure" : "";
  };
  const red = issues.filter((i) => i.severity === "red");
  const yellow = issues.filter((i) => i.severity === "yellow");
  const notes = issues.filter((i) => i.severity === "note" && i.code !== "course");
  const courseIssues = issues.filter((i) => i.code === "course");

  // ---------- updates ----------
  const touch = (field: string) => setDraft((d) => (d.lowConfidence?.includes(field) ? { ...d, lowConfidence: d.lowConfidence.filter((f) => f !== field) } : d));

  const set = <K extends keyof RoundDraft>(k: K, v: RoundDraft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    touch(String(k));
  };

  function setHole(i: number, patch: Partial<DraftHole>) {
    setDraft((d) => {
      const holes = d.holes.map((h, j) => {
        if (j !== i) return h;
        const next = { ...h, ...patch };
        if (next.par === 3) next.fairway = "na";
        else if (next.fairway === "na") next.fairway = null;
        if (!girManual.has(i) && ("strokes" in patch || "putts" in patch || "par" in patch)) next.gir = suggestGir(next.par, next.strokes, next.putts);
        return next;
      });
      const lowConfidence = (d.lowConfidence ?? []).filter((f) => !Object.keys(patch).some((k) => f === `holes.${i}.${k}`));
      return { ...d, holes, lowConfidence };
    });
  }

  function chooseCourse(key: string) {
    setCourseKey(key);
    if (key === "") {
      setDraft((d) => ({ ...d, clubId: null, loopId: null, combinationId: null, teeId: null }));
      setCourseAction(mode === "import" ? "create" : "none");
      return;
    }
    setCourseAction("none");
    const o = options.find((x) => keyOf(x) === key)!;
    const tees = teesOnDate(o.tees, draft.date);
    const t = tees.find((x) => x.name.toLowerCase() === draft.teeName.toLowerCase() && x.gender === draft.teeGender) ?? tees.find((x) => x.gender === draft.teeGender) ?? tees[0] ?? null;
    setDraft((d) => {
      let next: RoundDraft = {
        ...d,
        clubId: o.clubId,
        loopId: o.kind === "loop" ? o.id : null,
        combinationId: o.kind === "combination" ? o.id : null,
        clubName: o.clubName,
        loopName: o.name,
        teeId: t?.id ?? null,
        teeName: t?.name ?? d.teeName,
        teeGender: (t?.gender as "m" | "f") ?? d.teeGender,
        courseRating: t?.courseRating ?? null,
        slope: t?.slope ?? null,
      };
      if (mode !== "import") {
        const old = d.holes;
        next.holesCount = o.holesCount;
        next.holes = o.holes.map((h, i) => ({
          ...(old[i] ?? emptyHoles(o.holesCount)[i]),
          number: i + 1,
          par: h.par,
          si: h.si,
          length: t?.lengths[i] ?? null,
          fairway: h.par === 3 ? "na" : (old[i]?.fairway ?? null),
        }));
      }
      return next;
    });
  }

  function chooseTee(id: number) {
    const t = validTees.find((x) => x.id === id) ?? null;
    setDraft((d) => {
      let next: RoundDraft = { ...d, teeId: t?.id ?? null, teeName: t?.name ?? d.teeName, teeGender: (t?.gender as "m" | "f") ?? d.teeGender, courseRating: t?.courseRating ?? null, slope: t?.slope ?? null };
      if (t && mode !== "import") next.holes = next.holes.map((h, i) => ({ ...h, length: t.lengths[i] ?? h.length }));
      return next;
    });
  }

  function applyCourseData() {
    if (!courseHoles) return;
    setDraft((d) => ({
      ...d,
      holes: d.holes.map((h, i) => ({ ...h, par: courseHoles[i]?.par ?? h.par, si: courseHoles[i]?.si ?? h.si, length: courseHoles[i]?.length ?? h.length })),
    }));
    setCourseAction("none");
  }

  function useComputedPoints() {
    setDraft((d) => ({ ...d, holes: d.holes.map((h, i) => ({ ...h, points: h.strokes == null ? null : scored[i].points })) }));
  }

  function switchPlayer(idx: number) {
    if (!props.card) return;
    setPlayerIdx(idx);
    const next = aiCardToDraft(props.card, idx, draft.source);
    setDraft((d) => ({ ...next, clubId: d.clubId, loopId: d.loopId, combinationId: d.combinationId, teeId: d.teeId, courseRating: d.courseRating, slope: d.slope, handicapIndex: next.handicapIndex ?? d.handicapIndex }));
  }

  function setHolesCount(n: number) {
    setDraft((d) => ({ ...d, holesCount: n, holes: emptyHoles(n).map((h, i) => d.holes[i] ?? h) }));
    setCourseKey("");
  }

  // ---------- opslaan ----------
  async function save() {
    setSaving(true);
    setMessage(null);
    const final: RoundDraft = {
      ...draft,
      holes: draft.holes.map((h, i) => ({ ...h, points: h.strokes == null ? null : scored[i].points })),
    };
    const url = props.roundId ? `/api/rounds/${props.roundId}` : "/api/rounds";
    const res = await sendJson(url, props.roundId ? "PUT" : "POST", { draft: final, importId: props.importId, courseAction });
    setSaving(false);
    if (res.ok) {
      router.push(`/rounds/${res.data.id}`);
      router.refresh();
    } else if ("queued" in res) {
      setMessage({ kind: "ok", text: "Geen verbinding: de ronde staat in de wachtrij en wordt opgeslagen zodra er netwerk is." });
    } else setMessage({ kind: "red", text: res.error });
  }

  const totals = {
    strokes: draft.holes.reduce((a, h) => a + (h.strokes ?? 0), 0),
    points: scored.reduce((a, s, i) => a + (draft.holes[i].strokes == null ? 0 : s.points), 0),
    putts: draft.holes.reduce((a, h) => a + (h.putts ?? 0), 0),
    par: draft.holes.reduce((a, h) => a + h.par, 0),
    fw: fairwayStats(draft),
    gir: girStats(draft),
  };
  const canSave = draft.holes.some((h) => h.strokes != null) && (!red.length || ack) && !!draft.date;
  const cardPointsDiffer = mode === "import" && issues.some((i) => i.code === "stableford");

  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

  return (
    <div className={`review-layout ${props.images?.length ? "with-image" : ""}`}>
      {props.images?.length ? (
        <div className="image-pane">
          {props.images.map((src) => (
            <a key={src} href={`/api/uploads/${src}`} target="_blank" rel="noreferrer">
              <img src={`/api/uploads/${src}`} alt="Originele scorekaart" style={{ marginBottom: 8 }} />
            </a>
          ))}
        </div>
      ) : null}

      <div>
        {/* Controles */}
        <div className="card tight" aria-live="polite">
          {red.length === 0 && yellow.length === 0 ? (
            <div className="alert ok">Alle controles in orde.</div>
          ) : (
            <>
              {red.map((i, k) => (
                <div key={`r${k}`} className="alert red">
                  {i.message}
                </div>
              ))}
              {yellow.map((i, k) => (
                <div key={`y${k}`} className="alert yellow">
                  {i.message}
                </div>
              ))}
            </>
          )}
          {notes.map((i, k) => (
            <div key={`n${k}`} className="alert note">
              {i.message}
            </div>
          ))}
          {cardPointsDiffer && (
            <button type="button" className="btn sm" onClick={useComputedPoints}>
              Berekende punten overnemen
            </button>
          )}
        </div>

        {/* Ronde-gegevens */}
        <div className="card">
          {props.card && props.card.players.length > 1 && (
            <label className="field">
              <span>Welke speler ben jij?</span>
              <select value={playerIdx} onChange={(e) => switchPlayer(Number(e.target.value))}>
                {props.card.players.map((p, i) => (
                  <option key={i} value={i}>
                    {p.name ?? `Speler ${i + 1}`}
                    {p.playingHandicap != null ? ` (P.HCP ${p.playingHandicap})` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="grid grid-2 grid-md-3">
            <label className={`field ${cls("date")}`}>
              <span>Datum</span>
              <input type="date" value={draft.date} onChange={(e) => set("date", e.target.value)} />
            </label>
            {mode === "manual" && (
              <label className="field">
                <span>Holes</span>
                <select value={draft.holesCount} onChange={(e) => setHolesCount(Number(e.target.value))}>
                  <option value={9}>9 holes</option>
                  <option value={18}>18 holes</option>
                </select>
              </label>
            )}
            <label className="field">
              <span>Speelvorm</span>
              <select value={draft.format} onChange={(e) => set("format", e.target.value as RoundDraft["format"])}>
                <option value="stableford">Stableford</option>
                <option value="stroke">Strokeplay</option>
              </select>
            </label>
          </div>

          <label className="field">
            <span>Baan ({draft.holesCount} holes)</span>
            <select value={courseKey} onChange={(e) => chooseCourse(e.target.value)}>
              <option value="">{mode === "import" ? `Onbekend: ${[draft.clubName, draft.loopName].filter(Boolean).join(" – ") || "?"}` : "Kies een baan…"}</option>
              {options
                .filter((o) => o.holesCount === draft.holesCount)
                .map((o) => (
                  <option key={keyOf(o)} value={keyOf(o)}>
                    {o.label}
                  </option>
                ))}
            </select>
          </label>

          {!opt && (
            <>
              <div className="grid grid-2">
                <label className={`field ${cls("clubName")}`}>
                  <span>Club</span>
                  <input value={draft.clubName} onChange={(e) => set("clubName", e.target.value)} />
                </label>
                <label className="field">
                  <span>Lus</span>
                  <input value={draft.loopName} onChange={(e) => set("loopName", e.target.value)} />
                </label>
              </div>
              {(mode === "import" || mode === "manual") && (
                <label className="row small" style={{ marginBottom: 12 }}>
                  <input type="checkbox" checked={courseAction === "create"} onChange={(e) => setCourseAction(e.target.checked ? "create" : "none")} />
                  Als nieuwe baan opslaan (par, SI en lengtes van deze kaart)
                </label>
              )}
            </>
          )}

          <div className="grid grid-2 grid-md-3">
            {opt && validTees.length > 0 ? (
              <label className="field">
                <span>Tee</span>
                <select value={draft.teeId ?? ""} onChange={(e) => chooseTee(Number(e.target.value))}>
                  <option value="">–</option>
                  {validTees.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.gender === "f" ? "d" : "h"}) · {t.lengths.reduce((a, b) => a + b, 0)} m
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <label className="field">
                  <span>Tee</span>
                  <input value={draft.teeName} onChange={(e) => set("teeName", e.target.value)} />
                </label>
                <label className="field">
                  <span>Geslacht tee</span>
                  <select value={draft.teeGender} onChange={(e) => set("teeGender", e.target.value as "m" | "f")}>
                    <option value="m">Heren</option>
                    <option value="f">Dames</option>
                  </select>
                </label>
              </>
            )}
            <label className="field">
              <span>Course rating</span>
              <input inputMode="decimal" value={draft.courseRating ?? ""} onChange={(e) => set("courseRating", num(e.target.value))} placeholder="bijv. 35,4" />
            </label>
            <label className="field">
              <span>Slope</span>
              <input inputMode="numeric" value={draft.slope ?? ""} onChange={(e) => set("slope", num(e.target.value))} placeholder="bijv. 128" />
            </label>
          </div>

          <div className="grid grid-2 grid-md-3" style={{ marginBottom: 8 }}>
            <div className="kpi">
              <div className="label">Index (eigen database)</div>
              <div className="value">{props.currentIndex != null ? props.currentIndex.toLocaleString("nl-NL") : "–"}</div>
            </div>
            <div className="kpi">
              <div className="label">Course / playing hcp</div>
              <div className="value">
                {appHcp ? `${appHcp.courseHandicap} / ${appHcp.playingHandicap}` : "–"}
              </div>
            </div>
            {mode === "import" && (
              <label className={`field ${cls("playingHandicap")}`}>
                <span>P.HCP op kaart (alleen ter controle)</span>
                <input inputMode="numeric" value={draft.playingHandicap ?? ""} onChange={(e) => set("playingHandicap", num(e.target.value))} />
              </label>
            )}
          </div>
          <p className="small muted">
            Ontvangen slagen en punten rekent de app zelf uit met de handicap uit de database, niet met die van de kaart.
            {props.currentIndex == null && " Vul je officiële of startindex in bij Instellingen."}
            {appHcp?.approximate && " Course rating en slope ontbreken: benaderd met slope 113 en rating = par. Vul ze in bij Banen, dan wordt alles herberekend."}
          </p>

          <details>
            <summary className="small muted">Meer: qualifying, PCC, notitie</summary>
            <div className="grid grid-2" style={{ marginTop: 8 }}>
              <label className="row">
                <input type="checkbox" checked={draft.qualifying ?? true} onChange={(e) => set("qualifying", e.target.checked)} /> Qualifying (telt voor WHS)
              </label>
              <label className="field">
                <span>PCC</span>
                <input inputMode="numeric" value={draft.pcc ?? 0} onChange={(e) => set("pcc", Number(e.target.value) || 0)} />
              </label>
            </div>
            <label className="field">
              <span>Notitie</span>
              <textarea rows={2} value={draft.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
            </label>
          </details>
        </div>

        {/* Baandata wijkt af */}
        {courseIssues.length > 0 && (
          <div className="card tight">
            <h3>Baandata wijkt af van de opgeslagen baan</h3>
            {courseIssues.map((i, k) => (
              <div key={k} className="small muted">
                {i.message}
              </div>
            ))}
            <div className="row" style={{ marginTop: 8 }}>
              <button type="button" className="btn sm" onClick={applyCourseData}>
                Ronde corrigeren naar baandata
              </button>
              <label className="row small">
                <input type="checkbox" checked={courseAction === "update"} onChange={(e) => setCourseAction(e.target.checked ? "update" : "none")} />
                Baan bijwerken met de kaart
              </label>
            </div>
          </div>
        )}

        {/* Holes */}
        <div className="grid grid-md-2">
          {draft.holes.map((h, i) => {
            const f = (k: string) => cls(`holes.${i}.${k}`);
            const bad = [...byField.entries()].some(([k, s]) => k.startsWith(`holes.${i}.`) && s === "red");
            return (
              <div key={i} className={`hole-card ${bad ? "bad" : ""}`}>
                <div className="row between" style={{ marginBottom: 8 }}>
                  <strong>Hole {h.number}</strong>
                  <span className="small muted">
                    {scored[i].received > 0 ? `${scored[i].received} slag${scored[i].received > 1 ? "en" : ""} mee` : scored[i].received < 0 ? `${-scored[i].received} terug` : "geen slag"}
                    {h.strokes != null && ` · ${scored[i].points} pt`}
                  </span>
                </div>
                <div className="f-grid" style={{ marginBottom: 8 }}>
                  <label className={f("par")}>
                    <span>Par</span>
                    <select value={h.par} onChange={(e) => setHole(i, { par: Number(e.target.value) })}>
                      {[3, 4, 5, 6].map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </label>
                  <label className={f("si")}>
                    <span>SI</span>
                    <input inputMode="numeric" value={h.si} onChange={(e) => setHole(i, { si: Number(e.target.value) || 0 })} />
                  </label>
                  <label className={f("length")}>
                    <span>Lengte</span>
                    <input inputMode="numeric" value={h.length ?? ""} onChange={(e) => setHole(i, { length: num(e.target.value) })} />
                  </label>
                </div>
                <div className="f-grid">
                  <Stepper label="Slagen" className={f("strokes")} value={h.strokes} onChange={(v) => setHole(i, { strokes: v })} min={1} start={h.par} />
                  <Stepper label="Putts" className={f("putts")} value={h.putts ?? null} onChange={(v) => setHole(i, { putts: v })} min={0} start={2} />
                  {mode === "import" ? (
                    <label className={f("points")}>
                      <span>Punten kaart</span>
                      <input inputMode="numeric" value={h.points ?? ""} onChange={(e) => setHole(i, { points: num(e.target.value) })} />
                    </label>
                  ) : (
                    <label>
                      <span>Punten</span>
                      <input readOnly value={h.strokes == null ? "" : scored[i].points} tabIndex={-1} />
                    </label>
                  )}
                </div>
                {h.par >= 4 && (
                  <div className={f("fairway")} style={{ marginTop: 8 }}>
                    <div className="fw-buttons" role="group" aria-label="Fairway">
                      {FW_ORDER.map((fw) => (
                        <button type="button" key={fw} className={h.fairway === fw ? "on" : ""} onClick={() => setHole(i, { fairway: h.fairway === fw ? null : fw })}>
                          {FAIRWAY_LABELS[fw]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="f-grid" style={{ marginTop: 8 }}>
                  <label className={`${f("gir")} row`} style={{ alignSelf: "end", minHeight: 44 }}>
                    <input
                      type="checkbox"
                      checked={!!h.gir}
                      onChange={(e) => {
                        setGirManual((s) => new Set(s).add(i));
                        setHole(i, { gir: e.target.checked });
                      }}
                    />
                    GIR
                  </label>
                  <Stepper label="Straf" className={f("penalties")} value={h.penalties ?? 0} onChange={(v) => setHole(i, { penalties: v ?? 0 })} min={0} start={0} />
                  <Stepper label="Bunker" className={f("bunker")} value={h.bunker ?? 0} onChange={(v) => setHole(i, { bunker: v ?? 0 })} min={0} start={0} />
                </div>
                {f("shots") && <div className="alert red small" style={{ marginTop: 8 }}>Slagenreeks klopt niet met score/putts</div>}
              </div>
            );
          })}
        </div>

        {/* Totalen */}
        <div className="card">
          <h2>Totaal</h2>
          <div className="grid grid-3 num">
            <div>
              <div className="small muted">Slagen</div>
              <strong>{totals.strokes}</strong> <span className="small muted">(par {totals.par})</span>
            </div>
            <div>
              <div className="small muted">Punten</div>
              <strong>{totals.points}</strong>
            </div>
            <div>
              <div className="small muted">Putts</div>
              <strong>{totals.putts}</strong>
            </div>
            <div>
              <div className="small muted">Fairways</div>
              <strong>
                {totals.fw.hits}/{totals.fw.of}
              </strong>{" "}
              <span className="small muted">{totals.fw.pct ?? "–"}%</span>
            </div>
            <div>
              <div className="small muted">GIR</div>
              <strong>
                {totals.gir.hits}/{totals.gir.of}
              </strong>{" "}
              <span className="small muted">{totals.gir.pct ?? "–"}%</span>
            </div>
          </div>
          {mode === "import" && draft.totals && (
            <details style={{ marginTop: 12 }}>
              <summary className="small muted">TOT-kolom zoals gelezen (aanpasbaar)</summary>
              <div className="grid grid-3" style={{ marginTop: 8 }}>
                {(
                  [
                    ["strokes", "Slagen"],
                    ["points", "Punten"],
                    ["putts", "Putts"],
                    ["par", "Par"],
                    ["length", "Lengte"],
                    ["fairwayPct", "FW %"],
                    ["girPct", "GIR %"],
                    ["penalties", "Straf"],
                    ["bunker", "Bunker"],
                  ] as const
                ).map(([k, label]) => (
                  <label key={k} className={`field ${cls(`totals.${k}`)}`}>
                    <span>{label}</span>
                    <input
                      inputMode="numeric"
                      value={draft.totals?.[k] ?? ""}
                      onChange={(e) => {
                        setDraft((d) => ({ ...d, totals: { ...d.totals, [k]: num(e.target.value) } }));
                        touch(`totals.${k}`);
                      }}
                    />
                  </label>
                ))}
              </div>
            </details>
          )}
        </div>

        <div className="card">
          {red.length > 0 && (
            <label className="row" style={{ marginBottom: 12 }}>
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              Ik heb de rode afwijkingen gezien en wil toch opslaan
            </label>
          )}
          {message && <div className={`alert ${message.kind}`}>{message.text}</div>}
          <button className="btn primary block" disabled={!canSave || saving} onClick={save}>
            {saving ? "Opslaan…" : props.roundId ? "Wijzigingen opslaan" : "Akkoord, ronde opslaan"}
          </button>
          <p className="small muted" style={{ marginTop: 8, marginBottom: 0 }}>
            Bij opslaan rekent de app handicap, ontvangen slagen en punten opnieuw uit met de index uit de database.
          </p>
        </div>
      </div>
    </div>
  );
}

function Stepper({
  label,
  value,
  onChange,
  min = 0,
  start,
  className,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  start: number;
  className?: string;
}) {
  return (
    <label className={className}>
      <span>{label}</span>
      <div className="stepper">
        <button type="button" aria-label={`${label} min`} onClick={() => onChange(value == null ? start : Math.max(min, value - 1))}>
          −
        </button>
        <input
          inputMode="numeric"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? null : Math.max(min, Number(e.target.value) || 0))}
        />
        <button type="button" aria-label={`${label} plus`} onClick={() => onChange(value == null ? start : value + 1)}>
          +
        </button>
      </div>
    </label>
  );
}
