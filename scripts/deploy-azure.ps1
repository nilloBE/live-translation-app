<#
.SYNOPSIS
    Deploys the Live Translation App to Azure Container Apps and Static Web Apps.
    All resources are provisioned under a single resource group.
    Authentication uses Microsoft Entra ID exclusively — no API keys.

.DESCRIPTION
    This script:
    1. Creates the resource group (if missing)
    2. Provisions Azure AI Speech, Azure SignalR, Container Registry, Container Apps Environment, and Static Web App
    3. Builds and pushes the backend Docker image to ACR
    4. Creates or updates the Container App with system-assigned Managed Identity
    5. Assigns RBAC roles (Cognitive Services Speech User, SignalR App Server) to the Container App identity
    6. Builds and deploys the frontend apps to Azure Static Web Apps
    7. Prints the deployment URLs

.PARAMETER Location
    Azure region for all resources. Default: westeurope

.PARAMETER ResourceGroup
    Name of the Azure resource group. Default: rg-live-translation-dev

.PARAMETER SpeechResourceName
    Name of the Azure AI Speech resource. Default: speech-live-translation-dev

.PARAMETER SignalRResourceName
    Name of the Azure SignalR resource. Default: signalr-live-translation-dev

.PARAMETER ContainerRegistryName
    Name of the Azure Container Registry. Default: acrlivetranslationdev

.PARAMETER ContainerAppEnvironmentName
    Name of the Container Apps Environment. Default: env-live-translation-dev

.PARAMETER ContainerAppName
    Name of the Container App for the backend. Default: api-live-translation-dev

.PARAMETER StaticWebAppName
    Name of the Azure Static Web App. Default: web-live-translation-dev

.EXAMPLE
    .\scripts\deploy-azure.ps1
    .\scripts\deploy-azure.ps1 -Location "northeurope" -ResourceGroup "rg-live-translation-prod"
