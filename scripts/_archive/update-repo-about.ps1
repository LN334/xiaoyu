$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$proxy = 'http://127.0.0.1:7891'
$cred = ("protocol=https`nhost=github.com`n`n" | git credential fill) | Out-String
$token = ([regex]::Match($cred, '(?m)^password=(.+)$')).Groups[1].Value.Trim()
if (-not $token) { throw '未找到 GitHub 凭据' }
$headers = @{ Authorization = "Bearer $token"; 'User-Agent' = 'xiaoyu-readme'; Accept = 'application/vnd.github+json' }

$desc = '面向村镇水处理站的原生智能运维平台：11 单元工艺监控、四级告警、工单派发与闭环、设备台账、人工化验与报表。Windows 桌面 + 安卓双端，装完即用，数据在本机。'
$patch = @{ description = $desc; homepage = 'https://github.com/LN334/xiaoyu/releases/latest'; has_issues = $true; has_wiki = $false } | ConvertTo-Json
Invoke-RestMethod -Proxy $proxy -Method Patch -Uri 'https://api.github.com/repos/LN334/xiaoyu' -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($patch)) | Out-Null
Write-Host '简介已更新'

$topics = @{ names = @('water-treatment','wastewater','scada','wpf','dotnet','csharp','android','java','monitoring','rural') } | ConvertTo-Json
Invoke-RestMethod -Proxy $proxy -Method Put -Uri 'https://api.github.com/repos/LN334/xiaoyu/topics' -Headers $headers -ContentType 'application/json' -Body $topics | Out-Null
Write-Host 'Topics 已更新'
