#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output="$root/target/desktop-installers"
stage="$(mktemp -d "$output/.deb.XXXXXX")"
trap 'rm -rf -- "$stage"' EXIT
mkdir -p "$stage/opt/jademd-desktop" "$stage/usr/bin" "$stage/usr/share/applications" "$stage/DEBIAN"
cp -a "$output/linux-unpacked/." "$stage/opt/jademd-desktop/"
chmod 4755 "$stage/opt/jademd-desktop/chrome-sandbox"
ln -s /opt/jademd-desktop/jademd-desktop "$stage/usr/bin/jademd-desktop"
cp "$root/jademd.desktop" "$stage/usr/share/applications/jademd-desktop.desktop"
mkdir -p "$stage/usr/share/icons/hicolor/scalable/apps"
cp "$root/frontend/public/logo.svg" "$stage/usr/share/icons/hicolor/scalable/apps/jademd-desktop.svg"
version="$(node -p "require('$root/desktop/package.json').version")"
glibc="$(LC_ALL=C readelf --version-info "$root/target/release/jademd" | grep -oE 'GLIBC_[0-9]+\.[0-9]+' | sort -Vu | tail -n1)"
cat > "$stage/DEBIAN/control" <<CONTROL
Package: jademd-desktop
Version: $version
Architecture: amd64
Maintainer: JadeMD contributors
Depends: libc6 (>= ${glibc#GLIBC_}), libnss3, libatk1.0-0, libatk-bridge2.0-0, libcups2, libdrm2, libxkbcommon0, libxcomposite1, libxdamage1, libxfixes3, libxrandr2, libgbm1, libasound2t64 | libasound2, libgtk-3-0, libx11-6, libxcb1, libxext6, libglib2.0-0, libdbus-1-3
Section: editors
Priority: optional
Description: JadeMD desktop
 Gestor de conocimiento Markdown con ventana de escritorio.
CONTROL
dpkg-deb --root-owner-group --build "$stage" "$output/JadeMD_${version}_amd64.deb"
