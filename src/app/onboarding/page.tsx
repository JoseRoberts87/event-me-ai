import { Suspense } from "react";
import { requireUser } from "@/lib/supabase/server";
import { InterestsForm } from "./interests-form";

async function OnboardingPageContent() {
  const { supabase, user } = await requireUser();
  const [{ data: interests }, { data: profile }] = await Promise.all([
    supabase.from("interests").select("raw_text, structured").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1),
    supabase.from("profiles").select("home_city").eq("user_id", user.id).single(),
  ]);
  const latest = interests?.[0];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">What do you love seeing live?</h1>
      <p className="text-sm opacity-70">Describe artists, genres and how far you&apos;ll travel. Our AI turns it into a profile for finding shows.</p>
      <InterestsForm defaultText={latest?.raw_text?.split("\n\nI live in")[0] ?? ""} defaultCity={profile?.home_city ?? ""} />
      {latest && (
        <details className="card text-sm">
          <summary className="cursor-pointer">Current profile</summary>
          <pre className="mt-2 overflow-x-auto text-xs">{JSON.stringify(latest.structured, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<p className="opacity-70">Loading…</p>}>
      <OnboardingPageContent />
    </Suspense>
  );
}
