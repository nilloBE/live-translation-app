# Small-event readiness: 3 rooms / 30-50 audience members per room

## Scope and decisions

Target **3 simultaneous rooms**, each with one speaker and **30-50 audience
members**. The normal maximum is 150 audience plus 3 speaker connections:
**153 application connections**, before admins. Test with 60 audience members per
room as headroom: **183 application connections**.

- Speakers and audience members continue **without sign-in or presenter codes**.
- Use one Node.js backend replica in Azure Container Apps and the existing
  in-memory Socket.IO relay. No Redis, Web PubSub, or SignalR integration.
- Use Azure Speech **S0** for the three-room event; allow **F0** as an explicit
  deployment option for one-speaker development/demo use. Azure resource access
  continues to use Entra ID / Managed Identity, never Azure resource API keys.
- Keep the existing protected admin portal. Anonymous participants do not imply
  public admin access; no admin identity redesign is added to this work.
- Limit work to input/rate safeguards, room cleanup, accurate counts and a small
  reproducible test. High availability and transcript replay are out of scope.

**Status:** the scoped deployment safeguards, relay validation/limits, reconnect
handling and admin counts are implemented locally. Synthetic normal/headroom runs,
mock deployment tests and browser checks are recorded in [local-validation.md](local-validation.md).
Full event-duration, resource-constrained container and live Azure/Speech checks remain
open. No resources were changed or deployment performed during this implementation.

## One replica and built-in load balancing

A Container App is the deployed backend application. A **replica** is a running
copy of its container. Three rooms do not need three replicas: one Node.js process
can hold all three Socket.IO rooms and their connections in memory.

Container Apps supplies the HTTPS endpoint and ingress routing/load balancing;
we do not deploy a separate load balancer. With one replica, all speakers and
audience members reach the same backend process.

With two replicas, different clients can reach different processes:

```text
Speaker in room ABC --> Container Apps ingress --> replica A (room ABC)
Audience in room ABC -> Container Apps ingress --> replica B (separate memory)
```

Both connections can look healthy, but A's broadcast does not reach B. Load
balancing distributes connections; it does not synchronize Socket.IO rooms.
Sticky sessions keep an individual client on a replica, not everyone in a room
on the same replica, so they do not solve cross-replica broadcasting.

For this workload:

- Set minimum replicas to **1** (avoid scale-to-zero cold starts) and maximum
  replicas to **1** (avoid splitting rooms across processes).
- Use **single revision mode**, with no traffic splitting between app versions.
  A revision is a deployed version, not a replica. Old/new versions can overlap
  during rollout, so deploy outside events and reconnect afterward.
- Accept a brief interruption on process restart. Speakers can restart translation
  and audiences reconnect/refresh. Missed captions need not be replayed. This is
  deliberately not a high-availability design.
- A warm replica has a cost even between events; include it in the event budget.

The deployment script now pins both create/update paths to minimum/maximum one and
checks the sole active/latest-ready revision. This configuration has been checked
with mocks, not applied to Azure. Local relay results are not a cloud capacity guarantee.

## Why neither Redis nor Web PubSub is needed

These services address multi-instance communication or managed connection scaling.
They are not required just because many people join a room. Socket.IO already
handles fan-out when all clients connect to one process.

Azure Web PubSub for Socket.IO is a possible future managed solution, **not** the
existing Azure SignalR Service resource. A Redis adapter is another multi-instance
option. Neither belongs in this release and neither adds cost under this plan.

Unused SignalR provisioning, role assignment and deployment wiring have been removed.
Existing Azure resources are not deleted: confirm they are unused and obtain approval
for cleanup separately.

## Speech S0: one session per active speaker

An active speaker starts a continuous `TranslationRecognizer` session in their
browser. It is a streaming session, not one HTTP call per caption or audience member.
Three active speakers mean approximately **three concurrent Speech sessions**.
Audience members receive text through Socket.IO and add no Speech recognizers;
an idle room uses no Speech session.

