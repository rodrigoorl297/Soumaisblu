# =============================================================================
# SOU+BLU — Instalação Evolution API (Ubuntu VPS)
# Uso: sudo bash scripts/vps-install-evolution.sh seu.dominio.com.br SUA_API_KEY
# =============================================================================
set -euo pipefail

DOMAIN="${1:-}"
API_KEY="${2:-}"
if [ -z "$DOMAIN" ] || [ -z "$API_KEY" ]; then
  echo "Uso: $0 <dominio> <evolution_api_key>"
  echo "Ex:  $0 evo.soumaisblu.com.br minha_chave_forte_32chars"
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
fi

APP_DIR="/opt/soublu-evolution"
mkdir -p "$APP_DIR"
cd "$APP_DIR"

cat > docker-compose.yml <<EOF
services:
  evolution-api:
    image: atendai/evolution-api:v2.2.3
    container_name: soublu-evolution
    restart: unless-stopped
    ports:
      - "127.0.0.1:8080:8080"
    environment:
      SERVER_URL: https://${DOMAIN}
      AUTHENTICATION_API_KEY: ${API_KEY}
      AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES: "true"
      LOG_LEVEL: ERROR
      DATABASE_ENABLED: "true"
      DATABASE_PROVIDER: postgresql
      DATABASE_CONNECTION_URI: postgresql://evolution:evolution@postgres:5432/evolution
    depends_on:
      postgres:
        condition: service_healthy
    volumes:
      - evolution_instances:/evolution/instances

  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: evolution
      POSTGRES_PASSWORD: evolution
      POSTGRES_DB: evolution
    volumes:
      - evolution_pg:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U evolution"]
      interval: 5s
      retries: 10

volumes:
  evolution_instances:
  evolution_pg:
EOF

docker compose pull
docker compose up -d

if ! command -v nginx >/dev/null 2>&1; then
  apt-get update && apt-get install -y nginx certbot python3-certbot-nginx
fi

cat > /etc/nginx/sites-available/soublu-evolution <<EOF
server {
    listen 80;
    server_name ${DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
    }
}
EOF

ln -sf /etc/nginx/sites-available/soublu-evolution /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

echo ""
echo "=== Evolution API rodando em http://127.0.0.1:8080 ==="
echo "Configure HTTPS:"
echo "  certbot --nginx -d ${DOMAIN}"
echo ""
echo "No site SOU+BLU (config.evolution.local.php):"
echo "  EVOLUTION_API_URL = https://${DOMAIN}"
echo "  EVOLUTION_API_KEY = ${API_KEY}"
echo "  Webhook = https://www.soumaisblu.com.br/api/whatsapp_api.php?action=webhook&secret=SEU_SECRET"
