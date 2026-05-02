[CmdletBinding()]
param(
    [string]$Location,
    [string]$ResourceGroup,
    [string]$SpeechResourceName,
    [string]$SpeechCustomDomain,
    [string]$SignalRResourceName,
    [string]$ContainerRegistryName,
    [string]$ContainerAppEnvironmentName,
    [string]$StaticWebAppName,
    [ValidateSet("Phase2", "Full")]
    [string]$Mode
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-Setting {
    param(
        [string]$ProvidedValue,
        [string]$EnvironmentVariableName,
        [string]$DefaultValue
    )

    if (-not [string]::IsNullOrWhiteSpace($ProvidedValue)) {
        return $ProvidedValue
    }

    $environmentValue = [Environment]::GetEnvironmentVariable($EnvironmentVariableName)
    if (-not [string]::IsNullOrWhiteSpace($environmentValue)) {
        return $environmentValue
    }

    return $DefaultValue
}

function Invoke-Az {
    param(
        [Parameter(Mandatory = $true, ValueFromRemainingArguments = $true)]
        [string[]]$Arguments
    )

    & az @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Azure CLI command failed: az $($Arguments -join ' ')"
    }
}

function Invoke-AzText {
    param(
        [Parameter(Mandatory = $true, ValueFromRemainingArguments = $true)]
        [string[]]$Arguments
    )

    $output = & az @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Azure CLI command failed: az $($Arguments -join ' ')"
    }

    return ($output | Out-String).Trim()
}

function Test-AzResource {
    param(
        [Parameter(Mandatory = $true, ValueFromRemainingArguments = $true)]
        [string[]]$Arguments
    )

    $allArguments = $Arguments + @("--output", "none")
    & az @allArguments 2>$null
    return $LASTEXITCODE -eq 0
}

