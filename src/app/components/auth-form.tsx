"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/actions";

type Props = {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  submitLabel: string;
  withInviteCode?: boolean;
};

export function AuthForm({ action, submitLabel, withInviteCode }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex max-w-sm flex-col gap-3">
      <input name="email" type="email" required placeholder="you@example.com" className="input" />
      {withInviteCode && <input name="code" required placeholder="Invite code" className="input" />}
      <button className="btn" disabled={pending}>{pending ? "Working…" : submitLabel}</button>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.message && <p className="text-sm text-green-700">{state.message}</p>}
    </form>
  );
}
