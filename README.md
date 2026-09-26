# Live Translation App

A web-based live captioning experience for presenters and audiences. The speaker's microphone audio is translated in real-time using Azure AI Speech, and the translated captions are broadcast instantly to audience devices via a room code — on phones, tablets, or computers.

## How It Works

```
┌─────────────────┐       ┌──────────────────────┐       ┌─────────────────┐
│  Speaker App    │──────▶│  Azure Speech SDK    │──────▶│  Backend Server │
│  (React - mic)  │       │  (Translation API)   │       │  (Node.js +     │
│                 │       │  Runs in browser     │       │   Socket.IO)    │
└─────────────────┘       └──────────────────────┘       └────────┬────────┘
                                   ▲                               │
                           Token endpoint                  Broadcasts captions
                           (Entra ID auth)                         │
                                                    ┌──────────────┼──────────────┐
                                                    ▼              ▼              ▼
                                              ┌──────────┐  ┌──────────┐  ┌──────────┐
                                              │ Audience  │  │ Audience  │  │ Audience  │
                                              │ Device 1  │  │ Device 2  │  │ Device N  │
                                              └──────────┘  └──────────┘  └──────────┘
```

1. The **speaker app** captures microphone audio in the browser and uses the Azure Speech Translation SDK to produce real-time translated captions.
2. Captions are sent to the **backend server**, which relays them to all audience devices connected to the same room code.
3. Each **audience device** connects via a browser, picks a target language, and reads live subtitles.

Azure service authentication uses Microsoft Entra ID, without Azure resource API keys. Participants are anonymous; the admin portal has a separate private application key. Never commit credentials.

## Architecture

### Components

| Component | Location | Description |
|-----------|----------|-------------|
| Speaker app | `client-speaker/` | Responsive React + Vite console. Captures microphone audio, fetches a Speech token from the backend, runs the Azure Speech SDK in-browser, broadcasts translated captions to the room, and supports a paste-in glossary to improve recognition of names and acronyms. Includes caption sizing and system, light, and dark themes. |
| Audience app | `client-audience/` | Mobile-first React + Vite viewer. Connects to the backend via Socket.IO, lets each viewer pick a target language, and displays live subtitles with connection status, recent-caption history, adjustable text size, and system, light, and dark themes. |
| Admin app | `client-admin/` | React + Vite monitoring dashboard for operators. Shows active rooms, live connection counts, whether each room has a speaker, captions relayed, rejected/malformed messages, and server uptime/memory. Gated by a shared `ADMIN_API_KEY`, not by Entra ID. |
| Shared package | `shared/` | Caption protocol types, room normalization, language catalog, and Socket.IO client factory shared by the speaker and audience apps. |
| Backend server | `server/` | Node.js + Express. Speech token broker (`/api/speech-token`), Socket.IO relay, admin metrics API/namespace (`/api/admin/status`, `/admin`), and CORS. Runs in Docker. |

### Azure Resources

All resources are deployed to a single resource group (e.g. `rg-live-translation-dev`).

| Resource | Purpose |
|----------|---------|
| Azure AI Speech | Speech-to-text + translation |
| Azure Container Registry | Stores the backend Docker image |
| Azure Container Apps | Hosts the backend server |
| Azure Static Web Apps | Hosts the speaker, audience and admin React apps |

The relay runs in one Container App replica using in-memory Socket.IO. Setup and deployment do not provision SignalR. Previously created SignalR resources are not automatically deleted.

### Authentication

- **Local development**: uses your `az login` identity via `DefaultAzureCredential`.
- **Production**: uses the system-assigned Managed Identity of the Container App.
- Speech and registry access use Entra ID/RBAC, not resource API keys. Static Web Apps publishing uses a deployment credential internally; do not log or commit it.

### Supported Languages

| Direction | Languages |
|-----------|-----------|
| Source (speech recognition) | English (US/UK), French, Spanish, German, Italian, Portuguese, Dutch, Japanese, Mandarin Chinese |
| Target (translation output) | English, French, Spanish, German, Italian, Portuguese, Dutch, Japanese, Simplified Chinese |

