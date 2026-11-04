# 💎 Jademd

**Jademd** es un gestor de conocimiento personal y notas Markdown de alto rendimiento, modular y escalable, diseñado como alternativa moderna a Obsidian.

Cuenta con una arquitectura desacoplada:
- **Backend:** Desarrollado en **Rust** (Tokio, Axum, Apache OpenDAL, Petgraph).
- **Frontend:** Desarrollado con **React 19, TypeScript, Tailwind CSS** y el editor modular **CodeMirror 6**.
- **Almacenamiento Conectable:** Abstracción unificada vía **Apache OpenDAL** que soporta tanto el sistema de archivos local como nubes remotas (**Nextcloud / WebDAV**, **Google Drive** y puntos de montaje de red **SMB/NFS**).

---

## 🚀 Características Principales

1. **Gestión de Bóvedas (Vaults):**
   - **Local:** Abre cualquier directorio en tu máquina Linux o disco montado en la red.
   - **Nube Nextcloud / WebDAV:** Conéctate directamente a tu servidor Nextcloud o ownCloud mediante URL, credenciales o tokens de aplicación.
   - **Google Drive:** Conexión nativa mediante tokens de acceso OAuth2 o Service Accounts.

2. **Editor Markdown Potente (CodeMirror 6):**
   - Tema oscuro inspirado en Obsidian (OneDark / Jade Dark).
   - Autocompletado inteligente de enlaces dobles `[[wikilinks]]`.
   - Detección automática de etiquetas `#etiquetas` y YAML Frontmatter.
   - Guardado automático reactivo en tiempo real con debounce.

3. **Grafo de Conocimiento Interactivo (Graph View):**
   - Motor de grafos bidireccional en Rust (`petgraph`).
   - Simulación física 2D con fuerzas elásticas, repulsión e inercia.
   - Zoom, desplazamiento (pan), arrastre de nodos, resaltado por hovering y navegación directa al hacer clic.

4. **Lienzo Infinito Visual (.canvas):**
   - Compatibilidad completa con el formato estándar `.canvas` de Obsidian.
   - Tablero visual 2D infinito con zoom y paneo.
   - Tarjetas de texto editables y tarjetas vinculadas a notas existentes de la bóveda.
   - Conexiones direccionales curvas con flechas y etiquetas de relación.

5. **Panel Lateral de Navegación y Backlinks:**
   - Explorador de archivos anidado con creación de notas y carpetas.
   - Panel de información de nota activa: conteo de palabras, caracteres, etiquetas encontradas, esquema de encabezados y enlaces entrantes (backlinks).

6. **Búsqueda Global en Tiempo Real (`Ctrl + O`):**
   - Búsqueda instantánea en toda la bóveda con resaltado de coincidencias y líneas de texto.

---

## 🛠️ Requisitos Previos

- **Rust & Cargo** (versión 1.80+ recomendada)
- **Node.js** (versión 18+ o superior) y **npm**
- Navegador web moderno (Chrome, Brave, Firefox, etc.)

---

## ⚡ Inicio Rápido

### Opción 1: Lanzador Universal (Recomendado)
Para iniciar la aplicación con la bóveda de demostración o cualquier carpeta:

```bash
# Iniciar con la bóveda demo
./run.sh

# O pasar la ruta absoluta a tu bóveda personal
./run.sh /ruta/a/mi/boveda
```

Esto compilará el proyecto si aún no está listo, iniciará el servidor de Rust y abrirá tu navegador en `http://127.0.0.1:3030`.

### Opción 2: Compilación y Ejecución Manual

#### 1. Construir el Frontend
```bash
cd frontend
npm install
npm run build
cd ..
```

#### 2. Ejecutar el Servidor Rust
```bash
cargo run --bin jademd [ruta_a_la_boveda]
```

Accede a `http://127.0.0.1:3030`.

#### 3. Modo Desarrollo con Recarga en Vivo (HMR)
Si deseas modificar la interfaz con recarga instantánea:

```bash
# Terminal 1: Servidor API de Rust
cargo run --bin jademd demo_vault

# Terminal 2: Servidor Vite de Frontend
cd frontend
npm run dev
```
Abre `http://localhost:5173`. Vite redirigirá las llamadas `/api/*` automáticamente al puerto `3030`.

---

## 📂 Estructura del Proyecto

```
Jademd/
├── Cargo.toml                    # Workspace de Cargo
├── crates/
│   ├── jademd-core/              # Biblioteca principal en Rust
│   │   ├── src/
│   │   │   ├── models.rs         # Estructuras de datos (FileNode, Vault, Graph, Meta)
│   │   │   ├── parser.rs         # Parser de Wikilinks, tags, frontmatter y headings
│   │   │   ├── graph.rs          # Motor de grafos petgraph y resolución de enlaces
│   │   │   ├── storage.rs        # Capa de almacenamiento unificada Apache OpenDAL
│   │   │   └── vault.rs          # Gestor de bóveda, escáner e indexador
│   │   └── Cargo.toml
│   └── jademd-server/            # Servidor Axum REST API
│       ├── src/main.rs           # Endpoints HTTP y servidor de archivos estáticos
│       └── Cargo.toml
├── frontend/                     # Aplicación React + TypeScript + Tailwind
│   ├── src/
│   │   ├── components/           # Componentes UI (FileTree, GraphView, CanvasView, etc.)
│   │   ├── editor/               # Editor CodeMirror 6 con plugins y temas
│   │   ├── store/                # Estado global Zustand (useVaultStore)
│   │   ├── api/                  # Cliente HTTP para el backend
│   │   ├── App.tsx               # Workspace tri-panel estilo Obsidian
│   │   └── main.tsx
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
├── demo_vault/                   # Bóveda de ejemplo con notas y lienzo .canvas
├── run.sh                        # Script de inicio rápido de un solo clic
└── jademd.desktop                # Acceso directo para el escritorio Linux
```

---

## ☁️ Conexión a Nubes y Almacenamiento Remoto

Jademd utiliza **Apache OpenDAL**, lo que permite intercambiar el almacenamiento subyacente sin modificar la lógica de la aplicación:

- **Nextcloud / WebDAV:** Abre el selector de bóvedas, selecciona la pestaña *Nextcloud / WebDAV*, ingresa la URL WebDAV de tu usuario (ej: `https://nextcloud.midominio.com/remote.php/dav/files/usuario/`), tu usuario y tu contraseña o Token de Aplicación.
- **Google Drive:** Selecciona la pestaña *Google Drive* e ingresa tus credenciales OAuth2 (o Access/Refresh Token).
- **Carpetas Compartidas en Red (SMB / NFS):** Puedes montar cualquier carpeta compartida de tu red local en Linux (ej: `/mnt/recursos/boveda`) y abrirla como Bóveda Local con máximo rendimiento I/O.

---

## 📄 Licencia

MIT License. Diseñado con pasión para los amantes del conocimiento libre y descentralizado.
