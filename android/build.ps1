<#
  小禹 · 智慧水处理平台 —— 原生安卓客户端手工构建脚本
  ------------------------------------------------------------------
  不依赖 Gradle / AndroidX / 第三方库，直接调用本机 Android SDK 构建链：
    aapt2 compile → aapt2 link（生成 R.java + 资源包）
    → javac（Java 8 字节码，bootclasspath 指向 android.jar）
    → d8（生成 classes.dex）→ 打入 APK
    → zipalign → apksigner（debug keystore）→ dist\zhifu-water-mobile.apk
  说明：aapt2 对含中文的绝对路径支持不佳，故所有构建参数均使用相对
        路径（工作目录固定为本脚本所在目录），JDK/SDK 使用纯 ASCII 绝对路径。
  用法：powershell -ExecutionPolicy Bypass -File .\build.ps1
#>

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

$root = $PSScriptRoot
if (-not $root) { $root = (Get-Location).Path }
$root = (Resolve-Path $root).Path
Set-Location $root

[xml]$manifestXml = Get-Content -Raw 'AndroidManifest.xml'
$androidNamespace = 'http://schemas.android.com/apk/res/android'
$androidVersionCode = $manifestXml.DocumentElement.GetAttribute('versionCode', $androidNamespace)
$androidVersionName = $manifestXml.DocumentElement.GetAttribute('versionName', $androidNamespace)
if ($androidVersionCode -notmatch '^\d+$' -or $androidVersionName -notmatch '^\d+\.\d+\.\d+$') {
    Write-Error 'AndroidManifest.xml 的 versionCode/versionName 无效'
    exit 1
}

function Write-Step([string]$text) {
    Write-Host ''
    Write-Host "==> $text" -ForegroundColor Cyan
}

function Fail([string]$text) {
    Write-Host ''
    Write-Host "[失败] $text" -ForegroundColor Red
    exit 1
}

function Invoke-Tool {
    param(
        [string]$File,
        [string[]]$Arguments,
        [string]$Label
    )
    & $File @Arguments
    if ($LASTEXITCODE -ne 0) {
        Fail "$Label 失败（退出码 $LASTEXITCODE）"
    }
}

# ---------------------------------------------------------------- 环境定位
Write-Step '定位 JDK / Android SDK'

$sdk = $env:ANDROID_SDK_ROOT
if (-not $sdk -or -not (Test-Path $sdk)) { $sdk = 'D:\AndroidBuild\sdk' }
if (-not (Test-Path $sdk)) { Fail "找不到 Android SDK：$sdk" }
$sdk = (Resolve-Path $sdk).Path

$jdkCandidates = @()
if (Test-Path 'D:\AndroidBuild\jdk') {
    $jdkCandidates += Get-ChildItem 'D:\AndroidBuild\jdk' -Directory -Filter 'jdk-17*' -ErrorAction SilentlyContinue
}
if (-not $jdkCandidates -and $env:JAVA_HOME -and (Test-Path $env:JAVA_HOME)) {
    $jdkCandidates = @(Get-Item $env:JAVA_HOME)
}
if (-not $jdkCandidates -or $jdkCandidates.Count -eq 0) { Fail '找不到 JDK 17（期望 D:\AndroidBuild\jdk\jdk-17*）' }
$jdkDir = $jdkCandidates[0].FullName

$env:JAVA_HOME = $jdkDir
$env:PATH = (Join-Path $jdkDir 'bin') + ';' + $env:PATH

$bt = Join-Path $sdk 'build-tools\34.0.0'
$aapt2 = Join-Path $bt 'aapt2.exe'
$aapt  = Join-Path $bt 'aapt.exe'
$d8 = Join-Path $bt 'd8.bat'
$dexdump = Join-Path $bt 'dexdump.exe'
$zipalign = Join-Path $bt 'zipalign.exe'
$apksigner = Join-Path $bt 'apksigner.bat'
$androidJar = Join-Path $sdk 'platforms\android-34\android.jar'

