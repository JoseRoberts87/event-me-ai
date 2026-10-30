# Event Me AI

AI-powered concert tracker. Tell it what you love seeing live; it finds matching concerts, follows them, and sends curated updates (news, social buzz, lineup and ticket changes, setlists) as the show approaches.

See [PLAN.md](./PLAN.md) for the product plan and roadmap.

## Stack

- **Next.js 16** (App Router, server actions) — web app
- **Supabase** — Postgres, auth (magic link, invite-only), RLS
- **Strands Agents (TypeScript)** + **Claude** — AI agents
- **Inngest** — scheduled and fan-out background jobs
- **Langfuse** (via Strands' OpenTelemetry tracing) — traces for every agent, model call, tool call and job
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

## Telemetry (Langfuse)

`src/instrumentation.ts` calls Strands' `setupTracer()` at server start and exports traces over OTLP to Langfuse. Strands emits a span for each agent invocation (`invoke_agent`), loop cycle, model call (`chat`, with token usage) and tool call (`execute_tool`); Langfuse shows these as nested observations with inputs, outputs, latency and cost.

App code wraps jobs and actions in `withSpan()` (`src/lib/telemetry/index.ts`), which:
- creates a root span, so agent spans nest under the job or action that triggered them, and names the Langfuse trace after it
- sets Langfuse trace attributes as OTel baggage, which a baggage span processor copies onto **every** span (Langfuse needs them on each span to filter and aggregate):

| Attribute | Langfuse field | Value |
|---|---|---|
| `user.id` | User | Supabase user id |
| `session.id` | Session | `event:<concert id>`, so every tracking run for a show is grouped |
| `langfuse.trace.metadata.event_id` | Metadata | Concert id |
| `langfuse.trace.metadata.job` | Metadata | Job name, e.g. `track-event` |
| `langfuse.trace.name` | Trace name | Root span name |

- flushes buffered spans when the root span ends, since serverless functions can freeze before the batch exporter runs

Set `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` and `LANGFUSE_BASE_URL`; `src/lib/telemetry/setup.ts` derives the OTLP endpoint (`<base>/api/public/otel`) and Basic-auth header from them. Langfuse is the only trace backend; without these keys tracing is off.

## Local setup

```bash
npm install
cp .env.example .env.local        # fill in keys

# Database (Supabase CLI)
npx supabase init                 # once
npx supabase start
npx supabase db reset             # applies supabase/migrations

# App + jobs (two terminals)
npm run dev
npm run inngest:dev               # Inngest dev UI → http://localhost:8288

# Create an invite, then sign up at /signup
npm run invite -- friend@example.com
```

Keys you need: Anthropic API key, Ticketmaster Discovery API key (free at developer.ticketmaster.com), Resend API key (for digests), and Langfuse project keys.

### Langfuse

Easiest: create a free project at [cloud.langfuse.com](https://cloud.langfuse.com) (or `us.cloud.langfuse.com`), copy the public and secret keys from project settings into `.env.local`, and traces appear as soon as you use the app.

To self-host instead, run Langfuse's Docker Compose setup (`git clone https://github.com/langfuse/langfuse.git && cd langfuse && docker compose up`). It serves on port 3000, the same as `next dev`, so change its web port mapping (e.g. `3001:3000` and `NEXTAUTH_URL=http://localhost:3001`) and set `LANGFUSE_BASE_URL=http://localhost:3001`.

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
