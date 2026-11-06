use crate::models::{HeadingItem, NoteMetadata};
use regex::Regex;
use std::sync::OnceLock;

static WIKILINK_RE: OnceLock<Regex> = OnceLock::new();
static TAG_RE: OnceLock<Regex> = OnceLock::new();
static HEADING_RE: OnceLock<Regex> = OnceLock::new();
static FRONTMATTER_RE: OnceLock<Regex> = OnceLock::new();

fn wikilink_regex() -> &'static Regex {
    WIKILINK_RE.get_or_init(|| Regex::new(r"(!)?\[\[([^\|\]]+)(?:\|([^\]]+))?\]\]").unwrap())
}

pub fn is_attachment(target: &str) -> bool {
    let lower = target.split('#').next().unwrap_or(target).to_lowercase();
    lower.ends_with(".png")
        || lower.ends_with(".jpg")
        || lower.ends_with(".jpeg")
        || lower.ends_with(".gif")
        || lower.ends_with(".svg")
        || lower.ends_with(".webp")
        || lower.ends_with(".avif")
        || lower.ends_with(".bmp")
        || lower.ends_with(".ico")
        || lower.ends_with(".pdf")
        || lower.ends_with(".mp4")
        || lower.ends_with(".webm")
        || lower.ends_with(".mov")
        || lower.ends_with(".mp3")
        || lower.ends_with(".wav")
        || lower.ends_with(".ogg")
        || lower.ends_with(".m4a")
        || lower.ends_with(".canvas")
        || lower.ends_with(".excalidraw")
        || lower.ends_with(".excalidrawlib")
}

fn tag_regex() -> &'static Regex {
    TAG_RE.get_or_init(|| Regex::new(r"(?:^|\s)#([\p{L}\p{N}_\-/]+)").unwrap())
}

fn heading_regex() -> &'static Regex {
    HEADING_RE.get_or_init(|| Regex::new(r"^ {0,3}(#{1,6})[ \t]+(.*)$").unwrap())
}

fn frontmatter_regex() -> &'static Regex {
    FRONTMATTER_RE.get_or_init(|| {
        Regex::new(r"(?s)\A[\x{FEFF} \t\r\n]*---[ \t]*\r?\n(.*?)(?m:^---[ \t]*(?:\r?\n|\z))")
            .unwrap()
    })
}

