use crate::{markdown::visible_markdown, parser::parse_note_metadata, storage::Result, Vault};
use serde::Serialize;

#[derive(Serialize)]
pub struct OutgoingLink {
    pub target: String,
    pub path: Option<String>,
}
#[derive(Serialize)]
pub struct UnlinkedMention {
    pub path: String,
    pub line: usize,
    pub content: String,
}
#[derive(Serialize)]
pub struct Connections {
    pub outgoing: Vec<OutgoingLink>,
    pub unlinked: Vec<UnlinkedMention>,
}

fn contains_name(line: &str, name: &str) -> bool {
    line.match_indices(name).any(|(index, _)| {
        let boundary = |c: char| !c.is_alphanumeric() && c != '_';
        line[..index].chars().next_back().is_none_or(boundary)
            && line[index + name.len()..]
                .chars()
                .next()
                .is_none_or(boundary)
    })
}

impl Vault {
    pub async fn connections(&self, path: &str) -> Result<Connections> {
        let source = self.read_note(path).await?;
        let metadata = parse_note_metadata(path, &source);
        let mut names = vec![metadata.title.to_lowercase()];
        if let Some(stem) = std::path::Path::new(path)
            .file_stem()
            .and_then(|stem| stem.to_str())
        {
            names.push(stem.to_lowercase());
        }
        if let Some(aliases) = metadata
            .frontmatter
            .as_ref()
            .and_then(|frontmatter| frontmatter.get("aliases"))
        {
            match aliases {
                serde_json::Value::String(alias) => names.push(alias.to_lowercase()),
                serde_json::Value::Array(aliases) => names.extend(
                    aliases
                        .iter()
                        .filter_map(|alias| alias.as_str().map(str::to_lowercase)),
                ),
                _ => {}
            }
        }
        names.retain(|name| name.chars().count() >= 2);
        names.sort();
        names.dedup();
        let mut outgoing = vec![];
        for target in metadata.outlinks {
            let resolved = self.resolve_entry(&target, path).await.ok();
            outgoing.push(OutgoingLink {
                target,
                path: resolved,
            });
        }
        let cache = self.notes_cache.read().await.clone();
        let mut notes: Vec<_> = cache.into_iter().collect();
        notes.sort_by(|a, b| a.0.cmp(&b.0));
        let mut unlinked = vec![];
        for (candidate, content) in notes {
            if candidate == path {
                continue;
            }
            let mut linked = false;
            for target in parse_note_metadata(&candidate, &content).outlinks {
                if self
                    .resolve_entry(&target, &candidate)
                    .await
                    .ok()
                    .as_deref()
                    == Some(path)
                {
                    linked = true;
                    break;
                }
            }
            if linked {
                continue;
            }
            for (line, text) in visible_markdown(&content).lines().enumerate() {
                let lower = text.to_lowercase();
                if names.iter().any(|name| contains_name(&lower, name)) {
                    unlinked.push(UnlinkedMention {
                        path: candidate.clone(),
                        line: line + 1,
                        content: text.trim().chars().take(500).collect(),
                    });
                    if unlinked.len() >= 100 {
                        break;
                    }
                }
            }
            if unlinked.len() >= 100 {
                break;
            }
        }
        Ok(Connections { outgoing, unlinked })
    }
}

#[derive(Serialize)]
pub struct TagCount {
    pub tag: String,
    pub count: usize,
}
impl Vault {
    pub async fn tags(&self) -> Vec<TagCount> {
        let cache = self.notes_cache.read().await;
        let mut counts = std::collections::BTreeMap::<String, usize>::new();
        for (path, content) in cache.iter() {
            let mut tags = std::collections::HashSet::new();
            for tag in parse_note_metadata(path, content).tags {
                let parts: Vec<_> = tag
                    .trim_start_matches('#')
                    .split('/')
                    .filter(|part| !part.is_empty())
                    .collect();
                for depth in 1..=parts.len() {
                    tags.insert(parts[..depth].join("/"));
                }
            }
            for tag in tags {
                *counts.entry(tag).or_default() += 1;
            }
        }
        counts
            .into_iter()
            .map(|(tag, count)| TagCount { tag, count })
            .collect()
    }
}
