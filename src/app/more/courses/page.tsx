import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { clubsWithChildren } from "@/lib/courses";
import { saveClub } from "@/app/actions";
import ActionForm from "@/components/ActionForm";

export const dynamic = "force-dynamic";

export default async function CoursesPage() {
  await requireUser();
  const list = await clubsWithChildren();
  return (
    <>
      <Link href="/more" className="back">
        ‹ Meer
      </Link>
      <div className="page-head">
        <h1>Banen</h1>
      </div>
      <p className="small muted">Banen worden één keer vastgelegd en daarna door iedereen gebruikt. De eerste AI-import van een nieuwe baan vult par, SI en lengtes automatisch.</p>
      {list.length > 0 && (
        <div className="card tight">
          <ul className="list">
            {list.map((c) => (
              <li key={c.id}>
                <Link className="item" href={`/more/courses/${c.id}`}>
                  <div>
                    <strong>{c.name}</strong>
                    <div className="small muted">
                      {[c.city, `${c.loops.length} lus${c.loops.length === 1 ? "" : "sen"}`, c.combinations.length ? `${c.combinations.length} combinatie(s)` : null].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <span aria-hidden>›</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="card">
        <h2>Nieuwe club</h2>
        <ActionForm action={saveClub} submit="Club aanmaken">
          <label className="field">
            <span>Naam</span>
            <input name="name" placeholder="Golfbaan Het Rijk van Sybrook" required />
          </label>
          <div className="grid grid-2">
            <label className="field">
              <span>Plaats</span>
              <input name="city" />
            </label>
            <label className="field">
              <span>Website</span>
              <input name="website" type="url" />
            </label>
          </div>
        </ActionForm>
      </div>
    </>
  );
}
