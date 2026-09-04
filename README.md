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

Authentication is handled exclusively via Microsoft Entra ID — no API keys are stored or committed anywhere.

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
| Azure Static Web Apps | Hosts the speaker and audience React apps |
| Azure SignalR Service | Cloud-scale real-time caption broadcasting |

### Authentication

- **Local development**: uses your `az login` identity via `DefaultAzureCredential`.
- **Production**: uses the system-assigned Managed Identity of the Container App.
- No API keys are used. All Azure access is via RBAC role assignments.

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
- An Azure subscription that allows Container Apps, ACR, Speech, SignalR, and Static Web Apps

```powershell
az login
az account show
```

### Deploy

Run the deployment script. It provisions all Azure resources, builds and pushes the Docker image, assigns all RBAC roles, builds both frontend apps, and deploys everything:

```powershell
.\scripts\deploy-azure.ps1
```

The script performs these steps automatically:
1. Creates or reuses the resource group
2. Provisions Azure AI Speech, SignalR, Container Registry, Container Apps Environment, and Static Web App
3. Builds the backend Docker image via ACR Tasks (no local Docker required)
4. Deploys the Container App with system-assigned Managed Identity
5. Assigns RBAC roles: `Cognitive Services Speech User`, `Live Translation Speech Token Issuer` (custom), `AcrPull`, `SignalR App Server`
6. Builds both frontend apps with the backend URL configured
7. Deploys the combined frontend to the Static Web App

When complete, the script prints the live URLs:

- **Audience app**: `https://<swa-hostname>/`
- **Speaker app**: `https://<swa-hostname>/speaker/`
- **Admin dashboard**: `https://<swa-hostname>/admin/`
- **Backend API**: `https://<container-app-fqdn>/`

The admin dashboard is gated by an `ADMIN_API_KEY` shared secret rather than Entra ID (it has no relationship to Azure resource access — it just exposes in-process counters). If you don't pass `-AdminApiKey` or set `ADMIN_API_KEY` in the repo-root `.env`, the script generates a random one on every deploy and prints it once at the end — pin it if you want it to survive redeploys.

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
3. The dashboard shows, live: active room count, current and lifetime connection counts, captions relayed, rejected/malformed messages, server uptime and memory, and a per-room table (connections, peak connections, whether a speaker is registered, source/target languages, captions relayed, created/last-activity times).
4. Data updates automatically roughly every 2 seconds over a dedicated Socket.IO namespace (`/admin`); `GET /api/admin/status` (with an `x-admin-key` header) returns the same snapshot for scripting or external monitoring.

> The "speaker" indicator is informational, not an access control — any client that calls the internal `register-speaker` event can claim a room. Treat it as "a speaker session was started for this room," not as verified presenter identity. See `docs/scaling-plan.md` for the plan to add real presenter authentication.

## Local Development

### Prerequisites

- Node.js 20 or later, npm 10 or later
- Docker Desktop (optional, for running the backend in a container)
- Azure CLI signed in (`az login`) with an Azure AI Speech resource provisioned

### Set up Azure resources for local development

```powershell
.\scripts\setup-azure.ps1
```

This creates the resource group, Speech resource, and assigns the required RBAC roles to your signed-in user. See the script for available parameters.

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

This starts the backend on `http://localhost:3001`, the speaker app on `http://localhost:5173`, the audience app on `http://localhost:5174`, and the admin dashboard on `http://localhost:5175` (key: whatever you set `ADMIN_API_KEY` to in `server/.env`, default `local-dev-admin-key`).

Or run the backend in Docker:

```powershell
docker compose up --build
```

## Security

This project uses Microsoft Entra ID authentication exclusively. **Never commit API keys, `.env` files, tokens, or credentials.**

- Local dev authenticates via `az login` (`DefaultAzureCredential`)
- Production authenticates via Managed Identity on the Container App
- The backend exchanges an Entra ID token for a short-lived (10-minute) Speech authorization token, which it returns to the browser — the browser never sees a key
- The built-in `Cognitive Services Speech User` role does not include the `issueToken` data action; a least-privilege custom role (`Live Translation Speech Token Issuer`) is created and assigned by the deployment scripts
- The admin dashboard (`client-admin/`) is the one exception to "no keys": it's gated by an `ADMIN_API_KEY` shared secret, since it has nothing to do with Azure resource access — it only exposes in-process room/connection counters. This key is generated at deploy time (or pinned via `-AdminApiKey`/`.env`), stored as a Container App secret, and never committed to the repo.
- **Not yet implemented**: the `/api/speech-token` endpoint and the Socket.IO relay (join/publish) have no per-request caller authentication today — anyone who can reach the backend URL can request a Speech token or join/publish to any room by code. This is tracked as the top-priority item in `docs/scaling-plan.md`.

## Scaling & Capacity

This app has been evaluated for 5 concurrent rooms (speakers) with up to 50 audience members each (250 concurrent connections total). At that scale, raw message throughput is not the constraint — a single backend instance comfortably handles the connection count and caption fan-out involved. The real risks are availability and security ones (a single crash-prone message path, an unauthenticated token/relay endpoint, and a scale-to-zero cold start), most of which are now addressed; see `docs/scaling-plan.md` for the full analysis, what's already fixed, and what's still open before running a live event at this scale.

## Project Structure

```text
live-translation-app/
├── client-speaker/            # Speaker React app (Vite + TypeScript)
├── client-audience/           # Audience React app (Vite + TypeScript)
├── client-admin/              # Admin monitoring dashboard (Vite + TypeScript)
├── shared/                    # Caption protocol, language catalog, realtime client
├── server/                    # Express backend (Dockerized)
├── docs/
│   └── scaling-plan.md        # Bottleneck analysis and rollout plan for the 5-room/250-user target
├── scripts/
│   ├── setup-azure.ps1        # Provision Azure resources for local dev
│   ├── deploy-azure.ps1       # Full deploy to Azure (provision + build + deploy)
│   └── cleanup-azure.ps1      # Delete all Azure resources
├── docker-compose.yml         # Local containerized backend
├── .env.example               # Shared non-secret placeholders
└── README.md
```

