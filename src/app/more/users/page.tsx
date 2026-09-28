import Link from "next/link";
import { desc, isNull } from "drizzle-orm";
import { db } from "@/db";
import { invites, users } from "@/db/schema";
import { requireOwner } from "@/lib/auth";
import { createInvite, revokeInvite } from "@/app/actions";
import ActionForm from "@/components/ActionForm";

export const dynamic = "force-dynamic";

const ROLE: Record<string, string> = { owner: "Eigenaar", player: "Speler", viewer: "Flightgenoot (lezen)" };

export default async function UsersPage() {
  await requireOwner();
  const us = await db.select().from(users).orderBy(users.name);
  const inv = await db.select().from(invites).where(isNull(invites.usedAt)).orderBy(desc(invites.createdAt));
  return (
    <>
      <Link href="/more" className="back">
        ‹ Meer
      </Link>
      <div className="page-head">
        <h1>Spelers</h1>
      </div>
      <div className="card tight">
        <ul className="list">
          {us.map((u) => (
            <li key={u.id} className="item">
              <div>
                <strong>{u.name}</strong>
                <div className="small muted">{u.email}</div>
              </div>
              <span className="chip">{ROLE[u.role] ?? u.role}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="card">
        <h2>Uitnodigen</h2>
        <p className="small muted">Geen open registratie: de uitgenodigde krijgt een link die 14 dagen geldig is.</p>
        <ActionForm action={createInvite} submit="Uitnodigingslink maken">
          <div className="grid grid-2">
            <label className="field">
              <span>E-mail</span>
              <input name="email" type="email" required />
            </label>
            <label className="field">
              <span>Rol</span>
              <select name="role" defaultValue="player">
                <option value="player">Speler (eigen rondes)</option>
                <option value="viewer">Flightgenoot (alleen lezen)</option>
              </select>
            </label>
          </div>
        </ActionForm>
      </div>
      {inv.length > 0 && (
        <div className="card">
          <h2>Openstaande uitnodigingen</h2>
          <ul className="list">
            {inv.map((i) => (
              <li key={i.token} className="item">
                <div>
                  {i.email} <span className="small muted">· {ROLE[i.role]} · verloopt {i.expiresAt.toLocaleDateString("nl-NL")}</span>
                  <div className="small muted" style={{ wordBreak: "break-all" }}>
                    {process.env.APP_URL ?? ""}/invite/{i.token}
                  </div>
                </div>
                <form action={revokeInvite}>
                  <input type="hidden" name="token" value={i.token} />
                  <button className="btn sm danger">Intrekken</button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
