param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$VisualListPath = 'C:\Users\dbghk\Downloads\ipg_visual_generation_list_v2.json',
  [string]$ChromePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
)

$ErrorActionPreference = 'Stop'

function Escape-Html([string]$value) {
  if ($null -eq $value) { return '' }
  return [System.Net.WebUtility]::HtmlEncode($value)
}

function Slug-Class([string]$value) {
  if ([string]::IsNullOrWhiteSpace($value)) { return 'diagram' }
  $slug = $value.ToLowerInvariant() -replace '[^a-z0-9]+', '-'
  $slug = $slug.Trim('-')
  if ([string]::IsNullOrWhiteSpace($slug)) { return 'diagram' }
  return $slug
}

function Get-WrappedHtml([string]$text, [int]$max = 4) {
  if ([string]::IsNullOrWhiteSpace($text)) { return '' }
  $parts = $text -split '\s+'
  if ($parts.Count -le $max) { return (Escape-Html $text) }
  $lines = @()
  for ($i = 0; $i -lt $parts.Count; $i += $max) {
    $end = [Math]::Min($i + $max - 1, $parts.Count - 1)
    $lines += (($parts[$i..$end]) -join ' ')
  }
  return (($lines | ForEach-Object { Escape-Html $_ }) -join '<br>')
}

function Get-ImageTypes([string]$path) {
  $map = @{}
  if (!(Test-Path $path)) { return $map }
  $content = Get-Content $path -Raw -Encoding UTF8
  $matches = [regex]::Matches(
    $content,
    '"imageId"\s*:\s*"([^"]+)"[\s\S]*?"imageType"\s*:\s*"([^"]+)"[\s\S]*?"fileName"\s*:\s*"([^"]+)"',
    [System.Text.RegularExpressions.RegexOptions]::Singleline
  )
  foreach ($match in $matches) {
    $map[$match.Groups[1].Value] = [pscustomobject]@{
      imageType = $match.Groups[2].Value
      fileName = $match.Groups[3].Value
    }
  }
  return $map
}

function Get-VisualTasks([object]$summary, [hashtable]$typeMap) {
  $tasks = [ordered]@{}
  foreach ($section in $summary.sections) {
    foreach ($ref in @($section.visualRefs)) {
      if (!$ref.imageId -or !$ref.fileName) { continue }
      if ($tasks.Contains($ref.imageId)) { continue }
      $clozeSummaries = @($section.clozeItems | ForEach-Object { $_.sourceSummary } | Where-Object { $_ })
      $tasks[$ref.imageId] = [pscustomobject]@{
        imageId = $ref.imageId
        fileName = $ref.fileName
        priority = $ref.priority
        title = $section.title
        subject = $section.subject
        chapter = $section.chapter_title
        chapterNo = $section.chapter
        importance = $section.importance
        keywords = @($section.keywords)
        clozeSummaries = $clozeSummaries
        imageType = $(if ($typeMap.Contains($ref.imageId)) { $typeMap[$ref.imageId].imageType } else { 'diagram' })
      }
    }
  }
  return @($tasks.Values)
}

