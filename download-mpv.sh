#!/usr/bin/env bash
set -euo pipefail

# Instructions for installing system libmpv on Linux and macOS:
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "macOS detected: Installing mpv via Homebrew..."
    brew install mpv
elif [[ -f /etc/debian_version ]]; then
    echo "Debian/Ubuntu detected: Installing libmpv-dev..."
    sudo apt-get update && sudo apt-get install -y libmpv-dev libmpv2
elif [[ -f /etc/fedora-release ]] || [[ -f /etc/redhat-release ]]; then
    echo "Fedora/RHEL detected: Installing mpv-libs-devel..."
    sudo dnf install -y mpv-libs-devel
elif [[ -f /etc/arch-release ]]; then
    echo "Arch Linux detected: Installing mpv..."
    sudo pacman -S --needed mpv
else
    echo "Please install libmpv development libraries using your distribution package manager."
fi