A single session can translate into multiple target languages simultaneously. Each audience device independently selects which language to display.

## Deploy to Azure

### Prerequisites

- Node.js 20 or later and npm 10 or later
- Azure CLI, signed in with an account that can create resources and assign RBAC roles
- An Azure subscription that allows Container Apps, ACR, Speech, and Static Web Apps

```powershell
az login
az account show
```

### Deploy

First configure a private `ADMIN_API_KEY` in your environment or ignored root `.env` for a new backend. Run the deployment script outside live events. It builds all three frontend apps and deploys the backend with one warm replica:

```powershell
.\scripts\deploy-azure.ps1 -SpeechSku S0
```

The script performs these steps automatically:
1. Creates or reuses the resource group
2. Creates or updates Speech with verified SKU selection, then provisions Container Registry, Container Apps Environment, and Static Web App
3. Builds a uniquely tagged backend image via ACR Tasks (no local Docker required)
4. Installs/preserves the admin secret before deploying a single-revision Container App with Managed Identity and minimum/maximum replicas both set to 1
5. Assigns RBAC roles: `Cognitive Services Speech User`, `Live Translation Speech Token Issuer` (custom), `AcrPull`
6. Builds all three frontend apps with the backend URL configured
7. Deploys the combined frontend to the Static Web App
8. Checks the sole active/latest-ready healthy revision, image, replica settings, secret reference, actual Speech SKU, frontend routes, health, synthetic caption delivery and admin access

The topology check fails closed if rollout has not settled. A successful upload is not enough to declare readiness. Single-revision rollouts can briefly overlap versions, and restarting loses room state; do not deploy during an event.

When complete, the script prints the live URLs:

- **Audience app**: `https://<swa-hostname>/`
- **Speaker app**: `https://<swa-hostname>/speaker/`
- **Admin dashboard**: `https://<swa-hostname>/admin/`
- **Backend API**: `https://<container-app-fqdn>/`

The admin dashboard uses a private `ADMIN_API_KEY` unrelated to Azure resource access. Omission preserves the existing Container App secret. Supplying a value installs/rotates it before the new revision starts; it is never printed. Prefer a private environment value or ignored root `.env` to a literal command-line secret. If the existing key is preserved but not available locally, the deployment smoke explicitly leaves authenticated admin verification open; check the dashboard with that key before the event.

### Speech tier selection

Both setup and deploy accept `-SpeechSku F0` or `-SpeechSku S0`. Precedence is: explicit parameter, real `SPEECH_SKU` environment value, root `.env`, existing resource SKU, then **paid S0** for a new resource. Blank/omitted settings preserve an existing tier.

```powershell
.\scripts\setup-azure.ps1 -SpeechSku F0
.\scripts\deploy-azure.ps1 -SpeechSku S0
```

F0 supports only one concurrent speaker and has monthly usage limits. It is unsuitable for the three-room event and does not make the rest of Azure hosting free. Leaving `SPEECH_SKU=F0` configured requests F0 on subsequent deployments; `-SpeechSku S0` overrides it.

Tier changes are in place, never delete/recreate. Stop active recognizers first. The scripts check resource-specific advertised SKUs and read back the resulting tier; Azure policy, free-tier eligibility or quota can still reject a downgrade. A refusal stops deployment, reports the actual SKU if readable, and never silently falls back. Verify live Speech and quota propagation separately.

You can override the default resource names and region:

```powershell
.\scripts\deploy-azure.ps1 `
    -Location westeurope `
    -ResourceGroup rg-live-translation-prod `
    -ContainerAppName api-live-translation-prod
