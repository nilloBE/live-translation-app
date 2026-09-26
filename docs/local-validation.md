# Local small-event validation

## Scope and environment

Tested on 2026-09-26: the working tree on `feature/scaling-hardening-admin-dashboard`,
based on `eb0c042a6fa9cd51e5de9bdee144465565ee676f`, not a deployed or committed release.
Windows host, Node.js 26.3.0, local loopback Socket.IO. The
backend and simulated clients share one Node process in the load harness. Docker
Desktop's Linux engine was unavailable, so no container CPU/memory allocation was
tested. No Azure changes, live Speech calls, push or deployment were performed.

## Results

| Check | Result |
| --- | --- |
| Workspace typecheck and production builds | Passed; speaker bundle retains a >500 kB Vite warning. |
| PowerShell parsing and deployment mocks | Passed; SKU precedence/create/preserve/transitions, denied change, lookup/readback failures, topology/image/secret assertions. No live Azure calls. |
| Normal synthetic load | 3 rooms, 50 audience + 1 speaker each, 300 seconds, 1,097 captions/room, 164,550 deliveries, p95 22 ms. |
| Headroom synthetic load | 3 rooms, 60 audience + 1 speaker each, 60 seconds, 219 captions/room, 39,420 deliveries, p95 23 ms. |
| Delivery assertions | No missing/duplicate captions or cross-room leakage among continuously connected listeners, no unexpected disconnects; empty room cleanup passed. |
| Reconnect/restart | Actual speaker relay re-registers after transport loss; offline publish is dropped. Full backend replacement permits automatic speaker registration and audience rejoin; fresh captions arrive. |
| Abuse/ownership checks | Malformed/oversized messages, publish without registration, second speaker, join/register/publish flooding, room/member budgets and token HTTP limits rejected as expected. |
| Admin | Anonymous/wrong-key REST/namespace access rejected; valid access works. Admin excluded from participant totals; room audience/speaker/total counts verified under load. |
| Local deployment smoke | Health, anonymous rejection, authenticated admin REST/socket and disposable synthetic speaker/audience room passed. Real token acquisition not invoked. |
| Browser | Local speaker, audience and admin apps loaded. Wrong admin key rejected, valid test key accepted. Browser audience received a synthetic caption and switched English to Dutch. Admin showed audience 1, speaker 1, total 2. Advancing browser time exposed the stale status. Occupied-room speaker startup displayed a rejection. |
| Responsive layout | Playwright checked 390 px phone and 1440 px desktop layouts. Fixed admin grid overflow from the wider table; table now scrolls inside its panel. Audience caption view fits phone width. |

Load sends realistic synthetic French source text and English/Dutch/Spanish targets
roughly four times per second (250 ms after each acknowledged send), with every
fourth caption final. Latency is receipt time minus payload timestamp using the same
host clock, collected for every audience delivery; the harness asserts p95 <500 ms.
It is relay latency, not Speech recognition/translation or Internet latency.

Normal-run heap start/end was 41/46 MB, final RSS 227 MB; headroom was 41/33 MB,
RSS 164 MB. These numbers include all simulated clients and accumulated test data,
vary with GC, and do not establish stable backend-only memory usage over an event.

## Reproduce

From the root, after `npm install`:

```powershell
npm run typecheck
npm run build
npm run test:deployment
npm test
$env:LOAD_SECONDS='300'
try { npm test } finally { Remove-Item Env:LOAD_SECONDS }
$env:LOAD_AUDIENCES='60'
$env:LOAD_SECONDS='60'
try { npm test } finally { Remove-Item Env:LOAD_AUDIENCES; Remove-Item Env:LOAD_SECONDS }
```

The relay suite uses an ephemeral HTTP port, generated test-only admin key and stub
token route. `test:deployment` mocks Azure functions; it never invokes Azure CLI.
The browser checks used the Vite apps and local backend with explicit localhost
CORS and a test-only admin key. No microphone or Speech service was needed.
Browser evidence is based on DOM assertions and viewport measurements. Screenshot
retrieval encountered a Copilot attachment-fetch error, so no reliable screenshot
artifact is retained as sign-off evidence. An operator visual review remains useful.

## Open gates before a real event

1. Run the expected full event duration with representative Container App CPU/memory
   settings and observe steady-state resource usage after warm-up. Host loopback
   results do not establish Internet/venue Wi-Fi or Azure ingress behavior.
2. With authorization, verify real F0/S0 changes on a non-event resource, including
   eligibility, actual tier readback and quota propagation. Mocks cannot prove Azure
   will allow a particular downgrade.
3. Run three simultaneous real S0 Speech recognizers with intended languages/targets
   through at least two token renewals. Check microphone permissions and caption
   continuity on real audience devices.
4. After an approved deployment, verify one serving healthy revision, min/max one
   replica, expected image, S0, frontend assets and a real room/admin connection.
   The script fails closed during unsettled rollout. If the preserved admin key is
   unavailable to smoke testing, authenticated admin verification remains open.
5. Review dependency advisories before public exposure. Dependency installation
   reported 8 advisories (2 low, 4 moderate, 2 high); no forced unrelated upgrades
   were performed in this change. Node 26 also reports the tsx loader deprecation.

Anonymous token access and room ownership remain deliberate risks, not resolved
security findings. Limits are process-local abuse safeguards, not a spending cap.
Deploy only outside events; restarts discard room state and missed captions are
not replayed. Keep a known-good revision for an operator-managed rollback.