$javac = Join-Path $jdkDir 'bin\javac.exe'
$jar   = Join-Path $jdkDir 'bin\jar.exe'
$keytool = Join-Path $jdkDir 'bin\keytool.exe'

foreach ($p in @($aapt2, $aapt, $d8, $dexdump, $zipalign, $apksigner, $androidJar, $javac, $jar, $keytool)) {
    if (-not (Test-Path $p)) { Fail "缺少构建工具：$p" }
}

Write-Host "    JDK   : $jdkDir"
Write-Host "    SDK   : $sdk"
Write-Host "    Build : $bt"
Write-Host "    工程  : $root"

# ---------------------------------------------------------------- 目录准备
Write-Step '清理并创建构建目录'
if (Test-Path 'build') { Remove-Item 'build' -Recurse -Force }
foreach ($d in @('build', 'build\gen', 'build\classes', 'build\dex', 'dist', 'keystore')) {
    New-Item -ItemType Directory -Force -Path $d | Out-Null
}

# ---------------------------------------------------------------- 1 资源编译
Write-Step 'aapt2 compile：编译 res/ 资源'
Invoke-Tool $aapt2 @('compile', '--dir', 'res', '-o', 'build\res.zip') 'aapt2 compile'

# ---------------------------------------------------------------- 2 资源链接
Write-Step 'aapt2 link：生成资源包与 R.java'
Invoke-Tool $aapt2 @(
    'link',
    '-o', 'build\unsigned.apk',
    '-I', $androidJar,
    '--manifest', 'AndroidManifest.xml',
    '--java', 'build\gen',
    '--min-sdk-version', '24',
    '--target-sdk-version', '34',
    '--version-code', $androidVersionCode,
    '--version-name', $androidVersionName,
    '-A', 'assets',
    '--auto-add-overlay',
    'build\res.zip'
) 'aapt2 link'

$rJava = @(Get-ChildItem 'build\gen' -Recurse -Filter 'R.java' -ErrorAction SilentlyContinue)
if ($rJava.Count -eq 0) { Fail 'aapt2 link 未生成 R.java' }

# ---------------------------------------------------------------- 3 javac
Write-Step 'javac：编译 Java 源码（source/target 8，bootclasspath=android.jar）'
$sources = @()
$sources += @(Get-ChildItem 'src' -Recurse -Filter '*.java' -ErrorAction SilentlyContinue |
    ForEach-Object { $_.FullName.Substring($root.Length + 1) })
$sources += @(Get-ChildItem 'build\gen' -Recurse -Filter '*.java' -ErrorAction SilentlyContinue |
    ForEach-Object { $_.FullName.Substring($root.Length + 1) })
if ($sources.Count -eq 0) { Fail '没有找到 Java 源码' }
Write-Host "    源码数量：$($sources.Count)"

$javacArgs = @(
    '-encoding', 'UTF-8',
    '-source', '8',
    '-target', '8',
    '-bootclasspath', $androidJar,
    '-d', 'build\classes'
) + $sources
Invoke-Tool $javac $javacArgs 'javac'

# ---------------------------------------------------------------- 4 d8
Write-Step 'd8：生成 classes.dex'
Push-Location 'build\classes'
try {
    Invoke-Tool $jar @('cf', '..\classes.jar', '.') 'jar 打包 class'
} finally { Pop-Location }

Invoke-Tool $d8 @('--release', '--min-api', '24', '--lib', $androidJar, '--output', 'build\dex', 'build\classes.jar') 'd8'

if (-not (Test-Path 'build\dex\classes.dex')) { Fail 'd8 未生成 classes.dex' }
Write-Host ("    classes.dex : {0:N0} 字节" -f (Get-Item 'build\dex\classes.dex').Length)

# ---------------------------------------------------------------- 5 装入 APK
Write-Step '打入 classes.dex'
Invoke-Tool $jar @('uf', 'build\unsigned.apk', '-C', 'build\dex', 'classes.dex') 'jar 写入 classes.dex'

