import { redirect } from "next/navigation";
import { count } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { setupOwner } from "@/app/actions";
import ActionForm from "@/components/ActionForm";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const [{ n }] = await db.select({ n: count() }).from(users);
  if (n > 0) redirect("/login");
  return (
    <div className="auth-wrap">
      <div className="logo">
        <img src="/icon.svg" alt="" /> Golf Stats
      </div>
      <div className="card">
        <h1>Welkom</h1>
        <p className="muted">Maak het eigenaarsaccount aan. Daarna is registreren alleen nog mogelijk via een uitnodiging.</p>
        <ActionForm action={setupOwner} submit="Account aanmaken">
          <label className="field">
            <span>Naam</span>
            <input name="name" required />
          </label>
          <label className="field">
            <span>E-mail</span>
            <input name="email" type="email" autoComplete="username" required />
          </label>
          <label className="field">
            <span>Wachtwoord (min. 10 tekens)</span>
            <input name="password" type="password" autoComplete="new-password" minLength={10} required />
          </label>
          <div className="grid grid-2">
            <label className="field">
              <span>Geslacht (voor tees)</span>
              <select name="gender" defaultValue="m">
                <option value="m">Heer</option>
                <option value="f">Dame</option>
              </select>
            </label>
            <label className="field">
              <span>Officiële index (optioneel)</span>
              <input name="officialIndex" inputMode="decimal" placeholder="bijv. 24,3" />
            </label>
          </div>
        </ActionForm>
      </div>
    </div>
  );
}