#>
[CmdletBinding()]
param(
    [string]$Location,
    [string]$ResourceGroup,
    [string]$SpeechResourceName,
    [string]$SpeechCustomDomain,
    [string]$SignalRResourceName,
    [string]$ContainerRegistryName,
    [string]$ContainerAppEnvironmentName,
    [string]$ContainerAppName,
    [string]$StaticWebAppName
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------
function Get-Setting {
    param(
        [string]$ProvidedValue,
        [string]$EnvironmentVariableName,
        [string]$DefaultValue
    )
    if (-not [string]::IsNullOrWhiteSpace($ProvidedValue)) { return $ProvidedValue }
    $envValue = [Environment]::GetEnvironmentVariable($EnvironmentVariableName)
    if (-not [string]::IsNullOrWhiteSpace($envValue)) { return $envValue }
    return $DefaultValue
}

function Invoke-Az {
    param([Parameter(Mandatory, ValueFromRemainingArguments)][string[]]$Arguments)
    & az @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Azure CLI command failed: az $($Arguments -join ' ')" }
}

function Invoke-AzText {
    param([Parameter(Mandatory, ValueFromRemainingArguments)][string[]]$Arguments)
    $output = & az @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Azure CLI command failed: az $($Arguments -join ' ')" }
    return ($output | Out-String).Trim()
}

function Test-AzResource {
    param([Parameter(Mandatory, ValueFromRemainingArguments)][string[]]$Arguments)
    $allArgs = $Arguments + @("--output", "none")
    & az @allArgs 2>$null
    return $LASTEXITCODE -eq 0
}

function Set-RoleAssignmentIfMissing {
    param(
        [string]$AssigneeObjectId,
        [string]$RoleName,
        [string]$Scope
    )
    $existing = Invoke-AzText role assignment list `
        --assignee $AssigneeObjectId `
        --role $RoleName `
        --scope $Scope `
        --query "[0].id" `
        --output tsv
    if (-not [string]::IsNullOrWhiteSpace($existing)) {
        Write-Host "  Role '$RoleName' already assigned."
        return
    }
    Write-Host "  Assigning role '$RoleName'..."
    Invoke-Az role assignment create `
        --assignee-object-id $AssigneeObjectId `
        --assignee-principal-type ServicePrincipal `
        --role $RoleName `
        --scope $Scope `
        --output none
}

function Set-RoleAssignmentByDefinitionIdIfMissing {
    param(
        [string]$AssigneeObjectId,
        [string]$RoleDefinitionId,
        [string]$RoleDisplayName,
        [string]$Scope
    )
    $existing = Invoke-AzText role assignment list `
        --assignee $AssigneeObjectId `
        --scope $Scope `
        --query "[?ends_with(roleDefinitionId, '$RoleDefinitionId')][0].id" `
        --output tsv
    if (-not [string]::IsNullOrWhiteSpace($existing)) {
        Write-Host "  Role '$RoleDisplayName' already assigned."
        return
    }
    Write-Host "  Assigning role '$RoleDisplayName'..."
    Invoke-Az role assignment create `
        --assignee-object-id $AssigneeObjectId `
        --assignee-principal-type ServicePrincipal `
        --role $RoleDefinitionId `
        --scope $Scope `
        --output none
}

function Ensure-SpeechTokenIssuerRole {
    param(
        [string]$SubscriptionId,
        [string]$ResourceGroup
    )

    $roleName = "Live Translation Speech Token Issuer"
    $roleId = Invoke-AzText role definition list `
        --custom-role-only true `
        --query "[?roleName=='$roleName']|[0].name" `
        --output tsv

    if (-not [string]::IsNullOrWhiteSpace($roleId)) {
        Write-Host "  Custom role '$roleName' already exists."
        return $roleId
    }

    Write-Host "  Creating custom role '$roleName'..."
    $assignableScope = "/subscriptions/$SubscriptionId/resourceGroups/$ResourceGroup"
    $roleDefinition = [ordered]@{
        Name = $roleName
        IsCustom = $true
        Description = "Allows issuing Azure AI Speech authorization tokens without access to API keys."
        Actions = @("Microsoft.CognitiveServices/accounts/read")
        NotActions = @()
        DataActions = @("Microsoft.CognitiveServices/accounts/SpeechServices/issuetoken/action")
        NotDataActions = @()
        AssignableScopes = @($assignableScope)
    }

    $roleDefinitionPath = Join-Path ([System.IO.Path]::GetTempPath()) "live-translation-speech-token-role.json"
    $roleDefinition | ConvertTo-Json -Depth 5 | Set-Content $roleDefinitionPath -Encoding UTF8
    try {
        Invoke-Az role definition create --role-definition $roleDefinitionPath --output none
    } finally {
        Remove-Item $roleDefinitionPath -ErrorAction SilentlyContinue
    }

    for ($attempt = 1; $attempt -le 12; $attempt++) {
        $roleId = Invoke-AzText role definition list `
            --custom-role-only true `
            --query "[?roleName=='$roleName']|[0].name" `
            --output tsv
        if (-not [string]::IsNullOrWhiteSpace($roleId)) {
            return $roleId
        }
        Start-Sleep -Seconds 5
    }

    throw "Custom role '$roleName' was created but was not available for assignment yet. Re-run the script in a few minutes."
}

# Helper to invoke npm reliably on Windows. PowerShell's & operator can
# misresolve npm (e.g., when npm.ps1 wrappers from nvm-windows/volta are
# in PATH). Using cmd /c with the actual command string avoids all of that.
function Invoke-Npm {
    param([Parameter(Mandatory, ValueFromRemainingArguments)][string[]]$NpmArgs)
    $cmdLine = "npm " + ($NpmArgs -join " ")
    & cmd /c $cmdLine
}

function Invoke-Npx {
    param([Parameter(Mandatory, ValueFromRemainingArguments)][string[]]$NpxArgs)
    $cmdLine = "npx " + ($NpxArgs -join " ")
    & cmd /c $cmdLine
}

# ---------------------------------------------------------------------------
# Prerequisites check
# ---------------------------------------------------------------------------
if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    throw "Azure CLI is required. Install from https://learn.microsoft.com/cli/azure/install-azure-cli then run 'az login'."
}

# ---------------------------------------------------------------------------
# Resolve parameters
# ---------------------------------------------------------------------------
$Location = Get-Setting $Location "AZURE_LOCATION" "westeurope"
$ResourceGroup = Get-Setting $ResourceGroup "AZURE_RESOURCE_GROUP" "rg-live-translation-dev"
$SpeechResourceName = Get-Setting $SpeechResourceName "SPEECH_RESOURCE_NAME" "speech-live-translation-dev"
$SpeechCustomDomain = Get-Setting $SpeechCustomDomain "SPEECH_CUSTOM_DOMAIN" $SpeechResourceName
$SignalRResourceName = Get-Setting $SignalRResourceName "SIGNALR_RESOURCE_NAME" "signalr-live-translation-dev"
$ContainerRegistryName = Get-Setting $ContainerRegistryName "ACR_NAME" "acrlivetranslationdev"
$ContainerAppEnvironmentName = Get-Setting $ContainerAppEnvironmentName "CONTAINER_APP_ENV_NAME" "env-live-translation-dev"
$ContainerAppName = Get-Setting $ContainerAppName "CONTAINER_APP_NAME" "api-live-translation-dev"
$StaticWebAppName = Get-Setting $StaticWebAppName "STATIC_WEB_APP_NAME" "web-live-translation-dev"

$ImageName = "live-translation-api"
$ImageTag = "latest"
$FullImageName = "$ContainerRegistryName.azurecr.io/${ImageName}:${ImageTag}"
$SubscriptionId = Invoke-AzText account show --query id --output tsv

Write-Host "========================================"
Write-Host " Live Translation App - Azure Deployment"
Write-Host "========================================"
Write-Host ""
Write-Host "Subscription:"
Invoke-Az account show --query "{name:name, id:id}" --output table
Write-Host ""
Write-Host "Configuration:"
Write-Host "  Location:             $Location"
Write-Host "  Resource Group:       $ResourceGroup"
Write-Host "  Speech Resource:      $SpeechResourceName"
Write-Host "  SignalR Resource:     $SignalRResourceName"
Write-Host "  Container Registry:   $ContainerRegistryName"
Write-Host "  Container App Env:    $ContainerAppEnvironmentName"
Write-Host "  Container App:        $ContainerAppName"
Write-Host "  Static Web App:       $StaticWebAppName"
Write-Host ""

# ===========================================================================
# Step 1: Resource Group
# ===========================================================================
Write-Host "[1/10] Creating resource group..."
Invoke-Az group create --name $ResourceGroup --location $Location --output none

# ===========================================================================
# Step 2: Azure AI Speech (with custom subdomain for Entra ID token exchange)
# ===========================================================================
Write-Host "[2/10] Provisioning Azure AI Speech resource..."
if (Test-AzResource cognitiveservices account show --name $SpeechResourceName --resource-group $ResourceGroup) {
    Write-Host "  Already exists: $SpeechResourceName"
} else {
    Invoke-Az cognitiveservices account create `
        --name $SpeechResourceName `
        --resource-group $ResourceGroup `
        --kind SpeechServices `
        --sku F0 `
        --location $Location `
        --custom-domain $SpeechCustomDomain `
        --yes `
        --output none
}

$speechResourceId = Invoke-AzText cognitiveservices account show `
    --name $SpeechResourceName `
    --resource-group $ResourceGroup `
    --query id --output tsv

# ===========================================================================
# Step 3: Azure SignalR Service
# ===========================================================================
Write-Host "[3/10] Provisioning Azure SignalR Service..."
if (Test-AzResource signalr show --name $SignalRResourceName --resource-group $ResourceGroup) {
    Write-Host "  Already exists: $SignalRResourceName"
} else {
    Invoke-Az signalr create `
        --name $SignalRResourceName `
        --resource-group $ResourceGroup `
        --sku Free_F1 `
        --service-mode Default `
        --location $Location `
        --output none
}

$signalrResourceId = Invoke-AzText signalr show `
    --name $SignalRResourceName `
    --resource-group $ResourceGroup `
    --query id --output tsv

# ===========================================================================
# Step 4: Azure Container Registry
# ===========================================================================
Write-Host "[4/10] Provisioning Azure Container Registry..."
if (Test-AzResource acr show --name $ContainerRegistryName --resource-group $ResourceGroup) {
    Write-Host "  Already exists: $ContainerRegistryName"
} else {
    Invoke-Az acr create `
        --name $ContainerRegistryName `
        --resource-group $ResourceGroup `
        --sku Basic `
        --admin-enabled false `
        --output none
}

$acrResourceId = Invoke-AzText acr show `
    --name $ContainerRegistryName `
    --resource-group $ResourceGroup `
    --query id --output tsv

# ===========================================================================
# Step 5: Build & Push Docker Image (using ACR Tasks — no local Docker needed)
# ===========================================================================
Write-Host "[5/10] Building and pushing Docker image to ACR..."
Invoke-Az acr build `
    --registry $ContainerRegistryName `
    --image "${ImageName}:${ImageTag}" `
    --file server/Dockerfile `
    server/

# ===========================================================================
# Step 6: Container Apps Environment
# ===========================================================================
Write-Host "[6/10] Provisioning Container Apps Environment..."
if (Test-AzResource containerapp env show --name $ContainerAppEnvironmentName --resource-group $ResourceGroup) {
    Write-Host "  Already exists: $ContainerAppEnvironmentName"
} else {
    Invoke-Az containerapp env create `
        --name $ContainerAppEnvironmentName `
        --resource-group $ResourceGroup `
        --location $Location `
        --output none
}

# ===========================================================================
# Step 7: Container App (with system-assigned Managed Identity)
# ===========================================================================
Write-Host "[7/10] Deploying Container App..."

# Get the Static Web App URL for CORS (if it exists already)
$swaHostname = ""
if (Test-AzResource staticwebapp show --name $StaticWebAppName --resource-group $ResourceGroup) {
    $swaHostname = Invoke-AzText staticwebapp show `
        --name $StaticWebAppName `
        --resource-group $ResourceGroup `
        --query "defaultHostname" --output tsv
}

$corsOrigins = "https://$swaHostname"
if ([string]::IsNullOrWhiteSpace($swaHostname)) {
    $corsOrigins = "*"
}

if (Test-AzResource containerapp show --name $ContainerAppName --resource-group $ResourceGroup) {
    Write-Host "  Updating existing Container App..."
    Invoke-Az containerapp update `
        --name $ContainerAppName `
        --resource-group $ResourceGroup `
        --image $FullImageName `
        --set-env-vars `
            "NODE_ENV=production" `
            "PORT=3001" `
            "SPEECH_REGION=$Location" `
            "SPEECH_ENDPOINT=https://$SpeechCustomDomain.cognitiveservices.azure.com" `
            "CORS_ORIGIN=$corsOrigins" `
        --output none
} else {
    Write-Host "  Creating new Container App..."
    Invoke-Az containerapp create `
        --name $ContainerAppName `
        --resource-group $ResourceGroup `
        --environment $ContainerAppEnvironmentName `
        --image $FullImageName `
        --registry-server "$ContainerRegistryName.azurecr.io" `
        --registry-identity system `
        --target-port 3001 `
        --ingress external `
        --system-assigned `
        --env-vars `
            "NODE_ENV=production" `
            "PORT=3001" `
            "SPEECH_REGION=$Location" `
            "SPEECH_ENDPOINT=https://$SpeechCustomDomain.cognitiveservices.azure.com" `
            "CORS_ORIGIN=$corsOrigins" `
        --min-replicas 0 `
        --max-replicas 2 `
        --output none
}

# Ensure system identity is enabled
Invoke-Az containerapp identity assign `
    --name $ContainerAppName `
    --resource-group $ResourceGroup `
    --system-assigned `
    --output none

$appIdentityPrincipalId = Invoke-AzText containerapp identity show `
    --name $ContainerAppName `
    --resource-group $ResourceGroup `
    --query "principalId" --output tsv

# ===========================================================================
# Step 8: RBAC Role Assignments for Container App Managed Identity
# ===========================================================================
Write-Host "[8/10] Assigning RBAC roles to Container App identity..."

# Speech User role — allows requesting authorization tokens
Set-RoleAssignmentIfMissing `
    -AssigneeObjectId $appIdentityPrincipalId `
    -RoleName "Cognitive Services Speech User" `
    -Scope $speechResourceId

# The Speech token broker calls /sts/v1.0/issueToken. The built-in
# "Cognitive Services Speech User" role does not currently include the
# required issuetoken/action data action, so add a narrow custom role rather
# than granting broad key-listing permissions.
$speechTokenIssuerRoleId = Ensure-SpeechTokenIssuerRole `
    -SubscriptionId $SubscriptionId `
    -ResourceGroup $ResourceGroup
Set-RoleAssignmentByDefinitionIdIfMissing `
    -AssigneeObjectId $appIdentityPrincipalId `
    -RoleDefinitionId $speechTokenIssuerRoleId `
    -RoleDisplayName "Live Translation Speech Token Issuer" `
    -Scope $speechResourceId

# ACR Pull — allows pulling images from the container registry
Set-RoleAssignmentIfMissing `
    -AssigneeObjectId $appIdentityPrincipalId `
    -RoleName "AcrPull" `
    -Scope $acrResourceId

# SignalR App Server — allows the backend to use SignalR in the future
Set-RoleAssignmentIfMissing `
    -AssigneeObjectId $appIdentityPrincipalId `
    -RoleName "SignalR App Server" `
    -Scope $signalrResourceId

# ===========================================================================
# Step 9: Static Web App + Frontend Build & Deploy
# ===========================================================================
Write-Host "[9/10] Provisioning Static Web App..."
if (Test-AzResource staticwebapp show --name $StaticWebAppName --resource-group $ResourceGroup) {
    Write-Host "  Already exists: $StaticWebAppName"
} else {
    Invoke-Az staticwebapp create `
        --name $StaticWebAppName `
        --resource-group $ResourceGroup `
        --location $Location `
        --output none
}

# Get Container App FQDN for frontend configuration
$containerAppFqdn = Invoke-AzText containerapp show `
    --name $ContainerAppName `
    --resource-group $ResourceGroup `
    --query "properties.configuration.ingress.fqdn" --output tsv

$swaHostname = Invoke-AzText staticwebapp show `
    --name $StaticWebAppName `
    --resource-group $ResourceGroup `
    --query "defaultHostname" --output tsv

# Update CORS now that we have the SWA URL
Write-Host "  Updating Container App CORS with SWA hostname..."
Invoke-Az containerapp update `
    --name $ContainerAppName `
    --resource-group $ResourceGroup `
    --set-env-vars "CORS_ORIGIN=https://$swaHostname" `
    --output none

# ===========================================================================
# Step 10: Build and deploy frontend to Static Web App
# ===========================================================================
Write-Host "[10/10] Building and deploying frontend..."

$repoRoot = Split-Path -Parent $PSScriptRoot

# Install dependencies (npm workspaces)
Write-Host "  Installing npm dependencies..."
Push-Location $repoRoot
try {
    Invoke-Npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }

    # Build shared package first (workspace dependency)
    Write-Host "  Building shared package..."
    Invoke-Npm run build --workspace @live-translation/shared --if-present

    # Build speaker and audience apps with production API URL
    $env:VITE_API_BASE_URL = "https://$containerAppFqdn"

    Write-Host "  Building speaker app (VITE_API_BASE_URL=https://$containerAppFqdn)..."
    $env:VITE_BASE_PATH = "/speaker/"
    Invoke-Npm run build --workspace @live-translation/client-speaker
    if ($LASTEXITCODE -ne 0) { throw "Speaker app build failed" }
    Remove-Item Env:\VITE_BASE_PATH -ErrorAction SilentlyContinue

    Write-Host "  Building audience app (VITE_API_BASE_URL=https://$containerAppFqdn)..."
    Invoke-Npm run build --workspace @live-translation/client-audience
    if ($LASTEXITCODE -ne 0) { throw "Audience app build failed" }

    # Combine both apps into a single output directory:
    #   /           → audience app (primary public-facing app)
    #   /speaker/   → speaker app
    $combinedOutput = Join-Path $repoRoot ".deploy-output"
    if (Test-Path $combinedOutput) { Remove-Item -Recurse -Force $combinedOutput }
    New-Item -ItemType Directory -Path $combinedOutput -Force | Out-Null

    $audienceDist = Join-Path $repoRoot "client-audience" "dist"
    $speakerDist = Join-Path $repoRoot "client-speaker" "dist"

    if (-not (Test-Path $audienceDist)) { throw "Audience dist not found at $audienceDist" }
    if (-not (Test-Path $speakerDist)) { throw "Speaker dist not found at $speakerDist" }

    Write-Host "  Combining outputs (audience at /, speaker at /speaker/)..."
    Copy-Item -Recurse -Path "$audienceDist\*" -Destination $combinedOutput
    $speakerOutputDir = Join-Path $combinedOutput "speaker"
    New-Item -ItemType Directory -Path $speakerOutputDir -Force | Out-Null
    Copy-Item -Recurse -Path "$speakerDist\*" -Destination $speakerOutputDir

    # Create staticwebapp.config.json for SPA routing.
    # Routes are matched in order; first match wins.
    # - /speaker/assets/* has NO rewrite so assets are served as actual files.
    # - /speaker/* is the SPA catch-all; rewrites to the speaker index.html.
    # Note: SWA allows at most ONE wildcard '*' per pattern, and treats
    # /speaker and /speaker/ as the same route (no trailing-slash duplicate).
    $swaConfig = @{
        navigationFallback = @{
            rewrite = "/index.html"
            exclude = @(
                "/speaker/*",
                "/assets/*",
                "/*.{ico,svg,png,jpg,jpeg,gif,css,js,json,webmanifest,woff,woff2,ttf,map}"
            )
        }
        routes = @(
            # Assets must come first — no rewrite means the file is served as-is
            @{ route = "/speaker/assets/*" },
            # SPA catch-all for all other /speaker/* navigation paths
            @{ route = "/speaker/*"; rewrite = "/speaker/index.html" }
        )
    }
    $swaConfig | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $combinedOutput "staticwebapp.config.json") -Encoding UTF8

    # Deploy to Static Web App
    Write-Host "  Retrieving SWA deployment token..."
    $deploymentToken = Invoke-AzText staticwebapp secrets list `
        --name $StaticWebAppName `
        --resource-group $ResourceGroup `
        --query "properties.apiKey" --output tsv

    Write-Host "  Deploying to Static Web App..."
    $env:SWA_CLI_DEPLOYMENT_TOKEN = $deploymentToken
    try {
        Invoke-Npx --yes @azure/static-web-apps-cli deploy `"$combinedOutput`" --env production
        if ($LASTEXITCODE -ne 0) { throw "SWA deployment failed" }
    } finally {
        Remove-Item Env:\SWA_CLI_DEPLOYMENT_TOKEN -ErrorAction SilentlyContinue
    }

    # Cleanup temporary output directory
    Remove-Item -Recurse -Force $combinedOutput -ErrorAction SilentlyContinue
} finally {
    # Restore environment
    Remove-Item Env:\VITE_API_BASE_URL -ErrorAction SilentlyContinue
    Pop-Location
}

# ===========================================================================
# Summary
# ===========================================================================
Write-Host ""
Write-Host "========================================"
Write-Host " Deployment Complete!"
Write-Host "========================================"
Write-Host ""
Write-Host "Backend API:     https://$containerAppFqdn"
Write-Host "Health check:    https://$containerAppFqdn/health"
Write-Host ""
Write-Host "Audience app:    https://$swaHostname"
Write-Host "Speaker app:     https://$swaHostname/speaker/"
Write-Host ""
Write-Host "No API keys or secrets were used. All auth is via Microsoft Entra ID."
