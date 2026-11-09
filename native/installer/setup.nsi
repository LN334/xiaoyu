Unicode true
!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"

!define APP_NAME "小禹"
!define APP_FULL "小禹 · 村镇水处理站智能运维平台"
!define APP_VERSION "2.0.21"
!define APP_PUBLISHER "LN334"
!define APP_EXE "Xiaoyu.exe"
!define REG_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\XiaoyuNative"
!define LEGACY_REG_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\ZhifuWaterNative"
!define LEGACY_REG_KEY_QINGQU "Software\Microsoft\Windows\CurrentVersion\Uninstall\QingquNative"

Name "${APP_FULL}"
OutFile "Xiaoyu-Setup-${APP_VERSION}.exe"
InstallDir "$PROGRAMFILES64\${APP_NAME}"
InstallDirRegKey HKLM "${REG_KEY}" "InstallDir"
RequestExecutionLevel admin
SetCompressor /SOLID lzma
BrandingText "${APP_NAME} ${APP_VERSION}"

; ---- 外观 ----
!define MUI_ICON "..\..\desktop\build\icon.ico"
!define MUI_UNICON "..\..\desktop\build\icon.ico"
!define MUI_ABORTWARNING
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_BITMAP "branding\header.bmp"
!define MUI_WELCOMEFINISHPAGE_BITMAP "branding\welcome.bmp"
!define MUI_WELCOMEPAGE_TITLE "安装 ${APP_NAME}"
!define MUI_WELCOMEPAGE_TEXT "本向导将把「${APP_FULL}」安装到这台电脑。$\r$\n$\r$\n安装内容包括：$\r$\n    · 运行总览与工艺流程画面$\r$\n    · 告警、工单、巡检与设备台账$\r$\n    · 自动控制与设备控制$\r$\n    · 水质化验、运行诊断与报表$\r$\n$\r$\n点击「下一步」开始安装。"
!define MUI_FINISHPAGE_TITLE "安装完成"
!define MUI_FINISHPAGE_TEXT "${APP_NAME} ${APP_VERSION} 已安装完成。$\r$\n演示账号 admin，密码 water123。$\r$\n关闭窗口后程序留在托盘，右键托盘图标可退出。"
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "立即运行 ${APP_NAME}"
!define MUI_FINISHPAGE_LINK "打开项目主页"
!define MUI_FINISHPAGE_LINK_LOCATION "https://github.com/LN334/xiaoyu"

!define MUI_COMPONENTSPAGE_TEXT_TOP "选择要安装的内容，然后点击「下一步」。"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"

; ---- 安装 ----
Section "主程序（必需）" SecMain
  SectionIn RO
  SetOutPath "$INSTDIR"
  File /r "..\publish\*.*"

  ; 旧版本迁移清理，避免桌面出现两个图标、程序与卸载项并存
  Delete "$DESKTOP\智赋乡水.lnk"
  Delete "$DESKTOP\智赋乡水 · 智慧水处理平台.lnk"
  Delete "$DESKTOP\智赋乡水·智慧水处理平台.lnk"
  Delete "$SMPROGRAMS\智赋乡水\智赋乡水.lnk"
  Delete "$SMPROGRAMS\智赋乡水\卸载 智赋乡水.lnk"
  RMDir "$SMPROGRAMS\智赋乡水"
  DeleteRegKey HKLM "${LEGACY_REG_KEY}"
  IfFileExists "$PROGRAMFILES64\智赋乡水\ZhifuWater.exe" 0 +2
    RMDir /r "$PROGRAMFILES64\智赋乡水"

  ; 「清渠」旧版迁移清理：改名前的安装目录、快捷方式与卸载项
  Delete "$DESKTOP\清渠.lnk"
  Delete "$SMPROGRAMS\清渠\清渠.lnk"
  Delete "$SMPROGRAMS\清渠\卸载 清渠.lnk"
  RMDir "$SMPROGRAMS\清渠"
  DeleteRegKey HKLM "${LEGACY_REG_KEY_QINGQU}"
  IfFileExists "$PROGRAMFILES64\清渠\Qingqu.exe" 0 +2
    RMDir /r "$PROGRAMFILES64\清渠"

  WriteUninstaller "$INSTDIR\Uninstall.exe"

  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\卸载 ${APP_NAME}.lnk" "$INSTDIR\Uninstall.exe"

  WriteRegStr HKLM "${REG_KEY}" "DisplayName" "${APP_FULL}"
  WriteRegStr HKLM "${REG_KEY}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKLM "${REG_KEY}" "Publisher" "${APP_PUBLISHER}"
  WriteRegStr HKLM "${REG_KEY}" "DisplayIcon" "$INSTDIR\${APP_EXE}"
  WriteRegStr HKLM "${REG_KEY}" "InstallDir" "$INSTDIR"
  WriteRegStr HKLM "${REG_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKLM "${REG_KEY}" "NoModify" 1
  WriteRegDWORD HKLM "${REG_KEY}" "NoRepair" 1

  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKLM "${REG_KEY}" "EstimatedSize" "$0"
SectionEnd

Section "桌面快捷方式" SecDesktop
  CreateShortCut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0
SectionEnd

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SecMain} "小禹桌面端主程序，包含运行总览、工艺流程、告警与工单等全部功能。"
  !insertmacro MUI_DESCRIPTION_TEXT ${SecDesktop} "在桌面创建「小禹」快捷方式，方便直接打开。"
!insertmacro MUI_FUNCTION_DESCRIPTION_END

; ---- 卸载 ----
Section "Uninstall"
  Delete "$DESKTOP\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\卸载 ${APP_NAME}.lnk"
  RMDir "$SMPROGRAMS\${APP_NAME}"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKLM "${REG_KEY}"
  DeleteRegKey HKLM "${LEGACY_REG_KEY}"
SectionEnd
