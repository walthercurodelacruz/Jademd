# JadeMD en Windows: requisitos, compilación, pruebas e instalador

Guía para preparar un equipo Windows, compilar JadeMD, ejecutar sus comprobaciones y generar el instalador `.exe`.

> **Estado de validación en Windows (22 de noviembre de 2026):** se compilaron el backend (release) y el frontend, se generó el instalador NSIS con electron-builder y el backend empaquetado respondió correctamente (`/api/session` → 200 y entrega de `index.html`). **Todavía no se han validado en Windows** la suite de pruebas Rust/Vitest, la prueba de humo de Electron, ni la instalación, el arranque y la desinstalación del `.exe`. Las cifras de pruebas del README provienen de ejecuciones en Linux.

---

## 1. Requisitos

| Componente | Versión recomendada | Versión con la que se generó el instalador | Para qué se usa |
|---|---|---|---|
| Windows | 10 u 11 de **64 bits** | Windows 11 (build 26300) | El instalador rechaza sistemas de 32 bits |
| Visual Studio Build Tools | 2022 (o posterior) con la carga **Desarrollo para el escritorio con C++** | Build Tools 2022 + Windows SDK 10.0.26100.0 | Enlazador MSVC (`link.exe`) y bibliotecas del SDK necesarias para Rust |
| Rust (rustup) | Canal `stable`, host **`x86_64-pc-windows-msvc`** | rustc/cargo 1.100.0 | Compilar `jademd.exe` (backend) |
| Node.js | `^22.12.0`, `^24.0.0` o `>=26.0.0` (`frontend/.nvmrc` sugiere 22 LTS) | Node 26.13.1 | Compilar el frontend y ejecutar electron-builder |
| npm | El incluido con Node | npm 11.20.0 | Instalar dependencias fijadas (`npm ci`) |
| Git | Cualquier versión reciente | Git for Windows | Clonar el repositorio (incluye Git Bash, opcional) |
| Python | 3.10 o superior (opcional) | Python 3.12 | Solo para `scripts/test-desktop.py` |
| NSIS (`makensis`) | 3.x (opcional) | No necesario | Solo para el instalador personalizado `scripts/jademd-installer.nsi` |

Se necesita **conexión a Internet** la primera vez: crates de Rust, paquetes npm, el binario de Electron y las herramientas NSIS que descarga electron-builder.

### 1.1 Visual Studio Build Tools (obligatorio para Rust)

Rust en Windows con el host `msvc` necesita el enlazador de Microsoft. Sin él, `cargo build` falla con `linker 'link.exe' not found`.

1. Descarga **Build Tools para Visual Studio** desde <https://visualstudio.microsoft.com/es/downloads/> (sección *Herramientas para Visual Studio*).
2. En el instalador marca la carga de trabajo **Desarrollo para el escritorio con C++**. Comprueba que incluya:
   - *MSVC v143 – VS 2022 C++ x64/x86 build tools* (o la versión más reciente).
   - *Windows 11 SDK* (o Windows 10 SDK).
3. No hace falta instalar el IDE completo de Visual Studio.

> [!TIP]
> Si instalas Rust con `rustup-init.exe` antes que las Build Tools, rustup ofrece instalarlas automáticamente.

### 1.2 Rust (recomendación)

Se recomienda **rustup**, el instalador oficial, en vez de paquetes de terceros:

1. Descarga `rustup-init.exe` desde <https://rustup.rs>.
2. Ejecútalo y acepta la opción por defecto. Debe quedar:
   - Host: `x86_64-pc-windows-msvc` (**no** `gnu`; el proyecto se compila y empaqueta con MSVC).
   - Toolchain: `stable`.
   - Perfil: `default` (incluye `rustfmt` y `clippy`, que usa la CI).
3. Cierra y vuelve a abrir la terminal para que `%USERPROFILE%\.cargo\bin` entre en el `PATH`.
4. Comprueba:

```powershell
rustup show
cargo --version
rustc --version
```

Si instalaste con el perfil `minimal`, añade los componentes de comprobación:

```powershell
rustup component add rustfmt clippy
```

