"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** Eén of meer afbeeldingen per ronde: camera, galerij of slepen. */
export default function UploadForm() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = (list: FileList | null) => {
    if (!list) return;
    setFiles((f) => [...f, ...Array.from(list).filter((x) => x.type.startsWith("image/"))]);
  };

  async function submit() {
    if (!files.length) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    files.forEach((f) => form.append("images", f));
    try {
      const res = await fetch("/api/imports", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload mislukt");
      router.push(`/add/review/${data.id}`);
    } catch (e) {
      setBusy(false);
      setError(navigator.onLine ? (e as Error).message : "Geen verbinding. Uploaden kan zodra je weer online bent; handmatig invoeren werkt wel offline.");
    }
  }

  return (
    <div>
      <div
        className={`dropzone ${drag ? "drag" : ""}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          add(e.dataTransfer.files);
        }}
        role="button"
        tabIndex={0}
      >
        <strong>Screenshot of foto kiezen</strong>
        <div className="small muted">Hole19-screenshot of papieren scorekaart · meerdere afbeeldingen mogen</div>
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => add(e.target.files)} />
      </div>
      {files.length > 0 && (
        <div className="thumbs">
          {files.map((f, i) => (
            <img key={i} src={URL.createObjectURL(f)} alt={f.name} onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} title="Tik om te verwijderen" />
          ))}
        </div>
      )}
      {error && (
        <div className="alert red" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}
      <button className="btn primary block" style={{ marginTop: 12 }} disabled={!files.length || busy} onClick={submit}>
        {busy ? "Uploaden…" : `Uitlezen${files.length > 1 ? ` (${files.length} afbeeldingen)` : ""}`}
      </button>
    </div>
  );
}
