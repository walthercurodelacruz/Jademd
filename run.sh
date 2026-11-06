#!/usr/bin/env bash
# Build and launch the desktop application. Its window owns the local backend.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"
cargo build --locked --bin jademd
# npm ci replaces node_modules, including the Linux sandbox helper permissions.
# Reinstall only when dependencies are absent or their manifests have changed.
install_dependencies() {
    local package_dir="$1"
    local installed="$package_dir/node_modules/.package-lock.json"
    if [[ ! -f "$installed" || "$package_dir/package-lock.json" -nt "$installed" || "$package_dir/package.json" -nt "$installed" ]]; then
        (cd "$package_dir" && npm ci)
    fi
}
install_dependencies frontend
(cd frontend && npm run build)
install_dependencies desktop
cd desktop
exec npm start