```

### Cleanup

To delete all Azure resources permanently:

```powershell
.\scripts\cleanup-azure.ps1
```

You will be asked to confirm by typing the resource group name. Use `-Force` to skip the prompt:

```powershell
.\scripts\cleanup-azure.ps1 -Force
```

> **Note:** Azure Cognitive Services uses soft-delete. If you delete and recreate resources with the same name, the deployment script will fail with a "soft-deleted resource" error. Purge the old resource first:
> ```powershell
> az cognitiveservices account purge --name <speech-resource-name> --resource-group <rg> --location westeurope
> ```

## How to Use

### Speaker (presenter)

1. Open the speaker app at `https://<swa-hostname>/speaker/` (or `http://localhost:5173` locally).
2. Choose your spoken language from the source language dropdown.
3. Select one or more target languages using the language chips.
4. (Optional) Paste domain terms, names, or acronyms into the **Glossary** box — one per line — to help the recognizer transcribe them correctly (for example `AKS`, `Contoso`, `Kubernetes`). The glossary is remembered per device.
5. Share the generated room code with your audience (use the copy button).
6. Click **Start** and allow microphone access when prompted.
7. The app will begin capturing and translating your speech in real-time. Use the preview tabs to check each target language translation.
8. Use the display controls to adjust caption size or follow the system, light, or dark theme. These settings are remembered on the device.

> The glossary uses the Azure Speech SDK **phrase list** feature. It biases speech **recognition** toward your terms (up to 500), so acronyms and names are transcribed accurately. It does not change how those terms are translated into each target language.

### Audience (viewers)

1. Open the audience app at `https://<swa-hostname>/` (or `http://localhost:5174` locally).
2. Select your preferred UI language (Français, Nederlands, or English).
3. Enter the room code shared by the speaker.
4. Choose the language you want to read from the **Read in** selector.
5. Translated captions appear live and auto-scroll as the speaker talks.
6. Adjust the text size or choose the system, light, or dark theme as needed. Scroll through recent captions and use **Return to live** to resume following the latest subtitle.

The audience app is designed for phone, tablet, and desktop screens. It shows connection and speaker-language status, reconnects automatically after transient network interruptions, and remembers the UI language, room code, caption language, text size, and theme between visits.

### Admin (operators)

1. Open the admin app at `https://<swa-hostname>/admin/` (or `http://localhost:5175` locally).
2. Enter the `ADMIN_API_KEY` value configured on the backend. It's remembered on the device (`localStorage`) until you choose **Change key**.
3. The dashboard separates audience, registered speaker and total participant connections per room. These count sockets/tabs, not unique people; admins are excluded. It also shows peaks, captions, rejected publishes, uptime and memory. Connections since start includes participant-namespace connections, even those that never joined, and resets with the process.
4. Data updates automatically roughly every 2 seconds over a dedicated Socket.IO namespace (`/admin`); `GET /api/admin/status` (with an `x-admin-key` header) returns the same snapshot for scripting or external monitoring.

Snapshots older than six seconds are marked stale while connected. Disconnection and rejected keys have separate states. A registered speaker is not a verified identity or proof that a microphone is active. Only one socket can own a room's speaker registration, but an anonymous client can claim a vacant room. Participant authentication remains out of scope.

## Local Development

### Prerequisites

- Node.js 20 or later, npm 10 or later
- Docker Desktop (optional, for running the backend in a container)
- Azure CLI signed in (`az login`) with an Azure AI Speech resource provisioned

### Set up Azure resources for local development

```powershell
.\scripts\setup-azure.ps1
```

This creates the resource group, Speech resource, and required RBAC assignments. With no SKU configured, a new resource uses paid S0; use `-SpeechSku F0` for one-speaker development. Existing tiers are preserved by default.

### Configure environment

```powershell
Copy-Item server/.env.example server/.env
Copy-Item client-speaker/.env.example client-speaker/.env
Copy-Item client-audience/.env.example client-audience/.env
Copy-Item client-admin/.env.example client-admin/.env
```

Edit `server/.env` and set your Speech resource values:

```env
SPEECH_REGION=westeurope
SPEECH_ENDPOINT=https://<your-speech-resource>.cognitiveservices.azure.com
```

> `SPEECH_ENDPOINT` must be the custom subdomain endpoint, not the regional key endpoint.

### Run

```powershell
npm install
npm run dev
```

