# Productividad: notas diarias, plantillas, marcadores, etiquetas y atajos

Entrega del 5 de noviembre de 2026. Se abre desde el botón **Productividad y atajos** de la barra lateral, la paleta o `Ctrl/⌘+,`. Las preferencias pertenecen a la bóveda y al navegador; todavía no se sincronizan ni se escriben en archivos de configuración compartidos.

## Notas diarias

- `Ctrl/⌘+Shift+D` y el comando **Abrir nota diaria de hoy** abren la fecha local del navegador.
- El panel permite seleccionar otra fecha. El nombre es `AAAA-MM-DD.md` y la carpeta predeterminada es `Diario`; puede cambiarse o dejarse vacía para usar la raíz.
- Si la nota existe, se abre sin aplicar de nuevo la plantilla ni sobrescribirla. Si falta, se crea exclusivamente. Si otro cliente la crea al mismo tiempo, se abre su versión.
- Puede configurarse una nota Markdown como plantilla diaria. Se copia su contenido completo, incluido YAML, sustituyendo `{{date}}`, `{{time}}` y `{{title}}`. Sin plantilla se crea un encabezado con la fecha.
- Primero se guardan los borradores pendientes. Si falla ese guardado o la plantilla no se puede leer, no se crea una nota vacía. Las llamadas simultáneas de apertura se agrupan mientras hay una operación diaria en curso.

La fecha usa el calendario local, no una conversión UTC. `{{date}}` y el título de la nota diaria corresponden a la fecha seleccionada; `{{time}}` usa la hora de creación. No hay formato de fecha configurable, notas semanales ni mensuales en esta entrega.

## Plantillas

El panel enumera las notas `.md` de `Plantillas` y sus subcarpetas; la carpeta es configurable. Se excluyen los dibujos `.excalidraw.md`. Las plantillas siguen siendo archivos Markdown normales, editables desde el explorador.

**Insertar plantilla** añade el cuerpo al final de la nota Markdown activa. Conserva las propiedades de la nota de destino y no importa el YAML de la plantilla. Usa el borrador más reciente aunque haya cambiado mientras se cargaba la plantilla. Los saltos de línea insertados siguen el estilo del destino y el guardado utiliza las comprobaciones de versión existentes. En modo lectura, en dibujos o si se cambia de bóveda durante la carga, se rechaza la inserción.

Variables admitidas: `{{date}}`, `{{time}}`, `{{title}}`; las desconocidas permanecen literales. No hay ejecución de código, inserción en el cursor, mezcla automática de propiedades ni variables de plugins externos.

## Marcadores y etiquetas

Los marcadores guardan rutas de documentos por bóveda. Se pueden alternar desde el panel o con `Ctrl/⌘+Shift+B`. Al mover o renombrar desde Jademd, las rutas de marcadores y de plantillas se actualizan; la recuperación supervisada aplica el cambio inverso. Un fallo al conservar preferencias se informa sin presentar un movimiento ya confirmado como fallido. Se admiten hasta 500 marcadores.

Enviar un documento a la papelera conserva su marcador para poder usarlo después de restaurar. Los movimientos realizados por otro programa no remapean marcadores automáticamente. Todavía no se guardan búsquedas, secciones o grupos de marcadores.

El panel de etiquetas muestra el número de notas que contienen cada etiqueta del índice. Una nota cuenta una sola vez por etiqueta, aunque la repita en YAML o en el cuerpo. Las etiquetas superiores incluyen a sus descendientes y aparecen con jerarquía visual. Pulsar una etiqueta abre la búsqueda compartida `tag:"etiqueta"`. La actualización externa depende de la comprobación periódica del índice ya implementada.

## Comandos y atajos

La paleta y los atajos utilizan el mismo registro. Las preferencias permiten sustituir una combinación, desactivar un comando o restablecer todos los valores predeterminados. Se comprueban colisiones, incluidos los alias de búsqueda `Ctrl/⌘+O`, `Ctrl/⌘+K` y `Ctrl/⌘+F`. Para liberar cualquiera de esos alias puede desactivarse o reasignarse el comando de búsqueda.

El campo de captura no ejecuta el comando que se está configurando. Los diálogos conservan sus teclas de edición; la paleta puede alternarse con su combinación configurada. `Ctrl/⌘+S` guarda los borradores pendientes de todos los paneles desde un único manejador. Se eliminaron los manejadores globales duplicados de búsqueda y guardado.

Solo se admiten combinaciones con Ctrl/⌘, Alt o teclas de función. Copiar, pegar, cortar, seleccionar todo, deshacer/rehacer y los atajos básicos de formato están reservados. No se reconfiguran los atajos internos de Tiptap/CodeMirror; tampoco hay secuencias de varias pulsaciones ni resolución de atajos reservados por el sistema operativo o navegador. La aplicación y el resto de las plataformas todavía requieren pruebas visuales y de teclado reales.

## Comprobación manual

1. Reinicia `./run.sh /ruta/a/una/boveda-de-prueba` y abre **Productividad y atajos**.
2. Crea `Plantillas/Diario.md` con un encabezado `# {{date}}` y algo de contenido. Configúrala como plantilla diaria, abre una fecha y edita la nota. Ábrela de nuevo: el contenido debe conservarse.
3. Crea otra plantilla con `## {{title}}` y `{{time}}`. Insértala en una nota con propiedades YAML y comprueba que estas siguen intactas.
4. Marca un documento, cambia de bóveda y vuelve. Renómbralo desde Jademd y comprueba la nueva ruta del marcador.
5. Añade `#trabajo/proyecto` a dos notas, repitiéndola en una. Comprueba los contadores y la búsqueda al pulsar la etiqueta.
6. En **Atajos**, intenta asignar `Ctrl/⌘+O` a otro comando: debe mostrarse la colisión. Asigna una combinación libre, cierra el diálogo y comprueba que funciona y que la anterior dejó de ejecutarse.

Las pruebas automatizadas cubren fechas locales, creación diaria sin sobrescritura, fallos de guardado y plantillas ausentes, inserción sobre borradores recientes, cambio de bóveda, persistencia y remapeo de marcadores, cuotas de almacenamiento, captura de atajos, colisiones y navegación desde etiquetas. Las pruebas DOM no sustituyen la validación en navegador real.
