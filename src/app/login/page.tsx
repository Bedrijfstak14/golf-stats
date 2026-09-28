import { redirect } from "next/navigation";
import { count } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { login } from "@/app/actions";
import ActionForm from "@/components/ActionForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  const [{ n }] = await db.select({ n: count() }).from(users);
  if (n === 0) redirect("/setup");
  return (
    <div className="auth-wrap">
      <div className="logo">
        <img src="/icon.svg" alt="" /> Golf Stats
      </div>
      <div className="card">
        <h1>Inloggen</h1>
        <ActionForm action={login} submit="Inloggen">
          <label className="field">
            <span>E-mail</span>
            <input name="email" type="email" autoComplete="username" required />
          </label>
          <label className="field">
            <span>Wachtwoord</span>
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
        </ActionForm>
      </div>
      <p className="muted small center">Geen open registratie. Vraag de eigenaar om een uitnodigingslink.</p>
    </div>
  );
}
