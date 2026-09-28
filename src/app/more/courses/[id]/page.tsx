import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq, inArray, or } from "drizzle-orm";
import { db, num } from "@/db";
import { clubs, combinations, holes, loops, tees } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { deleteClub, deleteCombination, deleteLoop, deleteTee, saveClub, saveCombination, saveLoop, saveTee } from "@/app/actions";
import ActionForm from "@/components/ActionForm";
import { Term } from "@/components/Tip";

export const dynamic = "force-dynamic";

type TeeRow = typeof tees.$inferSelect;

export default async function ClubPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  const [club] = await db.select().from(clubs).where(eq(clubs.id, id));
  if (!club) notFound();
  const lp = await db.select().from(loops).where(eq(loops.clubId, id)).orderBy(asc(loops.name));
  const hs = lp.length ? await db.select().from(holes).where(inArray(holes.loopId, lp.map((l) => l.id))).orderBy(asc(holes.number)) : [];
  const cb = await db.select().from(combinations).where(eq(combinations.clubId, id));
  const ts =
    lp.length || cb.length
      ? await db
          .select()
          .from(tees)
          .where(or(lp.length ? inArray(tees.loopId, lp.map((l) => l.id)) : undefined, cb.length ? inArray(tees.combinationId, cb.map((c) => c.id)) : undefined))
          .orderBy(asc(tees.name), asc(tees.validFrom))
      : [];

  return (
    <>
      <Link href="/more/courses" className="back">
        ‹ Banen
      </Link>
      <div className="page-head">
        <h1>{club.name}</h1>
      </div>

      <details className="card">
        <summary>
          <strong>Clubgegevens</strong>
        </summary>
        <ActionForm action={saveClub}>
          <input type="hidden" name="id" value={club.id} />
          <label className="field">
            <span>Naam</span>
            <input name="name" defaultValue={club.name} required />
          </label>
          <div className="grid grid-2">
            <label className="field">
              <span>Plaats</span>
              <input name="city" defaultValue={club.city ?? ""} />
            </label>
            <label className="field">
              <span>Website</span>
              <input name="website" defaultValue={club.website ?? ""} />
            </label>
          </div>
        </ActionForm>
        {user.role === "owner" && (
          <form action={deleteClub} style={{ marginTop: 8 }}>
            <input type="hidden" name="id" value={club.id} />
            <button className="btn danger sm">Club verwijderen</button>
          </form>
        )}
      </details>

      <h2>
        <Term k="loop">Lussen</Term>
      </h2>
      {lp.map((l) => {
        const lh = hs.filter((h) => h.loopId === l.id);
        return (
          <div className="card" key={l.id}>
            <details>
              <summary>
                <strong>{l.name}</strong> <span className="small muted">· {l.holesCount} holes · par {lh.reduce((a, h) => a + h.par, 0)}</span>
              </summary>
              <LoopForm clubId={id} loop={l} holes={lh} />
              <form action={deleteLoop} style={{ marginTop: 8 }}>
                <input type="hidden" name="id" value={l.id} />
                <input type="hidden" name="clubId" value={id} />
                <button className="btn danger sm">Lus verwijderen</button>
              </form>
            </details>
            <TeeSection clubId={id} holesCount={lh.length} par={lh.reduce((a, h) => a + h.par, 0)} target={{ loopId: l.id }} list={ts.filter((t) => t.loopId === l.id)} />
          </div>
        );
      })}
      <details className="card">
        <summary>
          <strong>+ Nieuwe lus</strong>
        </summary>
        <LoopForm clubId={id} />
      </details>

      <h2>
        <Term k="combination">18-holescombinaties</Term>
      </h2>
      <p className="small muted">Een combinatie van twee lussen met eigen stroke index, rating en slope.</p>
      {cb.map((c) => {
        const lh = [...hs.filter((h) => h.loopId === c.firstLoopId), ...hs.filter((h) => h.loopId === c.secondLoopId)];
        return (
          <div className="card" key={c.id}>
            <details>
              <summary>
                <strong>{c.name}</strong> <span className="small muted">· par {lh.reduce((a, h) => a + h.par, 0)}</span>
              </summary>
              <CombinationForm clubId={id} loops={lp} holes={hs} combination={c} />
              <form action={deleteCombination} style={{ marginTop: 8 }}>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="clubId" value={id} />
                <button className="btn danger sm">Combinatie verwijderen</button>
              </form>
            </details>
            <TeeSection
              clubId={id}
              holesCount={lh.length}
              par={lh.reduce((a, h) => a + h.par, 0)}
              target={{ combinationId: c.id }}
              list={ts.filter((t) => t.combinationId === c.id)}
              suggestLengths={(name, gender) => {
                const a = ts.find((t) => t.loopId === c.firstLoopId && t.name === name && t.gender === gender);
                const b = ts.find((t) => t.loopId === c.secondLoopId && t.name === name && t.gender === gender);
                return a && b ? [...a.lengths, ...b.lengths] : null;
              }}
            />
          </div>
        );
      })}
      {lp.length >= 2 && (
        <details className="card">
          <summary>
            <strong>+ Nieuwe combinatie</strong>
          </summary>
          <CombinationForm clubId={id} loops={lp} holes={hs} />
        </details>
      )}
    </>
  );
}

