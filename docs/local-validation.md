# Local small-event validation

## Scope and environment

Initial local validation on 2026-09-26: the working tree on `feature/scaling-hardening-admin-dashboard`,
based on `eb0c042a6fa9cd51e5de9bdee144465565ee676f`, not a deployed or committed release.
Windows host, Node.js 26.3.0, local loopback Socket.IO. The
backend and simulated clients share one Node process in the load harness. Docker
Desktop's Linux engine was unavailable, so no container CPU/memory allocation was
tested. No Azure changes, live Speech calls, push or deployment were performed during
that initial phase. The later authorized Azure deployment is recorded below.

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
2. The later dev deployment verified F0-to-S0 eligibility, upgrade and actual tier
   readback. S0-to-F0 downgrade and three-recognizer quota behavior remain unverified.
3. Run three simultaneous real S0 Speech recognizers with intended languages/targets
   through at least two token renewals. Check microphone permissions and caption
   continuity on real audience devices.
4. Deployment topology, asset integrity and synthetic room/admin checks passed in
   Azure as recorded below. Real-device microphone and visual checks remain open.
5. Review and remediate dependency advisories before a public event. The initial
   installation reported 8 advisories; the later root audit reported 16 (2 low,
   7 moderate, 5 high, 2 critical). The critical findings are `concurrently` and
   `shell-quote` in local development tooling. Other findings include client-side
   dependencies; this is not a security clearance. No forced unrelated upgrades
   were performed. Node 26 also reports the local tsx loader deprecation.

Anonymous token access and room ownership remain deliberate risks, not resolved
security findings. Limits are process-local abuse safeguards, not a spending cap.
Deploy only outside events; restarts discard room state and missed captions are
not replayed. Keep a known-good revision for an operator-managed rollback.

## Azure deployment follow-up: 2026-09-26

- Pushed implementation `2cafbd2` and deployment fixes `cab401b` to
   `feature/scaling-hardening-admin-dashboard`. Deployed application source: `cab401b`.
- Reused `rg-live-translation-dev`, with backend/Speech in Sweden Central and the
   existing Static Web App in West Europe. Existing unused SignalR resources were
   left untouched; no SignalR integration was added.
- Upgraded the existing Speech resource from F0 to paid S0 in place. Verified S0
   readback and a real Managed Identity token exchange. Token value was not printed;
   `Cache-Control: no-store`, frontend CORS and expiry metadata passed. No audio sent.
- Image: `acrlivetranslationdev.azurecr.io/live-translation-api:d-f0f4847a82c34a39a1`.
- Sole healthy serving revision: `api-live-translation-dev--d-f0f4847a82c34a39a1`.
   Single revision mode, min/max replicas 1, actual ready/running replicas 1,
   restart count 0 at verification. Allocation: 0.5 vCPU / 1 GiB.
- Backend: https://api-live-translation-dev.happyocean-bb9b7789.swedencentral.azurecontainerapps.io
- Audience: https://agreeable-grass-096bf8e03.7.azurestaticapps.net/
- Speaker: https://agreeable-grass-096bf8e03.7.azurestaticapps.net/speaker/
- Admin: https://agreeable-grass-096bf8e03.7.azurestaticapps.net/admin/
- Passed deployment smoke: health, frontend HTML, anonymous admin rejection,
   authenticated admin REST/socket, speaker registration, audience count and
   synthetic caption delivery. All nine published HTML/JS/CSS files matched the
   three local client builds by SHA-256.
- Generated a random admin credential directly into the ignored root `.env` and
   installed it as a Container App secret. No credential was committed or printed.
- Live preflight exposed the SKU API's `value` envelope; fixed with array/envelope
   regression tests. The first rollout rejected an overlong revision name, leaving
   the old revision serving. Fixed with a unique 20-character tag and length test.
- ACR exposed Azure SDK dependencies requiring Node 22+, while the image used
   Node 20. Switched all Docker stages to Node 24 LTS and strict installation engine
   checks. ACR validation build `dtd` and deployed build `dte` passed. The isolated
   backend dependency audit reported zero vulnerabilities at build time; that does
   not supersede the root/client dependency findings above.
- This deployment is ready for manual dev testing, not yet signed off for a public
   event. Three live recognizers, two token renewals, real audience devices and
   full-duration venue/network/resource validation remain outstanding.

## Transcript download deployment: 2026-10-04

- Published frontend source `7788741a78ffec114753fbd00bddde34192000c8` from
   `feature/transcript-download-ai-disclaimer` to the existing Static Web App
   production environment. PR #2 remains open and unmerged.
- Reused only the frontend build/publish block of `scripts/deploy-azure.ps1`.
   Audience, speaker and admin retain their existing URLs above. No backend,
   Speech, RBAC or infrastructure changes were made.
- Backend remained healthy on revision
   `api-live-translation-dev--d-f0f4847a82c34a39a1` before and after publishing.
- All six transcript regression tests, workspace typechecks and three production
   client builds passed. All nine published HTML/JS/CSS files matched their local
   production builds by SHA-256.
- Live deployment smoke passed, including authenticated admin REST/socket checks
   and disposable synthetic caption delivery. No Speech request or audio was sent.
- Live browser checks confirmed the speaker AI notice, download control and all
   20 recognition hints. The French audience AI notice directly follows
   "Sous-titres en direct"; empty transcript downloads are disabled. The temporary
   audience room was left after verification.
- Download text generation and browser helper behavior are covered by local
   tests. Native operating-system save completion and real microphone recognition
   were not verified. Existing event-readiness gates and dependency advisories
   remain open; the speaker build still reports its large-bundle warning.