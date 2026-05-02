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
| Speaker app | `client-speaker/` | React + Vite app. Captures microphone, fetches a Speech token from the backend, runs the Azure Speech SDK in-browser, and broadcasts translated captions to the room. |
| Audience app | `client-audience/` | React + Vite app. Connects to the backend via Socket.IO, lets each viewer pick a target language, and displays live subtitles. |
| Shared package | `shared/` | Caption protocol types, room normalization, language catalog, and Socket.IO client factory shared by both apps. |
| Backend server | `server/` | Node.js + Express. Speech token broker (`/api/speech-token`), Socket.IO relay, and CORS. Runs in Docker. |

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
- **Backend API**: `https://<container-app-fqdn>/`

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
4. Share the generated room code with your audience (use the copy button).
5. Click **Start** and allow microphone access when prompted.
6. The app will begin capturing and translating your speech in real-time. Use the preview tabs to check each target language translation.

### Audience (viewers)

1. Open the audience app at `https://<swa-hostname>/` (or `http://localhost:5174` locally).
2. Select your preferred UI language (Français, Nederlands, or English).
3. Enter the room code shared by the speaker.
4. Choose the language you want to read from the **Read in** selector.
5. Translated captions appear live and auto-scroll as the speaker talks.

Audience language preference and room code are remembered between visits.

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

This starts the backend on `http://localhost:3001`, the speaker app on `http://localhost:5173`, and the audience app on `http://localhost:5174`.

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

## Project Structure

```text
live-translation-app/
├── client-speaker/            # Speaker React app (Vite + TypeScript)
├── client-audience/           # Audience React app (Vite + TypeScript)
├── shared/                    # Caption protocol, language catalog, realtime client
├── server/                    # Express backend (Dockerized)
├── scripts/
│   ├── setup-azure.ps1        # Provision Azure resources for local dev
│   ├── deploy-azure.ps1       # Full deploy to Azure (provision + build + deploy)
│   └── cleanup-azure.ps1      # Delete all Azure resources
├── docker-compose.yml         # Local containerized backend
├── .env.example               # Shared non-secret placeholders
└── README.md
```

