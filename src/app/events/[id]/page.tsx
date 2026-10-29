import { Suspense } from "react";
import { notFound } from "next/navigation";
import { daysUntil, formatShowDate } from "@/app/components/format";
import { requireUser } from "@/lib/supabase/server";

const KIND_LABEL: Record<string, string> = {
  news: "News",
  social: "Social",
  lineup: "Lineup",
  tickets: "Tickets",
  logistics: "Logistics",
  change: "Change",
  setlist: "Setlist",
};

async function EventPageContent({ params }: { params: PageProps<"/events/[id]">["params"] }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const [{ data: event }, { data: updates }] = await Promise.all([
    supabase.from("events").select("*").eq("id", id).maybeSingle(),
    supabase.from("updates").select("*").eq("event_id", id).order("created_at", { ascending: false }),
  ]);
  if (!event) notFound();
  const days = daysUntil(event.starts_at);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{event.name}</h1>
        <p className="opacity-70">
          {formatShowDate(event.starts_at)}
          {days !== null && days >= 0 && ` · in ${days} day${days === 1 ? "" : "s"}`} · {[event.venue, event.city].filter(Boolean).join(", ")}
        </p>
        {event.url && <a href={event.url} target="_blank" rel="noreferrer" className="text-sm underline">Tickets</a>}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Timeline</h2>
        {!updates?.length && <p className="text-sm opacity-70">No updates yet. Follow this show and we&apos;ll start tracking it.</p>}
        {updates?.map((u) => (
          <article key={u.id} className={`card ${u.importance === 3 ? "border-red-500" : ""}`}>
            <p className="text-xs uppercase opacity-60">
              {KIND_LABEL[u.kind] ?? u.kind} · {new Date(u.created_at).toLocaleDateString()}
            </p>
            <h3 className="font-medium">{u.title}</h3>
            <p className="text-sm">{u.summary}</p>
            {u.url && (
              <a href={u.url} target="_blank" rel="noreferrer" className="text-xs underline opacity-70">
                {u.source_name ?? "Source"}
              </a>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}

export default function EventPage({ params }: PageProps<"/events/[id]">) {
  return (
    <Suspense fallback={<p className="opacity-70">Loading…</p>}>
      <EventPageContent params={params} />
    </Suspense>
  );
}