function Set-RoleAssignmentIfMissing {
    param(
        [string]$AssigneeObjectId,
        [string]$RoleName,
        [string]$Scope
    )

    $existingAssignment = Invoke-AzText role assignment list `
        --assignee $AssigneeObjectId `
        --role $RoleName `
        --scope $Scope `
        --query "[0].id" `
        --output tsv

    if (-not [string]::IsNullOrWhiteSpace($existingAssignment)) {
        Write-Host "Role assignment already exists: $RoleName"
        return
    }

    Write-Host "Assigning $RoleName role to signed-in user"
    Invoke-Az role assignment create `
        --assignee $AssigneeObjectId `
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

    $existingAssignment = Invoke-AzText role assignment list `
        --assignee $AssigneeObjectId `
        --scope $Scope `
        --query "[?ends_with(roleDefinitionId, '$RoleDefinitionId')][0].id" `
        --output tsv

    if (-not [string]::IsNullOrWhiteSpace($existingAssignment)) {
        Write-Host "Role assignment already exists: $RoleDisplayName"
        return
    }

    Write-Host "Assigning $RoleDisplayName role to signed-in user"
    Invoke-Az role assignment create `
        --assignee $AssigneeObjectId `
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
        Write-Host "Custom role already exists: $roleName"
        return $roleId
    }

    Write-Host "Creating custom role: $roleName"
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

if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    throw "Azure CLI was not found. Install it from https://learn.microsoft.com/cli/azure/install-azure-cli, then run 'az login'."
}

$Location = Get-Setting $Location "AZURE_LOCATION" "westeurope"
$ResourceGroup = Get-Setting $ResourceGroup "AZURE_RESOURCE_GROUP" "rg-live-translation-dev"
$SpeechResourceName = Get-Setting $SpeechResourceName "SPEECH_RESOURCE_NAME" "speech-live-translation-dev"
$SpeechCustomDomain = Get-Setting $SpeechCustomDomain "SPEECH_CUSTOM_DOMAIN" $SpeechResourceName
$SignalRResourceName = Get-Setting $SignalRResourceName "SIGNALR_RESOURCE_NAME" "signalr-live-translation-dev"
$ContainerRegistryName = Get-Setting $ContainerRegistryName "ACR_NAME" "acrlivetranslationdev"
$ContainerAppEnvironmentName = Get-Setting $ContainerAppEnvironmentName "CONTAINER_APP_ENV_NAME" "env-live-translation-dev"
$StaticWebAppName = Get-Setting $StaticWebAppName "STATIC_WEB_APP_NAME" "web-live-translation-dev"
$Mode = Get-Setting $Mode "AZURE_SETUP_MODE" "Phase2"

if ($Mode -notin @("Phase2", "Full")) {
    throw "Invalid setup mode '$Mode'. Use 'Phase2' or 'Full'."
}

Write-Host "Using subscription:"
Invoke-Az account show --query "{name:name, id:id}" --output table
$subscriptionId = Invoke-AzText account show --query id --output tsv

Write-Host "Creating resource group $ResourceGroup in $Location"
Invoke-Az group create `
    --name $ResourceGroup `
    --location $Location `
    --output none

if (Test-AzResource cognitiveservices account show --name $SpeechResourceName --resource-group $ResourceGroup) {
    Write-Host "Azure AI Speech resource already exists: $SpeechResourceName"
} else {
    Write-Host "Creating Azure AI Speech resource $SpeechResourceName"
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

$currentSpeechCustomDomain = Invoke-AzText cognitiveservices account show `
    --name $SpeechResourceName `
    --resource-group $ResourceGroup `
    --query properties.customSubDomainName `
    --output tsv

if ([string]::IsNullOrWhiteSpace($currentSpeechCustomDomain)) {
    Write-Host "Configuring Speech custom subdomain $SpeechCustomDomain"
    Invoke-Az cognitiveservices account update `
        --name $SpeechResourceName `
        --resource-group $ResourceGroup `
        --custom-domain $SpeechCustomDomain `
        --output none
} elseif ($currentSpeechCustomDomain -ne $SpeechCustomDomain) {
    throw "Speech resource already uses custom subdomain '$currentSpeechCustomDomain'. Set SPEECH_CUSTOM_DOMAIN to match it, or create a new Speech resource."
} else {
    Write-Host "Speech custom subdomain is configured: $SpeechCustomDomain"
}

$speechResourceId = Invoke-AzText cognitiveservices account show `
    --name $SpeechResourceName `
    --resource-group $ResourceGroup `
    --query id `
    --output tsv

$userObjectId = Invoke-AzText ad signed-in-user show --query id --output tsv

Set-RoleAssignmentIfMissing `
    -AssigneeObjectId $userObjectId `
    -RoleName "Cognitive Services Speech User" `
    -Scope $speechResourceId

$speechTokenIssuerRoleId = Ensure-SpeechTokenIssuerRole `
    -SubscriptionId $subscriptionId `
    -ResourceGroup $ResourceGroup

Set-RoleAssignmentByDefinitionIdIfMissing `
    -AssigneeObjectId $userObjectId `
    -RoleDefinitionId $speechTokenIssuerRoleId `
    -RoleDisplayName "Live Translation Speech Token Issuer" `
    -Scope $speechResourceId

if ($Mode -eq "Full") {
    if (Test-AzResource signalr show --name $SignalRResourceName --resource-group $ResourceGroup) {
        Write-Host "Azure SignalR Service already exists: $SignalRResourceName"
    } else {
        Write-Host "Creating Azure SignalR Service $SignalRResourceName"
        Invoke-Az signalr create `
            --name $SignalRResourceName `
            --resource-group $ResourceGroup `
            --sku Free_F1 `
            --service-mode Default `
            --location $Location `
            --output none
    }

    if (Test-AzResource acr show --name $ContainerRegistryName --resource-group $ResourceGroup) {
        Write-Host "Azure Container Registry already exists: $ContainerRegistryName"
    } else {
        Write-Host "Creating Azure Container Registry $ContainerRegistryName"
        Invoke-Az acr create `
            --name $ContainerRegistryName `
            --resource-group $ResourceGroup `
            --sku Basic `
            --admin-enabled false `
            --output none
    }

    if (Test-AzResource containerapp env show --name $ContainerAppEnvironmentName --resource-group $ResourceGroup) {
        Write-Host "Azure Container Apps environment already exists: $ContainerAppEnvironmentName"
    } else {
        Write-Host "Creating Azure Container Apps environment $ContainerAppEnvironmentName"
        Invoke-Az containerapp env create `
            --name $ContainerAppEnvironmentName `
            --resource-group $ResourceGroup `
            --location $Location `
            --output none
    }

    if (Test-AzResource staticwebapp show --name $StaticWebAppName --resource-group $ResourceGroup) {
        Write-Host "Azure Static Web App already exists: $StaticWebAppName"
    } else {
        Write-Host "Creating Azure Static Web App $StaticWebAppName"
        Invoke-Az staticwebapp create `
            --name $StaticWebAppName `
            --resource-group $ResourceGroup `
            --location $Location `
            --output none
    }
}

Write-Host ""
Write-Host "Azure resources are ready."
Write-Host "Mode: $Mode"
Write-Host "Resource group: $ResourceGroup"
Write-Host "Speech resource: $SpeechResourceName"
Write-Host "Speech endpoint: https://$SpeechCustomDomain.cognitiveservices.azure.com"

if ($Mode -eq "Full") {
    Write-Host "SignalR resource: $SignalRResourceName"
    Write-Host "Container registry: $ContainerRegistryName"
    Write-Host "Container Apps environment: $ContainerAppEnvironmentName"
    Write-Host "Static Web App: $StaticWebAppName"
}

Write-Host ""
Write-Host "No API keys or connection strings were created or printed."
