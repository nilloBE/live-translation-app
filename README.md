# Live Translation App

Live Translation App is a web-based captioning experience for presenters and audiences. The planned application captures speaker audio in the browser, translates it with Azure Speech, and broadcasts translated captions to audience devices.

## Current Scope

This repository includes all five phases: Phase 1 scaffold, Phase 2 local Speech translation, Phase 3 local room broadcasting, Phase 4 UX polish, and Phase 5 full Azure deployment:

- React + TypeScript + Vite speaker app in `client-speaker/`
- Minimal React + TypeScript + Vite audience app in `client-audience/`
- Shared language catalog and realtime client in `shared/`
- Node.js + Express + TypeScript backend in `server/`
- Speech token broker endpoint at `/api/speech-token`
- Browser microphone translation with a freely chosen source language and one or more target languages per session
- Local Socket.IO caption relay with room codes that broadcasts every translated language at once
- Dedicated speaker and audience apps for testing live subtitles in separate browser tabs
- Audience onboarding in French, Dutch, and English with per-audience target language selection
- Polished session controls, generated/copyable room codes, status indicators, clear actions, and mobile-friendly subtitles
- Backend Dockerfile and local `docker-compose.yml`
- PowerShell Azure CLI provisioning scripts in `scripts/setup-azure.ps1` and `scripts/deploy-azure.ps1`
- Full deployment to Azure Container Apps (backend) and Azure Static Web Apps (frontend) with Managed Identity
- Public-repo-safe `.env.example` files with placeholders only
- Setup instructions for local development and Azure prerequisites

## Security Model

This project is designed for Microsoft Entra ID authentication only. Do not commit API keys, connection strings, tokens, `.env` files, certificates, or private keys.

Local development uses your Azure CLI identity from `az login`. Production will use managed identity on Azure Container Apps.

## Prerequisites

- Node.js 20 or later
- npm 10 or later
- Docker Desktop, for containerized local server testing
- Azure CLI
- An Azure subscription where you can create resource groups and assign RBAC roles

Sign in before provisioning Azure resources:

```powershell
az login
az account show
```

## Install

```powershell
npm install
```

## Environment Configuration

Copy the examples before running locally:

```powershell
Copy-Item .env.example .env
Copy-Item client-speaker/.env.example client-speaker/.env
Copy-Item client-audience/.env.example client-audience/.env
Copy-Item server/.env.example server/.env
```

The example files contain only non-secret values such as regions and service URLs. Keep real `.env` files local.

## Local Development

Run all apps from the host:

```powershell
npm run dev
```

Or run them separately:

```powershell
npm run dev:server
npm run dev:speaker
npm run dev:audience
```

Or run the containerized local setup:

```powershell
docker compose up --build
```

The speaker app normally runs on `http://localhost:5173`, the audience app runs on `http://localhost:5174`, and the backend runs on `http://localhost:3001`. If Vite moves to another port, include it in `server/.env` with a comma-separated `CORS_ORIGIN` value.

## Apps

- **Speaker app** (`client-speaker/`) captures microphone audio, requests short-lived Speech tokens from the backend, previews translations, and broadcasts caption bundles to a room.
- **Audience app** (`client-audience/`) is a simpler viewer experience. On first visit, it asks for a UI language (`Français`, `Nederlands`, or `English`), then asks for a room code, then shows connection status, speaker language, a `Read in` transcription selector, and live subtitles.
- **Shared package** (`shared/`) contains the caption protocol, room normalization, language catalog, and Socket.IO client factory used by both apps.

Audience preferences are stored locally with these keys: `live-translation:audience-ui-lang`, `live-translation:audience-room`, and `live-translation:audience-target`.

## Phase 2 Local Speech Translation

Before using the speaker console, make sure the signed-in Azure CLI user has Speech RBAC on the Azure AI Speech resource. The setup script assigns both `Cognitive Services Speech User` and the least-privilege custom `Live Translation Speech Token Issuer` role used by the `/api/speech-token` broker:

```powershell
az login
az account show
```

Set the backend Speech region in `server/.env`:

```powershell
SPEECH_REGION=westeurope
SPEECH_ENDPOINT=https://speech-live-translation-dev.cognitiveservices.azure.com
```

`SPEECH_ENDPOINT` must be the Speech resource custom subdomain endpoint. Entra ID token exchange does not work with the regional API key endpoint such as `https://westeurope.api.cognitive.microsoft.com`.

Start the app, open the speaker client, choose your spoken language and one or more target languages, and allow microphone access when the browser prompts. The backend calls Azure AI Speech with `DefaultAzureCredential` and returns a short-lived authorization token to the browser; no Speech keys are used.

On some Windows environments Node.js cannot establish TLS to the Speech token endpoint. In that case the backend automatically falls back to a PowerShell child process that uses .NET `HttpClient` to complete the token exchange. This fallback only activates on Windows in development mode. You can override the PowerShell executable with the `PWSH_EXE` environment variable (defaults to `pwsh`).

The speaker console ships with a curated catalog of source languages (English US/UK, French, Spanish, German, Italian, Portuguese, Dutch, Japanese, Mandarin Chinese) and target languages (English, French, Spanish, German, Italian, Portuguese, Dutch, Japanese, Simplified Chinese). A single Speech translation session can target multiple languages simultaneously.

## Phase 3 Local Broadcasting

The backend runs a local Socket.IO relay for development. The speaker view publishes translated captions to a room code, and the audience view subscribes to the same room code.

To test locally:

```powershell
npm run dev --workspace @live-translation/server
npm run dev --workspace @live-translation/client-speaker
npm run dev --workspace @live-translation/client-audience
```

Open the speaker and audience URLs printed in the terminal:

