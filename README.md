# Event Me AI

AI-powered concert tracker. Tell it what you love seeing live; it finds matching concerts, follows them, and sends curated updates (news, social buzz, lineup and ticket changes, setlists) as the show approaches.

See [PLAN.md](./PLAN.md) for the product plan and roadmap.

## Stack

- **Next.js 16** (App Router, server actions) — web app
- **Supabase** — Postgres, auth (magic link, invite-only), RLS
- **Strands Agents (TypeScript)** + **Claude** — AI agents
- **Inngest** — scheduled and fan-out background jobs
- **OpenTelemetry via Strands** — traces for every agent, model call, tool call and job
- **Resend** — email digests

## How it works

| Agent | File | Job |
|---|---|---|
| Interest | `src/lib/ai/agents/interest.ts` | Free-text taste → structured profile |
| Discovery | `src/lib/ai/agents/discovery.ts` | Searches Ticketmaster via a tool, ranks matches |
| Tracker | `src/lib/ai/agents/tracker.ts` | Claude web search for new updates on one concert |
| Digest | `src/lib/ai/agents/digest.ts` | Writes the daily email |

Background jobs (`src/inngest/functions.ts`):
- `tracking-scheduler` (hourly) picks followed concerts that are due (`src/lib/cadence.ts`: weekly when >60 days out, daily, every 6h in the final week, hourly on show day) and fans out `track-event` runs.
- `track-event` runs the tracker agent and stores new updates (deduped by URL).
- `daily-digest` (14:00 UTC) emails each user a summary of the last 24h.

## Telemetry

`src/instrumentation.ts` calls Strands' `setupTracer()` at server start. Strands emits OpenTelemetry spans for each agent invocation (`invoke_agent`), loop cycle, model call (`chat`, with token usage) and tool call (`execute_tool`).

App code wraps jobs and actions in `withSpan()` (`src/lib/telemetry/index.ts`), which:
- creates a parent span, so agent spans nest under the job or action that triggered them
- sets `app.user.id`, `app.event.id` and `app.job.name` as OTel baggage, which a baggage span processor copies onto **every** child span, including the ones Strands creates

Export uses standard OTel env vars (`OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`), so any OTLP backend works: Jaeger locally, Langfuse or similar in production.

## Local setup

```bash
npm install
cp .env.example .env.local        # fill in keys

# Database (Supabase CLI)
npx supabase init                 # once
npx supabase start
npx supabase db reset             # applies supabase/migrations

# Traces
docker compose up -d              # Jaeger UI → http://localhost:16686

# App + jobs (two terminals)
npm run dev
npm run inngest:dev               # Inngest dev UI → http://localhost:8288

# Create an invite, then sign up at /signup
npm run invite -- friend@example.com
```

Keys you need: Anthropic API key, Ticketmaster Discovery API key (free at developer.ticketmaster.com), Resend API key (for digests).

### Supabase auth settings

- Disable public sign-ups (Authentication → Sign In / Providers) so accounts are created only through invites.
- Add `http://localhost:3000/auth/callback` (and your production URL) to the redirect allow list.

## Scripts

| Command | |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm test` | Unit and telemetry tests (Vitest) |
| `npm run typecheck` | Route type generation + `tsc` |
| `npm run lint` | ESLint |
| `npm run invite -- [email] [--days=14]` | Create an invite code |
