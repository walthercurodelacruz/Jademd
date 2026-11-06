# Paridad funcional con Obsidian

Referencia de producto: documentación oficial consultada el 5 de noviembre de 2026:
[funciones integradas](https://obsidian.md/help/plugins),
[vistas y modos de edición](https://obsidian.md/help/edit-and-read),
[Canvas](https://obsidian.md/help/plugins/canvas) y
[Bases](https://obsidian.md/help/bases).

Esta matriz es un inventario y una hoja de ruta. No afirma compatibilidad completa con Obsidian ni con sus plugins. El estado refleja el código local y las pruebas disponibles, no una certificación de equivalencia.

## Contratos de producto

1. **Paridad funcional:** ofrecer los mismos flujos de trabajo, con criterios de aceptación propios y verificables.
2. **Compatibilidad de documentos:** conservar Markdown, YAML, JSON Canvas, adjuntos y campos desconocidos. Abrir o leer nunca escribe. La edición fuente es la alternativa segura mientras un formato no pueda editarse fielmente en vivo.
3. **Extensibilidad:** un sistema propio de extensiones y la ejecución de plugins existentes son compromisos distintos. La compatibilidad con la API de Obsidian continúa pendiente de diseño y pruebas; no se debe anunciar como implementada.
4. **Servicios:** WebDAV y Google Drive son capacidades adicionales de Jademd. No equivalen por sí mismos a sincronización con historial, conflictos o cifrado.

Estados: **V** = comportamiento delimitado verificado por pruebas; **I** = implementado, pendiente de validación visual/integración; **P** = parcial; **N** = pendiente. Una fila V no acredita todo el módulo.

## Fundamentos e integridad

| Función o contrato | Estado | Siguiente criterio de aceptación |
|---|---|---|
| Lectura sin escrituras automáticas | P | Store probado con carga lenta; completar prueba de navegador sobre Canvas existente |
| Respuestas de apertura fuera de orden | V | Mantener pruebas A/B, reapertura A/A y cambio de bóveda |
| Guardado de notas vacías | V | API y store aceptan contenido vacío |
| Guardado pendiente tras cerrar una pestaña | V | La cola del documento sobrevive al cierre |
| Recuperación ante fallo de guardado | V | Error propagado, borrador retenido y reintento probado |
| Recuperación local tras recarga | P | Persistencia por bóveda implementada; probar recarga y cuotas en navegador |
| Creación sin sobrescritura | V | Dos creaciones concurrentes conservan un solo original |
| Escritura atómica local | P | Reemplazo con archivo temporal y sync; falta simulación de corte de proceso |
| Aislamiento de rutas y symlinks | V | Lectura y escritura por symlink/traversal rechazadas; árbol sin ciclos |
| API local con sesión | V | Token/cookie, orígenes y Host comprobados por pruebas de handlers |
| Conflictos con editores externos u otros clientes | P | Guardados condicionados, comparación y copias probados; falta coordinación transaccional con otros procesos/servidores |
| Historial y recuperación de archivos | N | Restaurar versiones sin depender del almacenamiento del navegador |

## Archivos, edición y navegación

| Capacidad | Estado | Siguiente criterio de aceptación |
|---|---|---|
| Explorador y creación de notas/carpetas | P | Operaciones coherentes, selección, orden y errores visibles |
| Renombrar y mover con actualización de enlaces | P | Bóvedas locales y referencias compatibles probadas; ampliar sintaxis y recuperación tras corte de proceso |
| Papelera y restauración | V | Notas, carpetas y adjuntos locales recuperables; colisiones rechazadas |
| Pestañas y documentos abiertos | P | Fijación, arrastre y persistencia implementados; ampliar accesibilidad y QA de recarga en navegador |
| Paneles independientes y divisiones | P | Hasta cuatro paneles con divisiones anidadas, tamaños ajustables e historial propio. Pendiente validación visual en navegador |
| Navegación atrás/adelante | V | Historial por panel con secciones, independiente del navegador, probado en store y DOM |
| Fuente Markdown | I | Edición literal, atajos y navegación probados en navegador |
| Edición en vivo | P | Guardado por bloques y preservación verificados en DOM; faltan editores especializados de formatos protegidos |
| Lectura sin edición | I | Seleccionar/copiar/navegar sin generar escrituras |
| Fuente con lectura simultánea | I | Vista previa actualizada sin perder cursor ni cambios |
| YAML y propiedades tipadas | P | Parser completo y edición dirigida de valores verificados; faltan registro global de tipos y operaciones de propiedades |
| Wikilinks, alias, encabezados y bloques | P | Resolver común y navegación implementados; ampliar variantes y validación visual |
| Embeds de notas y secciones | P | Lectura de nota/sección/bloque probada en DOM; falta actualización al cambiar externamente el original |
| Tablas, tareas y formato básico | P | Pruebas de ida y vuelta por formato y por modo |
| Callouts, comentarios y resaltado | P | Preservación y representación fiel en lectura y vivo |
| Fórmulas matemáticas | P | KaTeX inline/bloque, edición y preservación probadas; ampliar variantes anidadas y QA visual |
| Diagramas Mermaid | P | Render real, edición de código, errores y preservación probados; no se admiten configuraciones por documento |
| Notas al pie y su panel | P | Referencias explícitas, numeración, definiciones, navegación y edición probadas; falta panel e inline footnotes |
| Imágenes y adjuntos | P | Resolución relativa, homónimos, pegado y arrastre sin sobrescritura |
| PDF | I | Visor conectado; falta validar navegador, navegación y anotaciones/enlaces |
| Audio y vídeo | P | Reproducción y conservación de embeds probadas en navegador |
| Exportación e impresión | P | Original, HTML con recursos locales y diálogo de impresión/PDF; faltan lotes y QA de paginación |
| Atajos configurables | P | Registro de comandos, captura y colisiones probados; faltan atajos internos del editor, secuencias y QA por plataforma |

## Conocimiento y productividad

| Capacidad | Estado | Siguiente criterio de aceptación |
|---|---|---|
| Grafo con identidad por ruta | V | Notas homónimas separadas y enlaces relativos/alias comprobados |
| Backlinks tras editar y borrar | V | No conservar conexiones antiguas |
| Grafo global/local, filtros e interacción | P | Navegar por ruta y medir fluidez con bóvedas representativas |
| Menciones no enlazadas y enlaces salientes | P | Destinos contextuales y sugerencias por título/alias implementados; falta conversión a enlace y salto a línea |
| Índice coherente al reindexar | V | Archivos desaparecidos y contenido oculto no permanecen en búsqueda |
| Detección de cambios externos | P | Comprobación local cada cinco segundos y al recuperar foco; faltan watcher incremental y pruebas de escala |
| Búsqueda global | P | Texto, etiquetas, rutas, propiedades y exclusiones probados; faltan OR, rangos, regex y clasificación por relevancia |
| Selector rápido | P | Navegación por teclado y creación segura desde resultados |
| Esquema y estadísticas | P | Exclusión de código/comentarios y líneas físicas verificadas con fixtures compartidos; faltan variantes avanzadas |
| Panel de etiquetas | V | Contadores por nota con ancestros, filtro y búsqueda comprobados en núcleo y DOM |
| Marcadores | P | Documentos persistidos por bóveda con remapeo; faltan grupos, búsquedas y secciones |
| Notas diarias | V | Fecha local, selector de fecha, carpeta y plantilla, creación exclusiva y apertura sin sobrescritura probadas |
| Plantillas | P | Variables fecha/hora/título e inserción de cuerpo al final probadas; faltan inserción en cursor y variantes avanzadas |
| Paleta y comandos con `/` | P | Paleta Ctrl+Shift+P con filtro y teclado; comandos `/` y atajos configurables pendientes |
| Composición, división y fusión de notas | N | Mantener referencias y dar opción de deshacer |
| Nota aleatoria y nombres únicos | N | Excluir formatos no apropiados y evitar colisiones |
| Grabación de audio | N | Permisos, almacenamiento y vínculo al documento |
| Presentaciones desde notas | N | Navegación y exportación sin modificar el original |
| Bases y vistas de propiedades | P | Archivos .base con tablas, listas, filtros anidados, fórmulas básicas y orden. Las propiedades se editan al abrir la nota. Pendientes agrupación, resúmenes y funciones avanzadas |
| Visor web | N | Aislamiento y navegación de contenido externo |

## Canvas, extensiones, servicios y plataformas

| Capacidad | Estado | Siguiente criterio de aceptación |
|---|---|---|
| JSON Canvas | P | Creación de tipos estándar, propiedades, duplicación, borrado, conexiones y vista previa probados; faltan edición completa, undo y QA visual |
| Excalidraw | P | Preservación, inicialización sin autosave, actualización compartida y exportaciones ampliadas; falta validar biblioteca gráfica en navegador |
| Espacios de trabajo | P | Sesión automática y hasta 20 espacios nombrados por bóveda en el navegador. Pendiente exportación de diseños |
| Ajustes, temas y snippets CSS | P | Configuración persistente por usuario/bóveda y personalización segura |
| Sistema propio de plugins | N | API versionada, ciclo de vida, permisos y aislamiento |
| Compatibilidad de plugins existentes | N | Definir API objetivo y una suite de plugins de referencia |
| WebDAV (Nextcloud) | P | Recorrido de subcarpetas, índice y escrituras condicionadas. Pendiente validar con una cuenta real |
| Carpetas compartidas (SMB/Samba) | P | Apertura como ruta montada en Linux. Pendiente validar guardado y bloqueos entre dos clientes SMB |
| Google Drive | Fuera de alcance | Conector existente. Se descartan nuevas mejoras y validaciones de Drive para este plan |
| Sincronización entre dispositivos | N | Conflictos, eliminaciones, historial, funcionamiento sin conexión y seguridad |
| Publicación | P | Exportación HTML estática de notas seleccionadas con enlaces internos y adjuntos opcionales. Pendientes alojamiento y permisos de publicación |
| Enlaces URI, CLI y captura web | N | Contratos de apertura, automatización y captura documentados |
| Escritorio y móvil | P | Paquete local para Linux de la arquitectura de compilación. Pendientes Windows, móvil y sus validaciones |

## Hitos y dependencias

1. **Integridad y seguridad:** primer lote implementado. Las pruebas automatizadas pasan; resta validación visual y ampliar los escenarios de conflictos y recuperación.
2. **Compatibilidad:** lote implementado y probado con fixtures compartidos y editor real en DOM. Ver [alcance y límites](COMPATIBILIDAD_DOCUMENTOS.md); las variantes avanzadas y la QA visual continúan pendientes.
3. **Trabajo cotidiano:** primer lote implementado: movimientos locales, papelera, historial por panel, divisiones, pestañas y paleta. Ver [alcance, pruebas y límites](TRABAJO_COTIDIANO.md). Continúan pendientes los escenarios avanzados y la validación visual en navegador.
4. **Índice y conocimiento:** lote implementado con detección periódica, conflictos, recuperación supervisada, filtros de búsqueda y conexiones. Ver [alcance y límites](INTEGRIDAD_CONOCIMIENTO.md). Continúan pendientes el watcher incremental y las variantes avanzadas.
5. **Productividad y extensiones:** primer lote de productividad implementado y probado; ver [alcance y límites](PRODUCTIVIDAD.md). Se añadió también el [lote de edición avanzada y exportación](EDICION_AVANZADA.md). Las herramientas restantes y la API de extensiones siguen pendientes.
6. **Servicios y distribución:** nube completa, sincronización/publicación equivalentes, pruebas de escala y empaquetado. Plataformas objetivo acordadas: Linux, Windows y móvil; solo Linux está validado actualmente.

Cada cambio debe actualizar esta matriz y añadir pruebas de comportamiento cuando afecte integridad o compatibilidad. Ningún hito se declara completo únicamente porque compile o por tener un botón en la interfaz.