Mantén el toolchain actualizado con `rustup update`. `Cargo.lock` está en el repositorio y todos los comandos usan `--locked`, de modo que las versiones de dependencias no cambian al compilar.

> [!NOTE]
> **Toolchain portable (sin modificar el sistema).** Si no puedes instalar Rust de forma permanente, puedes instalarlo en una carpeta aislada definiendo `RUSTUP_HOME` y `CARGO_HOME` antes de ejecutar `rustup-init.exe -y --no-modify-path --default-host x86_64-pc-windows-msvc`, y llamar después a `<CARGO_HOME>\bin\cargo.exe` con las mismas variables definidas. Así se generó el instalador del 22 de noviembre de 2026.

### 1.3 Node.js y npm

1. Instala Node.js LTS desde <https://nodejs.org> (o con `nvm-windows`, usando la versión de `frontend/.nvmrc`).
2. Comprueba con `node --version` y `npm --version`.

**PowerShell y la directiva de ejecución.** En instalaciones nuevas de Windows, PowerShell puede bloquear `npm.ps1` con el error *"la ejecución de scripts está deshabilitada en este sistema"*. Hay dos opciones:

- Llamar a los ejecutables `.cmd`: `npm.cmd` y `npx.cmd` (es lo que usa esta guía).
- O permitir scripts firmados localmente solo para tu usuario:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

**npm 11 y los scripts de instalación.** Las versiones recientes de npm no ejecutan los scripts `install`/`postinstall` de dependencias que no estén autorizadas, y muestran avisos `npm warn install-scripts` (por ejemplo `esbuild`, `electron-winstaller`). Para **compilar el frontend y generar el instalador** esos avisos no impiden nada. Sin embargo, el paquete `electron` descarga su binario en su `postinstall`; si `desktop\node_modules\electron\dist\electron.exe` no existe, ejecutar la app en modo desarrollo o la prueba de humo fallará. Para descargarlo manualmente:

```powershell
node desktop\node_modules\electron\install.js
```

---

## 2. Obtener el código

```powershell
git clone https://github.com/walthercurodelacruz/Jademd.git
cd Jademd
```

Los scripts `run.sh` y `scripts/*.sh` están escritos para Bash (Linux). En Windows se pueden ejecutar desde **Git Bash**, pero esta guía ofrece los comandos equivalentes en PowerShell, que no dependen de Bash.

---

## 3. Compilar

Todos los comandos se ejecutan desde la raíz del repositorio.

### 3.1 Backend (Rust)

```powershell
# Depuración: la usa Electron en modo desarrollo (target\debug\jademd.exe)
cargo build --locked --bin jademd

# Release: la que se incluye en el instalador (target\release\jademd.exe)
cargo build --locked --release --bin jademd
```

La primera compilación release tarda unos 2 minutos en un equipo moderno. En Windows se usa automáticamente `crates/jademd-core/src/local_fs_windows.rs` (confinamiento con rechazo de *reparse points*/symlinks, nombres reservados como `CON` o `COM1`, y reemplazo atómico con `MoveFileExW`).

### 3.2 Frontend

```powershell
cd frontend
npm.cmd ci
npm.cmd run build      # ejecuta tsc y vite build → frontend\dist
cd ..
```

Vite muestra el aviso *"Some chunks are larger than 500 kB"*; es conocido y no impide la compilación.

### 3.3 Cliente de escritorio

```powershell
cd desktop
npm.cmd ci
cd ..
```

---

## 4. Ejecutar en Windows

### 4.1 Como aplicación de escritorio (equivalente a `./run.sh`)

```powershell
cargo build --locked --bin jademd
npm.cmd --prefix frontend run build
npm.cmd --prefix desktop start
```

Electron arranca `target\debug\jademd.exe --desktop`, espera la señal de disponibilidad y abre la ventana. Para usar otro puerto:

```powershell
$env:JADEMD_PORT = "3100"; npm.cmd --prefix desktop start
```

### 4.2 Modo desarrollo en navegador

```powershell
# Terminal 1
cargo run --locked --bin jademd

# Terminal 2
cd frontend
npm.cmd run dev        # http://localhost:5173 (redirige /api a 127.0.0.1:3030)
```

