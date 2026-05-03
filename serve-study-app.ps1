param(
  [int]$Port = 4173
)

$ErrorActionPreference = "Stop"
$root = Join-Path $PSScriptRoot "study-app"
$script:VertexAccessToken = $null
$script:VertexAccessTokenExpiresAt = [DateTimeOffset]::MinValue
$listener = [System.Net.HttpListener]::new()
$prefix = "http://127.0.0.1:$Port/"
$listener.Prefixes.Add($prefix)

$contentTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".css" = "text/css; charset=utf-8"
  ".js" = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".png" = "image/png"
  ".jpg" = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".webp" = "image/webp"
  ".svg" = "image/svg+xml"
  ".ico" = "image/x-icon"
}

function Send-TextResponse {
  param(
    [System.Net.HttpListenerResponse]$Response,
    [int]$StatusCode,
    [string]$Body
  )

  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Body)
  $Response.StatusCode = $StatusCode
  $Response.ContentType = "text/plain; charset=utf-8"
  $Response.ContentLength64 = $bytes.Length
  $Response.OutputStream.Write($bytes, 0, $bytes.Length)
}

function Send-JsonResponse {
  param(
    [System.Net.HttpListenerResponse]$Response,
    [int]$StatusCode,
    $Body
  )

  $json = $Body | ConvertTo-Json -Depth 20 -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $Response.StatusCode = $StatusCode
  $Response.ContentType = "application/json; charset=utf-8"
  $Response.ContentLength64 = $bytes.Length
  $Response.OutputStream.Write($bytes, 0, $bytes.Length)
}

function Read-RequestJson {
  param([System.Net.HttpListenerRequest]$Request)

  $reader = [System.IO.StreamReader]::new($Request.InputStream, $Request.ContentEncoding)
  try {
    $raw = $reader.ReadToEnd()
  } finally {
    $reader.Dispose()
  }

  if ([string]::IsNullOrWhiteSpace($raw)) {
    return $null
  }

  return $raw | ConvertFrom-Json
}