# ---------------------------------------------------------------- 5.5 资源路径规范化
# Windows 下 aapt2 会把 assets 子目录与文件名之间的分隔符写成反斜杠（实测输出
# "assets/demo\sites.json"），Android 的 AssetManager 只认正斜杠。
# 这里不重建 zip：直接把 zip 里记录的文件名按字节改成正斜杠 —— 文件名长度不变，
# 所有数据偏移都不变，resources.arsc 得以保持 aapt2 写入的 stored（不压缩）状态。
# 这一点是硬性要求：targetSdk ≥ 30 的 APK 在 Android 11+ 上要求 resources.arsc
# 未压缩且 4 字节对齐，压缩过的包会被系统直接拒绝安装
# （INSTALL_PARSE_FAILED_RESOURCES_ARSC_COMPRESSED，用户侧看到的是「无效安装包」
# 「与操作系统不兼容」）。旧版用 ZipArchive 重建 zip 把整包重新压缩，正是装不上的原因。
Write-Step '规范化 APK 条目路径（按字节改写文件名，不重建 zip、不重新压缩）'
Add-Type -AssemblyName System.IO.Compression.FileSystem | Out-Null
$inApk = (Resolve-Path 'build\unsigned.apk').Path
$zipBytes = [System.IO.File]::ReadAllBytes($inApk)
$BS = [byte]0x5C
$SL = [byte]0x2F

# 定位中央目录结束记录（EOCD，0x06054B50），最多回扫 65557 字节（尾部注释上限）
$eocd = -1
$scanFrom = [Math]::Max(0, $zipBytes.Length - 65557)
for ($q = $zipBytes.Length - 22; $q -ge $scanFrom; $q--) {
    if ([System.BitConverter]::ToUInt32($zipBytes, $q) -eq 0x06054B50) { $eocd = $q; break }
}
if ($eocd -lt 0) { Fail 'APK 结构异常：找不到中央目录（EOCD）' }

$cdOffset = [System.BitConverter]::ToUInt32($zipBytes, $eocd + 16)
$cdCount  = [System.BitConverter]::ToUInt16($zipBytes, $eocd + 10)
$pos = $cdOffset
$nameFixed = 0
for ($n = 0; $n -lt $cdCount; $n++) {
    if ([System.BitConverter]::ToUInt32($zipBytes, $pos) -ne 0x02014B50) { Fail "APK 结构异常：中央目录第 $n 项签名不符" }
    $nameLen    = [System.BitConverter]::ToUInt16($zipBytes, $pos + 28)
    $extraLen   = [System.BitConverter]::ToUInt16($zipBytes, $pos + 30)
    $commentLen = [System.BitConverter]::ToUInt16($zipBytes, $pos + 32)
    $localOff   = [System.BitConverter]::ToUInt32($zipBytes, $pos + 42)

    # 中央目录里的文件名
    for ($k = 0; $k -lt $nameLen; $k++) {
        if ($zipBytes[$pos + 46 + $k] -eq $BS) { $zipBytes[$pos + 46 + $k] = $SL; $nameFixed++ }
    }
    # 对应本地文件头里的文件名（偏移 26 = 长度，30 = 名字）
    if ([System.BitConverter]::ToUInt32($zipBytes, $localOff) -ne 0x04034B50) { Fail 'APK 结构异常：本地文件头签名不符' }
    $localNameLen = [System.BitConverter]::ToUInt16($zipBytes, $localOff + 26)
    for ($k = 0; $k -lt $localNameLen; $k++) {
        if ($zipBytes[$localOff + 30 + $k] -eq $BS) { $zipBytes[$localOff + 30 + $k] = $SL; $nameFixed++ }
    }
    $pos += 46 + $nameLen + $extraLen + $commentLen
}

if ($nameFixed -gt 0) {
    [System.IO.File]::WriteAllBytes($inApk, $zipBytes)
    Write-Host ("    已修正 {0} 字节：反斜杠 -> 正斜杠（未重新压缩任何条目）" -f $nameFixed)
} else {
    Write-Host '    无需修正：所有条目名均为正斜杠'
}

