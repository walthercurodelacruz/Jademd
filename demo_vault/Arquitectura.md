---
title: Arquitectura de Jademd
tags: [arquitectura, rust, react]
---
# Arquitectura de Jademd

El sistema está diseñado en capas completamente desacopladas:

1. **Capa de Almacenamiento (OpenDAL):**
   Unifica el sistema de archivos local y el acceso a nubes como [[Nextcloud]] y Google Drive bajo una misma interfaz.
2. **Motor de Grafo (Petgraph):**
   Calcula en tiempo real los enlaces bidireccionales y las conexiones entre notas.
3. **Editor Extensible:**
   Desarrollado sobre CodeMirror 6 con autocompletado de wikilinks y fórmulas KaTeX.

Referencia: Volver a [[Bienvenida]] o ver [[Rust Core]].
