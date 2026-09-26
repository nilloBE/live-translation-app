function Resolve-SpeechSku {
    param([string]$RequestedSku, [string]$EnvironmentSku, [string]$ExistingSku)
    $source = 'new-resource default'
    $sku = 'S0'
    if (-not [string]::IsNullOrWhiteSpace($ExistingSku)) { $sku = $ExistingSku; $source = 'existing resource' }
    if (-not [string]::IsNullOrWhiteSpace($EnvironmentSku)) { $sku = $EnvironmentSku; $source = 'SPEECH_SKU' }
    if (-not [string]::IsNullOrWhiteSpace($RequestedSku)) { $sku = $RequestedSku; $source = 'parameter' }
    $sku = $sku.Trim().ToUpperInvariant()
    if ($sku -notin @('F0', 'S0')) { throw "Invalid Speech SKU '$sku'. Use F0 or S0." }
    return @{ Sku = $sku; Source = $source }
}

function Ensure-SpeechResource {
    param([string]$Name, [string]$ResourceGroup, [string]$Location, [string]$CustomDomain, [string]$RequestedSku)
    $selection = Resolve-SpeechSku $RequestedSku $env:SPEECH_SKU ''
    $accounts = @(Invoke-AzText cognitiveservices account list --resource-group $ResourceGroup --output json | ConvertFrom-Json)
    $existing = $accounts | Where-Object { $_.name -eq $Name } | Select-Object -First 1
    $currentSku = if ($existing) { $existing.sku.name } else { '' }
    $selection = Resolve-SpeechSku $RequestedSku $env:SPEECH_SKU $currentSku
    if ($existing -and $existing.kind -ne 'SpeechServices') { throw 'The selected account is not a SpeechServices resource.' }
    Write-Host "Speech $ResourceGroup/${Name}: '$currentSku' -> '$($selection.Sku)' ($($selection.Source))"
    if ($selection.Sku -eq 'F0') { Write-Warning 'F0 supports one concurrent speaker only; not three-room event ready.' }
    else { Write-Host 'S0 is billed by usage.' }
    try {
        if (-not $existing) {
            Invoke-Az cognitiveservices account create --name $Name --resource-group $ResourceGroup --kind SpeechServices --sku $selection.Sku --location $Location --custom-domain $CustomDomain --yes --output none
        } elseif ($currentSku -ne $selection.Sku) {
            $response = Invoke-AzText cognitiveservices account list-skus --name $Name --resource-group $ResourceGroup --output json | ConvertFrom-Json
            $available = if ($response.PSObject.Properties['value']) { @($response.value) } else { @($response) }
            $names = @($available | ForEach-Object {
                if ($_.PSObject.Properties['sku']) { $_.sku.name }
                elseif ($_.PSObject.Properties['name']) { $_.name }
            })
            if ($selection.Sku -notin $names) { throw "SKU $($selection.Sku) is not advertised for this resource. Available: $($names -join ', ')." }
            Invoke-Az cognitiveservices account update --name $Name --resource-group $ResourceGroup --sku $selection.Sku --output none
        }
    } catch {
        $failure = $_.Exception.Message
        $actual = 'unknown (read-back unavailable)'
        try { $actual = Invoke-AzText cognitiveservices account show --name $Name --resource-group $ResourceGroup --query sku.name --output tsv } catch { }
        throw "Speech provisioning failed; actual SKU: $actual. $failure"
    }
    $actual = Invoke-AzText cognitiveservices account show --name $Name --resource-group $ResourceGroup --query sku.name --output tsv
    if ($actual -ne $selection.Sku) { throw "Speech SKU mismatch: requested $($selection.Sku), actual $actual." }
    return $actual
}