"use client";
import { useState } from "react";

export interface LinePoint {
  label: string;
  value: number | null;
  rolling?: number | null;
  /** best = telt mee (gevuld), out = valt buiten de laatste 20 (vaag) */
  mark?: "best" | "out" | null;
  href?: string;
}

const fmt = (v: number) => v.toLocaleString("nl-NL", { maximumFractionDigits: 1 });

/** Lijngrafiek met optioneel voortschrijdend gemiddelde en hover-tooltip. Eén y-as. */
export function LineChart({
  points,
  height = 180,
  invert = false,
  valueLabel = "Waarde",
  rollingLabel = "Voortschrijdend gemiddelde",
}: {
  points: LinePoint[];
  height?: number;
  /** lager is beter: as omdraaien is verwarrend, dus we laten hem staan en tonen alleen een hint */
  invert?: boolean;
  valueLabel?: string;
  rollingLabel?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = height;
  const pad = { l: 36, r: 12, t: 12, b: 24 };
  const vals = points.flatMap((p) => [p.value, p.rolling]).filter((v): v is number => v != null);
  if (vals.length === 0) return <p className="muted small">Nog geen gegevens.</p>;
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  min -= span * 0.1;
  max += span * 0.1;
  const x = (i: number) => pad.l + (points.length === 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (points.length - 1));
  const y = (v: number) => pad.t + ((max - v) * (H - pad.t - pad.b)) / (max - min);
  const path = (key: "value" | "rolling") =>
    points
      .map((p, i) => [p[key], i] as const)
      .filter(([v]) => v != null)
      .map(([v, i], k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(v as number).toFixed(1)}`)
      .join(" ");
  const ticks = Array.from({ length: 4 }, (_, i) => min + ((i + 0.5) * (max - min)) / 4);
  const hasRolling = points.some((p) => p.rolling != null) && points.length > 2;
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));
  const h = hover != null ? points[hover] : null;

  return (
    <div style={{ position: "relative" }}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={valueLabel} onMouseLeave={() => setHover(null)}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line className="grid-line" x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end">
              {fmt(t)}
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          i % labelEvery === 0 || i === points.length - 1 ? (
            <text key={i} x={x(i)} y={H - 6} textAnchor="middle">
              {p.label}
            </text>
          ) : null,
        )}
        {hasRolling && <path className="series-2" d={path("rolling")} />}
        <path className="series" d={path("value")} />
        {hover != null && <line className="grid-line" x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} style={{ stroke: "var(--muted)" }} />}
        {points.map((p, i) =>
          p.value == null ? null : <circle key={i} className={`dot ${p.mark ?? ""}`} cx={x(i)} cy={y(p.value)} r={hover === i ? 6 : 4} />,
        )}
        {/* Grote hit-targets per punt */}
        {points.map((p, i) => (
          <rect
            key={`h${i}`}
            x={x(i) - (W - pad.l - pad.r) / Math.max(1, points.length) / 2}
            y={0}
            width={(W - pad.l - pad.r) / Math.max(1, points.length)}
            height={H}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onClick={() => (p.href ? (window.location.href = p.href) : setHover(i))}
            style={{ cursor: p.href ? "pointer" : "default" }}
          />
        ))}
      </svg>
      {h && h.value != null && (
        <div
          className="card tight small"
          style={{ position: "absolute", top: 0, left: `${Math.min(70, (x(hover!) / W) * 100)}%`, pointerEvents: "none", margin: 0, boxShadow: "0 4px 12px rgba(0,0,0,.12)" }}
        >
          <div className="muted">{h.label}</div>
          <div>
            {valueLabel}: <strong>{fmt(h.value)}</strong>
          </div>
          {h.rolling != null && hasRolling && (
            <div className="muted">
              {rollingLabel}: {fmt(h.rolling)}
            </div>
          )}
          {h.mark === "best" && <div className="muted">Telt mee voor de index</div>}
        </div>
      )}
      {(hasRolling || points.some((p) => p.mark)) && (
        <div className="legend">
          <span>
            <i style={{ background: "var(--accent)" }} />
            {valueLabel}
          </span>
          {hasRolling && (
            <span>
              <i style={{ background: "var(--muted)" }} />
              {rollingLabel}
            </span>
          )}
          {points.some((p) => p.mark === "best") && (
            <span>
              <i style={{ background: "var(--accent)", borderRadius: "50%" }} />
              Gevuld = telt mee
            </span>
          )}
          {invert && <span>Lager is beter</span>}
        </div>
      )}
    </div>
  );
}

/** Kleine sparkline zonder assen, voor het dashboard. */
export function Sparkline({ values, height = 40 }: { values: (number | null)[]; height?: number }) {
  const v = values.filter((x): x is number => x != null);
  if (v.length < 2) return null;
  const W = 200;
  const min = Math.min(...v);
  const max = Math.max(...v);
  const y = (n: number) => 4 + ((max - n) * (height - 8)) / (max - min || 1);
  const x = (i: number) => (i * W) / (v.length - 1);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${height}`} aria-hidden style={{ maxWidth: 200 }}>
      <path className="series" d={v.map((n, i) => `${i ? "L" : "M"}${x(i)},${y(n)}`).join(" ")} />
      <circle className="dot best" cx={x(v.length - 1)} cy={y(v[v.length - 1])} r={4} />
    </svg>
  );
}

