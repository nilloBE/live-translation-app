# Scaling to 5 rooms / 250 concurrent users

Target load: **5 simultaneous rooms**, each with one speaker and up to **50 audience
members** reading translated captions — 250 concurrent realtime connections and up to
5 concurrent Azure Speech Translation sessions.

## Headline finding

**Raw throughput is not the bottleneck.** 250 Socket.IO connections and the caption
fan-out they imply (worst case: 5 speakers × a few interim-caption events/sec ×
50 recipients ≈ 1,000–1,500 small emits/sec) are well within what a single Node.js
instance handles — this is a couple of orders of magnitude below where a single
Socket.IO process typically starts to strain. The Speech SDK also runs in the
speaker's browser, not on our server, so the backend never touches audio.

The real risks at this scale are **availability and security**, not capacity:

1. one malformed message could crash the whole backend for all 5 rooms at once,
2. there is no authentication in front of the endpoints that mint paid Azure
   Speech tokens or that let a client join/publish to any room,
3. the Azure SignalR resource the deploy script provisions "for future use" was
   never wired up, so if the container ever runs more than one replica, captions
   silently stop reaching some audience members, and
4. the container scales to zero, so the first connection of a live event can hit
   a cold start.

## What this change already fixes

| # | Issue | File(s) | Status |
|---|---|---|---|
| 1 | A synchronous throw inside any Socket.IO listener (e.g. `roomId.trim()` on a non-string `roomId`, or `payload.roomId` on a malformed `publish-caption` payload) was an **uncaught exception that crashes the entire process**, dropping all 5 rooms/250 users at once. | `server/src/realtime.ts` | **Fixed.** Every listener is wrapped in `safeHandler`, and payloads are type-checked (`isCaptionPayloadShape`, `isRegisterSpeakerPayload`) before use. Verified with a scripted client that sends malformed `join-room`/`publish-caption` payloads and confirms `/health` still responds afterward. |
| 2 | No caps on caption text length or target-language count — a buggy or hostile client could balloon memory/bandwidth on every broadcast. | `server/src/realtime.ts` | **Fixed.** `MAX_TEXT_LENGTH` (4000 chars) and `MAX_TARGET_LANGUAGES` (20) truncate/cap payloads before they're stored or broadcast. |
| 3 | No visibility into how many rooms/users/messages are active. | `server/src/realtime.ts`, `server/src/routes/admin.ts`, `client-admin/` | **Fixed** — see the admin dashboard section below. |
| 4 | Container App scale-to-zero (`--min-replicas 0`) causes a cold start on the first connection of an event. | `scripts/deploy-azure.ps1` | **Fixed** — changed to `--min-replicas 1`. |

## What's still open, in priority order

### P0 — fix before trusting this at 250-user scale

**1. No authentication in front of `/api/speech-token` or the Socket.IO relay.**
`server/src/routes/speechToken.ts` has no auth middleware, and `server/src/realtime.ts`
accepts `join-room`/`publish-caption` from any connected socket. Concretely, this
means:
- Anyone who has the backend URL (it's embedded in the public audience app's JS
  bundle) can call `GET /api/speech-token` and mint a real Azure Speech
  authorization token, at your cost, against your quota — independent of whether
  they ever open the speaker app.
- Anyone can `join-room`/`publish-caption` into any room code, including rooms
  they didn't create, i.e. caption spoofing or flooding a real event's room.

This is the highest-impact remaining gap because it's an availability risk (a
recognizer quota exhausted by an outsider blocks your real 5 speakers) as much as
a security one.

Recommended fix, in order of effort:
- **Short term (cheap, ships this sprint):** gate `/api/speech-token` behind a
  shared `PRESENTER_ACCESS_CODE` header, distributed to presenters out of band,
  the same pattern already used for `ADMIN_API_KEY` in this change. The speaker
  app prompts for it once and stores it like the admin key does.
