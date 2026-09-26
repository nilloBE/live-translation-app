function Assert-DeploymentState($App, $Revisions, [string]$Image) {
    if ($App.properties.configuration.activeRevisionsMode -ne 'Single') { throw 'Container App must use single revision mode.' }
    $active = @($Revisions | Where-Object { $_.properties.active })
    if ($active.Count -ne 1) { throw 'Expected exactly one active revision. Wait for rollout to settle and recheck.' }
    $revision = $active[0]
    if ($revision.name -ne $App.properties.latestRevisionName -or $revision.name -ne $App.properties.latestReadyRevisionName) {
        throw 'The latest revision is not the sole ready serving revision.'
    }
    if ($revision.properties.healthState -ne 'Healthy') { throw 'The serving revision is not healthy.' }
    if ($revision.properties.template.scale.minReplicas -ne 1 -or $revision.properties.template.scale.maxReplicas -ne 1) {
        throw 'The serving revision must have min/max replicas set to one.'
    }
    $containers = @($revision.properties.template.containers)
    if ($containers.Count -ne 1 -or $containers[0].image -ne $Image) { throw 'Serving image differs from the requested image.' }
    $admin = @($containers[0].env | Where-Object { $_.name -eq 'ADMIN_API_KEY' })
    if ($admin.Count -ne 1 -or $admin[0].secretRef -ne 'admin-api-key') { throw 'Admin secret reference is missing.' }
    return $revision.name
}