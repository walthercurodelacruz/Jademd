# Etapa 2: compatibilidad de documentos

Implementación del 5 de noviembre de 2026. Esta etapa amplía la compatibilidad y preservación de documentos; no certifica paridad completa con Obsidian.

## Contratos implementados

- **Guardado por bloques:** el editor conserva el texto original de los bloques sin cambios. Solo serializa bloques editados o nuevos. Una tabla, comentario, lista con formato propio o sintaxis no representable no se normaliza por editar otro párrafo.
- **Formatos no representables:** permanecen como bloques protegidos, con vista previa y acceso a fuente. Se pueden editar los bloques compatibles del mismo documento. La edición fuente sigue disponible para el documento completo.
- **Encabezado original:** YAML, comentarios, comillas, BOM y saltos CRLF se conservan al editar el cuerpo. Los cambios de propiedades utilizan rangos de la fuente para reemplazar únicamente el valor seleccionado.
- **Propiedades tipadas:** parser YAML completo, números, booleanos, nulos, listas, fechas como texto y estructuras anidadas. Duplicados, ciclos, mapas inválidos y números no finitos impiden editar propiedades automáticamente. No se regenera un encabezado inválido.
- **Referencias internas:** wikilinks y enlaces Markdown locales conservan su representación original. El resolver compartido del backend maneja rutas, alias, encabezados y bloques. Las rutas explícitas de bóveda, relativas `./`/`../` y nombres simples siguen una política determinista; los homónimos ambiguos se rechazan.
- **Adjuntos contextuales:** imágenes y recursos se resuelven con la ruta de la nota que los contiene. No se elige arbitrariamente un adjunto entre varios homónimos.
- **Imágenes pegadas en vivo:** los destinos nuevos codifican espacios y delimitadores para producir Markdown válido. Se reconoce además el formato `Pasted image <fecha>-<uuid>.<extensión>` guardado por versiones anteriores con espacios sin codificar; se representa la imagen conservando literalmente la fuente existente. Las pruebas cubren inserción, guardado, reapertura, URLs ya codificadas, paréntesis y URLs externas con parámetros.
- **Embeds:** una nota, una sección o un bloque pueden mostrarse sin modificar el archivo referenciado ni su enlace. Las referencias anidadas se representan sin iniciar una carga recursiva ilimitada. Fallos y referencias ausentes se muestran en la vista previa.
- **Análisis de metadatos:** Rust y TypeScript comparten fixtures de expectativas. Se excluyen código cercado, código indentado, código inline, comentarios HTML/Obsidian y delimitadores escapados. Los encabezados llevan el número de línea físico del archivo, incluido el frontmatter.
- **Canvas:** se aceptan arrays superiores opcionales. Se conservan campos desconocidos, orden de nodos, grupos, enlaces, subrutas, fondos, lados y extremos de conexiones y colores predefinidos. Guardar datos sin cambios devuelve la fuente original. La interfaz representa grupos y enlaces y respeta geometría/color de conexiones.
- **Excalidraw:** se identifica el dibujo dentro de su región y se rechazan escenas ambiguas o inválidas. Se conserva el texto ajeno al bloque, campos desconocidos de escena/elementos/recursos, opciones de estado no cambiadas y saltos de línea.

Los dibujos o lienzos inválidos ofrecen edición fuente para repararlos; no se sustituyen por documentos vacíos.

## Referencias de formato

- [Enlaces internos de Obsidian](https://obsidian.md/help/links): formatos, encabezados y bloques.
- [Propiedades de Obsidian](https://obsidian.md/help/properties): tipos y almacenamiento YAML.
- [JSON Canvas 1.0](https://jsoncanvas.org/spec/1.0/): nodos, conexiones y colores.

El soporte de estructuras YAML anidadas en Jademd busca preservar los datos importados, no afirmar que el editor de propiedades de Obsidian ofrezca esa misma interfaz.

## Pruebas de aceptación

Las muestras en `tests/fixtures/compatibility` incluyen BOM/CRLF, propiedades complejas, enlaces y alias, comentarios, cercas de código anidadas, listas, tablas, callouts, fórmulas y todos los tipos de nodos Canvas.

- Rust: abrir → leer → guardar → reabrir conserva los bytes UTF-8 de las muestras; metadatos contrastados con expectativas compartidas; resolución contextual y rechazo de homónimos/traversal.
- DOM de pruebas: editor TipTap real con la misma configuración de producción. Apertura/serialización exactas, edición aislada, deshacer, división de párrafos, enlaces, embeds y ausencia de scripts/handlers HTML en las vistas generadas.
- Utilidades: edición dirigida de YAML, preservación de campos Canvas/Excalidraw y selección de la región de dibujo.
- Store: navegación de enlaces, fragmentos y descarte de respuestas antiguas, incluidas referencias desde una nota embebida.

Comprobaciones:

```bash
cargo test --workspace --locked --offline
cargo clippy --workspace --all-targets --locked --offline -- -D warnings
cargo fmt --all -- --check
npm --prefix frontend run test
npm --prefix frontend run build
```

Resultado local final: **24 pruebas Rust y 64 del frontend aprobadas**, compilación del frontend, TypeScript, Clippy estricto y formato Rust correctos. Vite sigue indicando chunks grandes.

## Límites que siguen pendientes

- Las pruebas DOM no son una inspección visual ni una prueba de navegador completo. Persisten pendientes interacción física con Canvas, navegación/scroll, reproducción multimedia y exportación visual.
- Los formatos protegidos requieren fuente para editar su interior. Fórmulas, diagramas, notas al pie y todos los callouts todavía no tienen editores/renderizadores especializados.
- La vista embebida es una lectura puntual: no implementa vigilancia de archivos ni actualización externa automática. Los bloques complejos y encabezados Setext necesitan ampliar la suite.
- La resolución de referencias Markdown por definiciones (`[texto][id]`), todos los escapes y otras variantes avanzadas sigue pendiente.
- Canvas conserva y representa los campos principales; falta la edición completa de conexiones y operaciones de grupos.
- Las propiedades no incluyen aún un registro global de tipos, renombrado/eliminación asistidos ni validación específica de fechas.
- No se realizaron conexiones a WebDAV/Google Drive durante esta etapa ni se cambió el modelo de sincronización.

Los siguientes hitos siguen en la [matriz de paridad](PARIDAD_OBSIDIAN.md).
