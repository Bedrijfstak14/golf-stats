import Link from "next/link";
import { redirect } from "next/navigation";
import { canWrite, requireUser } from "@/lib/auth";
import UploadForm from "@/components/UploadForm";

export default async function AddPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser();
  if (!canWrite(user)) redirect("/");
  const { error } = await searchParams;
  return (
    <>
      <div className="page-head">
        <h1>Ronde toevoegen</h1>
      </div>
      {error && <div className="alert red">{error}</div>}
      <div className="card">
        <h2>Uploaden en laten uitlezen</h2>
        <p className="muted small">AI leest de kaart uit, de app controleert alles en jij kijkt het na voordat de ronde meetelt.</p>
        <UploadForm />
      </div>
      <Link href="/add/manual" className="card">
        <div className="row between">
          <div>
            <h2 style={{ margin: 0 }}>Handmatig invoeren</h2>
            <div className="small muted">Werkt ook zonder verbinding</div>
          </div>
          <span aria-hidden>›</span>
        </div>
      </Link>
      <Link href="/more/settings#csv" className="card">
        <div className="row between">
          <div>
            <h2 style={{ margin: 0 }}>Historische rondes importeren (CSV)</h2>
            <div className="small muted">Bijv. uit een export</div>
          </div>
          <span aria-hidden>›</span>
        </div>
      </Link>
    </>
  );
}
