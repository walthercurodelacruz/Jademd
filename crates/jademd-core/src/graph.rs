use std::collections::{HashMap, HashSet};
use petgraph::graph::{DiGraph, NodeIndex};
use petgraph::Direction;
use crate::models::{GraphData, GraphLink, GraphNode, NoteMetadata};

#[derive(Default)]
pub struct KnowledgeGraph {
    graph: DiGraph<String, ()>,
    node_indices: HashMap<String, NodeIndex>,
    metadata_map: HashMap<String, NoteMetadata>,
}

impl KnowledgeGraph {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn clear(&mut self) {
        self.graph.clear();
        self.node_indices.clear();
        self.metadata_map.clear();
    }

    fn get_or_insert_node(&mut self, label: &str) -> NodeIndex {
        if let Some(&idx) = self.node_indices.get(label) {
            idx
        } else {
            let idx = self.graph.add_node(label.to_string());
            self.node_indices.insert(label.to_string(), idx);
            idx
        }
    }

    pub fn insert_note(&mut self, meta: NoteMetadata) {
        let note_key = meta.title.clone();
        let source_idx = self.get_or_insert_node(&note_key);

        for target in &meta.outlinks {
            let target_name = std::path::Path::new(target)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or(target);
            let target_idx = self.get_or_insert_node(target_name);
            self.graph.update_edge(source_idx, target_idx, ());
        }

        self.metadata_map.insert(note_key, meta);
    }

    pub fn get_backlinks(&self, note_title: &str) -> Vec<String> {
        let mut backlinks = Vec::new();
        if let Some(&node_idx) = self.node_indices.get(note_title) {
            for neighbor in self.graph.neighbors_directed(node_idx, Direction::Incoming) {
                if let Some(name) = self.graph.node_weight(neighbor) {
                    backlinks.push(name.clone());
                }
            }
        }
        backlinks
    }

    pub fn to_graph_data(&self) -> GraphData {
        let mut nodes = Vec::new();
        let mut links = Vec::new();

        let mut seen_links = HashSet::new();

        for idx in self.graph.node_indices() {
            let label = &self.graph[idx];
            let in_degree = self.graph.neighbors_directed(idx, Direction::Incoming).count();
            let out_degree = self.graph.neighbors_directed(idx, Direction::Outgoing).count();
            let weight = 1 + in_degree + out_degree;

            let group = if let Some(meta) = self.metadata_map.get(label) {
                meta.tags.first().cloned().unwrap_or_else(|| "note".to_string())
            } else {
                "unresolved".to_string()
            };

            nodes.push(GraphNode {
                id: label.clone(),
                label: label.clone(),
                weight,
                group,
            });

            for neighbor in self.graph.neighbors_directed(idx, Direction::Outgoing) {
                let target_label = &self.graph[neighbor];
                let link_key = format!("{}->{}", label, target_label);
                if seen_links.insert(link_key) {
                    links.push(GraphLink {
                        source: label.clone(),
                        target: target_label.clone(),
                    });
                }
            }
        }

        GraphData { nodes, links }
    }
}