# 回读校验：条目名必须全为反斜杠，且 resources.arsc 必须是 stored
$verifyZip = [System.IO.Compression.ZipFile]::OpenRead($inApk)
try {
    $bad = @($verifyZip.Entries | Where-Object { $_.FullName.Contains('\') })
    if ($bad.Count -gt 0) { Fail '路径规范化失败：仍有反斜杠条目' }
    Write-Host ("    条目 {0} 个，全部为正斜杠" -f $verifyZip.Entries.Count)
} finally { $verifyZip.Dispose() }
# ---------------------------------------------------------------- 6 zipalign
Write-Step 'zipalign：4 字节对齐'
Invoke-Tool $zipalign @('-f', '-p', '4', 'build\unsigned.apk', 'build\aligned.apk') 'zipalign'

# ---------------------------------------------------------------- 7 签名
Write-Step '准备 debug keystore 并签名'
if (-not (Test-Path 'keystore\debug.jks')) {
    Invoke-Tool $keytool @(
        '-genkeypair',
        '-keystore', 'keystore\debug.jks',
        '-storepass', 'android',
        '-keypass', 'android',
        '-alias', 'androiddebugkey',
        '-keyalg', 'RSA',
        '-keysize', '2048',
        '-validity', '10000',
        '-dname', 'CN=Android Debug,O=Android,C=US',
        '-storetype', 'JKS',
        '-noprompt'
    ) 'keytool 生成 debug.jks'
} else {
    Write-Host '    复用已有 keystore：keystore\debug.jks'
}

if (Test-Path 'dist\zhifu-water-mobile.apk') { Remove-Item 'dist\zhifu-water-mobile.apk' -Force }
Invoke-Tool $apksigner @(
    'sign',
    '--ks', 'keystore\debug.jks',
    '--ks-pass', 'pass:android',
    '--key-pass', 'pass:android',
    '--ks-key-alias', 'androiddebugkey',
    '--out', 'dist\zhifu-water-mobile.apk',
    'build\aligned.apk'
) 'apksigner 签名'

# ---------------------------------------------------------------- 8 校验
Write-Step '校验签名与包信息'
& $apksigner verify --verbose 'dist\zhifu-water-mobile.apk'
if ($LASTEXITCODE -ne 0) { Fail 'apksigner verify 未通过' }
Write-Step '校验安装硬性要求（Android 11+ / targetSdk >= 30）'
# 直接解析最终 APK 的 zip 结构做校验（本机 PowerShell 5.1 捕获原生程序输出不可靠，
# 不走外部进程）：resources.arsc 必须 method=0（stored）且数据起点 4 字节对齐。
$apkPath = (Resolve-Path 'dist\zhifu-water-mobile.apk').Path
$a = [System.IO.File]::ReadAllBytes($apkPath)
$eocdPos = -1
$scanStart = [Math]::Max(0, $a.Length - 65557)
for ($q = $a.Length - 22; $q -ge $scanStart; $q--) {
    if ([System.BitConverter]::ToUInt32($a, $q) -eq 0x06054B50) { $eocdPos = $q; break }
}
if ($eocdPos -lt 0) { Fail 'APK 结构异常：找不到中央目录（EOCD）' }
$cdPos = [System.BitConverter]::ToUInt32($a, $eocdPos + 16)
$entryCount = [System.BitConverter]::ToUInt16($a, $eocdPos + 10)
$arscFound = $false
$badName = 0
for ($n = 0; $n -lt $entryCount; $n++) {
    $nameLen = [System.BitConverter]::ToUInt16($a, $cdPos + 28)
    $extraLen = [System.BitConverter]::ToUInt16($a, $cdPos + 30)
    $commentLen = [System.BitConverter]::ToUInt16($a, $cdPos + 32)
    $method = [System.BitConverter]::ToUInt16($a, $cdPos + 10)
    $localOff = [System.BitConverter]::ToUInt32($a, $cdPos + 42)
    $name = [System.Text.Encoding]::UTF8.GetString($a, $cdPos + 46, $nameLen)
    if ($name.Contains('\')) { $badName++ }
    if ($name -eq 'resources.arsc') {
        $arscFound = $true
        $localNameLen = [System.BitConverter]::ToUInt16($a, $localOff + 26)
        $localExtraLen = [System.BitConverter]::ToUInt16($a, $localOff + 28)
        $dataOff = $localOff + 30 + $localNameLen + $localExtraLen
        if ($method -ne 0) { Fail "resources.arsc 处于压缩状态（method=$method）：Android 11+ 会拒绝安装" }
        if ($dataOff % 4 -ne 0) { Fail "resources.arsc 数据起点未按 4 字节对齐（offset=$dataOff）" }
        Write-Host ("    resources.arsc：未压缩，数据起点 $dataOff（4 字节对齐）")
    }
    $cdPos += 46 + $nameLen + $extraLen + $commentLen
}
if (-not $arscFound) { Fail 'APK 中缺少 resources.arsc' }
if ($badName -gt 0) { Fail "APK 中仍有 $badName 个含反斜杠的条目名" }
Write-Host ("    条目共 {0} 个，路径均为正斜杠" -f $entryCount)

# 说明：本机 PowerShell 5.1 捕获原生程序 stdout 会拿到空结果，改用 cmd 重定向到文件。
if (Test-Path 'build\badging.txt') { Remove-Item 'build\badging.txt' -Force }
$badgingCmd = '"{0}" dump badging "dist\zhifu-water-mobile.apk" > "build\badging.txt" 2>&1' -f $aapt
& cmd.exe /c $badgingCmd
if ($LASTEXITCODE -ne 0) { Fail 'aapt dump badging 失败' }
if (-not (Test-Path 'build\badging.txt')) { Fail 'aapt dump badging 没有产出报告' }
$aaptOut = @(Get-Content 'build\badging.txt')
foreach ($line in ($aaptOut | Where-Object { $_ -match '^(package:|launchable-activity:|application-label:|sdkVersion:|targetSdkVersion:)' })) {
    Write-Host "    $line"
}
if (@($aaptOut | Where-Object { $_ -match '^launchable-activity:' }).Count -eq 0) {
    Fail 'APK 中没有 launchable-activity，无法从桌面启动'
}

# 无网页视图控件兜底检查（源码 + dex）。关键字由两段拼接，避免脚本自身被 grep 命中。
$needle = 'Web' + 'View'
$hits = @(Get-ChildItem 'src' -Recurse -Include '*.java' -ErrorAction SilentlyContinue |
    Select-String -Pattern $needle -SimpleMatch -ErrorAction SilentlyContinue)
if ($hits.Count -gt 0) { Fail "源码中出现网页视图控件引用：$($hits[0].Path)" }
$dexHits = @(& $dexdump -d 'build\dex\classes.dex' 2>&1 | Select-String -Pattern $needle -SimpleMatch)
if ($dexHits.Count -gt 0) { Fail 'classes.dex 中出现网页视图控件引用' }
Write-Host '    纯原生检查：通过（源码与 dex 均无网页视图控件引用）'

# ---------------------------------------------------------------- 汇总
$apkItem = Get-Item 'dist\zhifu-water-mobile.apk'
$sha = (Get-FileHash 'dist\zhifu-water-mobile.apk' -Algorithm SHA256).Hash
Write-Host ''
Write-Host '================ 构建成功 ================' -ForegroundColor Green
Write-Host ("  产物   : {0}" -f $apkItem.FullName)
Write-Host ("  大小   : {0:N0} 字节（{1:N2} MB）" -f $apkItem.Length, ($apkItem.Length / 1MB))
Write-Host ("  SHA256 : {0}" -f $sha)
Write-Host  '  包名   : com.ln334.zhifuwater'
Write-Host ("  版本   : {0} (versionCode {1})" -f $androidVersionName, $androidVersionCode)
Write-Host  '  签名   : keystore\debug.jks / androiddebugkey'
Write-Host '==========================================='
exit 0