/** Winst/verlies per categorie: divergerende balk rond nul, met label. */
export function DivergingBars({ rows, unit = "" }: { rows: { label: string; value: number }[]; unit?: string }) {
  const maxAbs = Math.max(0.5, ...rows.map((r) => Math.abs(r.value)));
  return (
    <div>
      {rows.map((r) => {
        const w = (Math.abs(r.value) / maxAbs) * 50;
        const pos = r.value >= 0;
        return (
          <div className="hbar" key={r.label} title={`${r.label}: ${r.value > 0 ? "+" : ""}${fmt(r.value)}${unit}`}>
            <span>{r.label}</span>
            <div className="track">
              <div className="mid" />
              <div className={`fill ${pos ? "bar-pos" : "bar-neg"}`} style={{ left: pos ? "50%" : `${50 - w}%`, width: `${w}%` }} />
            </div>
            <span className="num" style={{ textAlign: "right" }}>
              {r.value > 0 ? "+" : r.value < 0 ? "−" : ""}
              {fmt(Math.abs(r.value))}
              {unit}
            </span>
          </div>
        );
      })}
      <div className="legend">
        <span>
          <i className="bar-pos" />
          Winst t.o.v. referentie
        </span>
        <span>
          <i className="bar-neg" />
          Verlies
        </span>
      </div>
    </div>
  );
}

const DIST = [
  ["eagle", "Eagle+", "var(--eagle)"],
  ["birdie", "Birdie", "var(--birdie)"],
  ["par", "Par", "var(--muted)"],
  ["bogey", "Bogey", "var(--bogey)"],
  ["double", "Double", "var(--double)"],
  ["worse", "Slechter", "var(--worse)"],
] as const;

/** Scoreverdeling als gestapelde balk met legenda en aantallen. */
export function DistributionBar({ dist }: { dist: Record<(typeof DIST)[number][0], number> }) {
  const total = DIST.reduce((a, [k]) => a + dist[k], 0);
  if (!total) return null;
  return (
    <div>
      <div className="dist" role="img" aria-label="Scoreverdeling">
        {DIST.map(([k, label, color]) =>
          dist[k] ? <div key={k} title={`${label}: ${dist[k]}`} style={{ width: `${(dist[k] / total) * 100}%`, background: color, borderRight: "2px solid var(--surface)" }} /> : null,
        )}
      </div>
      <div className="legend">
        {DIST.map(([k, label, color]) => (
          <span key={k}>
            <i style={{ background: color }} />
            {label} {dist[k]}
          </span>
        ))}
      </div>
    </div>
  );
}
