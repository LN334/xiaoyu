@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [错误] 未检测到 Node.js。
  echo 请先安装 Node.js 18 或更高版本：https://nodejs.org/zh-cn
  echo 安装完成后重新双击本文件。
  echo.
  pause
  exit /b 1
)

echo.
echo   小禹 · 村镇水处理站智能运维平台
echo   正在启动，浏览器将自动打开 http://127.0.0.1:8765
echo   演示账号：admin / water123
echo   关闭本窗口即停止服务。
echo.

start "" cmd /c "timeout /t 2 >nul & start http://127.0.0.1:8765"

node server/index.js --port 8765
pause
