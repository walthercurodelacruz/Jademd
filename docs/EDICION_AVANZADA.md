# Edición avanzada, exportación y mejoras de lienzos

Entrega del 5 de noviembre de 2026. Esta etapa añade funciones delimitadas y verificadas; no declara equivalencia completa con Obsidian, Canvas o su plugin Excalidraw.

## Fórmulas, Mermaid y notas al pie

En edición en vivo hay botones **Fórmula**, **Diagrama** y **Nota al pie**. También pueden escribirse los formatos desde código fuente y verse en lectura o en vista dividida.

- Fórmulas inline: `$x^2 + 1$`. Fórmulas de bloque: `$$` al principio y al final del bloque. KaTeX representa el contenido y muestra los errores en el bloque afectado. La fórmula inline se edita pulsándola; los bloques ofrecen un editor de código con Aplicar/Cancelar.
- Diagramas: bloques cercados con lenguaje `mermaid`. Se usa Mermaid 11.17.2 como dependencia directa, con carga diferida. La vista ofrece edición del bloque original, sin convertirlo en una imagen dentro del Markdown.
- Notas al pie: referencias `[^identificador]` y definiciones `[^identificador]: contenido`, con continuaciones indentadas. Las referencias se numeran por orden de aparición, incluyendo las repetidas; el identificador original se conserva en el archivo. Se puede saltar a la definición y volver a la primera referencia. El botón de inserción crea referencia y definición con un identificador único.

Los nodos mantienen la fuente original. Abrir, representar o navegar no guarda. Editar otro párrafo conserva fórmulas, diagramas, notas al pie, BOM, CRLF y otros bloques sin cambios. La edición explícita del código de un bloque sí reemplaza su contenido. Código cercado, código inline, delimitadores escapados y los casos de moneda probados permanecen literales.

