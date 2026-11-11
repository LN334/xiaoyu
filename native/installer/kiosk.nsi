Unicode true
!include "MUI2.nsh"
!include "FileFunc.nsh"

!define APP_NAME "小禹现场触摸屏"
!define APP_FULL "小禹 · 现场触摸屏"
!define APP_VERSION "2.0.22"
!define APP_PUBLISHER "LN334"
!define APP_EXE "XiaoyuKiosk.exe"
!define REG_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\XiaoyuKioskNative"
!define LEGACY_REG_KEY_QINGQU "Software\Microsoft\Windows\CurrentVersion\Uninstall\QingquKioskNative"

Name "${APP_FULL}"
OutFile "Xiaoyu-Kiosk-Setup-${APP_VERSION}.exe"
InstallDir "$PROGRAMFILES64\${APP_NAME}"
InstallDirRegKey HKLM "${REG_KEY}" "InstallDir"
RequestExecutionLevel admin
SetCompressor /SOLID lzma
BrandingText "${APP_FULL} ${APP_VERSION}"

!define MUI_ICON "..\..\desktop\build\icon.ico"
!define MUI_UNICON "..\..\desktop\build\icon.ico"
!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"

Section "现场触摸屏程序" SecMain
  SectionIn RO
  SetOutPath "$INSTDIR"
  File /r "..\publish-kiosk\*.*"

  ; 「清渠」旧版迁移清理：改名前的安装目录、快捷方式、开机自启与卸载项
  Delete "$DESKTOP\清渠 · 现场触摸屏.lnk"
  Delete "$SMPROGRAMS\清渠现场触摸屏\清渠 · 现场触摸屏.lnk"
  Delete "$SMPROGRAMS\清渠现场触摸屏\卸载 清渠 · 现场触摸屏.lnk"
  RMDir "$SMPROGRAMS\清渠现场触摸屏"
  Delete "$SMSTARTUP\清渠 · 现场触摸屏.lnk"
  DeleteRegKey HKLM "${LEGACY_REG_KEY_QINGQU}"
  IfFileExists "$PROGRAMFILES64\清渠现场触摸屏\QingquKiosk.exe" 0 +2
    RMDir /r "$PROGRAMFILES64\清渠现场触摸屏"

  WriteUninstaller "$INSTDIR\Uninstall.exe"

  CreateShortCut "$DESKTOP\${APP_FULL}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0
  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\${APP_FULL}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\卸载 ${APP_FULL}.lnk" "$INSTDIR\Uninstall.exe"

  ; 现场机器开机即进入大屏：登录后自启动
  CreateShortCut "$SMSTARTUP\${APP_FULL}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0

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

Section "Uninstall"
  Delete "$DESKTOP\${APP_FULL}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\${APP_FULL}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\卸载 ${APP_FULL}.lnk"
  RMDir "$SMPROGRAMS\${APP_NAME}"
  Delete "$SMSTARTUP\${APP_FULL}.lnk"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKLM "${REG_KEY}"
SectionEnd
