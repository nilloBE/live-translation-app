# Live Translation App - Custom Instructions

## Project Overview

This is a web-based live translation application that:
- Captures audio from a speaker (presenter) and translates it in real-time
- Supports **French → Dutch** and **Spanish → French** translation pairs
- Broadcasts the translated transcription to audience members via a separate web view
- Audience can connect from phones or computers to see live subtitles
- **No API keys** — uses Microsoft Entra ID (Azure AD) authentication exclusively
- **Public repo safe** — no credentials or sensitive data ever committed

## Architecture

```
┌─────────────────┐       ┌──────────────────────┐       ┌─────────────────┐
│  Speaker App    │──────▶│  Azure Speech SDK    │──────▶│  Backend Server │
│  (React - mic)  │       │  (Translation API)   │       │  (Node.js +     │
│                 │       │  Runs in browser     │       │   SignalR/WS)   │
└─────────────────┘       └──────────────────────┘       └────────┬────────┘
                                                                   │
                                  ▲                       Broadcasts via
                                  │                       Azure SignalR
                          Token endpoint                           │
                          (Entra ID auth)             ┌────────────┼────────────┐
                                                      ▼            ▼            ▼
                                                ┌──────────┐ ┌──────────┐ ┌──────────┐
                                                │ Audience  │ │ Audience  │ │ Audience  │
                                                │ Device 1  │ │ Device 2  │ │ Device N  │
                                                └──────────┘ └──────────┘ └──────────┘
```

### Authentication Flow (No API Keys)

1. **Backend** uses `DefaultAzureCredential` from `@azure/identity` to authenticate to Azure services.
   - Locally: uses the developer's `az login` session (Azure CLI credential)
   - In production: uses Managed Identity assigned to the Azure Container App
2. **Backend exposes `/api/speech-token`** — fetches a short-lived (10 min) authorization token from the Azure Speech Service token endpoint using Entra ID credentials.
3. **Frontend (Speaker App)** calls the backend token endpoint, receives the short-lived token, and initializes the Speech SDK with `SpeechTranslationConfig.fromAuthorizationToken(token, region)`.
4. **RBAC Role Assignment** — the developer (and the Container App managed identity) are assigned the `Cognitive Services Speech User` role on the Speech resource.

### Key Components

1. **Speaker App** (React) - Captures microphone audio, uses Azure Speech Translation SDK in the browser to get real-time translated text, sends it to the backend.
2. **Audience App** (React) - Connects to the backend via SignalR and displays live translated subtitles.
3. **Backend Server** (Node.js/Express) - Token broker for Speech Service + relays translated text to audience via SignalR.
4. **Azure Resources** - Speech Service, SignalR Service, Container Apps, Container Registry, Static Web Apps (all authenticated via Entra ID/RBAC).

### Technology Stack

- **Frontend**: React (TypeScript) with Vite
- **Backend**: Node.js + Express + `@azure/identity` (Dockerized)
- **Containerization**: Docker + Docker Compose for local dev, Azure Container Apps for production
- **Real-time**: Azure SignalR Service (or Socket.IO for local dev)
- **Translation**: Azure Cognitive Services Speech SDK (`microsoft-cognitiveservices-speech-sdk`)
- **Authentication**: Microsoft Entra ID via `DefaultAzureCredential` (no API keys)
- **Hosting**: Azure Static Web Apps (frontend) + Azure Container Apps (backend)
- **Registry**: Azure Container Registry (ACR) for Docker images
- **Infrastructure**: Prefer IaC under `infra/` for Azure resources as the project matures; Azure CLI scripts may be used for quick local/dev setup and RBAC role assignments

### Translation Pairs

| Source Language | Target Language | Speech SDK Codes |
|---------------|----------------|------------------|
| French        | Dutch          | `fr-FR` → `nl`  |
| Spanish       | French         | `es-ES` → `fr`  |

## Security Rules (Public Repository)

### What goes into the repo
- `.env.example` with placeholder values only (e.g., `SPEECH_REGION=westeurope`)
- Non-sensitive configuration (region names, resource names for documentation)
- Scripts that reference environment variables, never hardcoded values

