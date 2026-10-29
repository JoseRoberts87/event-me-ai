"use client";

import { useActionState } from "react";
import { saveInterests } from "@/app/actions";

export function InterestsForm({ defaultText, defaultCity }: { defaultText: string; defaultCity: string }) {
  const [state, formAction, pending] = useActionState(saveInterests, {});
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <textarea
        name="interests"
        rows={5}
        defaultValue={defaultText}
        placeholder="e.g. Anything Phoebe Bridgers or boygenius, 90s shoegaze revival bands, small-venue jazz. Happy to travel for Radiohead."
        className="input"
      />
      <input name="city" defaultValue={defaultCity} placeholder="Home city (e.g. Austin)" className="input" />
      <button className="btn self-start" disabled={pending}>{pending ? "Understanding your taste…" : "Save interests"}</button>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