function ConvertTo-Base64Url([byte[]]$Bytes) {
  return [Convert]::ToBase64String($Bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

function Get-VertexAccessToken([string]$KeyPath) {
  $nowDate = [DateTimeOffset]::UtcNow
  if ($script:VertexAccessToken -and $script:VertexAccessTokenExpiresAt -gt $nowDate.AddMinutes(5)) {
    return $script:VertexAccessToken
  }

  if (-not (Test-Path -LiteralPath $KeyPath)) {
    throw "Service account key not found: $KeyPath"
  }

  $key = Get-Content -LiteralPath $KeyPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $now = $nowDate.ToUnixTimeSeconds()
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
  try {
    $rsa.ImportFromPem($key.private_key.ToCharArray())
    $signature = $rsa.SignData(
      [Text.Encoding]::UTF8.GetBytes($unsignedJwt),
      [System.Security.Cryptography.HashAlgorithmName]::SHA256,
      [System.Security.Cryptography.RSASignaturePadding]::Pkcs1
    )
  } finally {
    $rsa.Dispose()
  }
  $jwt = "$unsignedJwt.$(ConvertTo-Base64Url $signature)"

  $tokenResponse = Invoke-RestMethod -Method Post -Uri $key.token_uri -Body @{
    grant_type = "urn:ietf:params:oauth:grant-type:jwt-bearer"
    assertion = $jwt
  }

  $script:VertexAccessToken = $tokenResponse.access_token
  $script:VertexAccessTokenExpiresAt = $nowDate.AddSeconds([Math]::Max(60, [int]$tokenResponse.expires_in))
  return $script:VertexAccessToken
}

function Invoke-AiChat {
  param($Payload)

  $message = if ($Payload -and $Payload.PSObject.Properties["message"]) { [string]$Payload.message } else { "" }
  if ([string]::IsNullOrWhiteSpace($message)) {
    throw "질문 내용을 입력해 주세요."
  }

  $projectId = $env:VERTEX_PROJECT_ID
  if (-not $projectId) {
    $projectId = $env:GOOGLE_CLOUD_PROJECT
  }
  $keyPath = $env:GOOGLE_APPLICATION_CREDENTIALS
  $location = if ($env:VERTEX_LOCATION) { $env:VERTEX_LOCATION } else { "global" }
  $model = if ($env:VERTEX_MODEL) { $env:VERTEX_MODEL } else { "gemini-3-flash-preview" }

  if (-not $projectId) {
    throw "VERTEX_PROJECT_ID or GOOGLE_CLOUD_PROJECT is required."
  }
  if (-not $keyPath) {
    throw "GOOGLE_APPLICATION_CREDENTIALS is required."
  }

  $token = Get-VertexAccessToken $keyPath
  $hostName = if ($location -eq "global") { "https://aiplatform.googleapis.com" } else { "https://$location-aiplatform.googleapis.com" }
  $uri = "$hostName/v1/projects/$projectId/locations/$location/publishers/google/models/$model`:generateContent"
  $context = if ($Payload -and $Payload.PSObject.Properties["context"]) { [string]$Payload.context } else { "" }
  $prompt = @"
너는 정보처리기사 공부를 돕는 한국어 튜터야.
답변은 짧고 명확하게 하되, 시험장에서 구분해야 하는 포인트를 먼저 말해.
사용자가 객관식 문제나 오답을 물어보면 정답만 던지지 말고 왜 다른 보기가 아닌지도 설명해.

현재 앱 맥락:
$context

사용자 질문:
$message
"@

  $body = @{
    contents = @(
      @{
        role = "user"
        parts = @(@{ text = $prompt })
      }
    )
    generationConfig = @{
      temperature = 0.25
      topP = 0.85
      maxOutputTokens = 1024
    }
  } | ConvertTo-Json -Depth 20 -Compress

  $response = Invoke-RestMethod -Method Post -Uri $uri -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json; charset=utf-8" -Body $body
  $text = ($response.candidates[0].content.parts | ForEach-Object { $_.text }) -join ""
  return @{
    answer = $text
    model = $model
  }
}

$listener.Start()
Write-Host "Serving $root at $prefix"

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response

    try {
      if ($request.Url.AbsolutePath -eq "/api/ai-chat") {
        if ($request.HttpMethod -ne "POST") {
          Send-JsonResponse $response 405 @{ error = "Method not allowed" }
          continue
        }

        try {
          $payload = Read-RequestJson $request
          $result = Invoke-AiChat $payload
          Send-JsonResponse $response 200 $result
        } catch {
          Send-JsonResponse $response 500 @{ error = $_.Exception.Message }
        }
        continue
      }

      if ($request.HttpMethod -notin @("GET", "HEAD")) {
        Send-TextResponse $response 405 "Method not allowed"
        continue
      }

      $relative = [Uri]::UnescapeDataString($request.Url.AbsolutePath.TrimStart("/"))
      if ([string]::IsNullOrWhiteSpace($relative)) {
        $relative = "index.html"
      }

      $fullPath = [System.IO.Path]::GetFullPath((Join-Path $root $relative))
      $rootPath = [System.IO.Path]::GetFullPath($root)
      if (-not $fullPath.StartsWith($rootPath, [System.StringComparison]::OrdinalIgnoreCase)) {
        Send-TextResponse $response 403 "Forbidden"
        continue
      }

      if (-not [System.IO.File]::Exists($fullPath)) {
        Send-TextResponse $response 404 "Not found"
        continue
      }

      $extension = [System.IO.Path]::GetExtension($fullPath).ToLowerInvariant()
      $response.ContentType = if ($contentTypes.ContainsKey($extension)) {
        $contentTypes[$extension]
      } else {
        "application/octet-stream"
      }

      $bytes = [System.IO.File]::ReadAllBytes($fullPath)
      $response.StatusCode = 200
      $response.ContentLength64 = $bytes.Length

      if ($request.HttpMethod -eq "GET") {
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
      }
    } catch {
      if ($response.OutputStream.CanWrite) {
        Send-TextResponse $response 500 $_.Exception.Message
      }
    } finally {
      $response.Close()
    }
  }
} finally {
  $listener.Close()
}
