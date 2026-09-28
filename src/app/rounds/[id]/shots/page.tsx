import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bagClubs } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { loadRound } from "@/lib/rounds";
import ShotEditor from "@/components/ShotEditor";
import type { BaselineKey } from "@/lib/golf/strokesGained";

export const dynamic = "force-dynamic";

export default async function ShotsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ hole?: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  const r = await loadRound(id);
  if (!r || r.userId !== user.id) notFound();
  const bag = await db.select().from(bagClubs).where(eq(bagClubs.userId, user.id)).orderBy(asc(bagClubs.sortOrder), asc(bagClubs.id));
  const { hole } = await searchParams;
  return (
    <>
      <Link href={`/rounds/${id}`} className="back">
        ‹ Ronde
      </Link>
      <div className="page-head">
        <h1>Slaginvoer</h1>
      </div>
      {!bag.length && (
        <div className="alert note">
          Tip: <Link href="/more/bag">vul je tas</Link> voor clubstatistieken.
        </div>
      )}
      <ShotEditor
        roundId={id}
        startHole={Number(hole ?? 1)}
        puttUnit={user.puttUnit === "ft" ? "ft" : "m"}
        baseline={user.sgBaseline as BaselineKey}
        bag={bag.map((b) => ({ id: b.id, name: b.name, type: b.type }))}
        holes={r.holes.map((h) => ({
          number: h.number,
          par: h.par,
          length: h.length,
          strokes: h.strokes,
          putts: h.putts ?? null,
          shots: h.shots.map((s) => ({ lie: s.lie, distance: s.distance, penalty: s.penalty, bagClubId: s.bagClubId })),
        }))}
      />
    </>
  );
}