### What NEVER goes into the repo
- API keys, connection strings, or secrets of any kind
- `.env` files with real values
- Tokens or credentials

### Protection mechanisms
- `.gitignore` includes: `.env`, `.env.local`, `.env.*.local`, `node_modules/`, `*.pem`, `*.key`
- Pre-commit awareness: README warns about never committing `.env`
- All Azure auth is via RBAC + Entra ID — no keys to leak
- Backend token endpoint provides short-lived tokens (10-min expiry) to the frontend
- SignalR connection strings managed via Managed Identity (connectionless mode)

## Development Phases

### Phase 1: Project Setup & Azure Resources
- Initialize monorepo structure (client + server)
- Set up React + TypeScript + Vite for the frontend
- Set up Node.js + Express backend with `@azure/identity`
- Create `Dockerfile` for the backend and `docker-compose.yml` for local dev
- Create comprehensive `.gitignore` for a public repo
- Create Azure CLI script to provision resources with RBAC role assignments
- Create `.env.example` files (region and resource endpoint only, no keys)
- Write initial README with setup instructions (including `az login` and Docker for local dev)

Azure resource-group guidance:
- Use an environment-scoped resource group instead of one shared catch-all group, for example `rg-live-translation-dev`, `rg-live-translation-test`, and `rg-live-translation-prod`.
- Keep all resources for one app environment in the matching resource group so cleanup, cost review, RBAC, and deployment boundaries stay simple.
- For Phase 2 local Speech testing, create only the required Azure AI Speech resource and RBAC assignment in the dev resource group. Add SignalR in Phase 3 and deployment resources in Phase 5.

### Phase 2: Speech Translation (Speaker App - Local)
- Create or reuse a dev resource group such as `rg-live-translation-dev`
- Create an Azure AI Speech resource in that resource group, preferably named with an environment suffix such as `speech-live-translation-dev`
- Configure the Speech resource with a custom subdomain endpoint such as `https://speech-live-translation-dev.cognitiveservices.azure.com`; Entra ID token exchange does not work against the regional API key endpoint
- Assign the signed-in developer the `Cognitive Services Speech User` role scoped to the Speech resource
- Implement token endpoint in backend (`/api/speech-token`) using `DefaultAzureCredential`
- Implement microphone capture in the React speaker app
- Integrate Azure Speech Translation SDK using authorization tokens (not keys)
- Support continuous recognition mode for real-time translation
- Display original transcription and translated text in the speaker UI
- Allow selecting translation pair (FR→NL or ES→FR)
- Test locally with `az login` credentials and the Azure Speech API

Phase 2 implementation notes:
- The backend exchanges an Entra ID access token for a short-lived Azure Speech authorization token and returns only the Speech token, region, and expiry metadata to the browser.
- The backend token exchange uses `SPEECH_ENDPOINT`, the Speech resource custom subdomain endpoint, plus `/sts/v1.0/issueToken`.
- The frontend refreshes Speech authorization tokens before expiry while a microphone translation session is active.
- Keep the Speech SDK in the client only; the backend should not receive microphone audio during Phase 2.

### Phase 3: Real-time Broadcasting (Backend + Audience)
- Add Azure SignalR Service to the same environment resource group when cloud-scale real-time broadcasting is needed
- Implement WebSocket/SignalR hub in the backend to relay translations
- Connect speaker app to backend (send translated text as it arrives)
- Build audience app that connects to backend and displays live subtitles
- Implement session/room concept so multiple sessions can run simultaneously
- Test locally: speaker in one browser tab, audience in another

### Phase 4: UI Polish & UX
- Design clean, responsive UI for both speaker and audience views
- Add connection status indicators
- Add session management (create/join with code)
- Auto-scroll and subtitle styling for audience view
- Mobile-responsive design for audience (phone use case)

### Phase 5: Azure Deployment
- Create Azure Container Registry (ACR) in the same environment resource group and build/push backend Docker image
- Create Azure Container Apps Environment in the same environment resource group and deploy backend container
- Enable system-assigned Managed Identity on the Container App
- Assign RBAC roles to Managed Identity (Cognitive Services Speech User, SignalR App Server)
- Deploy frontend to Azure Static Web Apps
- Configure environment variables (non-secret: region, endpoints)
- Update Azure CLI script for full deployment with identity setup
- End-to-end testing in the cloud
- Finalize README with deployment instructions

