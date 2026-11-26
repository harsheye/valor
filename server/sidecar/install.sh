#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# ⚡ VALOR LOCAL MEDIA ENGINE — LINUX & MACOS INSTALLER
# Usage:
#   curl -fsSL http://<your-valor-host>/api/sidecar/install.sh | bash
# ════════════════════════════════════════════════════════════════════════════

set -e

BOLD="\033[1m"
GREEN="\033[0;32m"
CYAN="\033[0;36m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
RESET="\033[0m"

echo ""
echo -e "${CYAN}============================================================${RESET}"
echo -e "${GREEN}${BOLD}   ⚡ VALOR LOCAL MEDIA COMPANION ENGINE INSTALLER${RESET}"
echo -e "${CYAN}============================================================${RESET}"
echo ""

# Default origin if not provided via VALOR_HOST env
HOST_ORIGIN="${VALOR_HOST:-http://127.0.0.1:80}"
INSTALL_DIR="$HOME/.valor-service"
mkdir -p "$INSTALL_DIR"

SERVICE_FILE="$INSTALL_DIR/valor-service.mjs"
RUNNER_FILE="$INSTALL_DIR/run-valor-service.sh"

# Step 1: Check Node.js
echo -e "${YELLOW}[1/3] Checking Node.js runtime...${RESET}"
if ! command -v node >/dev/null 2>&1; then
    echo -e "${RED}  (!) Node.js is not installed.${RESET}"
    echo -e "  Please install Node.js (v18+) from https://nodejs.org or via your package manager:"
    echo -e "  - Ubuntu/Debian: sudo apt-get install -y nodejs"
    echo -e "  - macOS: brew install node"
    echo -e "  - Arch Linux: sudo pacman -S nodejs"
    exit 1
fi
echo -e "${GREEN}  ✓ Node.js detected: $(node -v)${RESET}"

# Step 2: Download service script
echo -e "${YELLOW}[2/3] Downloading Valor Local Media Engine...${RESET}"
DOWNLOAD_URL="$HOST_ORIGIN/api/sidecar/valor-service.mjs"

if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$DOWNLOAD_URL" -o "$SERVICE_FILE" || {
        echo -e "${YELLOW}  Could not download from $DOWNLOAD_URL. Retrying or using fallback...${RESET}"
    }
elif command -v wget >/dev/null 2>&1; then
    wget -qO "$SERVICE_FILE" "$DOWNLOAD_URL" || true
fi

if [ -f "$SERVICE_FILE" ]; then
    echo -e "${GREEN}  ✓ Engine downloaded to $SERVICE_FILE${RESET}"
fi

# Create run script
cat << 'EOF' > "$RUNNER_FILE"
#!/usr/bin/env bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
node "$DIR/valor-service.mjs"
EOF
chmod +x "$RUNNER_FILE"

# Try to create desktop or ~/bin shortcut if convenient
if [ -d "$HOME/Desktop" ]; then
    cp "$RUNNER_FILE" "$HOME/Desktop/Run Valor Engine.sh" 2>/dev/null || true
    chmod +x "$HOME/Desktop/Run Valor Engine.sh" 2>/dev/null || true
    echo -e "${GREEN}  ✓ Created shortcut on Desktop: 'Run Valor Engine.sh'${RESET}"
fi

# Step 3: Run
echo -e "${YELLOW}[3/3] Starting Valor Local Media Engine on http://127.0.0.1:45454...${RESET}"
echo ""
echo -e "${CYAN}------------------------------------------------------------${RESET}"
echo -e "  Engine is starting now in this window."
echo -e "  Keep this terminal open while watching remote media in Valor."
echo -e "${CYAN}------------------------------------------------------------${RESET}"
echo ""

exec node "$SERVICE_FILE"