function LoopForm({ clubId, loop, holes: hs = [] }: { clubId: number; loop?: typeof loops.$inferSelect; holes?: (typeof holes.$inferSelect)[] }) {
  const n = loop?.holesCount ?? 9;
  return (
    <ActionForm action={saveLoop} submit={loop ? "Lus opslaan" : "Lus aanmaken"}>
      <input type="hidden" name="clubId" value={clubId} />
      {loop && <input type="hidden" name="id" value={loop.id} />}
      <div className="grid grid-2" style={{ marginTop: 12 }}>
        <label className="field">
          <span>Naam</span>
          <input name="name" defaultValue={loop?.name} placeholder="Oost" required />
        </label>
        <label className="field">
          <span>Holes</span>
          <select name="holesCount" defaultValue={n}>
            <option value={9}>9</option>
            <option value={18}>18</option>
          </select>
        </label>
      </div>
      <p className="small muted">Par en stroke index per hole (SI 1 t/m {n} elk precies één keer). Na wijzigen van het aantal holes eerst opslaan.</p>
      <div className="table-wrap">
        <table className="t">
          <thead>
            <tr>
              <th>Hole</th>
              <th>
                <Term k="par">Par</Term>
              </th>
              <th>
                <Term k="si">SI</Term>
              </th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: n }, (_, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>
                  <input name={`par${i}`} inputMode="numeric" defaultValue={hs[i]?.par ?? 4} style={{ width: 64 }} aria-label={`Par hole ${i + 1}`} />
                </td>
                <td>
                  <input name={`si${i}`} inputMode="numeric" defaultValue={hs[i]?.si ?? i + 1} style={{ width: 64 }} aria-label={`SI hole ${i + 1}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ActionForm>
  );
}

function CombinationForm({
  clubId,
  loops: lp,
  holes: hs,
  combination,
}: {
  clubId: number;
  loops: (typeof loops.$inferSelect)[];
  holes: (typeof holes.$inferSelect)[];
  combination?: typeof combinations.$inferSelect;
}) {
  const first = combination?.firstLoopId ?? lp[0]?.id;
  const second = combination?.secondLoopId ?? lp[1]?.id;
  const all = [...hs.filter((h) => h.loopId === first), ...hs.filter((h) => h.loopId === second)];
  return (
    <ActionForm action={saveCombination} submit={combination ? "Combinatie opslaan" : "Combinatie aanmaken"}>
      <input type="hidden" name="clubId" value={clubId} />
      {combination && <input type="hidden" name="id" value={combination.id} />}
      <div className="grid grid-md-3" style={{ marginTop: 12 }}>
        <label className="field">
          <span>Naam</span>
          <input name="name" defaultValue={combination?.name} placeholder="Oost + West" />
        </label>
        <label className="field">
          <span>
            <Term text="De lus die je als holes 1–9 speelt.">Eerste negen</Term>
          </span>
          <select name="firstLoopId" defaultValue={first}>
            {lp.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>
            <Term text="De lus die je als holes 10–18 speelt.">Tweede negen</Term>
          </span>
          <select name="secondLoopId" defaultValue={second}>
            {lp.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="small muted">18-holes stroke index (1 t/m 18). Wijzig je de lussen, sla dan eerst op en vul daarna de SI's in.</p>
      <div className="table-wrap">
        <table className="t">
          <thead>
            <tr>
              {all.map((_, i) => (
                <th key={i}>{i + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {all.map((h, i) => (
                <td key={i}>
                  <input
                    name={`si${i}`}
                    inputMode="numeric"
                    defaultValue={combination?.si[i] ?? (i < 9 ? h.si * 2 - 1 : h.si * 2)}
                    style={{ width: 52, padding: 4 }}
                    aria-label={`SI hole ${i + 1}`}
                  />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </ActionForm>
  );
}

function TeeSection({
  clubId,
  holesCount,
  par,
  target,
  list,
  suggestLengths,
}: {
  clubId: number;
  holesCount: number;
  par: number;
  target: { loopId?: number; combinationId?: number };
  list: TeeRow[];
  suggestLengths?: (name: string, gender: string) => number[] | null;
}) {
  return (
    <div style={{ marginTop: 12 }}>
      <h3>
        <Term k="tee">Tees</Term>
      </h3>
      {list.length === 0 && <p className="small muted">Nog geen tees.</p>}
      {list.map((t) => (
        <details key={t.id} className="hole-card">
          <summary>
            <strong>
              {t.name} ({t.gender === "f" ? "d" : "h"})
            </strong>{" "}
            <span className="small muted">
              · {t.lengths.reduce((a, b) => a + b, 0)} m · CR {num(t.courseRating)?.toLocaleString("nl-NL") ?? "–"} / slope {t.slope ?? "–"}
              {t.validFrom > "2000-01-01" && ` · geldig vanaf ${t.validFrom}`}
            </span>
            {(t.courseRating == null || t.slope == null) && <span className="chip yellow" style={{ marginLeft: 6 }}>rating/slope ontbreekt</span>}
          </summary>
          <TeeForm clubId={clubId} holesCount={holesCount} par={par} target={target} tee={t} />
          <form action={deleteTee} style={{ marginTop: 8 }}>
            <input type="hidden" name="id" value={t.id} />
            <input type="hidden" name="clubId" value={clubId} />
            <button className="btn danger sm">Tee verwijderen</button>
          </form>
        </details>
      ))}
      <details className="hole-card">
        <summary>+ Nieuwe tee</summary>
        <TeeForm clubId={clubId} holesCount={holesCount} par={par} target={target} lengths={suggestLengths?.("Geel", "m") ?? undefined} />
      </details>
    </div>
  );
}

function TeeForm({
  clubId,
  holesCount,
  par,
  target,
  tee,
  lengths,
}: {
  clubId: number;
  holesCount: number;
  par: number;
  target: { loopId?: number; combinationId?: number };
  tee?: TeeRow;
  lengths?: number[];
}) {
  const len = tee?.lengths ?? lengths ?? [];
  return (
    <ActionForm action={saveTee} submit="Tee opslaan">
      <input type="hidden" name="clubId" value={clubId} />
      <input type="hidden" name="holesCount" value={holesCount} />
      {target.loopId && <input type="hidden" name="loopId" value={target.loopId} />}
      {target.combinationId && <input type="hidden" name="combinationId" value={target.combinationId} />}
      {tee && <input type="hidden" name="id" value={tee.id} />}
      <div className="grid grid-2 grid-md-3" style={{ marginTop: 12 }}>
        <label className="field">
          <span>
            <Term k="tee">Teekleur</Term>
          </span>
          <input name="name" defaultValue={tee?.name ?? ""} placeholder="Blauw" required />
        </label>
        <label className="field">
          <span>
            <Term k="teeGender">Geslacht</Term>
          </span>
          <select name="gender" defaultValue={tee?.gender ?? "m"}>
            <option value="m">Heren</option>
            <option value="f">Dames</option>
          </select>
        </label>
        <label className="field">
          <span>Par</span>
          <input name="par" inputMode="numeric" defaultValue={tee?.par ?? par} />
        </label>
        <label className="field">
          <span>
            <Term k="cr">Course rating ({holesCount} holes)</Term>
          </span>
          <input name="courseRating" inputMode="decimal" defaultValue={num(tee?.courseRating)?.toString().replace(".", ",") ?? ""} placeholder="bijv. 35,2" />
        </label>
        <label className="field">
          <span>
            <Term k="slope">Slope</Term>
          </span>
          <input name="slope" inputMode="numeric" defaultValue={tee?.slope ?? ""} placeholder="bijv. 127" />
        </label>
        <label className="field">
          <span>
            <Term k="validFrom">Geldig vanaf</Term>
          </span>
          <input name="validFrom" type="date" defaultValue={tee?.validFrom ?? "2000-01-01"} />
        </label>
      </div>
      <p className="small muted">Lengte per hole (m). Rating en slope staan niet op de Hole19-screenshot: bron is de baankaart of de NGF-baanrating.</p>
      <div className="table-wrap">
        <table className="t">
          <thead>
            <tr>
              {Array.from({ length: holesCount }, (_, i) => (
                <th key={i}>{i + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {Array.from({ length: holesCount }, (_, i) => (
                <td key={i}>
                  <input name={`len${i}`} inputMode="numeric" defaultValue={len[i] ?? ""} style={{ width: 60, padding: 4 }} aria-label={`Lengte hole ${i + 1}`} />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      {tee && (
        <label className="row small" style={{ margin: "8px 0 12px" }}>
          <input type="checkbox" name="newVersion" /> Opslaan als nieuwe versie (oude rondes houden de rating van toen)
        </label>
      )}
    </ActionForm>
  );
}