Current documented base-model concurrency limits:

| SKU | Concurrent real-time transcription and translation requests combined |
| --- | --- |
| F0 | 1; unsuitable for three simultaneous speakers |
| S0 | 100 per resource by default; sufficient quota headroom for three speakers |

Use S0, assuming other workloads sharing the resource have not consumed its quota.
It is pay-as-you-go, not free. Verify three simultaneous sessions with the intended
languages/targets. A quota increase is not planned. If the actual concurrency limit
is uncertain, Microsoft documents support as the way to confirm it; the existing
limit is not exposed in the portal, CLI or API.

**No Speech client-code change is needed just to change SKU** on the same resource.
This is provisioning/configuration work, but it must actually be applied to Azure.
It does not replace the relay fixes or load test. F0 also has monthly usage limits;
switching to F0 does not make Container Apps, the registry or the entire deployment
free, and must not be treated as resetting a free allowance.

## Deployment script changes

### Explicit Speech SKU option

Both `scripts/setup-azure.ps1` and `scripts/deploy-azure.ps1` now implement the same
`-SpeechSku` parameter accepting only `F0` or `S0`, plus optional `SPEECH_SKU`.
The following interface is implemented and mock-tested; actual Azure SKU transitions
still need an authorized non-event check.

```powershell
.\scripts\deploy-azure.ps1 -SpeechSku S0
.\scripts\deploy-azure.ps1 -SpeechSku F0
.\scripts\setup-azure.ps1 -SpeechSku S0
```

Resolve the selection in this order: explicit parameter, `SPEECH_SKU` from the
environment/root `.env`, existing resource SKU, then S0 for a new resource. Preserve
the scripts' rule that real environment values override `.env`. Validate the final
resolved value as well as the parameter; an invalid environment value must fail
before Azure mutations. Report where the selection came from.

| Resource state | Selection | Required behavior |
| --- | --- | --- |
| New | F0 or S0 explicitly configured | Create with that SKU. |
| New | No SKU configured | Default to S0; display the paid-tier choice before provisioning. |
| Existing | No SKU configured | Preserve current SKU; do not silently upgrade or downgrade on an ordinary redeploy. |
| Existing | Selected SKU matches current | No SKU update; safe to rerun. |
| Existing F0 | S0 selected | Request an in-place upgrade and verify the resulting SKU. |
| Existing S0 | F0 selected | Request an in-place downgrade if Azure permits it and verify the resulting SKU. |

For either transition:

- Display current/requested SKU, resource and subscription before making changes.
  An explicit parameter/environment choice is deployment intent; no extra
  interactive prompt is required. Warn that S0 is billed by usage and F0 supports
  only one concurrent speaker, so F0 is not three-room-event-ready.
- Change SKU before image builds/frontend deployment, so a refused transition
  stops the deployment early. Do not change tiers during an active event; stop
  recognition sessions first and allow for quota propagation afterward.
- Preserve resource identity, custom subdomain/endpoint, Managed Identity and
  Speech RBAC. Do not delete/recreate a resource to force a tier change.
- Verify available SKUs/eligibility for the specific Speech resource at
  implementation time. Do not promise every S0 resource can downgrade: free-tier
  eligibility, subscription restrictions or Azure policy may prevent F0. If Azure
  rejects the request, stop with the service error and re-read/report the actual
  SKU. Never silently stay on S0, fall back to a paid tier, or claim F0 succeeded.
- Distinguish a genuinely missing resource from a failed lookup (permissions,
  connectivity or service errors). A lookup failure must not trigger creation.
- Read back the SKU after a successful create/update, verify it matches the
  selection, and include it in the deployment summary. A successful control-plane
  update alone does not prove the new Speech quota is already effective.

Document parameter precedence, both examples and limits in script help, README and
the example environment file. Warn that leaving `SPEECH_SKU=F0` configured will
request F0 again on later deployments; `-SpeechSku S0` overrides it for an event.