## Project Structure

```
live-translation-app/
├── client/                    # React frontend (Vite + TypeScript)
│   ├── src/
│   │   ├── components/
│   │   │   ├── SpeakerView.tsx    # Speaker's interface
│   │   │   └── AudienceView.tsx   # Audience's interface
│   │   ├── services/
│   │   │   ├── speechTranslation.ts  # Azure Speech SDK wrapper
│   │   │   └── signalr.ts           # SignalR client connection
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
├── server/                    # Node.js backend (Dockerized)
│   ├── src/
│   │   ├── index.ts
│   │   ├── auth.ts            # Token broker (DefaultAzureCredential)
│   │   ├── signalr.ts         # SignalR hub logic
│   │   └── routes/
│   ├── Dockerfile             # Multi-stage Docker build
│   ├── .dockerignore
│   ├── package.json
│   └── tsconfig.json
├── docker-compose.yml         # Local dev: backend + client together
├── scripts/
│   ├── setup-azure.ps1        # Azure CLI provisioning + RBAC for Windows dev
│   └── deploy.ps1             # Build, push to ACR, deploy to Container Apps
├── .github/
│   └── copilot-instructions.md  # This file
├── .gitignore                 # Comprehensive ignore rules
├── .env.example               # Non-secret placeholders only
├── README.md
└── package.json               # Root workspace config
```

## Azure Resources (PowerShell + Azure CLI)

Use environment-scoped resource groups. For local development, prefer `rg-live-translation-dev`; use separate `test` and `prod` groups later.

The Windows developer setup script is `scripts/setup-azure.ps1`. It wraps Azure CLI commands, is safe to rerun, and does not create or print API keys or connection strings.

### Minimal Phase 2 setup

```powershell
.\scripts\setup-azure.ps1
```

This creates or reuses:
- Resource group: `rg-live-translation-dev`
- Speech resource: `speech-live-translation-dev`
- Speech custom subdomain endpoint: `https://speech-live-translation-dev.cognitiveservices.azure.com`
- RBAC: `Cognitive Services Speech User` for the signed-in Azure CLI user scoped to the Speech resource

If the subscription cannot create another free `F0` Speech resource, use an existing Speech resource or change the script SKU to `S0` for the dev environment.

### Full project setup for later phases

```powershell
.\scripts\setup-azure.ps1 -Mode Full
```

Full mode also creates or reuses Azure SignalR Service, Azure Container Registry, Azure Container Apps environment, and Azure Static Web App in the same dev resource group. Container image build/push and Container App deployment identity role assignments should be handled by the later deployment script/IaC work in Phase 5.

## Technical Notes

- **Browser compatibility**: The Speech SDK works in modern browsers (Chrome, Edge, Firefox). Microphone access requires HTTPS in production (localhost is exempt for dev).
- **Speech SDK in browser vs server**: Running the SDK in the browser avoids streaming audio to our backend, reducing latency and server load. The backend only provides short-lived auth tokens.
- **Token refresh**: Speech tokens expire after 10 minutes. The frontend will refresh tokens proactively before expiry.
- **Docker local dev**: `docker-compose.yml` runs backend in a container; `DefaultAzureCredential` picks up the host's `az login` session via volume-mounted Azure CLI config. The client runs on the host (Vite dev server) for hot-reload and microphone access.
- **Container Apps vs App Service**: Container Apps provides serverless containers with built-in scaling, revision management, and Managed Identity — same Docker image runs locally and in production.
- **SignalR vs plain WebSockets**: Azure SignalR Service handles scaling and connection management. For local dev, we can use Socket.IO or the self-hosted SignalR package.
- **Region**: Using `westeurope` for all resources as it supports both required language pairs and is geographically appropriate.
- **No API keys anywhere**: All authentication flows use Microsoft Entra ID. Local dev uses `az login`, production uses Managed Identity.
- **Public repo safety**: `.gitignore` is comprehensive, `.env.example` has no real values, README explicitly warns against committing secrets.
