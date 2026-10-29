import { Suspense } from "react";
import Link from "next/link";
import { signOut } from "@/app/actions";
import { daysUntil, formatShowDate } from "@/app/components/format";
import { requireUser } from "@/lib/supabase/server";

async function HomePageContent() {
  const { supabase, user } = await requireUser();
  const { data: follows } = await supabase
    .from("follows")
    .select("events(id, name, venue, city, starts_at, status, updates(id, title, importance, created_at))")
    .eq("user_id", user.id);

  const events = (follows ?? [])
    .flatMap((f) => (f.events ? [f.events].flat() : []))
    .sort((a, b) => (a.starts_at ?? "9999").localeCompare(b.starts_at ?? "9999"));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your concerts</h1>
        <form action={signOut}><button className="text-sm underline">Sign out</button></form>
      </div>
      {events.length === 0 ? (
        <p className="opacity-70">
          You&apos;re not following any shows yet. <Link href="/onboarding" className="underline">Tell us your taste</Link> or{" "}
          <Link href="/discover" className="underline">discover concerts</Link>.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {events.map((e) => {
            const latest = [...e.updates].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
            const days = daysUntil(e.starts_at);
            const urgent = e.updates.some((u) => u.importance === 3);
            return (
              <li key={e.id} className="card">
                <Link href={`/events/${e.id}`} className="font-medium hover:underline">{e.name}</Link>
                <p className="text-sm opacity-70">
                  {formatShowDate(e.starts_at)}
                  {days !== null && days >= 0 && ` · in ${days} day${days === 1 ? "" : "s"}`} · {[e.venue, e.city].filter(Boolean).join(", ")}
                  {e.status !== "scheduled" && <span className="ml-2 font-semibold text-red-600 uppercase">{e.status}</span>}
                </p>
                {latest && (
                  <p className="mt-2 text-sm">
                    {urgent && <span className="mr-1 text-red-600">●</span>}
                    {latest.title}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<p className="opacity-70">Loading…</p>}>
      <HomePageContent />
    </Suspense>
  );
}
