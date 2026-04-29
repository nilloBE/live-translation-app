#!/usr/bin/env bash
set -euo pipefail

AZURE_LOCATION="${AZURE_LOCATION:-westeurope}"
AZURE_RESOURCE_GROUP="${AZURE_RESOURCE_GROUP:-rg-live-translation}"
SPEECH_RESOURCE_NAME="${SPEECH_RESOURCE_NAME:-speech-live-translation}"
SIGNALR_RESOURCE_NAME="${SIGNALR_RESOURCE_NAME:-signalr-live-translation}"
ACR_NAME="${ACR_NAME:-acrlivetranslation}"
CONTAINER_APP_ENV_NAME="${CONTAINER_APP_ENV_NAME:-env-live-translation}"
STATIC_WEB_APP_NAME="${STATIC_WEB_APP_NAME:-web-live-translation}"

echo "Using subscription:"
az account show --query "{name:name, id:id}" --output table

echo "Creating resource group ${AZURE_RESOURCE_GROUP} in ${AZURE_LOCATION}"
az group create \
  --name "${AZURE_RESOURCE_GROUP}" \
  --location "${AZURE_LOCATION}" \
  --output none

echo "Creating Azure AI Speech resource ${SPEECH_RESOURCE_NAME}"
az cognitiveservices account create \
  --name "${SPEECH_RESOURCE_NAME}" \
  --resource-group "${AZURE_RESOURCE_GROUP}" \
  --kind SpeechServices \
  --sku F0 \
  --location "${AZURE_LOCATION}" \
  --yes \
  --output none

SPEECH_RESOURCE_ID="$(az cognitiveservices account show \
  --name "${SPEECH_RESOURCE_NAME}" \
  --resource-group "${AZURE_RESOURCE_GROUP}" \
  --query id \
  --output tsv)"

USER_OBJECT_ID="$(az ad signed-in-user show --query id --output tsv)"

echo "Assigning Cognitive Services Speech User role to signed-in user"
az role assignment create \
  --assignee "${USER_OBJECT_ID}" \
  --role "Cognitive Services Speech User" \
  --scope "${SPEECH_RESOURCE_ID}" \
  --output none || true

echo "Creating Azure SignalR Service ${SIGNALR_RESOURCE_NAME}"
az signalr create \
  --name "${SIGNALR_RESOURCE_NAME}" \
  --resource-group "${AZURE_RESOURCE_GROUP}" \
  --sku Free_F1 \
  --service-mode Default \
  --location "${AZURE_LOCATION}" \
  --output none

echo "Creating Azure Container Registry ${ACR_NAME}"
az acr create \
  --name "${ACR_NAME}" \
  --resource-group "${AZURE_RESOURCE_GROUP}" \
  --sku Basic \
  --admin-enabled false \
  --output none

echo "Creating Azure Container Apps environment ${CONTAINER_APP_ENV_NAME}"
az containerapp env create \
  --name "${CONTAINER_APP_ENV_NAME}" \
  --resource-group "${AZURE_RESOURCE_GROUP}" \
  --location "${AZURE_LOCATION}" \
  --output none

echo "Creating Azure Static Web App ${STATIC_WEB_APP_NAME}"
az staticwebapp create \
  --name "${STATIC_WEB_APP_NAME}" \
  --resource-group "${AZURE_RESOURCE_GROUP}" \
  --location "${AZURE_LOCATION}" \
  --output none

cat <<SUMMARY

Phase 1 Azure resources are ready.

Resource group: ${AZURE_RESOURCE_GROUP}
Speech resource: ${SPEECH_RESOURCE_NAME}
SignalR resource: ${SIGNALR_RESOURCE_NAME}
Container registry: ${ACR_NAME}
Container Apps environment: ${CONTAINER_APP_ENV_NAME}
Static Web App: ${STATIC_WEB_APP_NAME}

No API keys or connection strings were created or printed.
SUMMARY
