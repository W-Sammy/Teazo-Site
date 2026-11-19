# Tests atomic checkout claims through the local D1 proxy.
# Uses a unique temporary attempt and removes it afterward.
# Never connects to a remote database or Square.

$ErrorActionPreference = "Stop"

$siteRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $siteRoot ".env.local"
$proxyUrl = "http://127.0.0.1:8787"

if (-not (Test-Path -LiteralPath $envPath)) {
    throw "Missing teazo-site/.env.local"
}

$tokenLine = Get-Content -LiteralPath $envPath |
    Where-Object { $_ -match '^\s*PROXY_TOKEN\s*=' } |
    Select-Object -Last 1

if (-not $tokenLine) {
    throw "PROXY_TOKEN was not found in .env.local"
}

$token = ($tokenLine -split '=', 2)[1].Trim()
$token = $token.Trim('"', "'")

if ([string]::IsNullOrWhiteSpace($token)) {
    throw "PROXY_TOKEN is empty"
}

# Refuse nonlocal destinations.
$uri = [Uri]$proxyUrl
if (-not $uri.IsLoopback) {
    throw "Only loopback D1 proxy connections are permitted"
}

$client = [System.Net.Http.HttpClient]::new()
$client.DefaultRequestHeaders.Authorization =
    [System.Net.Http.Headers.AuthenticationHeaderValue]::new(
        "Bearer",
        $token
    )

function Start-D1Query {
    param(
        [string]$Sql,
        [object[]]$Parameters
    )

    $json = ConvertTo-Json -InputObject @{
        sql = $Sql
        params = $Parameters
    } -Depth 10 -Compress

    $content = [System.Net.Http.StringContent]::new(
        $json,
        [System.Text.Encoding]::UTF8,
        "application/json"
    )

    return $client.PostAsync("$proxyUrl/query", $content)
}

function Read-D1Result {
    param($Task)

    $response = $Task.GetAwaiter().GetResult()

    try {
        $body = $response.Content.ReadAsStringAsync().
            GetAwaiter().GetResult()

        if (-not $response.IsSuccessStatusCode) {
            throw "D1 proxy HTTP $([int]$response.StatusCode): $body"
        }

        $result = $body | ConvertFrom-Json

        if ($result.success -ne $true) {
            throw "D1 query failed: $body"
        }

        return $result
    }
    finally {
        $response.Dispose()
    }
}

$attemptId = "tz584-concurrency-$([guid]::NewGuid().ToString('N'))"

$insertSql = @"
INSERT INTO checkout_attempt (
    attempt_id,
    request_hash,
    square_idempotency_key,
    square_request_json,
    status
)
VALUES (?1, ?2, ?3, ?4, 'reserved')
ON CONFLICT (attempt_id) DO NOTHING
RETURNING attempt_id, status
"@

$ownerSql = @"
UPDATE checkout_attempt
SET status = 'processing',
    processing_owner = ?2,
    processing_started_at =
        strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE attempt_id = ?1
  AND status = 'reserved'
RETURNING attempt_id, processing_owner
"@

try {
    Write-Host "Testing concurrent reservations..."

    # Start all requests before awaiting any response.
    $tasks = @(
        for ($i = 0; $i -lt 10; $i++) {
            Start-D1Query -Sql $insertSql -Parameters @(
                $attemptId,
                "test-payload-hash",
                $attemptId,
                "{}"
            )
        }
    )

    $reservationWinners = 0

    foreach ($task in $tasks) {
        $result = Read-D1Result -Task $task
        $reservationWinners += @($result.results).Count
    }

    Write-Host "Successful reservations: $reservationWinners / 10"

    if ($reservationWinners -ne 1) {
        throw "Expected exactly one successful reservation"
    }

    Write-Host "Testing concurrent processing ownership..."

    $tasks = @(
        for ($i = 0; $i -lt 10; $i++) {
            Start-D1Query -Sql $ownerSql -Parameters @(
                $attemptId,
                "owner-$i"
            )
        }
    )

    $ownerWinners = 0

    foreach ($task in $tasks) {
        $result = Read-D1Result -Task $task
        $ownerWinners += @($result.results).Count
    }

    Write-Host "Successful processing claims: $ownerWinners / 10"

    if ($ownerWinners -ne 1) {
        throw "Expected exactly one processing owner"
    }

    Write-Host "PASS: D1 atomic reservation and ownership"
}
finally {
    try {
        $cleanup = Start-D1Query `
            -Sql "DELETE FROM checkout_attempt WHERE attempt_id = ?1" `
            -Parameters @($attemptId)

        $null = Read-D1Result -Task $cleanup
        Write-Host "Temporary test record cleaned up"
    }
    finally {
        $client.Dispose()
    }
}
