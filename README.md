# Live Translation App

Live Translation App is a web-based captioning experience for presenters and audiences. The planned application captures speaker audio in the browser, translates it with Azure Speech, and broadcasts translated captions to audience devices.

## Current Scope

This repository currently includes the Phase 1 scaffold and Phase 2 local Speech translation work:

- React + TypeScript + Vite frontend in `client/`
- Node.js + Express + TypeScript backend in `server/`
- Speech token broker endpoint at `/api/speech-token`
- Browser microphone translation for French to Dutch and Spanish to French
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

The client runs on `http://localhost:5173` and the backend runs on `http://localhost:3001`.

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

## Azure Resource Setup

Use one Azure resource group per app environment, for example `rg-live-translation-dev`, `rg-live-translation-test`, and `rg-live-translation-prod`. Keep all resources for that environment in its matching resource group so cleanup, RBAC, deployment scope, and cost review stay straightforward.

For Phase 2 local Speech translation work, the minimal Azure setup is:

- A dev resource group, such as `rg-live-translation-dev`
- An Azure AI Speech resource in that group
- A Speech custom subdomain endpoint, such as `https://speech-live-translation-dev.cognitiveservices.azure.com`
- `Cognitive Services Speech User` assigned to your signed-in Azure user on the Speech resource

SignalR belongs to Phase 3. Azure Container Registry, Container Apps, and Static Web Apps belong to Phase 5 deployment work.

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

Phase 3 will add real-time caption broadcasting to audience clients. Phase 5 will add production deployment with managed identity for the backend container.