- **Medium term (more aligned with this repo's "Entra ID only" principle):**
  require presenters to sign in via Entra ID (`@azure/msal-browser`) before the
  speaker app can fetch a token; keep the audience app anonymous (its blast
  radius — reading captions — doesn't need authentication).
- Either way, thread the resulting identity/room-ownership through to
  `register-speaker` so the admin dashboard's "speaker" indicator becomes a real
  authorization boundary instead of the informational flag it is today (see the
  callout in the dashboard section below).

**2. The Azure SignalR resource is provisioned but not wired in.**
`scripts/deploy-azure.ps1` creates an Azure SignalR resource and assigns the
`SignalR App Server` role with the comment "allows the backend to use SignalR in
the future" — but `server/src/realtime.ts` runs a plain, single-process,
in-memory Socket.IO server. Socket.IO's room membership lives only in that one
process's memory. Combined with `--max-replicas 2`, if Container Apps ever scales
past one replica, a speaker connected to replica A and an audience member on
replica B will never see each other's events — captions silently stop for part
of the audience, with no error.

At exactly 5 rooms / 250 users, one replica is enough, so this isn't blocking a
single event *as long as `--max-replicas` stays effectively 1 in practice* (see
mitigation below). It becomes correctness-critical the moment you need
redundancy or expect traffic that could trigger a scale-out.

Recommended fix: pick one and implement it before running with more than one
replica —
- Complete the originally-intended integration: Azure SignalR Service now offers
  a Socket.IO-compatible mode; confirm the current extension package/setup in
  Azure's docs at implementation time, since this already has provisioning and
  RBAC done.
- Or add the `@socket.io/redis-adapter` backed by a small Azure Cache for Redis
  instance — the more common, framework-native way to run Socket.IO across
  multiple instances.

Either option also requires **session affinity** (sticky sessions) at the
ingress if you keep long-polling as a fallback transport, since a client's own
connection (not just broadcasts) must stay pinned to one instance unless the
adapter also brokers that.

**Interim mitigation (no code change):** until one of the above ships, keep
`--max-replicas` at 1 for this workload, or accept that only rooms whose
speaker and full audience land on the same replica will work correctly. This
implementation already sets `--min-replicas 1`; consider also setting
`--max-replicas 1` explicitly until the adapter work lands, trading elastic
scale for correctness at a load level (250 users) that doesn't need the extra
replica anyway.

**3. Azure AI Speech concurrency quota is unverified.**
5 simultaneous `TranslationRecognizer` sessions is a small number, but the
default concurrent-request quota for real-time Speech-to-text/Translation on a
standard (S0) resource is a subscription-level setting you haven't confirmed
against this workload. Verify the current quota in the Azure portal (Speech
resource → Quotas) or via a support request well ahead of the event, and request
an increase if it's below ~10 (leaving headroom for reconnects/retries during
the event, which briefly hold two sessions per speaker).

### P1 — should fix soon, lower blast radius

**4. No rate limiting on the HTTP API.** `/api/speech-token` and
`/api/admin/status` have no request-rate limits. Add `express-rate-limit` (a
few requests/minute is generous for both — the speaker refreshes its token every
~9 minutes, and the admin dashboard polls/streams over the socket namespace).

**5. No structured application logging.** `morgan` logs HTTP requests only; there's
no visibility into socket.io event volume, per-room errors, or Speech SDK errors
surfaced from the browser. For a 250-person live event, add Application Insights
(or at minimum structured JSON logs) so a mid-event issue can be diagnosed from
logs rather than guesswork. The admin dashboard (below) covers the metrics half
of this; it doesn't cover error-level tracing.

**6. `register-speaker` is informational, not authorization.** As implemented,
any client can call `register-speaker` and claim a room in the admin dashboard.
It's deliberately non-blocking (see the code comment in `realtime.ts`) so a race
between join and the first caption can never drop real captions — but it means
the dashboard's "speaker" indicator should be read as "a speaker session
announced itself for this room," not as verified presenter identity. This gets
resolved for real once item P0-1 (presenter auth) lands.

### P2 — future / only matters at larger scale or longer-lived deployments

- Once P0-2 (multi-instance broadcast) ships, revisit `--max-replicas` upward
  and add Container Apps session affinity if still using plain WebSocket +
  polling transports.
- No caption persistence exists today — a client joining mid-session only sees
  captions from the moment it joins. That's an intentional product behavior at
  this scale, not a bug, but worth flagging if a future requirement is
  "audience members should see the full transcript on late join."

## Rollout sequence

1. **Shipped in this change:** crash-hardening (`safeHandler` + payload
   validation/caps), `--min-replicas 1`, and the admin dashboard.
2. **Before the first live event at this scale:** presenter authentication
   (P0-1, short-term shared-code version), verify/raise the Speech quota (P0-3),
   pin `--max-replicas 1` explicitly or complete the SignalR/Redis adapter
   (P0-2), add basic rate limiting (P1-4).
3. **Load-test before trusting it live** (see below).
4. **Before scaling beyond this specific shape** (more rooms, more replicas, or
   repeated/ongoing use rather than one-off events): finish the multi-instance
   adapter properly, add structured logging/App Insights, and move presenter
   auth to Entra ID sign-in.

## Load-test checklist

Before relying on this for a real 5-room event, validate the actual shape of the
load, not just connection count:
- Script (or recruit) 5 concurrent "speakers," each publishing realistic
  interim + final caption traffic (a few events/sec while "talking") into 5
  distinct room codes.
- Connect 50 Socket.IO clients per room (250 total) as audience.
- Run for at least the expected event duration and watch, live, via the new
  `/admin/` dashboard: `activeRoomCount` (should read 5), `currentConnections`
  (should read ~255 including speakers), `rejectedPublishCount` (should stay at
  0 — any growth means a client is sending malformed payloads), and
  `memory.rssMb`/`memory.heapUsedMb` for creep over the run.
- Cross-check Container Apps CPU/memory in Azure Monitor against the Node
  process numbers from the dashboard to confirm headroom on the container's
  allocated resources.

## Admin dashboard (implemented in this change)

`client-admin/` is a new Vite/React app (served at `/admin/` in production,
`http://localhost:5175` in local dev) showing:
- Active room count, current and lifetime connection counts, captions relayed,
  rejected/malformed message count, server uptime, and process memory (RSS and
  heap used).
- A per-room table: connection count and peak, whether a speaker has registered,
  source/target languages, captions relayed, and created/last-activity
  timestamps.

It's backed by:
- `server/src/realtime.ts` — an in-memory `roomStats` map recording what
  Socket.IO's own room registry doesn't retain (creation time, last activity,
  per-room caption counts, peak concurrent connections, and which socket
  registered as the room's speaker), plus a `buildAdminSnapshot()` that combines
  that with live figures from `io.sockets.adapter` and `io.engine.clientsCount`.
- `GET /api/admin/status` (`server/src/routes/admin.ts`) — a polling/REST view
  of the same snapshot, for scripting or external monitoring.
- The `/admin` Socket.IO namespace — pushes a fresh snapshot every 2 seconds to
  connected dashboard clients (only while at least one is connected).

Both are gated by a shared `ADMIN_API_KEY` (HTTP header `x-admin-key`, or
`{ auth: { key } }` on the socket handshake) — an app-level secret unrelated to
Azure resource access, generated at deploy time by `scripts/deploy-azure.ps1`
and printed once, or pinned via `-AdminApiKey`/the repo-root `.env`.
