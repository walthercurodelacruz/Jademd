use crate::models::{GraphData, GraphLink, GraphNode, NoteMetadata};
use petgraph::graph::{DiGraph, NodeIndex};
use petgraph::Direction;
use std::collections::{HashMap, HashSet};

#[derive(Default)]
pub struct KnowledgeGraph {
    graph: DiGraph<String, ()>,
    node_indices: HashMap<String, NodeIndex>,
    metadata_map: HashMap<String, NoteMetadata>,
}

impl KnowledgeGraph {
    pub(crate) fn indexed_notes(&self) -> Vec<NoteMetadata> {
        let mut notes: Vec<_> = self
            .metadata_map
            .values()
            .filter(|note| !note.path.split('/').any(|part| part.starts_with('.')))
            .cloned()
            .collect();
        notes.sort_by(|a, b| a.path.cmp(&b.path));
        notes
    }

    pub fn new() -> Self {
        Self::default()
    }
    pub fn clear(&mut self) {
        self.graph.clear();
        self.node_indices.clear();
        self.metadata_map.clear();
    }
    fn node(&mut self, key: &str) -> NodeIndex {
        *self
            .node_indices
            .entry(key.to_string())
            .or_insert_with(|| self.graph.add_node(key.to_string()))
    }
    pub fn insert_note(&mut self, mut meta: NoteMetadata) {
        if meta.path.is_empty() {
            meta.path = format!("{}.md", meta.title);
        }
        self.metadata_map.insert(meta.path.clone(), meta);
        self.rebuild();
    }
    pub fn replace_notes(&mut self, notes: Vec<NoteMetadata>) {
        self.metadata_map = notes
            .into_iter()
            .map(|meta| (meta.path.clone(), meta))
            .collect();
        self.rebuild();
    }
    pub fn remove_note(&mut self, path: &str) {
        self.metadata_map
            .retain(|key, _| key != path && !key.starts_with(&format!("{path}/")));
        self.rebuild();
    }
    fn resolve(&self, target: &str, source: &str) -> Option<String> {
        let target = target.split('#').next().unwrap_or(target);
        if target.is_empty() {
            return self
                .metadata_map
                .contains_key(source)
                .then(|| source.to_string());
        }
        let file = if target.to_lowercase().ends_with(".md") {
            target.to_string()
        } else {
            format!("{target}.md")
        };
        for path in crate::paths::candidates(&file, source) {
            if self.metadata_map.contains_key(&path) {
                return Some(path);
            }
        }
        if target.contains('/') {
            return None;
        }
        let mut candidates = self.metadata_map.values().filter(|meta| {
            let stem = std::path::Path::new(&meta.path)
                .file_stem()
                .and_then(|s| s.to_str());
            let aliases = meta.frontmatter.as_ref().and_then(|fm| fm.get("aliases"));
            meta.title == target
                || stem == Some(target)
                || aliases.is_some_and(|a| {
                    a.as_str() == Some(target)
                        || a.as_array()
                            .is_some_and(|a| a.iter().any(|v| v.as_str() == Some(target)))
                })
        });
        let first = candidates.next()?;
        if candidates.next().is_some() {
            None
        } else {
            Some(first.path.clone())
        }
    }
    pub fn resolve_note(&self, target: &str, source: &str) -> Option<String> {
        self.resolve(target, source)
    }

    fn rebuild(&mut self) {
        self.graph.clear();
        self.node_indices.clear();
        let notes: Vec<_> = self.metadata_map.values().cloned().collect();
        for meta in &notes {
            self.node(&meta.path);
        }
        for meta in &notes {
            let source = self.node(&meta.path);
            for target in &meta.outlinks {
                let key = self.resolve(target, &meta.path).unwrap_or_else(|| {
                    format!("unresolved:{}", target.split('#').next().unwrap_or(target))
                });
                let target = self.node(&key);
                self.graph.update_edge(source, target, ());
            }
        }
    }
    pub fn get_backlinks(&self, target: &str) -> Vec<String> {
        let key = self.resolve(target, "").unwrap_or_else(|| {
            format!("unresolved:{}", target.split('#').next().unwrap_or(target))
        });
        let mut result = self
            .node_indices
            .get(&key)
            .map(|&node| {
                self.graph
                    .neighbors_directed(node, Direction::Incoming)
                    .map(|idx| self.graph[idx].clone())
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        result.sort();
        result.dedup();
        result
    }
    pub fn to_graph_data(&self) -> GraphData {
        let mut nodes = Vec::new();
        let mut links = Vec::new();
        let mut seen = HashSet::new();
        for idx in self.graph.node_indices() {
            let key = &self.graph[idx];
            let meta = self.metadata_map.get(key);
            nodes.push(GraphNode {
                id: key.clone(),
                label: meta
                    .map(|m| m.title.clone())
                    .unwrap_or_else(|| key.trim_start_matches("unresolved:").to_string()),
                group: meta
                    .map(|m| m.tags.first().cloned().unwrap_or_else(|| "note".into()))
                    .unwrap_or_else(|| "unresolved".into()),
                weight: 1
                    + self
                        .graph
                        .neighbors_directed(idx, Direction::Incoming)
                        .count()
                    + self
                        .graph
                        .neighbors_directed(idx, Direction::Outgoing)
                        .count(),
            });
            for target in self.graph.neighbors_directed(idx, Direction::Outgoing) {
                if seen.insert((key.clone(), self.graph[target].clone())) {
                    links.push(GraphLink {
                        source: key.clone(),
                        target: self.graph[target].clone(),
                    });
                }
            }
        }
        nodes.sort_by(|a, b| a.id.cmp(&b.id));
        links.sort_by(|a, b| (&a.source, &a.target).cmp(&(&b.source, &b.target)));
        GraphData { nodes, links }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_knowledge_graph_links_and_backlinks() {
        let mut kg = KnowledgeGraph::new();

        let note_a = NoteMetadata {
            title: "Nota A".into(),
            outlinks: vec!["Nota B".into(), "Nota C".into()],
            tags: vec!["tecnologia".into()],
            ..Default::default()
        };

        let note_b = NoteMetadata {
            title: "Nota B".into(),
            outlinks: vec!["Nota C".into()],
            ..Default::default()
        };

        kg.insert_note(note_a);
        kg.insert_note(note_b);

        // Verify backlinks
        let backlinks_c = kg.get_backlinks("Nota C");
        assert_eq!(backlinks_c.len(), 2);
        assert!(backlinks_c.contains(&"Nota A.md".to_string()));
        assert!(backlinks_c.contains(&"Nota B.md".to_string()));

        let backlinks_b = kg.get_backlinks("Nota B");
        assert_eq!(backlinks_b, vec!["Nota A.md".to_string()]);

        let backlinks_a = kg.get_backlinks("Nota A");
        assert!(backlinks_a.is_empty());

        // Verify graph data export
        let graph_data = kg.to_graph_data();
        assert_eq!(graph_data.nodes.len(), 3);
        assert_eq!(graph_data.links.len(), 3);

        // Find node A
        let node_a = graph_data
            .nodes
            .iter()
            .find(|n| n.id == "Nota A.md")
            .unwrap();
        assert_eq!(node_a.group, "tecnologia");
    }

    #[test]
    fn test_graph_clear() {
        let mut kg = KnowledgeGraph::new();
        let note = NoteMetadata {
            title: "Test".into(),
            ..Default::default()
        };
        kg.insert_note(note);
        assert_eq!(kg.to_graph_data().nodes.len(), 1);

        kg.clear();
        assert_eq!(kg.to_graph_data().nodes.len(), 0);
    }
}
