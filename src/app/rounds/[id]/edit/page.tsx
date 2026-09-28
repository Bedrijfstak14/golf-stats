import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listCourseOptions } from "@/lib/courses";
import { loadRound } from "@/lib/rounds";
import RoundEditor from "@/components/RoundEditor";
import type { Fairway, RoundDraft } from "@/lib/golf/types";

export const dynamic = "force-dynamic";

export default async function EditRoundPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  const r = await loadRound(id);
  if (!r || r.userId !== user.id) notFound();
  const options = await listCourseOptions();
  const [clubName, loopName] = r.courseLabel.split(" – ");
  const draft: RoundDraft = {
    date: r.date,
    clubName: clubName ?? r.courseLabel,
    loopName: loopName ?? "",
    teeName: (r.teeLabel ?? "").replace(/\s*\((h|d)\)$/, ""),
    teeGender: (r.teeLabel ?? "").endsWith("(d)") ? "f" : "m",
    holesCount: r.holesCount,
    format: r.format as RoundDraft["format"],
    handicapIndex: r.handicapIndex,
    courseHandicap: r.courseHandicap,
    playingHandicap: r.playingHandicap,
    courseRating: r.courseRating,
    slope: r.slope,
    pcc: r.pcc,
    qualifying: r.qualifying,
    clubId: r.clubId,
    loopId: r.loopId,
    combinationId: r.combinationId,
    teeId: r.teeId,
    source: r.source as RoundDraft["source"],
    notes: r.notes,
    // slagenreeksen meenemen, anders gaan ze verloren bij opslaan
    holes: r.holes.map((h) => ({
      number: h.number,
      par: h.par,
      si: h.si,
      length: h.length,
      strokes: h.strokes,
      points: h.points,
      putts: h.putts,
      fairway: h.fairway as Fairway | null,
      gir: h.gir,
      penalties: h.penalties,
      bunker: h.bunker,
      shots: h.shots.map((s) => ({ lie: s.lie, distance: s.distance, penalty: s.penalty, bagClubId: s.bagClubId })),
    })),
  };
  return (
    <>
      <Link href={`/rounds/${id}`} className="back">
        ‹ Ronde
      </Link>
      <div className="page-head">
        <h1>Ronde bewerken</h1>
      </div>
      <RoundEditor mode="edit" initialDraft={draft} options={options} roundId={id} allowance={user.allowance} currentIndex={r.handicapIndex} />
    </>
  );
}