This starts the backend on `http://localhost:3001`, the speaker app on `http://localhost:5173`, the audience app on `http://localhost:5174`, and the admin dashboard on `http://localhost:5175`. Set a private `ADMIN_API_KEY` in the backend environment; without it admin access is denied. Ensure `CORS_ORIGIN` includes those localhost frontend origins when testing locally.

Or run the backend in Docker:

```powershell
docker compose up --build
```

## Security

Azure runtime authentication uses Microsoft Entra ID. **Never commit API keys, `.env` files, tokens, or credentials.**

- Local dev authenticates via `az login` (`DefaultAzureCredential`)
- Production authenticates via Managed Identity on the Container App
- The backend exchanges an Entra ID token for a short-lived (10-minute) Speech authorization token, which it returns to the browser — the browser never sees a key
- The built-in `Cognitive Services Speech User` role does not include the `issueToken` data action; a least-privilege custom role (`Live Translation Speech Token Issuer`) is created and assigned by the deployment scripts
- The admin dashboard uses a separately supplied private `ADMIN_API_KEY`, stored as a Container App secret. The browser remembers it in localStorage; avoid shared operator devices and clear it after use.
- **Deliberately anonymous:** anyone who discovers the backend can request paid Speech tokens, join rooms or claim a vacant speaker registration. Room codes are not strong authorization. Validation and rate limits reduce abuse, but provide neither confidentiality, DDoS protection nor a hard spending cap. Use only for non-sensitive events with this exposure understood.
- Token responses are not cacheable. Server request/error logs omit URLs, bodies, caption content and credential details. Do not enable verbose SDK/Socket.IO debug logging in production.

## Scaling & Capacity

The target is **3 speakers and 30-50 audience per room** (153 participant connections at the normal maximum), with 60 audience per room as headroom. The single in-memory relay has no cross-replica synchronization or replay. Clients rejoin automatically after interruption, and the speaker re-registers before publishing; captions produced while disconnected are dropped.

Limits per backend process: 12 rooms, 80 participants per room, 256 participant sockets and 8 admin sockets. Each socket can occupy one room, with 20 join/leave and 20 registration attempts per minute, and 40 publishes per second. Transport messages are limited to 64 KiB, captions to 60 KiB and each text value to 4,000 characters. Initially unjoined sockets time out after 30 seconds; empty rooms are removed immediately. HTTP limits are 120 Speech-token and 600 admin requests per minute, shared process-wide. They do not use client IP or trust forwarded headers, so a venue's shared IP does not receive a separate restrictive quota; an attacker can still exhaust the global budget.

Local synthetic tests passed for five minutes at 3 x 50 audience and one minute at 3 x 60, with p95 relay latency 22 ms and 23 ms respectively. This is **not full event-duration, container or live-Speech validation**. See [the validation record](docs/local-validation.md) and [the approved plan](docs/scaling-plan.md) for remaining gates.

### Local checks (no Azure calls)

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

Deployment tests mock Azure calls; the relay tests use synthetic text and a stub token route. Neither spends Speech quota. To recheck a deployed backend/frontends, `node scripts/deployment-smoke.mjs <api-url> <frontend-url>` uses `ADMIN_API_KEY` from the process environment and a disposable synthetic room, not Speech.

## Project Structure

```text
live-translation-app/
├── client-speaker/            # Speaker React app (Vite + TypeScript)
├── client-audience/           # Audience React app (Vite + TypeScript)
├── client-admin/              # Admin monitoring dashboard (Vite + TypeScript)
├── shared/                    # Caption protocol, language catalog, realtime client
├── server/                    # Express backend (Dockerized)
├── docs/
│   ├── scaling-plan.md        # Approved three-room scope and pre-event gates
│   └── local-validation.md    # Local test evidence and unverified cloud checks
├── scripts/
│   ├── setup-azure.ps1        # Provision Azure resources for local dev
│   ├── deploy-azure.ps1       # Full deploy to Azure (provision + build + deploy)
│   └── cleanup-azure.ps1      # Delete all Azure resources
├── docker-compose.yml         # Local containerized backend
├── .env.example               # Shared non-secret placeholders
└── README.md
```

