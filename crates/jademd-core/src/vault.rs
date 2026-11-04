use std::sync::Arc;
use tokio::sync::RwLock;
use walkdir::WalkDir;
use std::path::{Path, PathBuf};
use crate::models::{FileNode, GraphData, NoteMetadata, SearchMatch, SearchResult, StorageType, VaultInfo};
use crate::parser::parse_note_metadata;
use crate::graph::KnowledgeGraph;
use crate::storage::{Result, StorageManager};

pub struct Vault {
    info: VaultInfo,
    storage: StorageManager,
    graph: Arc<RwLock<KnowledgeGraph>>,
    notes_cache: Arc<RwLock<std::collections::HashMap<String, String>>>,
}

impl Vault {
    pub fn new_local(name: &str, local_dir: &str) -> Result<Self> {
        let storage = StorageManager::new_local(local_dir)?;
        let id = format!("{:x}", md5_or_hash(local_dir));
        let info = VaultInfo {
            id,
            name: name.to_string(),
            path: local_dir.to_string(),
            storage_type: StorageType::Local,
            last_opened: chrono::Utc::now().timestamp(),
        };

        Ok(Self {
            info,
            storage,
            graph: Arc::new(RwLock::new(KnowledgeGraph::new())),
            notes_cache: Arc::new(RwLock::new(std::collections::HashMap::new())),
        })
    }

    pub fn new_webdav(name: &str, endpoint: &str, user: Option<&str>, pass: Option<&str>, root: &str) -> Result<Self> {
        let storage = StorageManager::new_webdav(endpoint, user, pass, root)?;
        let id = format!("{:x}", md5_or_hash(&format!("{}:{}", endpoint, root)));
        let info = VaultInfo {
            id,
            name: name.to_string(),
            path: format!("{}/{}", endpoint.trim_end_matches('/'), root.trim_start_matches('/')),
            storage_type: StorageType::Webdav,
            last_opened: chrono::Utc::now().timestamp(),
        };

        Ok(Self {
            info,
            storage,
            graph: Arc::new(RwLock::new(KnowledgeGraph::new())),
            notes_cache: Arc::new(RwLock::new(std::collections::HashMap::new())),
        })
    }

    pub fn new_gdrive(
        name: &str,
        access_token: Option<&str>,
        refresh_token: Option<&str>,
        client_id: Option<&str>,
        client_secret: Option<&str>,
        root: &str,
    ) -> Result<Self> {
        let storage = StorageManager::new_gdrive(access_token, refresh_token, client_id, client_secret, root)?;
        let id = format!("{:x}", md5_or_hash(&format!("gdrive:{}", root)));
        let info = VaultInfo {
            id,
            name: name.to_string(),
            path: format!("gdrive://{}", root),
            storage_type: StorageType::Gdrive,
            last_opened: chrono::Utc::now().timestamp(),
        };

        Ok(Self {
            info,
            storage,
            graph: Arc::new(RwLock::new(KnowledgeGraph::new())),
            notes_cache: Arc::new(RwLock::new(std::collections::HashMap::new())),
        })
    }

    pub fn info(&self) -> &VaultInfo {
        &self.info
    }

    pub async fn read_note(&self, rel_path: &str) -> Result<String> {
        let content = self.storage.read(rel_path).await?;
        let mut cache = self.notes_cache.write().await;
        cache.insert(rel_path.to_string(), content.clone());
        Ok(content)
    }

    pub async fn write_note(&self, rel_path: &str, content: &str) -> Result<NoteMetadata> {
        self.storage.write(rel_path, content).await?;
        
        let meta = parse_note_metadata(rel_path, content);
        {
            let mut cache = self.notes_cache.write().await;
            cache.insert(rel_path.to_string(), content.to_string());
        }
        {
            let mut graph = self.graph.write().await;
            graph.insert_note(meta.clone());
        }
        Ok(meta)
    }

    pub async fn delete_entry(&self, rel_path: &str) -> Result<()> {
        self.storage.delete(rel_path).await?;
        let mut cache = self.notes_cache.write().await;
        cache.remove(rel_path);
        Ok(())
    }

