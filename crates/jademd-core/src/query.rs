use crate::{
    models::{SearchMatch, SearchResult},
    parser::parse_note_metadata,
};
use std::collections::HashMap;

fn terms(query: &str) -> std::io::Result<Vec<String>> {
    let mut terms = vec![];
    let mut current = String::new();
    let mut quoted = false;
    let mut bracket = false;
    for character in query.chars() {
        match character {
            '"' => quoted = !quoted,
            '[' if !quoted => {
                bracket = true;
                current.push(character);
            }
            ']' if !quoted => {
                bracket = false;
                current.push(character);
            }
            c if c.is_whitespace() && !quoted && !bracket => {
                if !current.is_empty() {
                    terms.push(std::mem::take(&mut current));
                }
            }
            c => current.push(c),
        }
    }
    if quoted || bracket {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "Cierra las comillas o corchetes de la consulta",
        ));
    }
    if !current.is_empty() {
        terms.push(current);
    }
    Ok(terms)
}
pub(crate) fn search(
    cache: &HashMap<String, String>,
    query: &str,
) -> std::io::Result<Vec<SearchResult>> {
    let terms = terms(query)?;
    if terms.is_empty() {
        return Ok(vec![]);
    }
    let mut results = vec![];
    for (path, content) in cache {
        let meta = parse_note_metadata(path, content);
        let lower = content.to_lowercase();
        let title = meta.title.to_lowercase();
        let matches = terms.iter().all(|term| {
            let (negative, term) = term
                .strip_prefix('-')
                .map_or((false, term.as_str()), |term| (true, term));
            let term = term.to_lowercase();
            let found = if let Some(tag) = term.strip_prefix("tag:") {
                let tag = tag.trim_start_matches('#');
                !tag.is_empty()
                    && meta.tags.iter().any(|value| {
                        value.trim_start_matches('#').to_lowercase() == tag
                            || value
                                .trim_start_matches('#')
                                .to_lowercase()
                                .starts_with(&format!("{tag}/"))
                    })
            } else if let Some(part) = term.strip_prefix("path:") {
                path.to_lowercase().contains(part)
            } else if let Some(part) = term.strip_prefix("file:") {
                path.rsplit('/')
                    .next()
                    .unwrap_or(path)
                    .to_lowercase()
                    .contains(part)
            } else if let Some(part) = term.strip_prefix("content:") {
                lower.contains(part)
            } else if term.starts_with('[') && term.ends_with(']') {
                let property = &term[1..term.len() - 1];
                let (key, value) = property
                    .split_once(':')
                    .map_or((property, None), |(key, value)| {
                        (key.trim(), Some(value.trim()))
                    });
                let property = meta
                    .frontmatter
                    .as_ref()
                    .and_then(|properties| properties.as_object())
                    .and_then(|properties| {
                        properties
                            .iter()
                            .find(|(name, _)| name.to_lowercase() == key)
                            .map(|(_, value)| value)
                    });
                property.is_some_and(|property| {
                    value.is_none_or(|expected| {
                        let equal = |value: &serde_json::Value| {
                            value
                                .as_str()
                                .map(str::to_lowercase)
                                .unwrap_or_else(|| value.to_string().to_lowercase())
                                == expected
                        };
                        property
                            .as_array()
                            .map_or_else(|| equal(property), |values| values.iter().any(equal))
                    })
                })
            } else {
                title.contains(&term) || lower.contains(&term)
            };
            found != negative
        });
        if !matches {
            continue;
        }
        let text_terms: Vec<_> = terms
            .iter()
            .filter(|term| !term.starts_with('-') && !term.starts_with('[') && !term.contains(':'))
            .map(|term| term.to_lowercase())
            .collect();
        let lines = content
            .lines()
            .enumerate()
            .filter(|(_, line)| {
                text_terms
                    .iter()
                    .any(|term| line.to_lowercase().contains(term))
            })
            .take(50)
            .map(|(index, line)| SearchMatch {
                line: index + 1,
                content: line.trim().chars().take(500).collect(),
            })
            .collect();
        results.push(SearchResult {
            path: path.clone(),
            title: meta.title,
            matches: lines,
        });
    }
    results.sort_by(|a, b| a.path.cmp(&b.path));
    results.truncate(200);
    Ok(results)
}
