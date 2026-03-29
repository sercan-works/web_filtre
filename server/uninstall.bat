@echo off
title ATLANTIS - Kaldirma
echo.
echo  Otomatik baslama gorevi kaldiriliyor...
schtasks /delete /tn "ATLANTIS_Server" /f >nul 2>nul
echo  [OK] Gorev zamanlayicidan kaldirildi.
echo.
pause
