@echo off
title ATLANTIS Agent - Kurulum
cd /d "%~dp0"

echo.
echo  ========================================
echo     ATLANTIS Donanim Agent Kurulumu
echo  ========================================
echo.

:: Yonetici kontrol
net session >nul 2>nul
if %errorlevel% neq 0 (
    echo  [!] Yonetici olarak calistirin!
    pause
    exit /b 1
)

:: Node.js kontrol
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo  [!] Node.js bulunamadi!
    echo  [!] https://nodejs.org adresinden indirip kurun.
    pause
    exit /b 1
)

echo  [+] Node.js bulundu: & node -v

:: Sunucu adresi sor
set /p SERVER_URL="  Sunucu adresi (ornek: http://192.168.1.50:3000): "
if "%SERVER_URL%"=="" set SERVER_URL=http://localhost:3000

:: Config dosyasi olustur
echo %SERVER_URL%> "%~dp0server_url.txt"
echo  [+] Sunucu: %SERVER_URL%

:: Node.js tam yolunu bul
for /f "tokens=*" %%i in ('where node') do set NODE_PATH=%%i

:: VBS (arka planda calistirmak icin)
(
echo Set objFSO = CreateObject("Scripting.FileSystemObject"^)
echo strFolder = objFSO.GetParentFolderName(WScript.ScriptFullName^)
echo Set objShell = CreateObject("WScript.Shell"^)
echo objShell.CurrentDirectory = strFolder
echo Dim serverUrl
echo Set fso = CreateObject("Scripting.FileSystemObject"^)
echo Set f = fso.OpenTextFile(strFolder ^& "\server_url.txt", 1^)
echo serverUrl = Trim(f.ReadLine^)
echo f.Close
echo objShell.Run "cmd /c node """ ^& strFolder ^& "\agent.js"" " ^& serverUrl, 0, False
) > "%~dp0start_agent.vbs"

:: Eski gorevi sil
schtasks /delete /tn "ATLANTIS_Agent" /f >nul 2>nul

:: Task Scheduler
set TASK_XML=%~dp0agent_task.xml
(
echo ^<?xml version="1.0" encoding="UTF-16"?^>
echo ^<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task"^>
echo   ^<Triggers^>
echo     ^<BootTrigger^>^<Enabled^>true^</Enabled^>^<Delay^>PT30S^</Delay^>^</BootTrigger^>
echo     ^<LogonTrigger^>^<Enabled^>true^</Enabled^>^</LogonTrigger^>
echo   ^</Triggers^>
echo   ^<Principals^>^<Principal^>^<LogonType^>S4U^</LogonType^>^<RunLevel^>HighestAvailable^</RunLevel^>^</Principal^>^</Principals^>
echo   ^<Settings^>
echo     ^<MultipleInstancesPolicy^>IgnoreNew^</MultipleInstancesPolicy^>
echo     ^<DisallowStartIfOnBatteries^>false^</DisallowStartIfOnBatteries^>
echo     ^<StopIfGoingOnBatteries^>false^</StopIfGoingOnBatteries^>
echo     ^<ExecutionTimeLimit^>PT0S^</ExecutionTimeLimit^>
echo     ^<AllowStartOnDemand^>true^</AllowStartOnDemand^>
echo     ^<StartWhenAvailable^>true^</StartWhenAvailable^>
echo     ^<RestartOnFailure^>^<Interval^>PT1M^</Interval^>^<Count^>3^</Count^>^</RestartOnFailure^>
echo   ^</Settings^>
echo   ^<Actions^>
echo     ^<Exec^>
echo       ^<Command^>wscript^</Command^>
echo       ^<Arguments^>"%~dp0start_agent.vbs"^</Arguments^>
echo       ^<WorkingDirectory^>%~dp0^</WorkingDirectory^>
echo     ^</Exec^>
echo   ^</Actions^>
echo ^</Task^>
) > "%TASK_XML%"

schtasks /create /tn "ATLANTIS_Agent" /xml "%TASK_XML%" /f >nul 2>nul
if %errorlevel% equ 0 (
    echo  [OK] Gorev zamanlayiciya eklendi.
) else (
    echo  [!] Gorev eklenemedi.
)
del "%TASK_XML%" >nul 2>nul

:: Hemen baslat
echo  [+] Agent baslatiliyor...
start "" wscript "%~dp0start_agent.vbs"

timeout /t 3 /nobreak >nul
echo.
echo  ========================================
echo     Kurulum tamamlandi!
echo  ========================================
echo  Sunucu: %SERVER_URL%
echo  Agent her 60sn donanim bilgisi gonderir.
echo.
pause
