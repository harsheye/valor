#!/usr/bin/env bash
# Install libmpv development files using the detected Unix package manager.
set -euo pipefail
if [[ "${OSTYPE:-}" == darwin* ]]; then
  brew install mpv
elif [[ -f /etc/debian_version ]]; then
  sudo apt-get update
  sudo apt-get install -y libmpv-dev libmpv2
elif [[ -f /etc/fedora-release ]] || [[ -f /etc/redhat-release ]]; then
  sudo dnf install -y mpv-libs-devel
elif [[ -f /etc/arch-release ]]; then
  sudo pacman -S --needed mpv
else
  printf '%s\n' 'Install libmpv and its development headers with your distribution package manager.'
  exit 1
fi
