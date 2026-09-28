"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { holeStrokesGained, quickPutts, SG_LABELS, type BaselineKey } from "@/lib/golf/strokesGained";
import { LIE_LABELS, type DraftShot, type Lie } from "@/lib/golf/types";
import { sendJson } from "./offline";
import Tip, { Term } from "@/components/Tip";

interface HoleIn {
  number: number;
  par: number;
  length: number | null;
  strokes: number | null;
  putts: number | null;
  shots: DraftShot[];
}

const FT = 0.3048;
const LIES = Object.keys(LIE_LABELS) as Lie[];

/** Slaginvoer per hole: club, ligging, afstand tot de vlag, strafslag. */
export default function ShotEditor({
  roundId,
  holes: initial,
  bag,
  puttUnit,
  baseline,
  startHole,
}: {
  roundId: number;
  holes: HoleIn[];
  bag: { id: number; name: string; type: string }[];
  puttUnit: "m" | "ft";
  baseline: BaselineKey;
  startHole: number;
}) {
  const router = useRouter();
  const [holes, setHoles] = useState(initial);
  const [cur, setCur] = useState(Math.max(0, initial.findIndex((h) => h.number === startHole)));
  const [qp, setQp] = useState({ count: 2, first: "" });
  const [status, setStatus] = useState<{ kind: "ok" | "red"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const h = holes[cur];

  const toDisplay = (s: DraftShot) => (s.lie === "green" && puttUnit === "ft" ? Math.round((s.distance / FT) * 10) / 10 : s.distance);
  const fromDisplay = (lie: Lie, v: number) => (lie === "green" && puttUnit === "ft" ? Math.round(v * FT * 10) / 10 : v);

  const update = (shots: DraftShot[]) => setHoles((hs) => hs.map((x, i) => (i === cur ? { ...x, shots } : x)));
  const setShot = (i: number, patch: Partial<DraftShot>) => update(h.shots.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  function addShot() {
    const last = h.shots.at(-1);
    const lie: Lie = h.shots.length === 0 ? "tee" : last?.lie === "green" ? "green" : "fairway";
    const distance = h.shots.length === 0 ? (h.length ?? 0) : Math.max(0, Math.round((last?.distance ?? 0) / 3));
    update([...h.shots, { lie, distance, penalty: false, bagClubId: null }]);
  }

  function addPutts() {
    const first = Number(qp.first.replace(",", "."));
    if (!(first > 0)) return;
    update([...h.shots, ...quickPutts(qp.count, fromDisplay("green", first)).map((p) => ({ ...p, bagClubId: bag.find((b) => b.type === "putter")?.id ?? null }))]);
    setQp({ count: 2, first: "" });
  }

  const count = h.shots.length + h.shots.filter((s) => s.penalty).length;
  const onGreen = h.shots.filter((s) => s.lie === "green").length;
  const problems = [
    h.shots.length && h.strokes != null && count !== h.strokes ? `Reeks telt ${count} slagen (incl. strafslagen), score is ${h.strokes}` : null,
    h.shots.length && h.putts != null && onGreen !== h.putts ? `${onGreen} slagen op de green, maar ${h.putts} putts` : null,
  ].filter(Boolean) as string[];

  const sg = useMemo(() => (h.shots.length ? holeStrokesGained(h.shots, h.par, baseline) : []), [h.shots, h.par, baseline]);

  async function save(next: boolean) {
    setSaving(true);
    setStatus(null);
    const res = await sendJson(`/api/rounds/${roundId}/shots`, "PUT", { hole: h.number, shots: h.shots });
    setSaving(false);
    if (res.ok) {
      setStatus({ kind: "ok", text: `Hole ${h.number} opgeslagen` });
      if (next && cur < holes.length - 1) setCur(cur + 1);
      router.refresh();
    } else if ("queued" in res) setStatus({ kind: "ok", text: "Offline: in de wachtrij" });
    else setStatus({ kind: "red", text: res.error });
  }

  return (
    <div>
      <div className="table-wrap" style={{ marginBottom: 12 }}>
        <div className="seg" role="tablist">
          {holes.map((x, i) => (
            <button key={x.number} className={i === cur ? "on" : ""} onClick={() => setCur(i)} role="tab" aria-selected={i === cur}>
              {x.number}
              {x.shots.length ? "•" : ""}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="row between" style={{ marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>
            Hole {h.number} · par {h.par}
          </h2>
          <span className="small muted">
            score {h.strokes ?? "–"} · putts {h.putts ?? "–"} · {h.length ?? "?"} m
          </span>
        </div>

        {h.shots.length === 0 && <p className="muted small">Nog geen slagen. Begin met de teeslag; de afstand komt uit de baandata.</p>}

        {h.shots.map((s, i) => (
          <div key={i} className="hole-card" style={{ padding: 10 }}>
            <div className="row between small muted" style={{ marginBottom: 6 }}>
              <span>
                Slag {i + 1}
                {sg[i] ? ` · ${SG_LABELS[sg[i].category]}` : ""}
              </span>
              <span className="num">
                <Tip text="Strokes gained van deze slag: hoeveel beter (+) of slechter (−) dan de referentiespeler vanaf dezelfde plek." label="SG" /> SG {sg[i] ? (sg[i].sg > 0 ? "+" : "") + sg[i].sg.toFixed(2) : ""}
                <button className="btn sm danger" style={{ marginLeft: 8 }} onClick={() => update(h.shots.filter((_, j) => j !== i))} aria-label="Slag verwijderen">
                  ×
                </button>
              </span>
            </div>
            <div className="f-grid">
              <label>
                <span>
                  <Term k="lie">Ligging</Term>
                </span>
                <select value={s.lie} onChange={(e) => setShot(i, { lie: e.target.value as Lie })}>
                  {LIES.map((l) => (
                    <option key={l} value={l}>
                      {LIE_LABELS[l]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>
                  <Term k="toFlag">{`Tot vlag (${s.lie === "green" ? puttUnit : "m"})`}</Term>
                </span>
                <input
                  inputMode="decimal"
                  value={toDisplay(s)}
                  onChange={(e) => setShot(i, { distance: fromDisplay(s.lie, Number(e.target.value.replace(",", ".")) || 0) })}
                />
              </label>
              <label>
                <span>Club</span>
                <select value={s.bagClubId ?? ""} onChange={(e) => setShot(i, { bagClubId: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">–</option>
                  {bag.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="row small" style={{ marginTop: 6 }}>
              <input type="checkbox" checked={!!s.penalty} onChange={(e) => setShot(i, { penalty: e.target.checked })} /> Strafslag (bijv. out-of-bounds of water)
            </label>
          </div>
        ))}

        <div className="row" style={{ marginBottom: 12 }}>
          <button className="btn" onClick={addShot}>
            + Slag
          </button>
        </div>

        <div className="row" style={{ marginBottom: 12 }}>
          <select value={qp.count} onChange={(e) => setQp({ ...qp, count: Number(e.target.value) })} style={{ width: 80 }} aria-label="Aantal putts">
            {[1, 2, 3, 4].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
          <span>putts, eerste van</span>
          <input value={qp.first} onChange={(e) => setQp({ ...qp, first: e.target.value })} inputMode="decimal" style={{ width: 80 }} aria-label="Afstand eerste putt" />
          <span>{puttUnit}</span>
          <button className="btn sm" onClick={addPutts}>
            Toevoegen
          </button>
        </div>

        {problems.map((p) => (
          <div key={p} className="alert red">
            {p}
          </div>
        ))}
        {status && <div className={`alert ${status.kind}`}>{status.text}</div>}
        <div className="row">
          <button className="btn primary" disabled={saving || problems.length > 0} onClick={() => save(true)}>
            {cur < holes.length - 1 ? "Opslaan en volgende hole" : "Opslaan"}
          </button>
          <button className="btn" disabled={saving || problems.length > 0} onClick={() => save(false)}>
            Alleen opslaan
          </button>
        </div>
      </div>
    </div>
  );
}
