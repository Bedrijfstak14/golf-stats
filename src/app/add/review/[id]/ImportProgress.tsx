"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** Start de AI-uitlezing en toont voortgang; daarna ververst de pagina naar het nakijkscherm. */
export default function ImportProgress({ id, status, error }: { id: number; status: string; error: string | null }) {
  const router = useRouter();
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: status === "pending", error });
  const [seconds, setSeconds] = useState(0);
  const started = useRef(false);

  async function run(force = false) {
    setState({ busy: true, error: null });
    setSeconds(0);
    try {
      const res = await fetch(`/api/imports/${id}${force ? "?force=1" : ""}`, { method: "POST" });
      const data = await res.json();
      if (data.status === "parsed") return router.refresh();
      setState({ busy: false, error: data.error ?? "Uitlezen mislukt" });
    } catch {
      setState({ busy: false, error: "Geen verbinding met de server" });
    }
  }

  useEffect(() => {
    if (status === "pending" && !started.current) {
      started.current = true;
      run();
    }
  }, [status]);

  useEffect(() => {
    if (!state.busy) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [state.busy]);

  return (
    <div className="card">
      {state.busy ? (
        <>
          <h2>AI leest de scorekaart…</h2>
          <div className="progress" aria-label="Bezig">
            <div />
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>
            {seconds}s · daarna koppelen we de baan en lopen de controles.
          </p>
        </>
      ) : (
        <>
          <div className="alert red">{state.error}</div>
          <div className="row">
            <button className="btn primary" onClick={() => run(true)}>
              Opnieuw proberen
            </button>
            <a className="btn" href="/add/manual">
              Handmatig invoeren
            </a>
          </div>
        </>
      )}
    </div>
  );
}