---

## 5. Probar

### 5.1 Comprobaciones equivalentes a la CI

```powershell
# Rust: formato, análisis estático y pruebas
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked

# Frontend: pruebas Vitest/JSDOM, tipos y compilación
npm.cmd --prefix frontend run test
npm.cmd --prefix frontend run typecheck
npm.cmd --prefix frontend run build
```

> [!WARNING]
> La CI (`.github/workflows/ci.yml`) solo se ejecuta en `ubuntu-latest`. Algunas pruebas del núcleo crean enlaces simbólicos para verificar el confinamiento; en Windows crear symlinks requiere el **Modo de desarrollador** activado o una terminal con privilegios de administrador. Si alguna prueba falla en Windows, conviene registrarla como incidencia de portabilidad antes de modificarla.

### 5.2 Prueba de humo de Electron

Requiere el backend de depuración, el frontend compilado, `desktop\node_modules` y el binario de Electron (véase §1.3). En Windows no se necesita `xvfb`.

```powershell
cargo build --locked --bin jademd
npm.cmd --prefix frontend run build
python scripts\test-desktop.py
```

El script usa el puerto 31337 (configurable con `JADEMD_PORT`) y un perfil temporal sin bóvedas reales. Comprueba el selector de bóvedas, la reapertura y que el puerto quede libre tras un cierre normal y tras un cierre abrupto. El puerto debe estar libre antes de empezar.

### 5.3 Verificación rápida del backend empaquetado

Tras generar el instalador (§6) se puede comprobar el backend incluido sin instalar nada:

```powershell
$b = "target\desktop-installers\win-unpacked\resources\backend"
$env:JADEMD_PORT = "31337"
$p = Start-Process "$b\jademd.exe" -WorkingDirectory $b -PassThru -WindowStyle Hidden
Start-Sleep 3
curl.exe -s -o NUL -w "session=%{http_code}`n" http://127.0.0.1:31337/api/session   # esperado: 200
curl.exe -s http://127.0.0.1:31337/ | Select-Object -First 2                       # esperado: <!doctype html>
Stop-Process $p -Force
```

---

## 6. Generar el instalador de Windows

### 6.1 Método recomendado: electron-builder (NSIS)

No necesita instalar NSIS ni Bash: electron-builder descarga Electron, 7-Zip y NSIS a su caché (`%LOCALAPPDATA%\electron-builder\Cache`).

```powershell
# 1. Backend release
cargo build --locked --release --bin jademd

# 2. Frontend de producción
cd frontend
npm.cmd ci
npm.cmd run build
cd ..

# 3. Empaquetado
cd desktop
npm.cmd ci
npx.cmd electron-builder --win nsis --x64 --config.win.signAndEditExecutable=false
cd ..
```

Resultado en `target\desktop-installers\`:

| Archivo | Descripción |
|---|---|
| `JadeMD Setup 0.1.0.exe` | Instalador NSIS (~134 MB) |
| `JadeMD Setup 0.1.0.exe.blockmap` | Metadatos para actualizaciones diferenciales (no necesario para distribuir) |
| `win-unpacked\` | Aplicación sin instalar; `JadeMD.exe` puede ejecutarse directamente |

Estructura relevante dentro de la aplicación:

```text
win-unpacked\
├── JadeMD.exe                      # Electron (desktop/main.cjs)
└── resources\
    ├── app.asar                    # main.cjs, preload.cjs, package.json
    └── backend\
        ├── jademd.exe              # target\release\jademd.exe
        └── frontend\dist\          # interfaz compilada