KaTeX usa `trust: false`, expansión limitada y errores visibles. Mermaid usa `securityLevel: strict` y produce una imagen SVG aislada del DOM de la nota. No se aceptan directivas de configuración o frontmatter de configuración Mermaid en esta vista; los errores mantienen el código disponible. Se limitan los diagramas a 50 000 caracteres y 1 000 conexiones. Referencias técnicas: [opciones de KaTeX](https://katex.org/docs/options) y [uso y niveles de seguridad de Mermaid](https://mermaid.js.org/config/usage).

El alcance comprobado usa bloques superiores y referencias explícitas. No incluye notas al pie inline `^[texto]`, un panel especializado de notas al pie, todas las combinaciones de bloques anidados, macros matemáticas compartidas entre bloques ni configuración Mermaid por documento. La edición fuente sigue disponible para las variantes no representadas.

## Exportación de documentos

El encabezado principal y la paleta incluyen **Exportar documento**:

- **Descargar original:** copia el contenido actual del documento de texto, incluidos borradores sin guardar. Los archivos binarios se descargan desde el endpoint de adjuntos, evitando generar una copia vacía desde el snapshot del editor.
- **Descargar HTML:** representa el cuerpo de la nota, incorpora imágenes y medios locales como datos y conserva los diagramas como SVG en imagen. Las fórmulas se exportan como MathML, sin depender de las fuentes de KaTeX de la aplicación. Se conservan enlaces de ida y vuelta de notas al pie.
- **Imprimir / PDF:** abre el HTML en otra ventana y utiliza el diálogo de impresión del navegador. El usuario elige impresora o guardar como PDF.

La exportación lee una instantánea del documento al pulsar el botón y no guarda la nota. Los adjuntos locales tienen un límite agregado de 50 MB; un fallo de carga o representación se informa en lugar de omitir el recurso silenciosamente. Las imágenes externas conservan su URL y requieren conexión. El HTML incluye una política que impide scripts y evita controles de edición.

El HTML no incluye el YAML como tabla de propiedades ni exporta automáticamente todas las notas enlazadas de la bóveda. Los wikilinks salientes no constituyen un sitio navegable completo. La impresión depende del navegador, su soporte MathML, sus permisos de ventanas y sus opciones de página. No hay generación de PDF en servidor, DOCX, exportación por lotes ni garantía de paginación editorial en esta entrega.

## Canvas

Además de tarjetas de texto, se pueden añadir grupos, archivos y enlaces HTTP/HTTPS. Pulsar una tarjeta abre sus propiedades: posición, dimensiones, color y campos correspondientes al tipo. Se pueden duplicar tarjetas y eliminar una tarjeta con sus conexiones.

El inspector crea conexiones entre tarjetas con lados de origen/destino y etiqueta; también permite cambiar la etiqueta o quitar una conexión. **Vista previa** representa el Markdown de las tarjetas y las imágenes vinculadas se muestran dentro de su tarjeta. **Ajustar vista** encuadra los nodos, incluidos los que tienen coordenadas negativas. Los grupos se dibujan detrás de otras tarjetas y las flechas tienen identificadores propios por panel. El arrastre usa las coordenadas relativas del lienzo.

Las operaciones conservan campos JSON desconocidos en raíz, nodos y conexiones. Seleccionar o navegar no encola una escritura si el contenido no cambió. Las pruebas cubren creación y eliminación de tarjetas y conexiones, campos desconocidos, lados y encuadre.

Quedan pendientes arrastre táctil completo, selección múltiple, deshacer/rehacer propio del lienzo, movimiento conjunto de grupos y sus miembros, redimensionamiento mediante tiradores, edición de todas las opciones de conexiones y exportación visual específica del Canvas. La descarga original sigue disponible desde el encabezado.

## Excalidraw

Las exportaciones PNG, SVG y portapapeles permiten elegir fondo y modo oscuro. Sus fallos se muestran en pantalla. **Descargar escena editable** genera un archivo `.excalidraw` con elementos, recursos y campos conservados, sin el envoltorio Markdown de una nota.

Un archivo inválido muestra un error y acceso a fuente, en lugar de quedarse cargando. La detección de cambios compara el contenido de los elementos, de modo que también reconoce ediciones externas que no incrementan sus números de versión. La API del dibujo recibe el contenido compartido más reciente cuando termina de inicializarse.

Los callbacks de inicialización o normalización no se guardan automáticamente: el guardado comienza tras una interacción del usuario y conserva los cambios sucesivos de un arrastre. Los recursos y los campos desconocidos siguen pasando por el serializador de preservación. La biblioteca gráfica completa requiere QA visual; las pruebas de esta integración usan un componente controlado para simular sus callbacks, además de pruebas del formato real.

## Cómo probarlo

1. Reinicia `./run.sh /ruta/a/una/boveda-de-prueba` y recarga la página.
2. Inserta una fórmula y un diagrama desde la barra de edición en vivo; cambia su código y usa deshacer. Prueba un error LaTeX o Mermaid y comprueba que el resto de la nota sigue disponible.
3. Inserta una nota al pie, edita su definición y navega en ambos sentidos desde lectura. Reabre la nota para comprobar su conservación.
4. Exporta HTML con una imagen local, fórmula, diagrama y nota al pie. Abre el archivo descargado y prueba los enlaces. Usa Imprimir/PDF para revisar la paginación del navegador.
5. En un Canvas, crea grupo y tarjetas, modifica dimensiones/color, crea una conexión, duplica y elimina una tarjeta. Comprueba la vista previa y el encuadre.
6. En Excalidraw, realiza un arrastre continuo y reabre el dibujo; comprueba el último punto. Exporta con y sin fondo y descarga una escena editable. Prueba también un archivo inválido y su reparación en fuente.

Las pruebas automatizadas incluyen KaTeX y Mermaid reales en DOM (con métricas SVG simuladas), preservación de fuente, errores, edición y deshacer de bloques, exportación de recursos, navegación de notas al pie e integración React de Canvas/Excalidraw. No sustituyen una revisión en navegador real ni validan todavía Windows o móvil.
