param(
  [string]$DataPath = ".\study-app\data\practical-summary.json",
  [string]$OutputPath = ".\study-app\data\practical-cloze-review.json",
  [string]$ServiceAccountKeyPath = "",
  [string]$ProjectId = "",
  [string]$Location = "global",
  [string]$Model = "gemini-2.5-flash",
  [int]$BatchSize = 8,
  [int]$StartIndex = 0,
  [int]$Limit = 0,
  [switch]$Apply
)

$ErrorActionPreference = "Stop"

function ConvertTo-Base64Url([byte[]]$Bytes) {
  return [Convert]::ToBase64String($Bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

function Get-VertexAccessToken([string]$KeyPath) {
  if (-not (Test-Path -LiteralPath $KeyPath)) {
    throw "Service account key not found: $KeyPath"
  }

  $key = Get-Content -LiteralPath $KeyPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  $header = @{ alg = "RS256"; typ = "JWT" } | ConvertTo-Json -Compress
  $claim = @{
    iss = $key.client_email
    scope = "https://www.googleapis.com/auth/cloud-platform"
    aud = $key.token_uri
    iat = $now
    exp = $now + 3600
  } | ConvertTo-Json -Compress

  $encodedHeader = ConvertTo-Base64Url ([Text.Encoding]::UTF8.GetBytes($header))
  $encodedClaim = ConvertTo-Base64Url ([Text.Encoding]::UTF8.GetBytes($claim))
  $unsignedJwt = "$encodedHeader.$encodedClaim"

  $rsa = [System.Security.Cryptography.RSA]::Create()
  $rsa.ImportFromPem($key.private_key.ToCharArray())
  $signature = $rsa.SignData(
    [Text.Encoding]::UTF8.GetBytes($unsignedJwt),
    [System.Security.Cryptography.HashAlgorithmName]::SHA256,
    [System.Security.Cryptography.RSASignaturePadding]::Pkcs1
  )
  $jwt = "$unsignedJwt.$(ConvertTo-Base64Url $signature)"

  $tokenResponse = Invoke-RestMethod -Method Post -Uri $key.token_uri -Body @{
    grant_type = "urn:ietf:params:oauth:grant-type:jwt-bearer"
    assertion = $jwt
  }
  return $tokenResponse.access_token
}

function ConvertFrom-GeminiJsonText([string]$Text) {
  $clean = $Text.Trim()
  if ($clean.StartsWith('```')) {
    $clean = $clean -replace '^```(?:json)?\s*', ''
    $clean = $clean -replace '\s*```$', ''
  }
  return $clean | ConvertFrom-Json
}

function New-ReviewPrompt($Items) {
  $payload = $Items | ForEach-Object {
    [ordered]@{
      id = $_.id
      number = $_.global_number
      title = $_.title
      summary = $_.summary
      details = $_.details
    }
  } | ConvertTo-Json -Depth 12 -Compress

  return @"
너는 정보처리기사 실기 암기 앱의 빈칸문제 검수자다.
아래 JSON 항목마다 "무엇을 빈칸으로 만들면 가장 암기에 도움이 되는지"를 새로 판단해라.
기존 prompt나 기존 빈칸에 묶이지 말고, 핵심 용어, 약어, 정의의 핵심 조건, 비교 포인트를 우선 빈칸화한다.

규칙:
- 각 항목마다 reviewed_clozes를 1~4개 만든다.
- 한 문제에 {{blank}}가 2개 이상이어도 된다.
- answers 배열은 prompt 안의 {{blank}} 순서와 정확히 맞춘다.
- 답은 짧고 명확한 용어로 둔다. 긴 문장 전체를 답으로 만들지 않는다.
- 소괄호 안 영문 약어, 한글 주제어, 열거된 하위 개념은 좋은 빈칸 후보이다.
- numbered detail이 여러 개 있으면 하위 개념별로 나누는 편이 좋다.
- prompt에는 반드시 {{blank}} 토큰을 넣는다.
- 한국어 원문을 보존하고, 임의로 새 지식을 추가하지 않는다.
- 출력은 설명 없이 JSON만 반환한다.

반환 형식:
{
  "items": [
    {
      "id": "practical-001",
      "reviewed_clozes": [
        {
          "label": "짧은 라벨",
          "prompt": "{{blank}} 방법론은 절차보다 사람이 중심이 되어 ...",
          "answers": ["애자일"],
          "source": "title",
          "reason": "핵심 용어라서"
        }
      ]
    }
  ]
}

검수할 항목:
$payload
"@
}

function Invoke-GeminiReview($Items, [string]$Token, [string]$Project, [string]$Region, [string]$ModelName) {
  $hostName = if ($Region -eq "global") { "https://aiplatform.googleapis.com" } else { "https://$Region-aiplatform.googleapis.com" }
  $uri = "$hostName/v1/projects/$Project/locations/$Region/publishers/google/models/$ModelName`:generateContent"
  $body = @{
    contents = @(
      @{
        role = "user"
        parts = @(@{ text = New-ReviewPrompt $Items })
      }
    )
    generationConfig = @{
      temperature = 0.15
      topP = 0.8
      maxOutputTokens = 8192
      responseMimeType = "application/json"
    }
  } | ConvertTo-Json -Depth 20 -Compress

  $response = Invoke-RestMethod -Method Post -Uri $uri -Headers @{ Authorization = "Bearer $Token" } -ContentType "application/json; charset=utf-8" -Body $body
  $text = ($response.candidates[0].content.parts | ForEach-Object { $_.text }) -join ""
  return ConvertFrom-GeminiJsonText $text
}

if (-not $ProjectId) {
  $ProjectId = $env:VERTEX_PROJECT_ID
}
if (-not $ServiceAccountKeyPath) {
  $ServiceAccountKeyPath = $env:GOOGLE_APPLICATION_CREDENTIALS
}
if (-not $ProjectId) {
  throw "ProjectId is required. Pass -ProjectId or set VERTEX_PROJECT_ID."
}
if (-not $ServiceAccountKeyPath) {
  throw "ServiceAccountKeyPath is required. Pass -ServiceAccountKeyPath or set GOOGLE_APPLICATION_CREDENTIALS."
}

$summary = Get-Content -LiteralPath $DataPath -Raw -Encoding UTF8 | ConvertFrom-Json
$allItems = @($summary.sections | ForEach-Object { $_.items } | ForEach-Object { $_ })
if ($Limit -gt 0) {
  $reviewItems = $allItems | Select-Object -Skip $StartIndex -First $Limit
} else {
  $reviewItems = $allItems | Select-Object -Skip $StartIndex
}

$token = Get-VertexAccessToken $ServiceAccountKeyPath
$reviewed = @()

for ($i = 0; $i -lt $reviewItems.Count; $i += $BatchSize) {
  $batch = $reviewItems | Select-Object -Skip $i -First $BatchSize
  Write-Host ("Reviewing {0}-{1} / {2}" -f ($StartIndex + $i + 1), ($StartIndex + $i + $batch.Count), $reviewItems.Count)
  $result = Invoke-GeminiReview $batch $token $ProjectId $Location $Model
  $reviewed += @($result.items)
  Start-Sleep -Milliseconds 650
}

$reviewDoc = [ordered]@{
  generated_at = (Get-Date).ToUniversalTime().ToString("s") + "Z"
  model = $Model
  item_count = $reviewed.Count
  items = $reviewed
}

$reviewDoc | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $OutputPath -Encoding UTF8

if ($Apply) {
  $byId = @{}
  foreach ($entry in $reviewed) {
    $byId[$entry.id] = $entry.reviewed_clozes
  }
  foreach ($section in $summary.sections) {
    foreach ($item in $section.items) {
      if ($byId.ContainsKey($item.id)) {
        $item | Add-Member -NotePropertyName reviewed_clozes -NotePropertyValue $byId[$item.id] -Force
      }
    }
  }
  $summary | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $DataPath -Encoding UTF8
}

Write-Host "Wrote $OutputPath"
if ($Apply) {
  Write-Host "Applied reviewed_clozes to $DataPath"
}
