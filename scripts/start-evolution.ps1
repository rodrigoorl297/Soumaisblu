# SOU+BLU — Evolution API local (WhatsApp dev)
$env:EVOLUTION_API_KEY = "soublu_evo_dev_change_me"
$env:EVOLUTION_SERVER_URL = "http://localhost:8081"
Write-Host "Subindo Evolution API em http://localhost:8081 ..."
docker compose -f docker-compose.evolution.yml up -d
Write-Host @"

Crie config.evolution.local.php na raiz com:
  EVOLUTION_API_URL = http://localhost:8081
  EVOLUTION_API_KEY = soublu_evo_dev_change_me

Teste: curl http://localhost:8081/
"@
