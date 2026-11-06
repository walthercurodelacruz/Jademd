# Primer lote de correcciones

5 de noviembre de 2026. Implementación inicial del plan de paridad; no representa paridad completa con Obsidian.

## Cambios

- Estado explícito de carga/error/listo. El editor no se monta mientras se lee el documento.
- Canvas sin escritura durante la apertura. Errores de JSON bloquean edición y se conservan campos desconocidos.
- Aperturas identificadas por secuencia y bóveda; respuestas antiguas no sustituyen el documento activo.
- Borradores por documento y bóveda; persistencia local cuando el navegador lo permite. La cola de autoguardado sobrevive al desmontaje del editor y al cierre de pestañas.
- Escrituras por documento en orden, notas vacías admitidas, errores propagados y reintento visible. Cambiar de bóveda espera los guardados y se cancela si fallan.
- Aviso al cerrar la ventana con cambios pendientes. Esto no sustituye al historial ni a la resolución de conflictos.
- Escrituras locales mediante temporal, sincronización y reemplazo atómico. Creación exclusiva para no sobrescribir notas existentes.
- Operaciones locales Linux mediante descriptores y `openat2`: rutas relativas y sin seguimiento de symlinks. Se rechaza texto no UTF-8 para evitar conversiones destructivas.
- Sesión aleatoria en la API, autenticación por cabecera/cookie HttpOnly, restricciones de origen y Host y aislamiento CSP de adjuntos.
- Eliminación del HTML interpolado en mensajes de error de imágenes.
- Grafo identificado por ruta, resolución de enlaces relativos/alias/encabezados, reemplazo de conexiones y eliminación de referencias obsoletas. Reindexación reconstruye la caché.
- Navegación del grafo y backlinks adaptada a rutas. El dibujo del grafo lee el estado visual actual y vacía nodos cuando no quedan resultados.
- La interfaz respeta la bóveda elegida por CLI; elimina la ruta personal fija. Los errores al abrir bóvedas permanecen visibles en el modal.
- Modos fuente, lectura, edición enriquecida y fuente con lectura conectados al documento. La lectura no permite editar; notas que el editor enriquecido no puede preservar ofrecen edición fuente.
- Visor PDF integrado en el flujo de documentos; archivos Excalidraw visibles en el árbol local.
- Excalidraw con parseo estricto, conservación de campos y saltos CRLF; cambios de fondo y recursos cuentan para el guardado. Dibujo cargado bajo demanda.
- Peticiones de búsqueda antiguas no sustituyen resultados nuevos.
- Lanzador recompila fuentes actuales y comprueba el arranque; lock Rust preparado para incorporarse a Git y ya no ignorado; requisitos Node explícitos; workflow CI preparado.

## Verificación

Pruebas de store con respuestas retardadas y errores simulados; pruebas de preservación Canvas/Excalidraw; pruebas Rust de creación concurrente, rutas, symlinks, índice y grafo; pruebas in-process de handlers HTTP autenticados.

Comandos:

```bash
cargo test --workspace --locked --offline
cargo clippy --workspace --all-targets --locked --offline -- -D warnings
cargo fmt --all -- --check
cd frontend
npm run test
npm run build
```

Resultado local: 21 pruebas Rust y 40 del frontend aprobadas; Clippy estricto, formato Rust, TypeScript y build del frontend correctos. Vite sigue avisando de chunks grandes. No se ejecutó una prueba visual completa ni se validó la conexión con proveedores remotos. El workflow se creó localmente; no se ejecutó en GitHub durante esta sesión.

## Pendientes y límites

- Edición en vivo equivalente a Obsidian, incluidas sintaxis y extensiones aún no representables. La protección de fuente conserva el documento mientras se completa esta capacidad.
- Prueba visual de Canvas, PDF, editor, fuentes y exportación de dibujos.
- Conflictos entre clientes/editores externos, historial de archivos y recuperación independiente del navegador.
- Recorrido/indexación remotos completos, sincronización y pruebas con servicios reales. La creación exclusiva remota depende del soporte del proveedor y falla si no lo ofrece; no se degrada a una sobrescritura.
- Seguimiento de cambios externos, operaciones de mover/renombrar con enlaces, paneles independientes y demás filas de la [matriz de paridad](PARIDAD_OBSIDIAN.md).
- Empaquetado y acceso de escritorio portables. El archivo `.desktop` heredado no fue instalado.
- Rendimiento con grandes bóvedas. El grafo reconstruye conexiones para resolver notas que aparecen/desaparecen y necesita mediciones antes de optimizarse.
- El confinamiento local utiliza Linux con `openat2` (kernel 5.6 o posterior); no se añadió un fallback que reduzca estas garantías.

La auditoría inicial se conserva en `REPORTE_ESTADO.md` como referencia histórica.
