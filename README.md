# Live Translation App

Live Translation App is a web-based captioning experience for presenters and audiences. The planned application captures speaker audio in the browser, translates it with Azure Speech, and broadcasts translated captions to audience devices.

## Current Scope

This repository currently includes the Phase 1 scaffold, Phase 2 local Speech translation, Phase 3 local room broadcasting, and Phase 4 UX polish:

- React + TypeScript + Vite frontend in `client/`
- Node.js + Express + TypeScript backend in `server/`
- Speech token broker endpoint at `/api/speech-token`
- Browser microphone translation for French to Dutch and Spanish to French
- Local Socket.IO caption relay with room codes
- Speaker and audience views for testing live subtitles in separate browser tabs
- Polished session controls, generated/copyable room codes, status indicators, clear actions, and mobile-friendly subtitles
- Backend Dockerfile and local `docker-compose.yml`
- PowerShell Azure CLI provisioning script in `scripts/setup-azure.ps1`
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
Copy-Item client/.env.example client/.env
Copy-Item server/.env.example server/.env
```

The example files contain only non-secret values such as regions and service URLs. Keep real `.env` files local.

## Local Development

Run both workspaces from the host:

```powershell
npm run dev
```

Or run the containerized local setup:

```powershell
docker compose up --build
```

The client normally runs on `http://localhost:5173` and the backend runs on `http://localhost:3001`. If Vite moves to another port such as `5174`, include it in `server/.env` with a comma-separated `CORS_ORIGIN` value.

## Phase 2 Local Speech Translation

Before using the speaker console, make sure the signed-in Azure CLI user has `Cognitive Services Speech User` on the Azure AI Speech resource:

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

Start the app, open the client, choose a translation pair, and allow microphone access when the browser prompts. The backend calls Azure AI Speech with `DefaultAzureCredential` and returns a short-lived authorization token to the browser; no Speech keys are used.

## Phase 3 Local Broadcasting

The backend runs a local Socket.IO relay for development. The speaker view publishes translated captions to a room code, and the audience view subscribes to the same room code.

To test locally:

```powershell
npm run dev --workspace @live-translation/server
npm run dev --workspace @live-translation/client
```

Open two browser tabs at the Vite URL printed in the terminal, usually `http://localhost:5173`:

- In the first tab, use `Speaker`, choose a room code such as `LIVE`, select a translation pair, and click `Start`.
- In the second tab, use `Audience`, enter the same room code, and watch the translated subtitles appear.

The local relay is intended for development and single-machine testing. Azure SignalR Service is still the planned cloud-scale realtime service for later phases.

## Phase 4 UX Polish

The app now has focused speaker and audience controls:

- Generated room codes with copy and regenerate actions
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
- `Cognitive Services Speech User` assigned to your signed-in Azure user on the Speech resource

Azure SignalR belongs to the cloud-scale version of the Phase 3 realtime path. Azure Container Registry, Container Apps, and Static Web Apps belong to Phase 5 deployment work.

The setup script defaults to the minimal Phase 2 resource set and assigns the current signed-in user the `Cognitive Services Speech User` role on the Speech resource.

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
├── client/                    # React frontend
├── server/                    # Express backend
├── scripts/setup-azure.ps1    # Azure provisioning script
├── docker-compose.yml         # Local containers
├── .env.example               # Shared Azure resource placeholders
└── README.md
```

## Next Phases

Phase 5 will add production deployment with managed identity for the backend container and cloud-scale realtime broadcasting.
