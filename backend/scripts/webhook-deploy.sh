#!/bin/bash
# Secure webhook deployment script for PulseCortex Platform
# Called by the webhook endpoint to deploy new code

set -e  # Exit on error

LOG_FILE="/tmp/platform-deploy.log"
DEPLOY_DIR="/opt/pulsecortex"
BACKUP_DIR="/opt/pulsecortex-backup"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

echo "=== PulseCortex Platform Deployment ($TIMESTAMP) ===" >> $LOG_FILE

# Check if we're already in the git repo
if [ ! -d ".git" ]; then
    echo "Not in git repository. Changing to deploy directory: $DEPLOY_DIR" >> $LOG_FILE
    cd "$DEPLOY_DIR" || { echo "Failed to cd to $DEPLOY_DIR" >> $LOG_FILE; exit 1; }
fi

# Backup current installation
echo "Creating backup..." >> $LOG_FILE
if [ -d "$DEPLOY_DIR" ]; then
    mkdir -p "$BACKUP_DIR"
    cp -r "$DEPLOY_DIR" "$BACKUP_DIR/$TIMESTAMP" 2>/dev/null || :
    echo "Backup created at $BACKUP_DIR/$TIMESTAMP" >> $LOG_FILE
fi

# Pull latest changes
echo "Pulling latest changes..." >> $LOG_FILE
git pull origin main >> $LOG_FILE 2>&1

# Get current commit hash
COMMIT_HASH=$(git rev-parse --short HEAD)
echo "Deploying commit: $COMMIT_HASH" >> $LOG_FILE

# Install/update dependencies
echo "Installing dependencies..." >> $LOG_FILE
npm ci --only=production >> $LOG_FILE 2>&1

# Ensure environment file exists
if [ ! -f ".env" ]; then
    echo "Creating .env file from .env.example..." >> $LOG_FILE
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "Created .env from example" >> $LOG_FILE
    else
        echo "Warning: No .env.example found" >> $LOG_FILE
    fi
fi

# Reload systemd service
echo "Restarting service..." >> $LOG_FILE
systemctl --user daemon-reload >> $LOG_FILE 2>&1

if systemctl --user is-active --quiet pulsecortex-backend.service; then
    echo "Service is active, restarting..." >> $LOG_FILE
    systemctl --user restart pulsecortex-backend.service >> $LOG_FILE 2>&1
    echo "Service restarted" >> $LOG_FILE
else
    echo "Service is not active, starting..." >> $LOG_FILE
    systemctl --user start pulsecortex-backend.service >> $LOG_FILE 2>&1
    echo "Service started" >> $LOG_FILE
fi

# Verify service status
sleep 2
if systemctl --user is-active --quiet pulsecortex-backend.service; then
    echo "Service verification: ACTIVE" >> $LOG_FILE
    echo "Deployment completed successfully!" >> $LOG_FILE
    echo "{\"status\": \"success\", \"commit\": \"$COMMIT_HASH\", \"timestamp\": \"$TIMESTAMP\"}"
else
    echo "Service verification: FAILED" >> $LOG_FILE
    echo "Deployment failed - service not running" >> $LOG_FILE
    echo "{\"status\": \"error\", \"message\": \"Service failed to start\", \"timestamp\": \"$TIMESTAMP\"}"
    exit 1
fi