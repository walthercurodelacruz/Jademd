# Etapa 3: trabajo cotidiano

## Cambios disponibles

- Se retiró la barra duplicada de LiveView que mostraba nombre, flechas, guardado y pantalla completa. El encabezado principal conserva el estado, los modos y la pantalla completa; sus flechas usan ahora el historial de Jademd.
- Cada panel tiene pestañas, selección e historial propios. Se pueden abrir hasta cuatro paneles en horizontal o vertical. Dos paneles con el mismo documento comparten contenido y cola de guardado.
- Las pestañas permiten fijación y reordenamiento por arrastre dentro del panel. Cerrar pestañas o paneles conserva los guardados pendientes.
- La sesión se conserva por bóveda en el almacenamiento del navegador: paneles, pestañas, fijaciones, historial, panel activo y modos de nota.
- `Ctrl+Shift+P` abre la paleta: filtro, flechas, Enter y Escape. Incluye creación, búsqueda, divisiones, navegación, modos, guardado, grafo y operaciones de archivos. `Alt+←/→` recorre el historial y `F2` renombra o mueve el documento activo.
- El lápiz del explorador abre el mismo diálogo para archivos y carpetas. El destino es una ruta relativa completa. Se guardan primero los borradores y después se actualizan pestañas, historial e índice.
- El borrado desde el explorador mueve a la papelera de la bóveda. La paleta y la barra de actividad permiten abrirla y restaurar al destino original, rechazando colisiones.

## Operaciones sobre archivos

Movimiento, papelera y restauración requieren una bóveda local. Se validan rutas y symlinks, y el renombrado nativo rechaza destinos existentes. Se actualizan wikilinks y enlaces Markdown locales compatibles, sus embeds, y los campos `file` y `background` de nodos Canvas. Se conservan alias, anclas y campos JSON desconocidos; los bloques de código y comentarios no se reescriben.

Antes del movimiento se preparan los cambios y se conserva un registro con contenido anterior y posterior en `.jademd/operations/<id>/manifest.json`. Ante errores detectados se intenta revertir sin pisar cambios externos. Un error de recuperación indica la ruta del registro. Las operaciones interrumpidas se detectan en la interfaz y permiten restauración supervisada; véase [integridad y recuperación](INTEGRIDAD_CONOCIMIENTO.md). No se debe interpretar como una transacción frente a otros procesos ni como historial de versiones.

La papelera guarda manifiestos y contenido en `.jademd/trash/<id>/`. Tras restaurar, la entrada deja de aparecer. No hay purga ni restauración a una ruta alternativa en esta entrega. Los enlaces hacia un elemento enviado a la papelera permanecen en las notas y recuperan su resolución al restaurarlo. El endpoint legado `DELETE /api/note` continúa borrando permanentemente; la interfaz utiliza `POST /api/trash`.

## Cómo probarlo

Desde la raíz, con los requisitos del README instalados:

```bash
./run.sh /ruta/a/una/boveda-de-prueba
```

Abre <http://127.0.0.1:3030>. Si el servidor ya estaba ejecutándose con una compilación anterior, detenlo y vuelve a ejecutar el comando. Una recarga completa actualiza la interfaz compilada.

1. Crea `A.md` y `B.md`, abre ambas y usa las flechas del encabezado o `Alt+←/→`. La navegación debe cambiar notas sin abandonar la aplicación.
2. Divide a la derecha, deja una nota distinta en cada panel y edita alternativamente. Abre la misma nota en ambos para comprobar que el contenido se comparte.
3. Fija una pestaña, arrastra otra para reordenarla y recarga. Comprueba paneles, pestañas, selección y modos restaurados.
4. Escribe en una nota y cierra su pestaña o panel inmediatamente. Vuelve a abrirla y verifica el último cambio.
5. Añade en `B.md` un enlace `[[A#Título|Alias]]` y un enlace `[A](A.md)`. Renombra `A.md` con `F2` a `Notas/Nueva.md`. Comprueba enlaces, pestañas, búsqueda y backlinks.
6. Envía la nota o una carpeta a la papelera y restáurala desde la paleta. Si recreas primero el destino, la restauración debe rechazarlo y mantener el contenido en la papelera.
7. Abre `Ctrl+Shift+P`, filtra un comando y ejecútalo con Enter. Verifica también los botones de división y la ausencia de la barra duplicada de la captura.

## Verificación y límites

Las pruebas automatizadas cubren el store, persistencia y sanitización de sesión, componentes React en DOM, historial y anclas por panel, enlaces simultáneos, edición compartida, cierres con borradores, movimiento con actualización de referencias, conservación de bytes, colisiones, symlinks, reversión ante fallo y recorrido autenticado de la API. No sustituyen una revisión visual en navegador real.

El diseño de paneles utiliza un solo eje y tamaños iguales: no admite divisiones anidadas, ajuste de tamaño ni arrastre entre paneles. La sesión pertenece al navegador y no se sincroniza entre dispositivos. La fijación evita cerrar la pestaña desde su botón; no impide eliminar el archivo. La paleta todavía no ofrece comandos `/` ni atajos configurables.

La reescritura de enlaces no cubre toda sintaxis de Markdown, referencias de plugins, enlaces contenidos en propiedades arbitrarias ni recursos internos de dibujos Excalidraw. Los enlaces ambiguos o no resueltos se conservan. Los documentos Canvas modificados se serializan como JSON indentado. Cambiar una extensión mediante renombrado no convierte su formato. La detección periódica de cambios, comparación de conflictos y recuperación supervisada se describen en [la siguiente entrega](INTEGRIDAD_CONOCIMIENTO.md). El watcher incremental y la recuperación automática tras corte de proceso continúan pendientes.
