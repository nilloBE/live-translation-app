# Live Translation App

Live Translation App is a web-based captioning experience for presenters and audiences. The planned application captures speaker audio in the browser, translates it with Azure Speech, and broadcasts translated captions to audience devices.

## Phase 1 Scope

This repository currently includes the Phase 1 scaffold:

- React + TypeScript + Vite frontend in `client/`
- Node.js + Express + TypeScript backend in `server/`
- Backend Dockerfile and local `docker-compose.yml`
- Azure CLI provisioning script in `scripts/setup-azure.sh`
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

```bash
az login
az account show
```

## Install

```bash
npm install
```

## Environment Configuration

Copy the examples before running locally:

```bash
cp .env.example .env
cp client/.env.example client/.env
cp server/.env.example server/.env
```

The example files contain only non-secret values such as regions and service URLs. Keep real `.env` files local.

## Local Development

Run both workspaces from the host:

```bash
npm run dev
```

Or run the containerized local setup:

```bash
docker compose up --build
```

The client runs on `http://localhost:5173` and the backend runs on `http://localhost:3001`.

## Azure Resource Setup

The setup script provisions the Phase 1 Azure resources and assigns the current signed-in user the `Cognitive Services Speech User` role on the Speech resource.

```bash
bash scripts/setup-azure.sh
```

You can override defaults with environment variables:

```bash
AZURE_LOCATION=westeurope \
AZURE_RESOURCE_GROUP=rg-live-translation \
SPEECH_RESOURCE_NAME=speech-live-translation \
SIGNALR_RESOURCE_NAME=signalr-live-translation \
ACR_NAME=acrlivetranslation \
CONTAINER_APP_ENV_NAME=env-live-translation \
STATIC_WEB_APP_NAME=web-live-translation \
bash scripts/setup-azure.sh
```

The script creates:

- Resource group
- Azure AI Speech resource, free tier
- Azure SignalR Service, free tier
- Azure Container Registry, basic tier with admin access disabled
- Azure Container Apps environment
- Azure Static Web App
- RBAC assignment for your signed-in Azure user

## Project Structure

```text
live-translation-app/
├── client/                    # React frontend
├── server/                    # Express backend
├── scripts/setup-azure.sh     # Azure provisioning script
├── docker-compose.yml         # Local containers
├── .env.example               # Shared Azure resource placeholders
└── README.md
```

## Next Phases

Phase 2 will add the Speech token broker endpoint and browser Speech SDK integration. Phase 3 will add real-time caption broadcasting to audience clients.