### Other changes needed for reliable deployment

Keep these within the existing PowerShell workflow; no new deployment framework:

- **Topology:** apply minimum/maximum one replica to both create/update paths and
  explicitly ensure single revision mode. Skip unused SignalR provisioning, role
  assignments and configuration references without deleting existing resources.
- **Image version:** replace the fixed `latest` tag with a unique deployment tag
  or digest and print it with the deployed revision. Unique deployment tags now
  replace the former fixed tag to identify the running build.
- **Admin secret ordering:** ensure the secret exists before a new/updated revision
  references it. The update path now sets the secret first, including when upgrading
  a pre-admin deployment. Avoid silently generating a replacement
  on every redeploy; preserve an existing secret unless rotation is requested.
  If a secret changes, ensure the serving revision uses the new value. Never print
  secrets in command-error diagnostics or the normal deployment summary.
- **Post-deploy verification:** check revision health, replica settings, actual
  Speech SKU, frontend routes and a simple speaker/audience/admin connection.
  Do not print a successful deployment solely because the build/upload completed.

Test the SKU decision paths with mocked Azure responses: new F0/S0, both transitions,
unchanged SKU, omitted SKU on an existing resource, precedence, invalid values,
denied downgrade, failed resource lookup and read-back mismatch. Mocked tests verify
script logic, not Azure's permission to downgrade a particular resource. Real tier
changes require an authorized non-event check; never alter production to test this.

## Anonymous use with minimum safeguards

No participant login, MSAL integration or shared presenter code is required for
this release. This is a deliberate convenience/security trade-off: someone who
discovers the public backend can request paid Speech tokens, and room codes are
not strong authorization. Rate limits reduce abuse but do not prove presenter
identity, guarantee confidentiality or enforce a hard spending cap. Use for
non-sensitive small events with this exposure understood.

Implement in the existing modules, without new infrastructure:

1. **Complete validation:** reject invalid room IDs rather than mapping malformed
   inputs to `LIVE`; bound room IDs, language codes, arrays, translation keys/values,
   timestamps and total message bytes. Retain handler guards and caption text caps.
2. **Basic limits:** rate-limit token requests, admin polling, socket joins,
   registrations and publishes. Bound rooms and memberships per socket. Use local
   counters, not a distributed store. Allow normal renewal/retries by three
   presenters and audience join bursts behind a shared venue IP; configure proxy/IP
   handling correctly. A per-IP limit must not block the whole event network.
3. **Bound room state:** clean up every membership/registration on leave/disconnect;
   remove empty/stale rooms independently of admin polling. Prevent arbitrary
   publish-created rooms from leaving retained records. Acknowledge registration
   before publishing and rejoin/re-register on reconnect. This orders the flow;
   it does not authenticate the presenter.
4. **Simple failure behavior:** reject excessive traffic visibly without disrupting
   other rooms, and avoid unbounded queues of stale captions during disconnection.
   No durable replay or guaranteed-delivery system is required.

Keep Azure credentials out of the browser and tokens/caption content out of logs.
Existing console/container logs plus the admin portal are adequate for this scope;
no Application Insights integration or new monitoring platform is required.

## Minimal admin portal

Keep `client-admin/`, served at `/admin/` in production and port 5175 locally.
The branch already has `GET /api/admin/status` and the `/admin` Socket.IO namespace,
pushing snapshots every two seconds while an admin is connected. Both currently
require `ADMIN_API_KEY`, a separate app-level secret, not an Azure resource key.
Retain this protection for now rather than introducing an admin identity migration.
Never commit the secret or include it in the public frontend bundle.

Required outcome: an accurate live list of rooms and connected participants.

- Active room means a room with at least one connected participant.
- Show audience connections, speaker connection(s) and total participant connections
  separately per room. Count sockets/tabs, not unique people: anonymous use does not
  reliably identify distinct humans.
- Exclude admins from participant counts. Label any transport-wide connection metric
  separately, since namespace connections can share a transport.
