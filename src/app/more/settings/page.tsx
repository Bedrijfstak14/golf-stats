import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { updateSettings } from "@/app/actions";
import { num } from "@/db";
import ActionForm from "@/components/ActionForm";
import { Term } from "@/components/Tip";
import { BASELINES } from "@/lib/golf/strokesGained";
import { aiUsageSummary } from "@/lib/aiBudget";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ imported?: string; error?: string; recalc?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const ai = user.role === "owner" ? await aiUsageSummary() : null;
  const dec = (v: string | null) => (num(v) == null ? "" : String(num(v)).replace(".", ","));
  return (
    <>
      <Link href="/more" className="back">
        ‹ Meer
      </Link>
      <div className="page-head">
        <h1>Instellingen</h1>
      </div>
      <div className="card">
        <ActionForm action={updateSettings}>
          <h2>Profiel</h2>
          <div className="grid grid-2">
            <label className="field">
              <span>Naam</span>
              <input name="name" defaultValue={user.name} />
            </label>
            <label className="field">
              <span>
                <Term k="gender">Geslacht (voor tees)</Term>
              </span>
              <select name="gender" defaultValue={user.gender}>
                <option value="m">Heer</option>
                <option value="f">Dame</option>
              </select>
            </label>
          </div>
          <h2>Handicap</h2>
          <div className="grid grid-2 grid-md-3">
            <label className="field">
              <span>
                <Term k="official">Officiële NGF-index</Term>
              </span>
              <input name="officialIndex" inputMode="decimal" defaultValue={dec(user.officialIndex)} />
            </label>
            <label className="field">
              <span>
                <Term k="startIndex">Startindex (tot 3 rondes)</Term>
              </span>
              <input name="startIndex" inputMode="decimal" defaultValue={dec(user.startIndex)} placeholder="standaard: officiële index" />
            </label>
            <label className="field">
              <span>
                <Term k="allowance">Allowance playing hcp (%)</Term>
              </span>
              <input name="allowance" inputMode="numeric" defaultValue={user.allowance} />
            </label>
          </div>
          <h2>Eenheden en strokes gained</h2>
          <div className="grid grid-2">
            <label className="field">
              <span>
                <Term k="puttUnit">Putt-afstand</Term>
              </span>
              <select name="puttUnit" defaultValue={user.puttUnit}>
                <option value="m">Meters</option>
                <option value="ft">Voeten</option>
              </select>
            </label>
            <label className="field">
              <span>
                <Term k="baseline">Referentieniveau SG</Term>
              </span>
              <select name="sgBaseline" defaultValue={user.sgBaseline}>
                {Object.entries(BASELINES).map(([k, b]) => (
                  <option key={k} value={k}>
                    {b.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <h2>Delen</h2>
          <label className="field">
            <span>
              <Term k="sharing">Mijn rondes en statistieken</Term>
            </span>
            <select name="sharing" defaultValue={user.sharing}>
              <option value="private">Privé</option>
              <option value="friends">Gedeeld met vrienden</option>
            </select>
          </label>
          <p className="small muted">Per ronde kun je dit overschrijven op de rondepagina.</p>
          <h2>Wachtwoord</h2>
          <label className="field">
            <span>Nieuw wachtwoord (leeg laten om te behouden)</span>
            <input name="newPassword" type="password" autoComplete="new-password" />
          </label>
        </ActionForm>
      </div>

      {user.role !== "viewer" && (
        <div className="card" id="recalc">
          <h2>
            <Term k="recalc">Handicap herberekenen</Term>
          </h2>
          {sp.recalc === "1" && <div className="alert ok">Handicap en punten van alle rondes zijn opnieuw berekend.</div>}
          {sp.recalc === "wait" && <div className="alert yellow">Je hebt net al een paar keer herberekend. Probeer het over een paar minuten opnieuw.</div>}
          <p className="small muted">
            Gebeurt normaal automatisch. Gebruik dit na een correctie buiten de app om, bijvoorbeeld van rating of slope.
          </p>
          <form action="/api/admin/recalc" method="post">
            <input type="hidden" name="back" value="/more/settings" />
            <button className="btn">Alles herberekenen</button>
          </form>
        </div>
      )}

      {ai && (
        <div className="card" id="ai">
          <h2>
            <Term text="Elke uitlezing van een screenshot of foto is een betaalde Gemini-aanroep (soms twee, als de controles een herkansing nodig vinden). Boven deze limieten weigert de app nieuwe uitlezingen; handmatig invoeren blijft werken. Aan te passen met GEMINI_MAX_PER_DAY, GEMINI_MAX_PER_MONTH, GEMINI_MAX_PER_USER_DAY en GEMINI_MAX_PER_IMPORT in .env.">
              AI-verbruik (Gemini)
            </Term>
          </h2>
          <table className="t">
            <tbody>
              <tr>
                <td>Afgelopen 24 uur</td>
                <td className="num">
                  {ai.dayAll} / {ai.limits.perDay}
                </td>
              </tr>
              <tr>
                <td>Afgelopen 30 dagen</td>
                <td className="num">
                  {ai.monthAll} / {ai.limits.perMonth}
                </td>
              </tr>
              <tr>
                <td>Per speler per 24 uur</td>
                <td className="num">max {ai.limits.perUserDay}</td>
              </tr>
              <tr>
                <td>Per afbeelding</td>
                <td className="num">max {ai.limits.perImport}</td>
              </tr>
              <tr>
                <td>Tokens 30 dagen (invoer / uitvoer)</td>
                <td className="num">
                  {ai.promptTokens.toLocaleString("nl-NL")} / {ai.outputTokens.toLocaleString("nl-NL")}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="card" id="export">
        <h2>Export</h2>
        <p className="small muted">Al je eigen data downloaden.</p>
        <div className="row">
          <a className="btn" href="/api/export?format=json">
            JSON
          </a>
          <a className="btn" href="/api/export?format=csv">
            CSV (per hole)
          </a>
        </div>
      </div>

      <div className="card" id="csv">
        <h2>Historische rondes importeren (CSV)</h2>
        {sp.imported && <div className="alert ok">{sp.imported} rondes geïmporteerd.</div>}
        {sp.error && <div className="alert red">{sp.error}</div>}
        <p className="small muted">
          Zelfde formaat als de CSV-export: één regel per hole met kolommen <code>date, course, tee, holes_count, format, playing_handicap, course_rating, slope, hole, par, si, length, strokes, putts, fairway, gir, penalties, bunker</code>.
          Het formaat van de Hole19-export is nog een open punt; zodra die er is, komt er een aparte omzetting.
        </p>
        <form action="/api/import-csv" method="post" encType="multipart/form-data" className="row">
          <input type="file" name="file" accept=".csv,text/csv" required style={{ flex: 1 }} />
          <button className="btn primary">Importeren</button>
        </form>
      </div>
    </>
  );
}
