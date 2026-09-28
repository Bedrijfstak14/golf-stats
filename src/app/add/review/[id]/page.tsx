import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { imports } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { listCourseOptions } from "@/lib/courses";
import { indexOnDate } from "@/lib/rounds";
import RoundEditor from "@/components/RoundEditor";
import ImportProgress from "./ImportProgress";
import { findDuplicates } from "@/lib/imports";
import type { AiCard } from "@/lib/golf/aiDraft";
import type { RoundDraft } from "@/lib/golf/types";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  const [imp] = await db.select().from(imports).where(and(eq(imports.id, id), eq(imports.userId, user.id)));
  if (!imp) notFound();

  if (imp.status === "saved" && imp.roundId) {
    return (
      <>
        <div className="page-head">
          <h1>Al opgeslagen</h1>
        </div>
        <Link className="btn primary" href={`/rounds/${imp.roundId}`}>
          Naar de ronde
        </Link>
      </>
    );
  }

  if (imp.status === "pending" || imp.status === "failed") {
    return (
      <>
        <div className="page-head">
          <h1>Scorekaart uitlezen</h1>
        </div>
        <div className="review-layout with-image">
          <div className="image-pane">
            {imp.images.map((src) => (
              <img key={src} src={`/api/uploads/${src}`} alt="Scorekaart" style={{ marginBottom: 8 }} />
            ))}
          </div>
          <ImportProgress id={imp.id} status={imp.status} error={imp.error} />
        </div>
      </>
    );
  }

  const options = await listCourseOptions();
  const draft = imp.draft as RoundDraft;
  const card = (imp.rawOutput as { card?: AiCard } | null)?.card ?? null;
  const index = await indexOnDate(user, draft.date);
  const dups = await findDuplicates(user.id, draft);
  return (
    <>
      <Link href="/add" className="back">
        ‹ Toevoegen
      </Link>
      <div className="page-head">
        <h1>Nakijken</h1>
        <span className="chip">{draft.source === "ai_photo" ? "AI-foto" : "AI-screenshot"}</span>
      </div>
      {dups.map((d) => (
        <div key={d.id} className="alert yellow">
          Deze ronde lijkt al te bestaan: <Link href={`/rounds/${d.id}`}>{d.courseLabel}</Link> op dezelfde datum met dezelfde score.
        </div>
      ))}
      <RoundEditor mode="import" initialDraft={draft} options={options} importId={imp.id} images={imp.images} card={card} allowance={user.allowance} currentIndex={index} />
    </>
  );
}
