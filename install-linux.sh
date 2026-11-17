#!/usr/bin/env bash
# Blob installer for Linux (Ubuntu and derivatives).
# Usage:  curl -fsSL https://raw.githubusercontent.com/bomberm4n-lgtm/blob/main/install-linux.sh | bash
# Blob updates itself after it is installed.
set -e
REPO="bomberm4n-lgtm/blob"
DIR="$HOME/.local/share/blob"
BIN="$HOME/.local/bin"
APPS="$HOME/.local/share/applications"

echo "== Installing Blob =="
rm -rf "$DIR"            # remove older installs (old .sh installer)
mkdir -p "$DIR" "$BIN" "$APPS"
curl -fL --progress-bar -o "$DIR/Blob.AppImage" "https://github.com/$REPO/releases/latest/download/Blob-linux.AppImage"
chmod +x "$DIR/Blob.AppImage"
curl -fsSL -o "$DIR/icon.png" "https://raw.githubusercontent.com/$REPO/main/desktop/icon.png"

# APPIMAGE_EXTRACT_AND_RUN: no libfuse2 needed. --no-sandbox: avoids the AppArmor block on Ubuntu 24+.
cat > "$BIN/blob" <<LAUNCH
#!/usr/bin/env bash
export APPIMAGE_EXTRACT_AND_RUN=1
exec "$DIR/Blob.AppImage" --no-sandbox --enable-features=WebRTCPipeWireCapturer "\$@"
LAUNCH
chmod +x "$BIN/blob"

cat > "$APPS/blob.desktop" <<DESK
[Desktop Entry]
Name=Blob
Comment=Voice, chat and screen sharing
Exec=$BIN/blob %U
Icon=$DIR/icon.png
Terminal=false
Type=Application
Categories=Network;Chat;
DESK
DESKTOP_DIR="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"
if [ -d "$DESKTOP_DIR" ]; then
  cp "$APPS/blob.desktop" "$DESKTOP_DIR/blob.desktop"
  chmod +x "$DESKTOP_DIR/blob.desktop"
  gio set "$DESKTOP_DIR/blob.desktop" metadata::trusted true 2>/dev/null || true
fi
echo "Done! Open \"Blob\" from your app menu (or type: blob)."
