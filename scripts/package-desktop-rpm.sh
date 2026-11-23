#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output="$root/target/desktop-installers"
topdir="$(mktemp -d "$output/.rpm.XXXXXX")"
trap 'rm -rf -- "$topdir"' EXIT

mkdir -p "$topdir"/{BUILD,BUILDROOT,RPMS,SOURCES,SPECS,SRPMS}

version="$(node -p "require('$root/desktop/package.json').version")"
arch="$(uname -m)"
glibc="$(LC_ALL=C readelf --version-info "$root/target/release/jademd" | grep -oE 'GLIBC_[0-9]+\.[0-9]+' | sort -Vu | tail -n1)"

cat > "$topdir/SPECS/jademd-desktop.spec" <<SPEC
%global debug_package %{nil}
%global _build_id_links none
%define __strip /bin/true

Name:           jademd-desktop
Version:        ${version}
Release:        1
Summary:        JadeMD desktop
License:        GPL-3.0-or-later
URL:            https://github.com/walthercurodelacruz/Jademd
BuildArch:      ${arch}
AutoReqProv:    no
Requires:       glibc >= ${glibc#GLIBC_}, nss, at-spi2-atk, at-spi2-core, cups-libs, libdrm, libxkbcommon, libXcomposite, libXdamage, libXfixes, libXrandr, mesa-libgbm, alsa-lib, gtk3, libX11, libxcb, libXext, glib2, dbus-libs

%description
Gestor de conocimiento Markdown con ventana de escritorio.

%install
mkdir -p %{buildroot}/opt/jademd-desktop %{buildroot}/usr/bin %{buildroot}/usr/share/applications %{buildroot}/usr/share/icons/hicolor/scalable/apps
cp -a "$output/linux-unpacked/." %{buildroot}/opt/jademd-desktop/
ln -s /opt/jademd-desktop/jademd-desktop %{buildroot}/usr/bin/jademd-desktop
cp "$root/jademd.desktop" %{buildroot}/usr/share/applications/jademd-desktop.desktop
cp "$root/frontend/public/logo.svg" %{buildroot}/usr/share/icons/hicolor/scalable/apps/jademd-desktop.svg

%files
/opt/jademd-desktop
%attr(4755, root, root) /opt/jademd-desktop/chrome-sandbox
/usr/bin/jademd-desktop
/usr/share/applications/jademd-desktop.desktop
/usr/share/icons/hicolor/scalable/apps/jademd-desktop.svg
SPEC

rpmbuild --define "_topdir $topdir" --target "$arch" -bb "$topdir/SPECS/jademd-desktop.spec"
rpm_built="$(find "$topdir/RPMS" -name '*.rpm' -print -quit)"
cp -f -- "$rpm_built" "$output/JadeMD-${version}-1.${arch}.rpm"
echo "RPM generado: $output/JadeMD-${version}-1.${arch}.rpm"
