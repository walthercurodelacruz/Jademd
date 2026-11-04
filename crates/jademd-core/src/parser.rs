use regex::Regex;
use std::sync::OnceLock;
use crate::models::{HeadingItem, NoteMetadata};

static WIKILINK_RE: OnceLock<Regex> = OnceLock::new();
static TAG_RE: OnceLock<Regex> = OnceLock::new();
static HEADING_RE: OnceLock<Regex> = OnceLock::new();
static FRONTMATTER_RE: OnceLock<Regex> = OnceLock::new();

fn wikilink_regex() -> &'static Regex {
    WIKILINK_RE.get_or_init(|| Regex::new(r"\[\[([^\|\]]+)(?:\|([^\]]+))?\]\]").unwrap())
}

fn tag_regex() -> &'static Regex {
    TAG_RE.get_or_init(|| Regex::new(r"(?:^|\s)#([a-zA-Z0-9_\-/]+)").unwrap())
}

fn heading_regex() -> &'static Regex {
    HEADING_RE.get_or_init(|| Regex::new(r"^(#{1,6})\s+(.*)$").unwrap())
}

fn frontmatter_regex() -> &'static Regex {
    FRONTMATTER_RE.get_or_init(|| Regex::new(r"(?s)^---\r?\n(.*?)\r?\n---").unwrap())
}

pub fn parse_note_metadata(rel_path: &str, content: &str) -> NoteMetadata {
    let mut meta = NoteMetadata::default();
    meta.path = rel_path.to_string();
    meta.character_count = content.chars().count();
    meta.word_count = content.split_whitespace().count();

    // Default title from filename without .md
    let filename = std::path::Path::new(rel_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(rel_path);
    meta.title = filename.to_string();

    // Parse Frontmatter
    let mut body = content;
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
            body = &content[caps.get(0).unwrap().end()..];
        }
    }

    // Parse Wikilinks: [[target|display]] or [[target]]
    let mut outlinks = Vec::new();
    for cap in wikilink_regex().captures_iter(body) {
        if let Some(target) = cap.get(1) {
            let clean_target = target.as_str().trim().to_string();
            if !clean_target.is_empty() && !outlinks.contains(&clean_target) {
                outlinks.push(clean_target);
            }
        }
    }
    meta.outlinks = outlinks;

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
    for (idx, line) in body.lines().enumerate() {
        if let Some(caps) = heading_regex().captures(line) {
            let hashes = caps.get(1).map(|m| m.as_str().len()).unwrap_or(1) as u8;
            let text = caps.get(2).map(|m| m.as_str().trim().to_string()).unwrap_or_default();
            meta.headings.push(HeadingItem {
                level: hashes,
                text,
                line: idx + 1,
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
}
