# Integridad e índice: entrega del 5 de noviembre de 2026

Esta entrega avanza los bloques 1 y 2 de la hoja de ruta. No completa los seis bloques ni certifica paridad con Obsidian. Las plataformas objetivo acordadas son Linux, Windows y móvil; esta implementación se valida en Linux y DOM de pruebas.

## Cambios externos y conflictos

Con una bóveda local abierta, la interfaz comprueba cambios cada cinco segundos y al recuperar el foco. La comprobación periódica se pausa cuando la página está oculta. Se reconstruye el índice local, se calcula una huella del árbol y del contenido Markdown y se refrescan árbol/grafo cuando cambia. Se comprueban también los documentos de texto cargados, incluidos Canvas y Excalidraw.

Si un documento no tiene borrador, el contenido externo lo actualiza. Si tiene cambios locales, se conserva el borrador y se pausa su autosave. Una eliminación externa también requiere revisión: no recrea automáticamente el archivo.

La API de guardado exige `check_version: true` y `expected_content` con el contenido base; `null` significa que se espera un archivo ausente. La falta de precondición devuelve **428** y una versión distinta devuelve **409**. El cliente mantiene esa base junto al borrador recuperable. La subida de adjuntos utiliza creación exclusiva y rechaza un nombre existente en vez de sobrescribirlo. Los borradores antiguos que no conservan base requieren comparación antes de guardarse.

El aviso **Comparar versiones** muestra la versión externa, la propuesta local editable y la base. Permite:

- Guardar una combinación revisada, comprobando otra vez la versión externa.
- Usar la versión externa, con confirmación antes de descartar cambios locales.
- Crear una copia del borrador en otra ruta, mediante creación exclusiva.
- Posponer la revisión manteniendo el borrador.

Los autosaves anteriores se cancelan al resolver el conflicto. Si el archivo vuelve a cambiar durante la revisión, se debe actualizar la comparación; el guardado del servidor vuelve a verificarlo.

La exclusión mutua serializa las operaciones de esta instancia de Vault. La comparación de contenido y el reemplazo atómico **no constituyen una transacción con editores externos**: otro proceso puede escribir entre la comprobación y el reemplazo. No hay bloqueo interoperable con cualquier editor, historial de versiones ni coordinación entre servidores independientes. Los conectores remotos siguen sin garantías ETag/CAS de sincronización.

## Recuperar movimientos interrumpidos

La interfaz identifica registros `prepared` en `.jademd/operations/<id>/manifest.json` y ofrece **Restaurar estado anterior**. Antes de ejecutarlo guarda los borradores; si hay conflictos pendientes, deben resolverse primero.

La recuperación comprueba rutas, colisiones y todas las versiones afectadas antes de escribir. Solo acepta contenidos que coinciden con el anterior o el posterior del registro. Revierte los enlaces y el nombre original, reindexa y marca el registro como `recovered`. Una repetición es idempotente y una restauración interrumpida puede reintentarse. Los movimientos revertidos correctamente durante un error ordinario se marcan `rolled_back`.

Si hay cambios posteriores, ambos destinos existen, ambos faltan o el registro es inválido, se detiene y conserva los datos para revisión manual. Los registros se mantienen como evidencia; no hay limpieza automática. La recuperación supervisada no se ejecuta silenciosamente al abrir una bóveda. Las pruebas simulan estados persistidos antes/después de escrituras y del renombrado; no simulan físicamente un corte eléctrico.

## Búsqueda y conexiones

Ejemplos de consultas combinables:

```text
"frase exacta" tag:trabajo path:Notas
tag:trabajo -tag:archivo
[estado:activo] [hecho:false] [numero:3]
[estado] -path:Archivo
file:reunion content:presupuesto
[responsable:"Ana Pérez"]
```

Los términos se combinan con AND; `-` excluye coincidencias. Las etiquetas incluyen sus descendientes (`tag:trabajo` incluye `trabajo/proyecto`). `path:` y `file:` buscan fragmentos de ruta y nombre. Las propiedades superiores admiten existencia, valores escalares y pertenencia en listas. Las comparaciones no distinguen mayúsculas. Una consulta con comillas o corchetes sin cerrar muestra un error y limpia resultados antiguos.

Se devuelven hasta 200 notas, ordenadas por ruta, con hasta 50 líneas de coincidencia por nota. No hay operadores OR, expresiones regulares, comparaciones numéricas de rango ni navegación de propiedades anidadas en esta entrega.

El panel de enlaces muestra destinos salientes resueltos por el resolver contextual y los que faltan. Las menciones buscan título, nombre y alias de dos o más caracteres, con límites de palabra, en notas que todavía no enlazan al documento. Se excluyen código y comentarios mediante el analizador compartido. Se muestran hasta 100 sugerencias con ruta y línea. Son sugerencias: los homónimos pueden requerir revisión. Todavía no hay conversión automática de menciones en enlaces ni salto directo a su línea.

## Comprobación manual

1. Arranca `./run.sh /ruta/a/una/boveda-de-prueba` y abre una nota.
2. Modifícala desde otro editor: sin borrador debe actualizarse en cinco segundos o al volver a la ventana.
3. Escribe en Jademd y cambia el archivo externamente antes del autosave. Comprueba el aviso, el borrador conservado y la comparación. Repite eliminando externamente el archivo.
4. Combina versiones, cambia de nuevo el archivo mientras revisas y verifica el rechazo de la base anterior. Prueba guardar una copia en una ruta existente: debe rechazarse sin sobrescribirla.
5. Prueba las consultas anteriores y comprueba los enlaces salientes y las menciones desde el inspector.

Las pruebas Rust cubren versiones obsoletas, eliminación, escrituras concurrentes dentro de Vault, actualización del índice, recuperación reintentable y rechazo de cambios posteriores. Las pruebas frontend cubren borradores, pausas/cancelaciones del autosave, respuestas tardías, comparación en React, navegación contextual y errores de búsqueda. Continúa pendiente la revisión visual en navegador y la prueba de escala; la reindexación periódica completa tiene coste proporcional al tamaño de la bóveda.

## Continuación acordada

3. Productividad: primer lote implementado de notas diarias y plantillas, marcadores, etiquetas y atajos configurables. Véase [alcance y pruebas](PRODUCTIVIDAD.md).
4. Edición: primer lote implementado de fórmulas, Mermaid, notas al pie, exportación y mejoras Canvas/Excalidraw. Véase [alcance y pruebas](EDICION_AVANZADA.md).
5. Espacio de trabajo con divisiones anidadas y tamaños ajustables. Arrastra el separador o usa las flechas tras enfocarlo. El botón **Espacios guardados** permite guardar y restaurar diseños por bóveda en el navegador.
6. Extensiones y servicios: Bases, API de plugins, sincronización con conflictos, publicación y distribución para **Linux, Windows y móvil**. La capa local actual depende de Linux; su portabilidad necesita implementación y pruebas propias antes de anunciar compatibilidad con otras plataformas.
