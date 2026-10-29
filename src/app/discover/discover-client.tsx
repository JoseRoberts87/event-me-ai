"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { discover, follow, unfollow, type DiscoverState } from "@/app/actions";
import { formatShowDate } from "@/app/components/format";

function FollowButton({ eventId, initial }: { eventId: string; initial: boolean }) {
  const [followed, setFollowed] = useState(initial);
  const [pending, startTransition] = useTransition();
  return (
    <button
      className={followed ? "rounded-md border px-3 py-1 text-sm" : "btn py-1"}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await (followed ? unfollow(eventId) : follow(eventId));
          setFollowed(!followed);
        })
      }
    >
      {followed ? "Following" : "Follow"}
    </button>
  );
}

export function DiscoverClient() {
  const [state, run, pending] = useActionState<DiscoverState>(discover, {});
  return (
    <div className="flex flex-col gap-4">
      <form action={run}>
        <button className="btn" disabled={pending}>{pending ? "Searching for shows…" : "Find concerts for me"}</button>
      </form>
      {state.error && (
        <p className="text-sm text-red-600">
          {state.error} <Link href="/onboarding" className="underline">Set interests</Link>
        </p>
      )}
      {state.concerts?.length === 0 && <p className="text-sm opacity-70">No upcoming matches yet. Try broadening your interests.</p>}
      <ul className="flex flex-col gap-3">
        {state.concerts?.map((c) => (
          <li key={c.id} className="card flex items-start justify-between gap-4">
            <div>
              <Link href={`/events/${c.id}`} className="font-medium hover:underline">{c.name}</Link>
              <p className="text-sm opacity-70">
                {formatShowDate(c.startsAt)} · {[c.venue, c.city].filter(Boolean).join(", ")}
              </p>
              <p className="mt-1 text-sm">{c.reason}</p>
            </div>
            <FollowButton eventId={c.id} initial={c.followed} />
          </li>
        ))}
      </ul>
    </div>
  );
}
