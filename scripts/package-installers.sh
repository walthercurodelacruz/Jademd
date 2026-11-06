#!/usr/bin/env bash
# Desktop packages include Electron, the Rust backend and the built frontend.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
case "${1:-}" in
  linux)
    cargo build --locked --release --bin jademd
    target_args=(--linux AppImage)
    ;;
  windows)
    if [[ -n "${2:-}" ]]; then
      mkdir -p target/release
      cp -- "$2" target/release/jademd.exe
    elif [[ "${OS:-}" == Windows_NT ]]; then
      cargo build --locked --release --bin jademd
    else
      echo 'Proporciona el backend compilado para Windows como segundo argumento.' >&2
      exit 2
    fi
    target_args=(--win --dir --config.win.signAndEditExecutable=false)
    ;;
  *) echo 'Uso: scripts/package-installers.sh {linux|windows} [backend-windows.exe]' >&2; exit 2 ;;
esac
(cd frontend && npm ci && npm run build)
(cd desktop && npm ci && npm run dist -- "${target_args[@]}")

if [[ "${1:-}" == linux ]]; then
  "$root/scripts/package-desktop-deb.sh"
fi

if [[ "${1:-}" == windows ]]; then
  version="$(node -p "require('./desktop/package.json').version")"
  makensis "-DVERSION=$version" "-DAPPDIR=$root/target/desktop-installers/win-unpacked" "-DLICENSE_FILE=$root/LICENSE" "-DOUTPUT=$root/target/desktop-installers/JadeMD-$version-Windows-x64-Setup.exe" scripts/jademd-installer.nsi
fi