pub fn parse_note_metadata(rel_path: &str, content: &str) -> NoteMetadata {
    let mut meta = NoteMetadata {
        path: rel_path.to_string(),
        character_count: content.chars().count(),
        word_count: content.split_whitespace().count(),
        ..Default::default()
    };

    // Default title from filename without .md
    let filename = std::path::Path::new(rel_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(rel_path);
    meta.title = filename.to_string();

    // Parse Frontmatter
    let mut body = content;
    let mut body_line = 1;
    if let Some(caps) = frontmatter_regex().captures(content) {
        if let Some(fm_str) = caps.get(1) {
            if let Ok(yaml_val) = serde_yaml::from_str::<serde_json::Value>(fm_str.as_str()) {
                if let Some(title_val) = yaml_val.get("title").and_then(|v| v.as_str()) {
                    meta.title = title_val.to_string();
                }
                if let Some(tags_val) = yaml_val.get("tags") {
                    if let Some(arr) = tags_val.as_array() {
                        for t in arr {
                            if let Some(s) = t.as_str() {
                                meta.tags.push(s.trim_start_matches('#').to_string());
                            }
                        }
                    } else if let Some(s) = tags_val.as_str() {
                        meta.tags.push(s.trim_start_matches('#').to_string());
                    }
                }
                meta.frontmatter = Some(yaml_val);
            }
            let header = caps.get(0).unwrap();
            body_line += content[..header.end()]
                .bytes()
                .filter(|b| *b == b'\n')
                .count();
            body = &content[header.end()..];
        }
    }

    let original_lines: Vec<_> = body.lines().collect();
    let visible = crate::markdown::visible_markdown(body);
    let body = visible.as_str();

    // Parse Wikilinks: [[target|display]] or [[target]] (ignoring embeds ![[...]] and attachments)
    let mut outlinks = Vec::new();
    for cap in wikilink_regex().captures_iter(body) {
        if let Some(target) = cap.get(2) {
            let clean_target = target.as_str().trim().to_string();
            if is_attachment(&clean_target) {
                continue;
            }
            if !clean_target.is_empty()
                && !outlinks.iter().any(|(_, target)| target == &clean_target)
            {
                outlinks.push((cap.get(0).unwrap().start(), clean_target));
            }
        }
    }
    static MARKDOWN_LINK: OnceLock<Regex> = OnceLock::new();
    let markdown_link = MARKDOWN_LINK.get_or_init(|| Regex::new(r#"(!?)\[([^\]\n]*)\]\((?:<([^>\n]*)>|([^\s()]+(?:\([^)]*\)[^\s()]*)*))(?:[ \t]+["'][^\n]*?["'])?\)"#).unwrap());
    for cap in markdown_link.captures_iter(body) {
        if !cap[1].is_empty() {
            continue;
        }
        let encoded = cap.get(3).or_else(|| cap.get(4)).unwrap().as_str();
        if encoded.starts_with("//") || encoded.contains(':') {
            continue;
        }
        let target = percent_encoding::percent_decode_str(encoded)
            .decode_utf8_lossy()
            .into_owned();
        if !is_attachment(&target) {
            outlinks.push((cap.get(0).unwrap().start(), target));
        }
    }
    outlinks.sort_by_key(|(position, _)| *position);
    for (_, target) in outlinks {
        if !meta.outlinks.contains(&target) {
            meta.outlinks.push(target);
        }
    }

    // Parse inline tags #tag
    for cap in tag_regex().captures_iter(body) {
        if let Some(tag_match) = cap.get(1) {
            let tag = tag_match.as_str().to_string();
            if !meta.tags.contains(&tag) {
                meta.tags.push(tag);
            }
        }
    }

    // Parse Headings
    static CLOSING_HASHES: OnceLock<Regex> = OnceLock::new();
    let closing_hashes = CLOSING_HASHES.get_or_init(|| Regex::new(r"[ \t]+#+[ \t]*$").unwrap());
    for (idx, line) in body.lines().enumerate() {
        if let Some(caps) = heading_regex().captures(line) {
            let hashes = caps.get(1).map(|m| m.as_str().len()).unwrap_or(1) as u8;
            let raw = heading_regex().captures(original_lines[idx]).unwrap();
            let text = raw.get(2).map(|m| m.as_str().trim()).unwrap_or_default();
            let text = closing_hashes.replace(text, "").to_string();
            meta.headings.push(HeadingItem {
                level: hashes,
                text,
                line: body_line + idx,
            });
        }
    }

    meta
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_wikilinks_and_tags() {
        let text = r#"---
title: Mi Nota Especial
tags: [rust, obsidian]
---
# Bienvenida
Hola esto es [[Otra Nota]] y también [[Carpeta/Tercera|Alias]].
Un tag inline #proyecto/jademd y algo más.
"#;
        let meta = parse_note_metadata("docs/test.md", text);
        assert_eq!(meta.title, "Mi Nota Especial");
        assert_eq!(meta.outlinks, vec!["Otra Nota", "Carpeta/Tercera"]);
        assert!(meta.tags.contains(&"rust".to_string()));
        assert!(meta.tags.contains(&"proyecto/jademd".to_string()));
        assert_eq!(meta.headings.len(), 1);
        assert_eq!(meta.headings[0].text, "Bienvenida");
    }

    #[test]
    fn test_parse_frontmatter_single_string_tag_and_fallbacks() {
        let text = r#"---
tags: single_tag
custom_property: valor_test
---
Texto simple sin título en frontmatter."#;

        let meta = parse_note_metadata("Ruta/Mi Documento.md", text);
        assert_eq!(meta.title, "Mi Documento");
        assert_eq!(meta.tags, vec!["single_tag"]);
        assert!(meta.frontmatter.is_some());
        assert_eq!(meta.headings.len(), 0);
        assert!(meta.word_count > 0);
    }

    #[test]
    fn test_parse_hierarchical_headings_and_outlink_dedup() {
        let text = r#"# Nivel 1
Contenido sobre [[Referencia Común]].

## Nivel 2
Más detalles repitiendo [[Referencia Común]] y un nuevo enlace [[Guia/Avanzada|Guía Completa]].

### Nivel 3
Fin del documento."#;

        let meta = parse_note_metadata("Nota Jerarquica.md", text);
        assert_eq!(meta.title, "Nota Jerarquica");
        assert_eq!(meta.headings.len(), 3);
        assert_eq!(meta.headings[0].level, 1);
        assert_eq!(meta.headings[0].text, "Nivel 1");
        assert_eq!(meta.headings[1].level, 2);
        assert_eq!(meta.headings[1].text, "Nivel 2");
        assert_eq!(meta.headings[2].level, 3);
        assert_eq!(meta.headings[2].text, "Nivel 3");

        // Verificamos deduplicación de outlinks
        assert_eq!(meta.outlinks.len(), 2);
        assert_eq!(meta.outlinks, vec!["Referencia Común", "Guia/Avanzada"]);
    }

    #[test]
    fn test_parse_ignores_embeds_and_attachments() {
        let text = r#"# Nota con multimedia
Aquí hay una imagen embebida ![[Pasted image 20261104.png]]
Y un audio embebido ![[nota de voz.mp3]]
Y un PDF adjunto [[documento.pdf]]
Y un enlace a otra nota legítima: [[Guía de Docker]].
"#;
        let meta = parse_note_metadata("docs/multimedia.md", text);
        // Sólo debe capturar la nota legítima, NO las imágenes, audios o PDFs
        assert_eq!(meta.outlinks, vec!["Guía de Docker"]);
    }
}
