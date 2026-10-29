import { DiscoverClient } from "./discover-client";

export default function DiscoverPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Discover concerts</h1>
      <p className="text-sm opacity-70">We search upcoming shows and pick the ones that fit your interests.</p>
      <DiscoverClient />
    </div>
  );
}
