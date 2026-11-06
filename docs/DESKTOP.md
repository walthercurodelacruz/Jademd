# JadeMD desktop

La entrada de producción es `desktop/main.cjs`. Electron crea un único backend Rust, mantiene abierta su entrada estándar y espera la señal de disponibilidad emitida después de enlazar el socket. No reutiliza servidores preexistentes. La ventana usa sandbox, aislamiento de contexto y no tiene acceso a Node. Solo se exponen dos operaciones IPC de cierre; el proceso principal verifica el emisor.

El cierre de ventana solicita al frontend vaciar su cola de guardados. Si falla, no destruye la ventana. Cuando confirma, destruye la ventana y cierra la tubería del backend. Si el proceso principal muere abruptamente, el sistema cierra la tubería y el backend termina al detectar EOF. Un cierre forzado no garantiza guardar cambios que todavía no se hayan enviado; los borradores locales ayudan a recuperar esos cambios.

Las bóvedas y la última elegida se guardan en el almacenamiento local del perfil Electron. Cero bóvedas: gestor; una local: reapertura; varias: elección obligatoria. WebDAV recuerda endpoint, usuario y raíz, sin contraseña. Reconectar una bóveda protegida requiere proporcionar el token. Una carpeta de red desconectada permanece registrada y muestra el error para reconectarla.

## Validación aislada

```bash
cargo build --locked --bin jademd
npm --prefix frontend run build
npm --prefix desktop ci
JADEMD_PORT=31337 xvfb-run -a desktop/node_modules/.bin/electron desktop/smoke.cjs
JADEMD_PORT=31337 JADEMD_SMOKE_SCENARIO=crash xvfb-run -a desktop/node_modules/.bin/electron desktop/smoke.cjs
```

Las pruebas usan un perfil temporal sin bóvedas. En la segunda se termina el proceso principal sin limpieza explícita para comprobar la recuperación del backend. Después de cada ejecución se debe verificar que 31337 dejó de escuchar. No usar un puerto ocupado. Para una prueba interactiva local basta `./run.sh`.

## Distribución

`desktop/package.json` configura electron-builder para deb, AppImage y NSIS. Los nuevos paquetes salen en `target/desktop-installers`, separados de los instaladores anteriores que abrían el navegador. La validación de Linux no sustituye pruebas de instalación y cierre en Windows.

La auditoría inicial de dependencias de desarrollo detectó avisos moderados en la cadena del empaquetador (`minimatch`); no son dependencias de ejecución de la aplicación. Debe actualizarse el empaquetador cuando incorpore la corrección compatible, sin aplicar un downgrade automático de la herramienta.

## Resultado de la validación local

Pasaron 47 pruebas Rust, 138 de frontend, TypeScript, compilación de producción y Clippy sin advertencias. La prueba con Electron en Linux verificó el selector inicial, la reapertura de una bóveda temporal, la elección entre dos y el recuerdo de la última. Tanto el cierre normal como SIGKILL al proceso principal dejaron libre el puerto de prueba 31337. Puede repetirse con `python3 scripts/test-desktop.py` después de compilar. Windows y los nuevos instaladores aún requieren validación de distribución.
