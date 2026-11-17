#!/usr/bin/env bash
# Instalador do Blob para Linux (Ubuntu e derivados).
# Uso:  curl -fsSL https://raw.githubusercontent.com/bomberm4n-lgtm/blob/main/install-linux.sh | bash
# O Blob se atualiza sozinho depois de instalado.
set -e
REPO="bomberm4n-lgtm/blob"
DIR="$HOME/.local/share/blob"
BIN="$HOME/.local/bin"
APPS="$HOME/.local/share/applications"

echo "== Instalando o Blob =="
rm -rf "$DIR"            # remove versões antigas (instalador .sh antigo)
mkdir -p "$DIR" "$BIN" "$APPS"
curl -fL --progress-bar -o "$DIR/Blob.AppImage" "https://github.com/$REPO/releases/latest/download/Blob-linux.AppImage"
chmod +x "$DIR/Blob.AppImage"
curl -fsSL -o "$DIR/icon.png" "https://raw.githubusercontent.com/$REPO/main/desktop/icon.png"

# APPIMAGE_EXTRACT_AND_RUN: não precisa de libfuse2. --no-sandbox: evita bloqueio do AppArmor no Ubuntu 24+.
cat > "$BIN/blob" <<LAUNCH
#!/usr/bin/env bash
export APPIMAGE_EXTRACT_AND_RUN=1
exec "$DIR/Blob.AppImage" --no-sandbox --enable-features=WebRTCPipeWireCapturer "\$@"
LAUNCH
chmod +x "$BIN/blob"

cat > "$APPS/blob.desktop" <<DESK
[Desktop Entry]
Name=Blob
Comment=Voz, chat e transmissão de tela
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
echo "Pronto! Abra o \"Blob\" pelo menu de aplicativos (ou digite: blob)."
