#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
PLIST_NAME="com.valor.server.plist"
SOURCE_PLIST="$DIR/$PLIST_NAME"
TARGET_DIR="$HOME/Library/LaunchAgents"
TARGET_PLIST="$TARGET_DIR/$PLIST_NAME"

echo "==> Setting up Valor launchd auto-start service..."

mkdir -p "$TARGET_DIR"
mkdir -p "$DIR/.valor_data"

# Unload previous instance if loaded
if launchctl list 2>/dev/null | grep -q "com.valor.server"; then
    echo "==> Unloading previous service instance..."
    launchctl unload "$TARGET_PLIST" 2>/dev/null || true
fi

echo "==> Copying service plist to $TARGET_DIR..."
cp "$SOURCE_PLIST" "$TARGET_PLIST"

echo "==> Registering and starting service with launchctl..."
launchctl load "$TARGET_PLIST"

sleep 1

if launchctl list 2>/dev/null | grep -q "com.valor.server"; then
    echo "=========================================================="
    echo "✅ Valor service is successfully installed and running!"
    echo "It will automatically start when the system boots/logs in."
    echo "Access URL: http://localhost:50000"
    echo "Logs:"
    echo "  - $DIR/.valor_data/service.log"
    echo "  - $DIR/.valor_data/service_error.log"
    echo "=========================================================="
else
    echo "⚠️ Warning: Service could not be verified with launchctl list."
fi
