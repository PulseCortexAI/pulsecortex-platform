#!/bin/bash
# Deploy PulseCortex Platform with webhook enabled

set -e

DEPLOY_DIR="/opt/pulsecortex"
ENV_FILE="$DEPLOY_DIR/backend/.env"
SERVICE_FILE="/etc/systemd/system/pulsecortex-backend.service"

echo "=== Deploying PulseCortex Platform with Webhook Support ==="

# Create deployment directory
sudo mkdir -p "$DEPLOY_DIR"

# Copy platform files
echo "Copying files..."
sudo cp -r /home/vm1/.openclaw/workspace/platform/* "$DEPLOY_DIR/"

# Set permissions
sudo chown -R vm1:vm1 "$DEPLOY_DIR"
sudo chmod -R 755 "$DEPLOY_DIR"

# Create .env file if it doesn't exist
if [ ! -f "$ENV_FILE" ]; then
    echo "Creating .env file..."
    sudo tee "$ENV_FILE" > /dev/null << 'ENV'
NODE_ENV=production
PORT=3000
DATABASE_URL=sqlite://./data/pulsecortex.db
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
WEBHOOK_SECRET=d11e899b3711f5b13a596723603d13020984f1622c94cc31cecd81de8592fd28
ENABLE_WEBHOOK=true
API_RATE_LIMIT=100
API_RATE_WINDOW_MS=900000
LOG_LEVEL=info
LOG_FILE=/var/log/pulsecortex-backend.log
ENV
fi

# Install backend dependencies
echo "Installing dependencies..."
cd "$DEPLOY_DIR/backend"
npm ci --only=production

# Create systemd service file
echo "Creating systemd service..."
sudo tee "$SERVICE_FILE" > /dev/null << 'SERVICE'
[Unit]
Description=PulseCortex Platform Backend
After=network.target

[Service]
Type=simple
User=vm1
WorkingDirectory=/opt/pulsecortex/backend
Environment=NODE_ENV=production
EnvironmentFile=/opt/pulsecortex/backend/.env
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=pulsecortex-backend

[Install]
WantedBy=multi-user.target
SERVICE

# Reload systemd and start service
echo "Starting service..."
sudo systemctl daemon-reload
sudo systemctl enable pulsecortex-backend
sudo systemctl restart pulsecortex-backend

# Wait for service to start
sleep 3

# Check service status
if sudo systemctl is-active --quiet pulsecortex-backend; then
    echo "✅ Service deployed successfully!"
    echo "Service status:"
    sudo systemctl status pulsecortex-backend --no-pager
else
    echo "❌ Service failed to start!"
    sudo journalctl -u pulsecortex-backend -n 20 --no-pager
    exit 1
fi
