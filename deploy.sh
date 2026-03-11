#!/bin/bash
# Deployment script for PulseCortex Platform

set -e

DEPLOY_DIR="/opt/pulsecortex"
BACKUP_DIR="/opt/pulsecortex-backups"
LOG_FILE="/var/log/pulsecortex-deploy.log"

echo "=== PulseCortex Platform Deployment $(date) ===" | tee -a "$LOG_FILE"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Check if service is running
if systemctl is-active --quiet pulsecortex-backend; then
    echo "Stopping existing service..." | tee -a "$LOG_FILE"
    systemctl stop pulsecortex-backend
    sleep 2
fi

# Backup existing installation if exists
if [ -d "$DEPLOY_DIR" ]; then
    echo "Creating backup of existing installation..." | tee -a "$LOG_FILE"
    BACKUP_NAME="backup-$(date +%Y%m%d-%H%M%S)"
    tar -czf "$BACKUP_DIR/$BACKUP_NAME.tar.gz" -C "$DEPLOY_DIR" .
fi

# Clean deployment directory
echo "Preparing deployment directory..." | tee -a "$LOG_FILE"
rm -rf "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"

# Copy files
echo "Copying new files..." | tee -a "$LOG_FILE"
cp -r /home/vm1/.openclaw/workspace/platform/* "$DEPLOY_DIR/"

# Install backend dependencies
echo "Installing backend dependencies..." | tee -a "$LOG_FILE"
cd "$DEPLOY_DIR/backend"
npm ci --only=production

# Create systemd service file if it doesn't exist
SERVICE_FILE="/etc/systemd/system/pulsecortex-backend.service"
if [ ! -f "$SERVICE_FILE" ]; then
    echo "Creating systemd service..." | tee -a "$LOG_FILE"
    cat > "$SERVICE_FILE" << EOF
[Unit]
Description=PulseCortex Platform Backend
After=network.target

[Service]
Type=simple
User=vm1
WorkingDirectory=$DEPLOY_DIR/backend
Environment=NODE_ENV=production
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
fi

# Reload systemd and start service
echo "Starting service..." | tee -a "$LOG_FILE"
systemctl daemon-reload
systemctl start pulsecortex-backend
systemctl enable pulsecortex-backend

# Wait for service to start
sleep 3

# Check if service is running
if systemctl is-active --quiet pulsecortex-backend; then
    echo "✅ Deployment successful! Service is running." | tee -a "$LOG_FILE"
    echo "Service status:" | tee -a "$LOG_FILE"
    systemctl status pulsecortex-backend --no-pager | tee -a "$LOG_FILE"
else
    echo "❌ Deployment failed! Check logs:" | tee -a "$LOG_FILE"
    journalctl -u pulsecortex-backend -n 20 | tee -a "$LOG_FILE"
    exit 1
fi

echo "=== Deployment completed $(date) ===" | tee -a "$LOG_FILE"