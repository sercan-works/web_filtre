@echo off
title ATLANTIS - Kurulum
cd /d "%~dp0"

echo.
echo  ========================================
echo     ATLANTIS Filtre Sunucusu Kurulumu
echo  ========================================
echo.

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
npm install
echo.

:: data klasoru
if not exist "data" mkdir data

:: Otomatik baslama - Task Scheduler
echo  [+] Windows gorev zamanlayiciya ekleniyor...
schtasks /create /tn "ATLANTIS_Server" /tr "\"%~dp0start_hidden.vbs\"" /sc onlogon /rl highest /f >nul 2>nul
if %errorlevel% equ 0 (
    echo  [OK] Bilgisayar acildiginda otomatik baslatilacak.
) else (
    echo  [!] Gorev eklenemedi. Yonetici olarak calistirin.
)

:: Hemen baslat
echo  [+] Sunucu baslatiliyor...
start "" wscript "%~dp0start_hidden.vbs"

:: 2 saniye bekle ve kontrol et
timeout /t 2 /nobreak >nul
netstat -an | findstr ":3000" >nul 2>nul
if %errorlevel% equ 0 (
    echo  [OK] Sunucu calisiyor!
) else (
    echo  [!] Sunucu baslatilamamis olabilir, start.bat ile deneyin.
)

echo.
echo  ========================================
echo     Kurulum tamamlandi!
echo  ========================================
echo.
echo  Admin panel: http://localhost:3000/admin
echo.
pause
