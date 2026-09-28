import { scoreClass } from "@/lib/golf/stats";
import type { LoadedRound } from "@/lib/rounds";
import { Term } from "@/components/Tip";

const FW_SYMBOL: Record<string, string> = { hit: "●", left: "←", right: "→", short: "↓", long: "↑", na: "" };

/** Scorekaart zoals Hole19, met kleurcodes eagle t/m double bogey. Bij 18 holes in twee helften. */
export default function Scorecard({ round }: { round: LoadedRound }) {
  const halves = round.holes.length > 9 ? [round.holes.slice(0, 9), round.holes.slice(9)] : [round.holes];
  return (
    <div className="stack">
      {halves.map((hs, k) => {
        const sum = (f: (h: (typeof hs)[number]) => number | null | undefined) => hs.reduce((a, h) => a + (f(h) ?? 0), 0);
        return (
          <div className="table-wrap" key={k}>
            <table className="scorecard">
              <thead>
                <tr>
                  <th>Hole</th>
                  {hs.map((h) => (
                    <th key={h.number}>{h.number}</th>
                  ))}
                  <th className="tot">{halves.length > 1 ? (k === 0 ? "UIT" : "IN") : "TOT"}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <Term k="length">Lengte</Term>
                  </td>
                  {hs.map((h) => (
                    <td key={h.number} className="small muted">
                      {h.length ?? ""}
                    </td>
                  ))}
                  <td className="tot small">{sum((h) => h.length) || ""}</td>
                </tr>
                <tr>
                  <td>
                    <Term k="par">Par</Term>
                  </td>
                  {hs.map((h) => (
                    <td key={h.number}>{h.par}</td>
                  ))}
                  <td className="tot">{sum((h) => h.par)}</td>
                </tr>
                <tr>
                  <td>
                    <Term k="si">SI</Term>
                  </td>
                  {hs.map((h) => (
                    <td key={h.number} className="small muted">
                      {h.si}
                    </td>
                  ))}
                  <td className="tot" />
                </tr>
                <tr>
                  <td>Score</td>
                  {hs.map((h) => (
                    <td key={h.number}>{h.strokes == null ? "–" : <span className={`score ${scoreClass(h.strokes, h.par)}`}>{h.strokes}</span>}</td>
                  ))}
                  <td className="tot">{sum((h) => h.strokes)}</td>
                </tr>
                <tr>
                  <td>
                    <Term k="points">Punten</Term>
                  </td>
                  {hs.map((h) => (
                    <td key={h.number}>{h.points ?? ""}</td>
                  ))}
                  <td className="tot">{sum((h) => h.points)}</td>
                </tr>
                <tr>
                  <td>
                    <Term k="putts">Putts</Term>
                  </td>
                  {hs.map((h) => (
                    <td key={h.number}>{h.putts ?? ""}</td>
                  ))}
                  <td className="tot">{sum((h) => h.putts)}</td>
                </tr>
                <tr>
                  <td>
                    <Term k="fairwayRow">Fairway</Term>
                  </td>
                  {hs.map((h) => (
                    <td key={h.number} aria-label={h.fairway ?? ""} style={{ color: h.fairway === "hit" ? "var(--accent)" : undefined }}>
                      {FW_SYMBOL[h.fairway ?? ""] ?? ""}
                    </td>
                  ))}
                  <td className="tot small">
                    {hs.filter((h) => h.fairway === "hit").length}/{hs.filter((h) => h.par >= 4).length}
                  </td>
                </tr>
                <tr>
                  <td>
                    <Term k="girPct">GIR</Term>
                  </td>
                  {hs.map((h) => (
                    <td key={h.number} style={{ color: "var(--accent)" }}>
                      {h.gir ? "✓" : ""}
                    </td>
                  ))}
                  <td className="tot small">{hs.filter((h) => h.gir).length}</td>
                </tr>
                <tr>
                  <td>
                    <Term k="penalties">Straf</Term>
                  </td>
                  {hs.map((h) => (
                    <td key={h.number}>{h.penalties || ""}</td>
                  ))}
                  <td className="tot">{sum((h) => h.penalties)}</td>
                </tr>
                <tr>
                  <td>
                    <Term k="bunker">Bunker</Term>
                  </td>
                  {hs.map((h) => (
                    <td key={h.number}>{h.bunker || ""}</td>
                  ))}
                  <td className="tot">{sum((h) => h.bunker)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}
      <div className="legend">
        <span>
          <span className="score eagle" style={{ width: 16, height: 16 }} /> Eagle
        </span>
        <span>
          <span className="score birdie" style={{ width: 16, height: 16 }} /> Birdie
        </span>
        <span>
          <span className="score bogey" style={{ width: 16, height: 16 }} /> Bogey
        </span>
        <span>
          <span className="score double" style={{ width: 16, height: 16 }} /> Double
        </span>
        <span>
          <span className="score worse" style={{ width: 16, height: 16 }} /> Slechter
        </span>
      </div>
    </div>
  );
}