    pub async fn get_tree(&self) -> Result<FileNode> {
        if self.storage.storage_type() == &StorageType::Local {
            let root_path = PathBuf::from(self.storage.root());
            let node = build_local_tree(&root_path, &root_path);
            Ok(node)
        } else {
            // Cloud OpenDAL listing
            let entries = self.storage.list("").await?;
            let mut root_node = FileNode {
                name: self.info.name.clone(),
                path: "/".to_string(),
                is_dir: true,
                children: Some(Vec::new()),
                size: None,
                modified_at: None,
            };

            for entry in entries {
                let path = entry.path().to_string();
                if path.ends_with(".md") || path.ends_with(".canvas") || path.ends_with('/') {
                    let is_dir = path.ends_with('/');
                    let clean_path = path.trim_end_matches('/').to_string();
                    let name = Path::new(&clean_path)
                        .file_name()
                        .and_then(|s| s.to_str())
                        .unwrap_or(&clean_path)
                        .to_string();

                    if let Some(children) = &mut root_node.children {
                        children.push(FileNode {
                            name,
                            path: clean_path,
                            is_dir,
                            children: if is_dir { Some(Vec::new()) } else { None },
                            size: None,
                            modified_at: None,
                        });
                    }
                }
            }
            Ok(root_node)
        }
    }

    pub async fn index_all_local(&self) -> Result<usize> {
        if self.storage.storage_type() != &StorageType::Local {
            return Ok(0);
        }

        let root = PathBuf::from(self.storage.root());
        let mut count = 0;
        let mut graph = self.graph.write().await;
        let mut cache = self.notes_cache.write().await;
        graph.clear();

        for entry in WalkDir::new(&root).into_iter().filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("md") {
                if let Ok(rel) = path.strip_prefix(&root) {
                    let rel_str = rel.to_string_lossy().to_string();
                    if let Ok(content) = std::fs::read_to_string(path) {
                        let meta = parse_note_metadata(&rel_str, &content);
                        graph.insert_note(meta);
                        cache.insert(rel_str, content);
                        count += 1;
                    }
                }
            }
        }

        Ok(count)
    }

    pub async fn get_graph_data(&self) -> GraphData {
        let graph = self.graph.read().await;
        graph.to_graph_data()
    }

    pub async fn get_backlinks(&self, note_title: &str) -> Vec<String> {
        let graph = self.graph.read().await;
        graph.get_backlinks(note_title)
    }

    pub async fn search(&self, query: &str) -> Vec<SearchResult> {
        let query_lower = query.to_lowercase();
        let cache = self.notes_cache.read().await;
        let mut results = Vec::new();

        for (path, content) in cache.iter() {
            let mut matches = Vec::new();
            let title = Path::new(path)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or(path)
                .to_string();

            let title_matches = title.to_lowercase().contains(&query_lower);

            for (idx, line) in content.lines().enumerate() {
                if line.to_lowercase().contains(&query_lower) {
                    matches.push(SearchMatch {
                        line: idx + 1,
                        content: line.trim().to_string(),
                    });
                }
            }

            if title_matches || !matches.is_empty() {
                results.push(SearchResult {
                    path: path.clone(),
                    title,
                    matches,
                });
            }
        }

        results
    }
}

fn build_local_tree(dir: &Path, root: &Path) -> FileNode {
    let name = dir.file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("root")
        .to_string();
    
    let rel_path = dir.strip_prefix(root)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| "".to_string());

    let mut children = Vec::new();
    if let Ok(entries) = std::fs::read_dir(dir) {
        let mut sorted_entries: Vec<_> = entries.filter_map(|e| e.ok()).collect();
        // Sort folders first, then files alphabetically
        sorted_entries.sort_by_key(|e| (!e.path().is_dir(), e.file_name()));

        for entry in sorted_entries {
            let path = entry.path();
            let filename = entry.file_name().to_string_lossy().to_string();
            // Skip hidden folders (.git, .obsidian, etc.)
            if filename.starts_with('.') {
                continue;
            }

            if path.is_dir() {
                children.push(build_local_tree(&path, root));
            } else {
                let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
                if ext == "md" || ext == "canvas" {
                    let file_rel = path.strip_prefix(root)
                        .map(|p| p.to_string_lossy().to_string())
                        .unwrap_or_default();
                    let size = entry.metadata().map(|m| m.len()).ok();
                    let modified = entry.metadata()
                        .and_then(|m| m.modified())
                        .ok()
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_secs() as i64);

                    children.push(FileNode {
                        name: filename,
                        path: file_rel,
                        is_dir: false,
                        children: None,
                        size,
                        modified_at: modified,
                    });
                }
            }
        }
    }

    FileNode {
        name,
        path: rel_path,
        is_dir: true,
        children: Some(children),
        size: None,
        modified_at: None,
    }
}

fn md5_or_hash(val: &str) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut s = DefaultHasher::new();
    val.hash(&mut s);
    s.finish()
}
