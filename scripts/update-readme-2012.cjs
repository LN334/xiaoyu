const fs = require('fs');
const p = 'D:/小禹/README.md';
let raw = fs.readFileSync(p, 'utf8');
const bom = raw[0] === '\uFEFF';
let s = raw.replace(/^\uFEFF/, '');
const crlf = s.includes('\r\n');
s = s.replace(/\r\n/g, '\n');
s = s.split('2.0.11').join('2.0.12').split('2.2.0（versionCode 6）').join('2.0.12（versionCode 8）');
s = s.replace('（Android 2.2.0）', '（Android 2.0.12）');
s = s.replace('Android 与 Windows 使用同一版本号，APK 版本以 `android/AndroidManifest.xml` 为准；当前源码为 **2.0.12（versionCode 8）**，v2.0.11 Release 内的 APK 仍是旧口径（2.2.0 / 6）。',
  'Android 与 Windows 使用同一版本号，APK 版本以 `android/AndroidManifest.xml` 为准；当前版本为 **2.0.12（versionCode 8）**。');
s = s.replace('5. 桌面端为自包含单文件程序，启动时需解压运行时，首次打开约 2–4 秒；未做自动更新，升级需下载新安装包覆盖安装。',
  '5. 桌面端为自包含单文件程序，启动时需解压运行时，首次打开约 2–4 秒。桌面端会从 GitHub Releases 自动检查更新：发现新版本后可一键下载、校验、静默安装并重启，也可在用户菜单里手动检查。');
if (!s.includes('桌面端自动更新')) {
  s = s.replace('> 全部版本与 SHA256 见 [Releases · v2.0.12]',
    '> 桌面端内置自动更新：发布新版本后，已安装的旧版本会在启动时提示升级。\n>\n> 全部版本与 SHA256 见 [Releases · v2.0.12]');
}
if (crlf) s = s.replace(/\n/g, '\r\n');
fs.writeFileSync(p, (bom ? '\uFEFF' : '') + s, 'utf8');
console.log('README updated');
