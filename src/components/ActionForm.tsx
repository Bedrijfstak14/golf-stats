"use client";
import { useActionState } from "react";
import type { FormState } from "@/app/actions";

/** Formulier rond een server action, met foutmelding/bevestiging en een verzendknop. */
export default function ActionForm({
  action,
  children,
  submit = "Opslaan",
  block = true,
  className,
}: {
  action: (state: FormState, f: FormData) => Promise<FormState>;
  children: React.ReactNode;
  submit?: string;
  block?: boolean;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className}>
      {children}
      {state?.error && <div className="alert red">{state.error}</div>}
      {state?.ok && (
        <div className="alert ok" style={{ wordBreak: "break-all" }}>
          {state.ok}
        </div>
      )}
      <button className={`btn primary ${block ? "block" : ""}`} disabled={pending}>
        {pending ? "Bezig…" : submit}
      </button>
    </form>
  );
}
