# 小禹 · 原生安卓客户端

完全原生实现：Java + Android 框架 API，无 WebView、Gradle、AndroidX 或第三方依赖。界面由 Java 代码构建。

## 版本与产物

| 项目 | 当前值 |
| --- | --- |
| APK | `dist/zhifu-water-mobile.apk` |
| 包名 | `com.ln334.zhifuwater` |
| 应用版本 | 2.0.21（versionCode 17） |
| 版本来源 | `AndroidManifest.xml`；构建脚本从 Manifest 读取版本 |
| SDK | minSdk 24 / targetSdk 34 |
| 启动页 | `com.ln334.zhifuwater.LoginActivity` |
| 签名 | 当前构建使用本地 debug keystore；正式分发需改用受控发布密钥 |

Android 客户端有独立版本号，不跟随平台主版本。平台发布页可同时包含不同客户端版本的 APK。

## 构建

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\build.ps1
```

构建脚本调用 Android SDK 的 `aapt2`、`javac`、`d8`、`zipalign` 和 `apksigner`，并检查签名、APK 安装兼容性及包信息。需要 JDK 17、Android SDK build-tools 34 和 platform 34。脚本优先使用 `JAVA_HOME`、`ANDROID_SDK_ROOT`，未设置时尝试本机默认目录。

## 运行模式

- **离线演示：** 首次启动时从 `assets/demo/` 导入 SQLite。`LocalEngine` 每 5 秒推进 site-1 的模拟遥测和告警；本地告警、工单与巡检操作写入 SQLite，关闭或重启 App 后仍保留。引擎不连接现场 PLC。
- **连接服务端：** 在登录页配置平台服务地址，客户端通过 HTTP API 操作服务器数据。此模式的数据以服务端为准，与离线演示数据库分开。
- **页面：** 底部 5 个入口 —— 总览、监测、告警、工单、更多。
  - 监测：点位实时值与 24 小时曲线、区间统计；
  - 更多：巡检任务（可逐项判定并提交）、水质化验（查看指标与复核）、设备台账（状态与维护信息）、智能诊断（按点位与化验结果给出处置建议）、关于；
  - 远程控制与参数修改不在手机端（需要联锁校验和二次确认，留在桌面端）。

## 已知限制

- 离线模拟引擎当前只推进 site-1；本机演示数据不会同步到服务器。
- 安卓端尚无消息推送和趋势图；在线设备接入仍需服务端与现场网关支持。
- 本地构建状态不等于真机验收；发布前应在目标 Android 版本上安装并检查升级、持久化和网络连接流程。
