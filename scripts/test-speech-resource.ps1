$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/speech-resource.ps1"
function Assert-Equal($Actual, $Expected) {
    if ($Actual -ne $Expected) { throw "Expected '$Expected', got '$Actual'." }
}
function Invoke-AzText {
    param([Parameter(ValueFromRemainingArguments)][string[]]$Arguments)
    if ($Arguments -contains 'list-skus') { return $script:skuResponse }
    if ($Arguments -contains 'list') {
        if ($script:lookupFails) { throw 'lookup denied' }
        if (-not $script:actualSku) { return '[]' }
        return "[{`"name`":`"speech`",`"kind`":`"SpeechServices`",`"sku`":{`"name`":`"$script:actualSku`"}}]"
    }
    return $script:actualSku
}
function Invoke-Az {
    param([Parameter(ValueFromRemainingArguments)][string[]]$Arguments)
    $script:mutations++
    if ($script:updateFails) { throw 'update denied' }
    if (-not $script:mismatch) { $script:actualSku = $Arguments[[Array]::IndexOf($Arguments, '--sku') + 1] }
}
$savedSku = $env:SPEECH_SKU
try {
    $env:SPEECH_SKU = ''
    $script:skuResponse = '[{"sku":{"name":"F0"}},{"sku":{"name":"S0"}}]'
    Assert-Equal (Resolve-SpeechSku 'F0' 'S0' 'S0').Sku 'F0'
    Assert-Equal (Resolve-SpeechSku '' 'F0' 'S0').Sku 'F0'
    Assert-Equal (Resolve-SpeechSku '' '' 'F0').Sku 'F0'
    foreach ($case in @(@('', 'F0'), @('', 'S0'), @('', ''), @('F0', 'S0'), @('S0', 'F0'), @('F0', ''), @('S0', 'S0'))) {
        $script:actualSku = $case[0]; $script:mutations = 0
        $script:lookupFails = $false; $script:updateFails = $false; $script:mismatch = $false
        $expected = (Resolve-SpeechSku $case[1] '' $case[0]).Sku
        Assert-Equal (Ensure-SpeechResource speech group region domain $case[1]) $expected
        Assert-Equal $script:mutations ([int]($case[0] -ne $expected))
    }
    foreach ($response in @('{"value":[{"sku":{"name":"F0"}},{"sku":{"name":"S0"}}]}', '[{"name":"F0"},{"name":"S0"}]', '{"value":[]}')) {
        $script:skuResponse = $response
        $script:actualSku = 'F0'; $script:mutations = 0
        $caught = $false
        try { Ensure-SpeechResource speech group region domain S0 | Out-Null } catch { $caught = $true }
        $unavailable = $response -eq '{"value":[]}'
        Assert-Equal $caught $unavailable
        Assert-Equal $script:mutations ([int](-not $unavailable))
        Assert-Equal $script:actualSku $(if ($unavailable) { 'F0' } else { 'S0' })
    }
    $script:skuResponse = '{"value":[{"sku":{"name":"F0"}},{"sku":{"name":"S0"}}]}'
    foreach ($failure in @('invalid', 'lookup', 'denied', 'mismatch')) {
        $script:actualSku = 'S0'; $script:mutations = 0
        $script:lookupFails = $failure -eq 'lookup'; $script:updateFails = $failure -eq 'denied'; $script:mismatch = $failure -eq 'mismatch'
        $env:SPEECH_SKU = if ($failure -eq 'invalid') { 'invalid' } else { '' }
        $caught = $false
        try { Ensure-SpeechResource speech group region domain '' | Out-Null
            if ($failure -in @('denied', 'mismatch')) { Ensure-SpeechResource speech group region domain F0 | Out-Null }
        } catch { $caught = $true }
        Assert-Equal $caught $true
        if ($failure -in @('invalid', 'lookup')) { Assert-Equal $script:mutations 0 }
    }
    Write-Host 'Speech SKU tests passed (no Azure calls).'
} finally { $env:SPEECH_SKU = $savedSku }

. "$PSScriptRoot/deployment-checks.ps1"
function New-DeploymentFixture {
    return @{
        App = @{ properties = @{ configuration = @{ activeRevisionsMode = 'Single' }; latestRevisionName = 'app--test'; latestReadyRevisionName = 'app--test' } }
        Revisions = @(@{ name = 'app--test'; properties = @{ active = $true; healthState = 'Healthy'; template = @{
            scale = @{ minReplicas = 1; maxReplicas = 1 }
            containers = @(@{ image = 'registry/app:test'; env = @(@{ name = 'ADMIN_API_KEY'; secretRef = 'admin-api-key' }) })
        } } })
    }
}
$fixture = New-DeploymentFixture
Assert-Equal (Assert-DeploymentState $fixture.App $fixture.Revisions 'registry/app:test') 'app--test'
foreach ($failure in @('mode', 'multiple', 'notReady', 'unhealthy', 'scale', 'image', 'secret')) {
    $fixture = New-DeploymentFixture
    switch ($failure) {
        mode { $fixture.App.properties.configuration.activeRevisionsMode = 'Multiple' }
        multiple { $fixture.Revisions += $fixture.Revisions[0] }
        notReady { $fixture.App.properties.latestReadyRevisionName = 'old' }
        unhealthy { $fixture.Revisions[0].properties.healthState = 'Unhealthy' }
        scale { $fixture.Revisions[0].properties.template.scale.maxReplicas = 2 }
        image { $fixture.Revisions[0].properties.template.containers[0].image = 'registry/app:old' }
        secret { $fixture.Revisions[0].properties.template.containers[0].env = @() }
    }
    $caught = $false
    try { Assert-DeploymentState $fixture.App $fixture.Revisions 'registry/app:test' | Out-Null } catch { $caught = $true }
    Assert-Equal $caught $true
}
foreach ($file in Get-ChildItem $PSScriptRoot -Filter '*.ps1') {
    $parseErrors = $null
    [System.Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$null, [ref]$parseErrors) | Out-Null
    if ($parseErrors) { throw "$($file.Name): $parseErrors" }
}
$deploy = Get-Content "$PSScriptRoot/deploy-azure.ps1" -Raw
if ($deploy -match 'signalr create|SignalR App Server|livetranslation-api:latest') { throw 'Obsolete deployment configuration.' }
if ($deploy.IndexOf('containerapp secret set') -gt $deploy.IndexOf('containerapp update')) { throw 'Secret must be installed before revision update.' }
Write-Host 'Deployment state and PowerShell syntax checks passed (no Azure calls).'