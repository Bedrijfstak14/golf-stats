import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { updateSettings } from "@/app/actions";
import { num } from "@/db";
import ActionForm from "@/components/ActionForm";
import { BASELINES } from "@/lib/golf/strokesGained";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ imported?: string; error?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
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
              <span>Geslacht (voor tees)</span>
              <select name="gender" defaultValue={user.gender}>
                <option value="m">Heer</option>
                <option value="f">Dame</option>
              </select>
            </label>
          </div>
          <h2>Handicap</h2>
          <div className="grid grid-2 grid-md-3">
            <label className="field">
              <span>Officiële NGF-index</span>
              <input name="officialIndex" inputMode="decimal" defaultValue={dec(user.officialIndex)} />
            </label>
            <label className="field">
              <span>Startindex (tot 3 rondes)</span>
              <input name="startIndex" inputMode="decimal" defaultValue={dec(user.startIndex)} placeholder="standaard: officiële index" />
            </label>
            <label className="field">
              <span>Allowance playing hcp (%)</span>
              <input name="allowance" inputMode="numeric" defaultValue={user.allowance} />
            </label>
          </div>
          <h2>Eenheden en strokes gained</h2>
          <div className="grid grid-2">
            <label className="field">
              <span>Putt-afstand</span>
              <select name="puttUnit" defaultValue={user.puttUnit}>
                <option value="m">Meters</option>
                <option value="ft">Voeten</option>
              </select>
            </label>
            <label className="field">
              <span>Referentieniveau SG</span>
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
            <span>Mijn rondes en statistieken</span>
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
