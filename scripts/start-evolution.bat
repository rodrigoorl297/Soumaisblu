@echo off
REM SOU+BLU — sobe Evolution API local (WhatsApp dev)
REM Requer Docker Desktop. Depois copie config.evolution.local.php.example

set EVOLUTION_API_KEY=soublu_evo_dev_change_me
set EVOLUTION_SERVER_URL=http://localhost:8081

echo Subindo Evolution API em http://localhost:8081 ...
docker compose -f docker-compose.evolution.yml up -d

echo.
echo Crie config.evolution.local.php com:
echo   EVOLUTION_API_URL = http://localhost:8081
echo   EVOLUTION_API_KEY = %EVOLUTION_API_KEY%
echo.
echo Teste: curl http://localhost:8081/