function New-FlowHtml([object]$task) {
  $labels = @($task.keywords | Select-Object -First 5)
  if (!$labels.Count) { $labels = @($task.title) }
  $nodes = for ($i = 0; $i -lt $labels.Count; $i++) {
    $step = ($i + 1).ToString('00')
    @"
      <div class="flow-node">
        <span class="step">$step</span>
        <strong>$(Get-WrappedHtml $labels[$i] 3)</strong>
      </div>
"@
  }
  return "<div class='diagram-flow'>$($nodes -join '<div class=`"arrow`">&#8595;</div>')</div>"
}

function New-StackHtml([object]$task) {
  $labels = @($task.keywords | Select-Object -First 6)
  if (!$labels.Count) { $labels = @($task.title) }
  $layers = for ($i = 0; $i -lt $labels.Count; $i++) {
    $n = $labels.Count - $i
    "<div class='stack-layer l$n'><span>$(Escape-Html $labels[$i])</span></div>"
  }
  return "<div class='diagram-stack'>$($layers -join '')</div>"
}

function New-MapHtml([object]$task) {
  $labels = @($task.keywords | Select-Object -First 6)
  if (!$labels.Count) { $labels = @($task.title) }
  $items = $labels | ForEach-Object { "<span>$(Escape-Html $_)</span>" }
  return @"
    <div class="diagram-map">
      <div class="map-center">$(Get-WrappedHtml $task.title 2)</div>
      <div class="map-ring">$($items -join '')</div>
    </div>
"@
}

function New-CardHtml([object]$task) {
  $labels = @($task.keywords | Select-Object -First 6)
  if (!$labels.Count) { $labels = @($task.title) }
  $cards = for ($i = 0; $i -lt $labels.Count; $i++) {
    "<div class='mini-card'><b>$($i + 1)</b><span>$(Get-WrappedHtml $labels[$i] 2)</span></div>"
  }
  return "<div class='diagram-cards'>$($cards -join '')</div>"
}

function New-VisualHtml([object]$task) {
  $rawType = $task.imageType
  if ([string]::IsNullOrWhiteSpace($rawType)) { $rawType = 'diagram' }
  $type = $rawType.ToLowerInvariant()
  if ($type -match 'flow|process|sequence') {
    return New-FlowHtml $task
  }
  if ($type -match 'layer|architecture|stack') {
    return New-StackHtml $task
  }
  if ($type -match 'comparison|gallery|checklist') {
    return New-CardHtml $task
  }
  return New-MapHtml $task
}

function New-AssetPage([object]$task) {
  $visual = New-VisualHtml $task
  $keywordChips = @($task.keywords | Select-Object -First 7 | ForEach-Object {
    "<span>$(Escape-Html $_)</span>"
  }) -join ''
  $summaryLines = @($task.clozeSummaries | Select-Object -First 3 | ForEach-Object {
    "<li>$(Escape-Html $_)</li>"
  }) -join ''
  $typeClass = Slug-Class $task.imageType
  $subjectNo = if ($task.imageId -match '^VIS-\d+-(\d+)$') { $matches[1] } else { $task.imageId }

@"
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <style>
    :root {
      color-scheme: light;
      --ink: #111827;
      --muted: #64748b;
      --line: #dbeafe;
      --blue: #2563eb;
      --sky: #eff6ff;
      --mint: #dcfce7;
      --green: #16a34a;
      --amber: #f59e0b;
      --rose: #fb7185;
    }
    * { box-sizing: border-box; }
    body {
      width: 1080px;
      height: 1920px;
      margin: 0;
      overflow: hidden;
      font-family: "Pretendard", "Noto Sans KR", "Malgun Gothic", Arial, sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at 8% 4%, rgba(37, 99, 235, .09), transparent 26%),
        linear-gradient(180deg, #f8fbff 0%, #eef4ff 100%);
    }
    .canvas {
      position: relative;
      width: 100%;
      height: 100%;
      padding: 74px 82px;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
      margin-bottom: 56px;
    }
    .subject {
      display: inline-flex;
      align-items: center;
      gap: 14px;
      padding: 16px 24px;
      border-radius: 999px;
      background: #fff;
      color: var(--blue);
      font-size: 28px;
      font-weight: 850;
      box-shadow: 0 14px 44px rgba(37, 99, 235, .12);
    }
    .badge {
      min-width: 86px;
      height: 86px;
      display: grid;
      place-items: center;
      border-radius: 28px;
      background: #111827;
      color: #fff;
      font-size: 34px;
      font-weight: 900;
    }
    h1 {
      margin: 0;
      font-size: 72px;
      line-height: 1.12;
      letter-spacing: 0;
      word-break: keep-all;
    }
    .meta {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 24px;
      color: var(--muted);
      font-size: 27px;
      font-weight: 750;
    }
    .type {
      margin-left: auto;
      padding: 10px 18px;
      border-radius: 999px;
      background: #e0f2fe;
      color: #0369a1;
      font-size: 24px;
    }
    .main {
      margin-top: 56px;
      min-height: 850px;
      display: grid;
      place-items: center;
    }
    .diagram-flow,
    .diagram-stack,
    .diagram-map,
    .diagram-cards {
      width: 100%;
      padding: 54px;
      border-radius: 54px;
      background: rgba(255,255,255,.9);
      box-shadow: 0 34px 100px rgba(15, 23, 42, .12);
      border: 1px solid rgba(147,197,253,.7);
    }
    .diagram-flow {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .flow-node {
      display: grid;
      grid-template-columns: 92px 1fr;
      align-items: center;
      gap: 24px;
      min-height: 118px;
      padding: 26px 30px;
      border-radius: 34px;
      background: linear-gradient(135deg, #eff6ff, #ffffff);
      border: 2px solid #bfdbfe;
    }
    .flow-node .step {
      width: 66px;
      height: 66px;
      display: grid;
      place-items: center;
      border-radius: 22px;
      background: #2563eb;
      color: white;
      font-size: 26px;
      font-weight: 900;
    }
    .flow-node strong {
      font-size: 42px;
      line-height: 1.2;
      word-break: keep-all;
    }
    .arrow {
      text-align: center;
      color: #60a5fa;
      font-size: 44px;
      font-weight: 900;
      line-height: 1;
    }
    .diagram-stack {
      display: flex;
      flex-direction: column;
      gap: 24px;
      justify-content: center;
    }
    .stack-layer {
      min-height: 112px;
      display: grid;
      place-items: center;
      border-radius: 34px;
      padding: 24px;
      color: #fff;
      font-size: 42px;
      font-weight: 900;
      text-align: center;
      word-break: keep-all;
      box-shadow: 0 16px 34px rgba(37,99,235,.18);
    }
    .stack-layer:nth-child(1) { background: #2563eb; }
    .stack-layer:nth-child(2) { background: #0891b2; }
    .stack-layer:nth-child(3) { background: #16a34a; }
    .stack-layer:nth-child(4) { background: #f59e0b; }
    .stack-layer:nth-child(5) { background: #f97316; }
    .stack-layer:nth-child(6) { background: #7c3aed; }
    .diagram-map {
      min-height: 770px;
      display: grid;
      grid-template-rows: auto 1fr;
      gap: 44px;
    }
    .map-center {
      justify-self: center;
      max-width: 660px;
      padding: 34px 44px;
      border-radius: 38px;
      background: #111827;
      color: #fff;
      text-align: center;
      font-size: 46px;
      line-height: 1.16;
      font-weight: 950;
      word-break: keep-all;
      box-shadow: 0 22px 52px rgba(15, 23, 42, .28);
    }
    .map-ring {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 26px;
      align-content: center;
    }
    .map-ring span {
      min-height: 132px;
      display: grid;
      place-items: center;
      padding: 24px;
      border-radius: 34px;
      background: #f8fafc;
      border: 2px solid #bfdbfe;
      color: #1e3a8a;
      text-align: center;
      font-size: 35px;
      line-height: 1.18;
      font-weight: 900;
      word-break: keep-all;
    }
    .diagram-cards {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 24px;
    }
    .mini-card {
      min-height: 214px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 22px;
      padding: 30px;
      border-radius: 36px;
      background: #f8fafc;
      border: 2px solid #dbeafe;
    }
    .mini-card b {
      width: 54px;
      height: 54px;
      display: grid;
      place-items: center;
      border-radius: 18px;
      background: #dbeafe;
      color: #2563eb;
      font-size: 25px;
      font-weight: 950;
    }
    .mini-card span {
      font-size: 34px;
      line-height: 1.22;
      font-weight: 900;
      word-break: keep-all;
    }
    .chips {
      display: none;
      flex-wrap: wrap;
      gap: 14px;
      margin-top: 42px;
    }
    .chips span {
      padding: 13px 20px;
      border-radius: 999px;
      background: #fff;
      border: 1px solid #dbeafe;
      color: #1d4ed8;
      font-size: 25px;
      font-weight: 850;
    }
    .summary {
      position: absolute;
      left: 82px;
      right: 82px;
      bottom: 76px;
      padding: 36px 42px;
      border-radius: 42px;
      background: rgba(255,255,255,.94);
      border: 1px solid rgba(203,213,225,.9);
      box-shadow: 0 20px 70px rgba(15, 23, 42, .09);
    }
    .summary-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 20px;
      color: #0f172a;
      font-size: 28px;
      font-weight: 950;
    }
    .summary-title em {
      font-style: normal;
      color: #2563eb;
      font-size: 24px;
    }
    ul {
      margin: 0;
      padding-left: 30px;
      display: grid;
      gap: 12px;
    }
    li {
      color: #334155;
      font-size: 28px;
      line-height: 1.36;
      font-weight: 700;
      word-break: keep-all;
    }
  </style>
</head>
<body class="$typeClass">
  <main class="canvas">
    <div class="header">
      <div class="subject">$(Escape-Html $task.subject)</div>
      <div class="badge">$(Escape-Html $task.importance)</div>
    </div>
    <h1>$(Get-WrappedHtml $task.title 3)</h1>
    <div class="meta">
      <span>$(Escape-Html $task.chapterNo)</span>
      <span>&middot;</span>
      <span>$(Escape-Html $task.chapter)</span>
      <span class="type">$(Escape-Html $task.imageType)</span>
    </div>
    <section class="main">
      $visual
    </section>
    <div class="chips">$keywordChips</div>
    <section class="summary">
      <div class="summary-title">
        <span>&#50516;&#44592; &#54252;&#51064;&#53944;</span>
        <em>$(Escape-Html $task.imageId)</em>
      </div>
      <ul>$summaryLines</ul>
    </section>
  </main>
</body>
</html>
"@
}

$summaryPath = Join-Path $ProjectRoot 'study-app\data\written-core-summaries.json'
$outDir = Join-Path $ProjectRoot 'study-app\assets\infoproc\visuals'
$buildDir = Join-Path $ProjectRoot '.visual-build'

New-Item -ItemType Directory -Force -Path $outDir | Out-Null
New-Item -ItemType Directory -Force -Path $buildDir | Out-Null

$summary = Get-Content $summaryPath -Raw -Encoding UTF8 | ConvertFrom-Json
$typeMap = Get-ImageTypes $VisualListPath
$tasks = Get-VisualTasks $summary $typeMap

if (!(Test-Path $ChromePath)) {
  throw "Chrome not found: $ChromePath"
}

$generated = 0
foreach ($task in $tasks) {
  $htmlPath = Join-Path $buildDir ($task.fileName -replace '\.png$', '.html')
  $pngPath = Join-Path $outDir $task.fileName
  if (Test-Path $pngPath) {
    $generated += 1
    continue
  }
  $html = New-AssetPage $task
  Set-Content -Path $htmlPath -Value $html -Encoding UTF8

  $fileUri = ([System.Uri]$htmlPath).AbsoluteUri
  $args = @(
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--window-size=1080,1920',
    "--screenshot=$pngPath",
    $fileUri
  )
  $process = Start-Process -FilePath $ChromePath -ArgumentList $args -Wait -PassThru -WindowStyle Hidden
  if ($process.ExitCode -ne 0 -or !(Test-Path $pngPath)) {
    throw "Failed to render $($task.imageId) to $pngPath"
  }
  $generated += 1
}

[pscustomobject]@{
  generated = $generated
  output = $outDir
  build = $buildDir
} | ConvertTo-Json -Compress