```

El backend busca `frontend/dist` junto a su ejecutable, por eso ambos se copian a `resources\backend` (configurado en `build.extraResources` de `desktop/package.json`).

El instalador generado con la configuración de `desktop/package.json` (`oneClick: false`, `allowToChangeInstallationDirectory: true`) permite elegir la carpeta de destino y se instala por usuario, sin requerir administrador.

**Sobre `--config.win.signAndEditExecutable=false`:** omite la firma y la edición de recursos del `.exe` (icono, versión). Evita descargar `winCodeSign`, cuyo archivo contiene enlaces simbólicos y falla con *"Cannot create symbolic link: El cliente no dispone de un privilegio requerido"* si Windows no tiene el Modo de desarrollador activado. Si quieres conservar icono y metadatos sin firmar, activa el **Modo de desarrollador** (Configuración → Sistema → Para programadores) y usa `--config.win.signExecutable=false` en su lugar.

### 6.2 Método alternativo: script NSIS propio

El repositorio incluye `scripts/jademd-installer.nsi` (instalación por usuario en `%LOCALAPPDATA%\Programs\JadeMD`, interfaz en español, acceso en el menú Inicio y desinstalador registrado). Requiere:

- **NSIS 3.x** con `makensis` en el `PATH` (<https://nsis.sourceforge.io>).
- **Git Bash** para ejecutar el script de empaquetado.

```bash
# Desde Git Bash, en la raíz del repositorio
scripts/package-installers.sh windows
```

Genera primero `win-unpacked` con electron-builder (`--win --dir`) y luego `target/desktop-installers/JadeMD-0.1.0-Windows-x64-Setup.exe` con `makensis`. Para usar un `jademd.exe` compilado en otra máquina, pásalo como segundo argumento: `scripts/package-installers.sh windows /ruta/a/jademd.exe`.

---

## 7. Distribución: consideraciones

- **Firma de código.** Los instaladores generados no están firmados. Windows SmartScreen mostrará *"Windows protegió su PC"*; el usuario debe pulsar *Más información → Ejecutar de todas formas*. Para distribución pública se recomienda un certificado de firma de código (OV/EV) configurado mediante las variables `CSC_LINK`/`CSC_KEY_PASSWORD` de electron-builder.
- **Icono.** No hay icono configurado; se usa el de Electron. Añade un `.ico` de 256×256 y declara `"icon"` en `build.win` de `desktop/package.json`.
- **Antivirus.** Algunos antivirus analizan o retienen ejecutables sin firmar recién creados; si el empaquetado falla al renombrar archivos, excluye temporalmente la carpeta `target\`.
- **Arquitectura.** Solo se genera x64. ARM64 requeriría compilar Rust con `--target aarch64-pc-windows-msvc` y empaquetar con `--arm64`.
- **Actualizar una instalación existente.** Cierra JadeMD antes de ejecutar el nuevo instalador.

---

## 8. Solución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| `cargo` / `rustc` no se reconoce | Rust no instalado o terminal abierta antes de instalarlo | Instala con rustup (§1.2) y abre una terminal nueva |
| `linker 'link.exe' not found` | Faltan las Build Tools de C++ | Instala la carga *Desarrollo para el escritorio con C++* (§1.1) |
| `npm.ps1 no se puede cargar… ejecución de scripts deshabilitada` | Directiva de ejecución de PowerShell | Usa `npm.cmd`/`npx.cmd` o `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| `npm warn install-scripts …` | npm 11 bloquea scripts de dependencias | Inofensivo para compilar; descarga Electron con `node desktop\node_modules\electron\install.js` si vas a ejecutar la app en desarrollo |
| `Electron failed to install correctly` al ejecutar `npm start` | Falta `electron.exe` | Igual que el punto anterior |
| `Cannot create symbolic link` durante electron-builder | `winCodeSign` necesita privilegios para symlinks | Usa `--config.win.signAndEditExecutable=false` o activa el Modo de desarrollador |
| *"El puerto 3030 ya está en uso"* al abrir la app | Otra instancia de JadeMD u otro programa usa el puerto | Cierra la instancia previa o define `JADEMD_PORT` |
| PowerShell muestra `NativeCommandError` aunque el comando terminó bien | PowerShell 5 trata la salida de stderr de `cargo` como error | Revisa el código de salida (`$LASTEXITCODE`); puedes ejecutar con `cmd /c "cargo … 2>&1"` |
| El instalador queda bloqueado por SmartScreen | Ejecutable sin firma | *Más información → Ejecutar de todas formas*, o firma el instalador (§7) |