- In the speaker app (`http://localhost:5173`), choose a room code such as `LIVE`, pick your spoken language, toggle one or more target language chips, and click `Start`.
- In the audience app (`http://localhost:5174`), choose a UI language, enter the same room code, choose your preferred transcription language from `Read in`, and watch the translated subtitles appear.

The speaker can preview each translated language inline using the preview tabs above the translated transcript without affecting what audience members see. Each audience device renders only the language it has selected; the choice is remembered locally between visits.

The local relay is intended for development and single-machine testing. Azure SignalR Service is still the planned cloud-scale realtime service for later phases.

## Phase 4 UX Polish

The app now has focused speaker and audience controls:

- Generated room codes with copy and regenerate actions
- Source language dropdown and multi-select target language chips for the speaker
- Inline preview tabs so the speaker can switch between target languages locally
- Separate audience wizard with UI language, room entry, and live caption steps
- Per-audience `Read in` dropdown that persists between visits via `localStorage`
- Separate status indicators for microphone/Speech, realtime relay, audience connection, and connected clients
- Clear actions for speaker transcripts and audience captions
- Larger audience subtitle display with original source text in caption history
- Auto-scrolling recent caption history for audience devices
- Responsive controls for phone-sized audience screens

## Azure Resource Setup

Use one Azure resource group per app environment, for example `rg-live-translation-dev`, `rg-live-translation-test`, and `rg-live-translation-prod`. Keep all resources for that environment in its matching resource group so cleanup, RBAC, deployment scope, and cost review stay straightforward.

For Phase 2 local Speech translation work, the minimal Azure setup is:

- A dev resource group, such as `rg-live-translation-dev`
- An Azure AI Speech resource in that group
- A Speech custom subdomain endpoint, such as `https://speech-live-translation-dev.cognitiveservices.azure.com`
- `Cognitive Services Speech User` and `Live Translation Speech Token Issuer` assigned to your signed-in Azure user on the Speech resource

Azure SignalR belongs to the cloud-scale version of the Phase 3 realtime path. Azure Container Registry, Container Apps, and Static Web Apps belong to Phase 5 deployment work.

The setup script defaults to the minimal Phase 2 resource set and assigns the current signed-in user the required Speech roles on the Speech resource.

```powershell
.\scripts\setup-azure.ps1
```

You can override defaults with environment variables:

```powershell
$env:AZURE_LOCATION = "westeurope"
$env:AZURE_RESOURCE_GROUP = "rg-live-translation-dev"
$env:SPEECH_RESOURCE_NAME = "speech-live-translation-dev"
.\scripts\setup-azure.ps1
```

Or pass parameters directly:

```powershell
.\scripts\setup-azure.ps1 `
	-Location westeurope `
	-ResourceGroup rg-live-translation-dev `
	-SpeechResourceName speech-live-translation-dev
```

To provision the broader project resource set for later phases, run:

```powershell
.\scripts\setup-azure.ps1 -Mode Full
```

The default Phase 2 script mode creates:

- Resource group
- Azure AI Speech resource, free tier
- RBAC assignment for your signed-in Azure user

Full mode also creates:

- Azure SignalR Service, free tier
- Azure Container Registry, basic tier with admin access disabled
- Azure Container Apps environment
- Azure Static Web App

## Project Structure

```text
live-translation-app/
├── client-speaker/            # Speaker React app with microphone translation
├── client-audience/           # Audience React app with localized caption viewer
├── shared/                    # Shared caption protocol, language catalog, realtime client
├── server/                    # Express backend (Dockerized)
├── scripts/
│   ├── setup-azure.ps1        # Azure provisioning (Phase 2 / Full mode)
│   ├── deploy-azure.ps1       # Full deployment to Azure Container Apps
│   └── cleanup-azure.ps1      # Delete all resources (resource group)
├── docker-compose.yml         # Local containers
├── .env.example               # Shared Azure resource placeholders
└── README.md
```

## Azure Deployment (Phase 5)

Deploy the full application to Azure using the deployment script. This provisions all resources under a single resource group and uses Managed Identity exclusively — no API keys.

### Prerequisites for Deployment

- All [local prerequisites](#prerequisites) above
- Azure CLI logged in with an account that can create resources and assign RBAC roles
- The Azure subscription must allow creating Container Apps, ACR, Speech, SignalR, and Static Web Apps

### Deploy

```powershell
.\scripts\deploy-azure.ps1
```

This script:
1. Creates/reuses the resource group
2. Provisions Azure AI Speech (F0), SignalR (Free), Container Registry (Basic), Container Apps Environment, and Static Web App
3. Builds the backend Docker image using ACR Tasks (no local Docker required)
4. Deploys the Container App with system-assigned Managed Identity
5. Assigns RBAC roles: `Cognitive Services Speech User`, least-privilege `Live Translation Speech Token Issuer`, `AcrPull`, `SignalR App Server`
6. Builds both frontend apps with the backend URL baked in
7. Deploys the combined frontend to the Static Web App

Once complete, the script prints the live URLs:

- **Audience app** (root): `https://<swa-hostname>/`
- **Speaker app**: `https://<swa-hostname>/speaker/`
- **Backend API**: `https://<container-app-fqdn>/`

You can override defaults with parameters or environment variables:

```powershell
.\scripts\deploy-azure.ps1 `
    -Location westeurope `
    -ResourceGroup rg-live-translation-prod `
    -ContainerAppName api-live-translation-prod
```

### Cleanup

To permanently delete all Azure resources (resource group and everything in it):

```powershell
.\scripts\cleanup-azure.ps1
```

This deletes the entire resource group. You will be asked to confirm by typing the resource group name. Use `-Force` to skip confirmation:

```powershell
.\scripts\cleanup-azure.ps1 -Force
```
