@echo off
title ATLANTIS Agent - Kaldirma
echo.
echo  Agent durduruluyor...
taskkill /f /im node.exe /fi "WINDOWTITLE eq ATLANTIS*" >nul 2>nul
schtasks /delete /tn "ATLANTIS_Agent" /f >nul 2>nul
echo  [OK] Agent kaldirildi.
echo.
pause
