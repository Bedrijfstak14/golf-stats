import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { invites } from "@/db/schema";
import { acceptInvite } from "@/app/actions";
import ActionForm from "@/components/ActionForm";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [inv] = await db
    .select()
    .from(invites)
    .where(and(eq(invites.token, token), isNull(invites.usedAt), gt(invites.expiresAt, new Date())));
  return (
    <div className="auth-wrap">
      <div className="logo">
        <img src="/icon.svg" alt="" /> Golf Stats
      </div>
      <div className="card">
        {!inv ? (
          <>
            <h1>Uitnodiging ongeldig</h1>
            <p className="muted">Deze link is al gebruikt of verlopen. Vraag de eigenaar om een nieuwe.</p>
          </>
        ) : (
          <>
            <h1>Account aanmaken</h1>
            <p className="muted">
              Uitnodiging voor <strong>{inv.email}</strong> als {inv.role === "viewer" ? "flightgenoot (lezen)" : "speler"}.
            </p>
            <ActionForm action={acceptInvite} submit="Account aanmaken">
              <input type="hidden" name="token" value={token} />
              <label className="field">
                <span>Naam</span>
                <input name="name" required />
              </label>
              <label className="field">
                <span>Wachtwoord (min. 10 tekens)</span>
                <input name="password" type="password" autoComplete="new-password" minLength={10} required />
              </label>
              <label className="field">
                <span>Geslacht (voor tees)</span>
                <select name="gender" defaultValue="m">
                  <option value="m">Heer</option>
                  <option value="f">Dame</option>
                </select>
              </label>
            </ActionForm>
          </>
        )}
      </div>
    </div>
  );
}
