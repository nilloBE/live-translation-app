<#
.SYNOPSIS
    Deletes all Azure resources for the Live Translation App by removing the resource group.

.DESCRIPTION
    This script performs a complete cleanup by deleting the entire resource group.
    All resources within the group (Speech, SignalR, ACR, Container App, Static Web App)
    will be permanently deleted. This action is irreversible.

.PARAMETER ResourceGroup
    Name of the resource group to delete. Default: rg-live-translation-dev

.PARAMETER Force
    Skip the confirmation prompt.

.EXAMPLE
    .\scripts\cleanup-azure.ps1
    .\scripts\cleanup-azure.ps1 -ResourceGroup "rg-live-translation-prod" -Force
#>
[CmdletBinding()]
param(
    [string]$ResourceGroup,
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

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

if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    throw "Azure CLI is required. Install from https://learn.microsoft.com/cli/azure/install-azure-cli"
}

$ResourceGroup = Get-Setting $ResourceGroup "AZURE_RESOURCE_GROUP" "rg-live-translation-dev"

# Check if the resource group exists
$rgExists = & az group exists --name $ResourceGroup
if ($rgExists -ne "true") {
    Write-Host "Resource group '$ResourceGroup' does not exist. Nothing to clean up."
    exit 0
}

# List resources that will be deleted
Write-Host "========================================"
Write-Host " Live Translation App - Cleanup"
Write-Host "========================================"
Write-Host ""
Write-Host "The following resource group will be PERMANENTLY DELETED:"
Write-Host "  $ResourceGroup"
Write-Host ""
Write-Host "Resources in this group:"
& az resource list --resource-group $ResourceGroup --query "[].{Name:name, Type:type}" --output table
Write-Host ""

if (-not $Force) {
    $confirmation = Read-Host "Type the resource group name to confirm deletion"
    if ($confirmation -ne $ResourceGroup) {
        Write-Host "Confirmation did not match. Aborting cleanup."
        exit 1
    }
}

Write-Host ""
Write-Host "Deleting resource group '$ResourceGroup'..."
Write-Host "This may take several minutes..."
& az group delete --name $ResourceGroup --yes --no-wait

if ($LASTEXITCODE -ne 0) {
    throw "Failed to delete resource group '$ResourceGroup'."
}

Write-Host ""
Write-Host "Resource group deletion initiated (running in background)."
Write-Host "Use 'az group show --name $ResourceGroup' to check status."
Write-Host ""
Write-Host "All Azure resources for the Live Translation App will be removed."
