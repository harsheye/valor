#!/usr/bin/env bash
set -e

PLIST_NAME="com.valor.server.plist"
TARGET_PLIST="$HOME/Library/LaunchAgents/$PLIST_NAME"

echo "==> Stopping and uninstalling Valor service..."

if launchctl list 2>/dev/null | grep -q "com.valor.server"; then
    launchctl unload "$TARGET_PLIST" 2>/dev/null || true
    echo "==> Service unloaded."
fi

if [ -f "$TARGET_PLIST" ]; then
    rm -f "$TARGET_PLIST"
    echo "==> Removed $TARGET_PLIST."
fi

echo "✅ Valor auto-start service uninstalled successfully."
