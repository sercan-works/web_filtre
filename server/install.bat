@echo off
title ATLANTIS - Kurulum
cd /d "%~dp0"

echo.
echo  ========================================
echo     ATLANTIS Filtre Sunucusu Kurulumu
echo  ========================================
echo.

:: Yonetici kontrol
net session >nul 2>nul
if %errorlevel% neq 0 (
    echo  [!] Yonetici olarak calistirin!
    echo  [!] Sag tik ^> Yonetici olarak calistir
    echo.
    pause
    exit /b 1
)

:: Node.js kontrol
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo  [!] Node.js bulunamadi!
    echo  [!] https://nodejs.org adresinden indirip kurun.
    echo.
    pause
    exit /b 1
)

echo  [+] Node.js bulundu:
node -v
echo.

:: npm install
echo  [+] Bagimliliklar yukleniyor...
call npm install
echo.

:: data klasoru
if not exist "data" mkdir data

:: Node.js tam yolunu bul
for /f "tokens=*" %%i in ('where node') do set NODE_PATH=%%i
echo  [+] Node yolu: %NODE_PATH%

:: Eski gorevi sil
schtasks /delete /tn "ATLANTIS_Server" /f >nul 2>nul

:: Task Scheduler - XML ile olustur (Win11 uyumlu)
set TASK_XML=%~dp0atlantis_task.xml
set SERVER_JS=%~dp0server.js

(
echo ^<?xml version="1.0" encoding="UTF-16"?^>
echo ^<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task"^>
echo   ^<Triggers^>
echo     ^<BootTrigger^>
echo       ^<Enabled^>true^</Enabled^>
echo     ^</BootTrigger^>
echo     ^<LogonTrigger^>
echo       ^<Enabled^>true^</Enabled^>
echo     ^</LogonTrigger^>
echo   ^</Triggers^>
echo   ^<Principals^>
echo     ^<Principal^>
echo       ^<LogonType^>S4U^</LogonType^>
echo       ^<RunLevel^>HighestAvailable^</RunLevel^>
echo     ^</Principal^>
echo   ^</Principals^>
echo   ^<Settings^>
echo     ^<MultipleInstancesPolicy^>IgnoreNew^</MultipleInstancesPolicy^>
echo     ^<DisallowStartIfOnBatteries^>false^</DisallowStartIfOnBatteries^>
echo     ^<StopIfGoingOnBatteries^>false^</StopIfGoingOnBatteries^>
echo     ^<ExecutionTimeLimit^>PT0S^</ExecutionTimeLimit^>
echo     ^<AllowStartOnDemand^>true^</AllowStartOnDemand^>
echo     ^<AllowHardTerminate^>true^</AllowHardTerminate^>
echo     ^<StartWhenAvailable^>true^</StartWhenAvailable^>
echo     ^<RestartOnFailure^>
echo       ^<Interval^>PT1M^</Interval^>
echo       ^<Count^>3^</Count^>
echo     ^</RestartOnFailure^>
echo   ^</Settings^>
echo   ^<Actions^>
echo     ^<Exec^>
echo       ^<Command^>%NODE_PATH%^</Command^>
echo       ^<Arguments^>"%SERVER_JS%"^</Arguments^>
echo       ^<WorkingDirectory^>%~dp0^</WorkingDirectory^>
echo     ^</Exec^>
echo   ^</Actions^>
echo ^</Task^>
) > "%TASK_XML%"

schtasks /create /tn "ATLANTIS_Server" /xml "%TASK_XML%" /f >nul 2>nul
if %errorlevel% equ 0 (
    echo  [OK] Gorev zamanlayiciya eklendi.
    echo  [OK] Boot + Logon tetikleyici aktif.
    echo  [OK] Basarisiz olursa 1dk icinde yeniden dener.
) else (
    echo  [!] Gorev eklenemedi. Asagidaki alternatifi deneyin:
    echo  [!] Baslat ^> Calistir ^> shell:startup ^> start.bat kisayolu koyun
)

del "%TASK_XML%" >nul 2>nul

:: Hemen baslat
echo.
echo  [+] Sunucu baslatiliyor...
start "" wscript "%~dp0start_hidden.vbs"

timeout /t 3 /nobreak >nul
netstat -an | findstr ":3000" >nul 2>nul
if %errorlevel% equ 0 (
    echo  [OK] Sunucu calisiyor! Port 3000 aktif.
) else (
    echo  [!] Port 3000 aktif degil. Manuel test:
    echo  [!]   cd "%~dp0" ^&^& node server.js
)

echo.
echo  ========================================
echo     Kurulum tamamlandi!
echo  ========================================
echo.
echo  Admin panel: http://localhost:3000/admin
echo.
pause
