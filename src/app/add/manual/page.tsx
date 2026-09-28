import Link from "next/link";
import { redirect } from "next/navigation";
import { canWrite, requireUser } from "@/lib/auth";
import { listCourseOptions } from "@/lib/courses";
import { indexOnDate } from "@/lib/rounds";
import { today } from "@/lib/format";
import RoundEditor from "@/components/RoundEditor";
import type { RoundDraft } from "@/lib/golf/types";

export default async function ManualPage() {
  const user = await requireUser();
  if (!canWrite(user)) redirect("/");
  const [options, index] = await Promise.all([listCourseOptions(), indexOnDate(user, "9999-12-31")]);
  const draft: RoundDraft = {
    date: today(),
    clubName: "",
    loopName: "",
    teeName: "",
    teeGender: user.gender === "f" ? "f" : "m",
    holesCount: 9,
    format: "stableford",
    handicapIndex: index,
    playingHandicap: null,
    source: "manual",
    qualifying: true,
    pcc: 0,
    holes: Array.from({ length: 9 }, (_, i) => ({ number: i + 1, par: 4, si: i + 1, length: null, strokes: null, putts: null, fairway: null, gir: null, penalties: 0, bunker: 0 })),
  };
  return (
    <>
      <Link href="/add" className="back">
        ‹ Toevoegen
      </Link>
      <div className="page-head">
        <h1>Handmatig invoeren</h1>
      </div>
      {!options.length && (
        <div className="alert note">
          Nog geen banen. <Link href="/more/courses">Leg eerst een baan vast</Link> of vul par en SI hieronder zelf in.
        </div>
      )}
      <RoundEditor mode="manual" initialDraft={draft} options={options} allowance={user.allowance} currentIndex={index} />
    </>
  );
}
