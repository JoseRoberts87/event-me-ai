# Event Me AI — Plan

An AI-powered tracker for music concerts. Users describe the artists and scenes they care about; the app finds matching concerts, follows them, and delivers curated updates — news, social posts, setlist/lineup changes, ticket drops, and countdown digests — leading up to the show.

## Decisions

| Area | Decision |
|---|---|
| Platform | Web-first (Next.js, responsive + installable PWA) |
| Launch vertical | Music concerts only |
| Access | Invite-only (admin-issued invite codes) |
| Stack | Next.js (TypeScript) + Supabase (Postgres, Auth, pgvector) + Claude API |
| Agent framework & telemetry | Strands Agents (TypeScript SDK) with its built-in OpenTelemetry tracing |
| Background jobs | Inngest (scheduled, retryable per-event workflows) |
| Notifications | Resend (email digests) + Web Push |

## Architecture

```
Next.js app (UI + API routes)
   │
   ├── Supabase: users, invites, interests, events, follows, updates, embeddings
   │
   └── Inngest jobs ──► Strands agents ──► Claude (+ web search tool)
                          │      └──► tools: Ticketmaster, SeatGeek, setlist.fm,
                          │                 Reddit, YouTube, Bluesky, RSS
                          └──► OpenTelemetry traces ──► OTLP collector/backend
```

### Agents (Strands, TypeScript)
1. **Interest agent** — turns free text ("90s shoegaze, anything Phoebe Bridgers, shows near Austin") into structured interests: artists, genres, location, radius, date window.
2. **Discovery agent** — queries Ticketmaster/SeatGeek + web search to find matching concerts; ranks and explains matches.
3. **Tracker agent** — per followed event, gathers new items from sources, dedupes (pgvector similarity), scores relevance, and detects material changes (venue/time change, presale, support act announced, cancellation).
4. **Digest agent** — writes per-event and daily summaries with source links.

### Telemetry (Strands + OpenTelemetry)
- Enable Strands tracing in every agent; spans cover agent invocations, model calls (tokens, latency), tool calls, and the event loop.
- Add custom attributes: `user.id`, `event.id`, `job.name`, `agent.name`, cost estimate.
- Wrap Inngest job runs in parent spans so agent traces nest under the job that triggered them.
- Export via OTLP HTTP (`OTEL_EXPORTER_OTLP_ENDPOINT`). Dev: local Jaeger or Langfuse via Docker. Prod: Langfuse (LLM-focused) or any OTLP backend.
- Dashboards/alerts: cost per user/event, job failure rate, source latency, update volume.

## Data model (initial)
- `invites` (code, created_by, used_by, expires_at)
- `profiles` (user_id, display_name, home_location, notification prefs)
- `interests` (user_id, raw_text, structured JSON, embedding)
- `events` (source, source_id, artist(s), venue, city, starts_at, url, status)
- `follows` (user_id, event_id, created_at)
- `updates` (event_id, source, url, title, summary, kind, importance, embedding, published_at)
- `notifications` (user_id, update_id, channel, sent_at)

## Data sources
| Source | Use | Notes |
|---|---|---|
| Ticketmaster Discovery API | Event discovery, ticket status | Free tier |
| SeatGeek API | Event discovery, pricing | Free tier |
| setlist.fm API | Recent setlists for the tour | Free, non-commercial key |
| Claude web search tool | News, announcements | Per-search cost |
| Reddit, YouTube, Bluesky | Social buzz, fan posts, clips | Official APIs only |
| Artist/venue RSS & sites | Official announcements | Page-diff watching |
| X/Twitter | Deferred | API cost too high for MVP |

## Tracking cadence
Polling frequency scales with proximity: weekly (>60 days out) → daily (≤60 days) → several times a day (≤7 days) → hourly (day of show). Keeps costs bounded.

## Phases

### Phase 1 — MVP
- Project scaffold: Next.js, Supabase, Inngest, Strands + OTel wiring, CI
- Invite-only sign-up (magic link via Supabase Auth)
- Interest onboarding (interest agent)
- Concert discovery + follow (discovery agent, Ticketmaster/SeatGeek)
- Per-event timeline + daily digest email (tracker + digest agents, web search)
- Telemetry visible end-to-end in local Jaeger/Langfuse

### Phase 2
- Social sources (Reddit, YouTube, Bluesky), setlist.fm
- Real-time push alerts for high-importance changes
- Proximity-based cadence + cost dashboards

### Phase 3
- Personalization from engagement (clicks/dismissals)
- Group/shared tracking ("going with friends")
- Calendar sync, native mobile app

## Risks & mitigations
- **LLM/API cost** — batch per event (not per user), cache results, proximity cadence, per-user caps; track cost in telemetry.
- **Source ToS** — official APIs only, no social scraping.
- **Accuracy/staleness** — every update links its source; change detection compares against stored event state.

## Open items
- Telemetry backend for prod (Langfuse cloud vs self-hosted vs other)
- Hosting (Vercel + Supabase cloud assumed)