- Update on join/leave/disconnect, and remove rooms when empty.
- Show connection state and last update time so stale values do not appear live.

Keep existing inexpensive extras: peak connections, languages, caption/rejection
counts, last activity, uptime and memory. Speaker registration is self-reported,
not verified identity. Metrics belong to the sole process and reset on restart;
history storage and cluster aggregation are out of scope. Current counts and cleanup
need verification/fixes, not just new labels.

## Focused acceptance checks

Record the tested revision, container CPU/memory, event duration, target-language
mix and results. Use a deployment representative of the event. See the local
validation record for completed subsets; the full acceptance gates below are not
all satisfied by the short, host-local synthetic runs.

| Check | Procedure and pass condition |
| --- | --- |
| Normal load | Three simulated speakers send realistic interim/final captions to 50 audience clients each for the expected event duration. All rooms receive their own captions, with no cross-room leakage, unexpected disconnects or missing finals while continuously connected. |
| Headroom | Shorter run with 60 audience clients per room and near-simultaneous joins. No crashes, join failures or loss of isolation. |
| Responsiveness | Measure relay delivery separately from Speech latency using test timestamps/sequences. Proposed target: p95 below 500 ms under normal load; record method and actual result. |
| Resources | Observe admin memory and Container Apps CPU/memory. No sustained memory growth after warm-up or resource exhaustion; room state clears after participants leave. |
| Admin accuracy | Verify three rooms, 150 audience and 3 speaker connections, with an admin connected. Disconnect/reconnect/leave; counts remain accurate, empty rooms disappear and stale dashboards are indicated. |
| Invalid traffic | Send malformed/oversized messages and excessive publish/room/token requests. They are rejected without crashing the server or blocking normal traffic in other rooms. |
| Real Speech | Run three real speakers on S0 with intended languages/targets through at least two token renewals. No quota/renewal errors; captions continue in all rooms. Synthetic Socket.IO traffic alone does not test this. |
| Basic reconnect | Interrupt a client and restart the backend once outside the event. New captions and correct registration/counts resume after rejoining; manual restart/refresh is acceptable after backend failure. Missed captions need not be recovered. |

No chaos-testing platform, durable replay service or multi-region suite is needed.
Sequence numbers can belong solely to the test harness, not the production protocol.

## Implementation and event checklist

1. Implement the deployment changes above, including selectable F0/S0, existing-SKU
  preservation, verified tier transitions, single-replica topology, versioned images
  and admin secret ordering. Select S0 explicitly for the three-room event.
2. Complete validation, rate limits, room cleanup and basic reconnect registration
   without introducing end-user authentication.
3. Verify/fix admin participant counts, room removal and stale-connection display.
4. Run and record the focused acceptance checks before claiming readiness.
5. Before the event, confirm S0, one serving revision/replica, a working test room
   and accessible admin portal. Make no deployments during the event; retain a
   known-good app revision for rollback outside live use.

Implemented locally: deployment SKU/topology/secret safeguards, strict payload
validation, bounded room/connection/rate state, reconnect registration, accurate
admin counts and stale display. Local tests pass, but cloud/event readiness remains
conditional on the unverified gates in the validation record.

Deferred: participant identity, horizontal scale, Redis, Web PubSub, SignalR
integration, automatic failover, transcript persistence, cross-replica monitoring
and advanced telemetry. If one replica fails the test, inspect the measured
bottleneck and consider a modest CPU/memory increase before adding another service.

## References

- [Container Apps ingress](https://learn.microsoft.com/azure/container-apps/ingress-overview)
- [Container Apps revisions](https://learn.microsoft.com/azure/container-apps/revisions)
- [Speech quotas and limits](https://learn.microsoft.com/azure/ai-services/speech-service/speech-services-quotas-and-limits)
- [Socket.IO on Azure (future option only)](https://learn.microsoft.com/azure/azure-web-pubsub/socketio-overview)
