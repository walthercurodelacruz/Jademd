use crate::graph::KnowledgeGraph;
use crate::models::{FileNode, GraphData, NoteMetadata, SearchResult, StorageType, VaultInfo};
use crate::parser::parse_note_metadata;
use crate::storage::{Result, StorageError, StorageManager};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::RwLock;
use walkdir::WalkDir;

pub struct Vault {
    info: VaultInfo,
    pub(crate) storage: StorageManager,
    graph: Arc<RwLock<KnowledgeGraph>>,
    pub(crate) notes_cache: Arc<RwLock<std::collections::HashMap<String, String>>>,
    pub(crate) mutation: tokio::sync::Mutex<()>,
}

impl Vault {
    pub fn new_local(name: &str, local_dir: &str) -> Result<Self> {
        let storage = StorageManager::new_local(local_dir)?;
        let local_dir = storage.root();
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
            mutation: tokio::sync::Mutex::new(()),
        })
    }

    pub fn new_webdav(
        name: &str,
        endpoint: &str,
        user: Option<&str>,
        pass: Option<&str>,
        root: &str,
    ) -> Result<Self> {
        let storage = StorageManager::new_webdav(endpoint, user, pass, root)?;
        let id = remote_vault_id(&[
            "webdav",
            endpoint.trim_end_matches('/'),
            user.unwrap_or_default(),
            root.trim_matches('/'),
        ]);
        let info = VaultInfo {
            id,
            name: name.to_string(),
            path: format!(
                "{}/{}",
                endpoint.trim_end_matches('/'),
                root.trim_start_matches('/')
            ),
            storage_type: StorageType::Webdav,
            last_opened: chrono::Utc::now().timestamp(),
        };

        Ok(Self {
            info,
            storage,
            graph: Arc::new(RwLock::new(KnowledgeGraph::new())),
            notes_cache: Arc::new(RwLock::new(std::collections::HashMap::new())),
            mutation: tokio::sync::Mutex::new(()),
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
        let storage = StorageManager::new_gdrive(
            access_token,
            refresh_token,
            client_id,
            client_secret,
            root,
        )?;
        // A root path such as "/" is shared by unrelated accounts.
        let credential = refresh_token
            .filter(|token| !token.is_empty())
            .or(access_token)
            .unwrap_or_default();
        let id = remote_vault_id(&["gdrive", root.trim_matches('/'), credential]);
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
            mutation: tokio::sync::Mutex::new(()),
        })
    }

    pub fn info(&self) -> &VaultInfo {
        &self.info
    }

    pub async fn read_note(&self, rel_path: &str) -> Result<String> {
        let _mutation = self.mutation.lock().await;
        let content = self.storage.read(rel_path).await?;
        let mut cache = self.notes_cache.write().await;
        if rel_path.to_lowercase().ends_with(".md") {
            cache.insert(rel_path.to_string(), content.clone());
        }
        Ok(content)
    }

    pub async fn resolve_entry(&self, target: &str, source: &str) -> Result<String> {
        if target.contains(':') || target.starts_with("//") {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "El enlace no es una ruta de bóveda",
            )
            .into());
        }
        let file = target.split('#').next().unwrap_or(target);
        let source = if source.to_lowercase().ends_with(".canvas") && !file.starts_with('.') {
            ""
        } else {
            source
        };
        if file.is_empty() {
            crate::local_fs::validate(source)?;
            return if self.storage.exists(source).await? {
                Ok(source.to_string())
            } else {
                Err(crate::storage::StorageError::NotFound(source.to_string()))
            };
        }
        if !crate::parser::is_attachment(target) {
            if let Some(path) = self.graph.read().await.resolve_note(target, source) {
                if self.storage.exists(&path).await? {
                    return Ok(path);
                }
            }
        }
        let paths = crate::paths::candidates(file, source);
        if paths.is_empty() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "El enlace sale de la bóveda",
            )
            .into());
        }
        for path in &paths {
            if self.storage.exists(path).await? {
                return Ok(path.clone());
            }
            if Path::new(path).extension().is_none() {
                let markdown = format!("{path}.md");
                if self.storage.exists(&markdown).await? {
                    return Ok(markdown);
                }
            }
        }
        if !file.contains('/') && self.storage.storage_type() == &StorageType::Local {
            let root = PathBuf::from(self.storage.root());
            let filename = file.to_string();
            let matches = tokio::task::spawn_blocking(move || {
                WalkDir::new(&root)
                    .follow_links(false)
                    .into_iter()
                    .filter_entry(|entry| {
                        entry.depth() == 0 || !entry.file_name().to_string_lossy().starts_with('.')
                    })
                    .filter_map(|entry| entry.ok())
                    .filter(|entry| entry.file_type().is_file())
                    .filter(|entry| {
                        entry
                            .file_name()
                            .to_string_lossy()
                            .eq_ignore_ascii_case(&filename)
                            || entry
                                .file_name()
                                .to_string_lossy()
                                .eq_ignore_ascii_case(&format!("{filename}.md"))
                    })
                    .filter_map(|entry| relative_vault_path(entry.path(), &root))
                    .collect::<Vec<_>>()
            })
            .await
            .map_err(std::io::Error::other)?;
            if matches.len() == 1 {
                return Ok(matches[0].clone());
            }
            if matches.len() > 1 {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::InvalidInput,
                    "Enlace ambiguo: utiliza la ruta completa",
                )
                .into());
            }
        }
        Err(crate::storage::StorageError::NotFound(target.to_string()))
    }

    pub async fn read_bytes(&self, rel_path: &str) -> Result<Vec<u8>> {
        // Direct asset requests never interpret absolute paths or parent traversal.
        crate::local_fs::validate(rel_path)?;
        self.read_linked_bytes(rel_path, "").await
    }

    pub async fn read_linked_bytes(&self, target: &str, source: &str) -> Result<Vec<u8>> {
        let path = self.resolve_entry(target, source).await?;
        self.storage.read_bytes(&path).await
    }

    pub async fn write_note(&self, rel_path: &str, content: &str) -> Result<NoteMetadata> {
        let _mutation = self.mutation.lock().await;
        self.write_note_unlocked(rel_path, content).await
    }

    pub async fn write_note_checked(
        &self,
        rel_path: &str,
        content: &str,
        expected: Option<&str>,
    ) -> Result<NoteMetadata> {
        let _mutation = self.mutation.lock().await;
        self.storage
            .write_checked(rel_path, content, expected)
            .await?;
        Ok(self.cache_note(rel_path, content).await)
    }

    async fn write_note_unlocked(&self, rel_path: &str, content: &str) -> Result<NoteMetadata> {
        self.storage.write(rel_path, content).await?;
        Ok(self.cache_note(rel_path, content).await)
    }

    async fn cache_note(&self, rel_path: &str, content: &str) -> NoteMetadata {
        let meta = parse_note_metadata(rel_path, content);
        {
            let mut cache = self.notes_cache.write().await;
            if rel_path.to_lowercase().ends_with(".md") {
                cache.insert(rel_path.to_string(), content.to_string());
            }
        }
        {
            let mut graph = self.graph.write().await;
            if rel_path.to_lowercase().ends_with(".md") {
                graph.insert_note(meta.clone());
            }
        }
        meta
    }

    pub async fn create_note(&self, rel_path: &str, content: &str) -> Result<NoteMetadata> {
        let _mutation = self.mutation.lock().await;
        self.storage.create(rel_path, content).await?;
        Ok(self.cache_note(rel_path, content).await)
    }

    pub async fn create_folder(&self, path: &str) -> Result<()> {
        let _mutation = self.mutation.lock().await;
        self.storage.create_dir(path).await
    }

    pub async fn check(&self) -> Result<()> {
        self.storage.check().await
    }

    pub async fn write_asset(&self, rel_path: &str, bytes: Vec<u8>) -> Result<()> {
        let _mutation = self.mutation.lock().await;
        let clean = rel_path;
        crate::local_fs::validate(clean)?;
        self.storage.create_bytes(clean, bytes).await?;
        Ok(())
    }

    pub async fn delete_entry(&self, rel_path: &str) -> Result<()> {
        let _mutation = self.mutation.lock().await;
        self.storage.delete(rel_path).await?;
        let mut cache = self.notes_cache.write().await;
        cache.retain(|path, _| path != rel_path && !path.starts_with(&format!("{rel_path}/")));
        self.graph.write().await.remove_note(rel_path);
        Ok(())
    }

    pub async fn get_tree(&self) -> Result<FileNode> {
        if self.storage.storage_type() == &StorageType::Local {
            let root_path = PathBuf::from(self.storage.root());
            let node =
                tokio::task::spawn_blocking(move || build_local_tree(&root_path, &root_path))
                    .await
                    .map_err(std::io::Error::other)?;
            Ok(node)
        } else {
            let mut remaining = 25_000;
            self.remote_folder("", &self.info.name, 0, &mut remaining)
                .await
        }
    }

    async fn remote_folder(
        &self,
        path: &str,
        name: &str,
        depth: usize,
        remaining: &mut usize,
    ) -> Result<FileNode> {
        if depth >= 64 {
            return Err(StorageError::Unsupported(
                "La bóveda remota supera 64 niveles de carpetas".into(),
            ));
        }
        let prefix = if path.is_empty() {
            String::new()
        } else {
            format!("{path}/")
        };
        let mut children = Vec::new();
        let mut seen = std::collections::HashSet::new();
        for entry in self.storage.list(&prefix).await? {
            let entry_path = entry.path().trim_end_matches('/');
            if entry_path == path {
                continue;
            }
            let Some(child) = entry_path.strip_prefix(&prefix) else {
                continue;
            };
            if child.is_empty() || child.starts_with('.') || child.contains('/') {
                continue;
            }
            crate::local_fs::validate(entry_path)?;
            if !seen.insert(child.to_owned()) {
                return Err(StorageError::Unsupported(format!(
                    "El proveedor devolvió una ruta duplicada: {entry_path}"
                )));
            }
            let is_dir = entry.metadata().is_dir() || entry.path().ends_with('/');
            if !is_dir && !supported_file(Path::new(child)) {
                continue;
            }
            *remaining = remaining.checked_sub(1).ok_or_else(|| {
                StorageError::Unsupported(
                    "La bóveda remota supera 25 000 archivos y carpetas visibles".into(),
                )
            })?;
            if is_dir {
                children.push(
                    Box::pin(self.remote_folder(entry_path, child, depth + 1, remaining)).await?,
                );
            } else {
                children.push(FileNode {
                    name: child.to_owned(),
                    path: entry_path.to_owned(),
                    is_dir: false,
                    children: None,
                    size: Some(entry.metadata().content_length()),
                    modified_at: entry
                        .metadata()
                        .last_modified()
                        .map(|time| time.into_inner().as_second()),
                });
            }
        }
        children.sort_by(|a, b| (!a.is_dir, &a.name).cmp(&(!b.is_dir, &b.name)));
        Ok(FileNode {
            name: name.to_owned(),
            path: path.to_owned(),
            is_dir: true,
            children: Some(children),
            size: None,
            modified_at: None,
        })
    }

    pub async fn reindex(&self) -> Result<usize> {
        let _mutation = self.mutation.lock().await;
        if self.storage.storage_type() == &StorageType::Local {
            return self.index_unlocked().await;
        }
        let tree = self.get_tree().await?;
        self.index_remote_tree(&tree).await
    }

    async fn index_remote_tree(&self, tree: &FileNode) -> Result<usize> {
        let mut paths = Vec::new();
        collect_note_paths(tree, &mut paths);
        let mut cache = std::collections::HashMap::new();
        let mut notes = Vec::new();
        // Fetch in bounded batches and replace the index only after all reads succeed.
        for batch in paths.chunks(8) {
            let mut tasks = tokio::task::JoinSet::new();
            for path in batch {
                let path = (*path).to_owned();
                let storage = self.storage.clone();
                tasks
                    .spawn(async move { storage.read(&path).await.map(|content| (path, content)) });
            }
            while let Some(result) = tasks.join_next().await {
                let (path, content) = result.map_err(std::io::Error::other)??;
                notes.push(parse_note_metadata(&path, &content));
                cache.insert(path, content);
            }
        }
        let count = notes.len();
        self.graph.write().await.replace_notes(notes);
        *self.notes_cache.write().await = cache;
        Ok(count)
    }

    pub async fn index_all_local(&self) -> Result<usize> {
        let _mutation = self.mutation.lock().await;
        self.index_unlocked().await
    }

    pub(crate) async fn index_unlocked(&self) -> Result<usize> {
        if self.storage.storage_type() != &StorageType::Local {
            return Ok(0);
        }
        let root = PathBuf::from(self.storage.root());
        let paths = tokio::task::spawn_blocking(move || {
            WalkDir::new(&root)
                .follow_links(false)
                .into_iter()
                .filter_entry(|e| {
                    e.depth() == 0 || !e.file_name().to_string_lossy().starts_with('.')
                })
                .filter_map(|e| e.ok())
                .filter(|e| {
                    e.file_type().is_file()
                        && e.path()
                            .extension()
                            .is_some_and(|s| s.eq_ignore_ascii_case("md"))
                })
                .filter_map(|e| relative_vault_path(e.path(), &root))
                .collect::<Vec<_>>()
        })
        .await
        .map_err(std::io::Error::other)?;
        let mut cache = std::collections::HashMap::new();
        let mut notes = Vec::new();
        for path in paths {
            let content = self.storage.read(&path).await?;
            notes.push(parse_note_metadata(&path, &content));
            cache.insert(path, content);
        }
        let count = notes.len();
        self.graph.write().await.replace_notes(notes);
        *self.notes_cache.write().await = cache;
        Ok(count)
    }

    pub async fn refresh_local(&self) -> Result<String> {
        use sha2::{Digest, Sha256};
        let _mutation = self.mutation.lock().await;
        let tree = if self.storage.storage_type() == &StorageType::Local {
            self.index_unlocked().await?;
            self.get_tree().await?
        } else {
            let tree = self.get_tree().await?;
            self.index_remote_tree(&tree).await?;
            tree
        };
        let mut hash = Sha256::new();
        hash.update(serde_json::to_vec(&tree).map_err(std::io::Error::other)?);
        let cache = self.notes_cache.read().await;
        let mut paths: Vec<_> = cache.keys().collect();
        paths.sort();
        for path in paths {
            hash.update((path.len() as u64).to_le_bytes());
            hash.update(path.as_bytes());
            hash.update(cache[path].as_bytes());
        }
        Ok(hex::encode(hash.finalize()))
    }

    pub async fn indexed_notes(&self) -> Vec<NoteMetadata> {
        self.graph.read().await.indexed_notes()
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
        self.search_advanced(query).await.unwrap_or_default()
    }
    pub async fn search_advanced(&self, query: &str) -> Result<Vec<SearchResult>> {
        let cache = self.notes_cache.read().await;
        Ok(crate::query::search(&cache, query)?)
    }
}

fn remote_vault_id(parts: &[&str]) -> String {
    use sha2::{Digest, Sha256};
    let mut hash = Sha256::new();
    for part in parts {
        hash.update((part.len() as u64).to_le_bytes());
        hash.update(part.as_bytes());
    }
    hex::encode(hash.finalize())
}

fn collect_note_paths<'a>(node: &'a FileNode, paths: &mut Vec<&'a str>) {
    if let Some(children) = &node.children {
        for child in children {
            collect_note_paths(child, paths);
        }
    } else if Path::new(&node.path)
        .extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
    {
        paths.push(&node.path);
    }
}

fn supported_file(path: &Path) -> bool {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    matches!(
        extension.as_str(),
        "md" | "canvas"
            | "base"
            | "excalidraw"
            | "excalidrawlib"
            | "png"
            | "jpg"
            | "jpeg"
            | "gif"
            | "svg"
            | "webp"
            | "avif"
            | "bmp"
            | "ico"
            | "pdf"
    )
}

fn relative_vault_path(path: &Path, root: &Path) -> Option<String> {
    let rel = path.strip_prefix(root).ok()?;
    #[cfg(windows)]
    return Some(rel.to_string_lossy().replace('\\', "/"));
    #[cfg(not(windows))]
    return Some(rel.to_string_lossy().into_owned());
}

fn build_local_tree(dir: &Path, root: &Path) -> FileNode {
    let name = dir
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("root")
        .to_string();

    let rel_path = relative_vault_path(dir, root).unwrap_or_default();

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

            if entry.file_type().map(|t| t.is_symlink()).unwrap_or(true) {
                continue;
            }
            if path.is_dir() {
                children.push(build_local_tree(&path, root));
            } else if supported_file(&path) {
                let file_rel = relative_vault_path(&path, root).unwrap_or_default();
                let size = entry.metadata().map(|m| m.len()).ok();
                let modified = entry
                    .metadata()
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

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn remote_tree_indexes_nested_notes_and_preserves_previous_index_on_failed_refresh() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("Projects/Sub")).unwrap();
        std::fs::create_dir_all(root.join(".private")).unwrap();
        std::fs::write(root.join("Projects/Sub/A.md"), "initial [[B]]").unwrap();
        std::fs::write(root.join("Projects/Sub/B.md"), "# B").unwrap();
        std::fs::write(root.join(".private/Hidden.md"), "hidden content").unwrap();
        std::fs::write(root.join("Projects/View.base"), "views: []").unwrap();
        let mut vault = Vault::new_local("Remote test", root.to_str().unwrap()).unwrap();
        vault.storage = StorageManager::test_remote_fs(root.to_str().unwrap()).unwrap();
        vault.info.storage_type = StorageType::Webdav;

        let tree = vault.get_tree().await.unwrap();
        let projects = &tree.children.unwrap()[0];
        assert_eq!(projects.path, "Projects");
        let children = projects.children.as_ref().unwrap();
        assert_eq!(
            children[0].children.as_ref().unwrap()[0].path,
            "Projects/Sub/A.md"
        );
        assert_eq!(children[1].path, "Projects/View.base");
        assert_eq!(vault.reindex().await.unwrap(), 2);
        assert_eq!(vault.search("initial").await.len(), 1);
        assert!(vault.search("hidden").await.is_empty());
        assert_eq!(
            vault.get_backlinks("Projects/Sub/B.md").await,
            vec!["Projects/Sub/A.md"]
        );
        assert!(matches!(
            vault.read_note("Projects/Missing.md").await,
            Err(StorageError::NotFound(_))
        ));

        std::fs::write(root.join("Projects/Sub/A.md"), "updated").unwrap();
        std::fs::write(root.join("Projects/Invalid.md"), [0xff]).unwrap();
        assert!(vault.refresh_local().await.is_err());
        assert_eq!(vault.search("initial").await.len(), 1);
        assert!(vault.search("updated").await.is_empty());

        std::fs::remove_file(root.join("Projects/Invalid.md")).unwrap();
        std::fs::remove_file(root.join("Projects/Sub/B.md")).unwrap();
        vault.refresh_local().await.unwrap();
        assert_eq!(vault.indexed_notes().await.len(), 1);
        assert_eq!(vault.search("updated").await.len(), 1);
    }

    #[test]
    fn remote_identity_distinguishes_credentials_and_path_boundaries() {
        assert_ne!(
            remote_vault_id(&["gdrive", "", "account1"]),
            remote_vault_id(&["gdrive", "", "account2"])
        );
        assert_ne!(
            remote_vault_id(&["webdav", "ab", "c"]),
            remote_vault_id(&["webdav", "a", "bc"])
        );
    }

    use tempfile::tempdir;

    #[tokio::test]
    async fn test_vault_create_read_write_note() {
        let dir = tempdir().unwrap();
        let vault = Vault::new_local("Test Vault", dir.path().to_str().unwrap()).unwrap();

        let note_rel = "Documentos/Prueba.md";
        let content = "# Título de Prueba\nTexto con [[Enlace]]";

        vault.write_note(note_rel, content).await.unwrap();

        let read_back = vault.read_note(note_rel).await.unwrap();
        assert_eq!(read_back, content);
    }

    #[tokio::test]
    async fn test_vault_asset_direct_and_recursive_lookup() {
        let dir = tempdir().unwrap();
        let vault = Vault::new_local("Test Vault", dir.path().to_str().unwrap()).unwrap();

        let asset_rel = "Recursos/Imagenes/logo.png";
        let binary_data = vec![0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

        vault
            .write_asset(asset_rel, binary_data.clone())
            .await
            .unwrap();

        // 1. Búsqueda por ruta directa exacta
        let direct = vault.read_bytes(asset_rel).await.unwrap();
        assert_eq!(direct, binary_data);

        // 2. Búsqueda recursiva por nombre de archivo (igual que Obsidian ![[logo.png]])
        let recursive = vault.read_bytes("logo.png").await.unwrap();
        assert_eq!(recursive, binary_data);
    }

    #[tokio::test]
    async fn test_vault_file_tree_ignores_hidden() {
        let dir = tempdir().unwrap();
        let vault = Vault::new_local("Test Vault", dir.path().to_str().unwrap()).unwrap();

        vault
            .write_note("Notas/Nota1.md", "Contenido 1")
            .await
            .unwrap();
        vault
            .write_note(".obsidian/app.json", "Ignored")
            .await
            .unwrap();
        vault
            .write_asset(".git/config", vec![1, 2, 3])
            .await
            .unwrap();

        let tree = vault.get_tree().await.unwrap();
        assert!(tree.is_dir);
        let children = tree.children.expect("Children should exist");

        // Comprobamos que directorios ocultos (.obsidian, .git) no se muestren en la raíz
        let hidden_found = children.iter().any(|c| c.name.starts_with('.'));
        assert!(!hidden_found, "Las carpetas ocultas deben ser filtradas");

        let notas_folder = children.iter().find(|c| c.name == "Notas");
        assert!(
            notas_folder.is_some(),
            "La carpeta Notas debe estar presente"
        );
    }

    #[tokio::test]
    async fn test_vault_indexing_search_and_graph() {
        let dir = tempdir().unwrap();
        let vault = Vault::new_local("Test Vault", dir.path().to_str().unwrap()).unwrap();

        vault
            .write_note("Nota_Origen.md", "Esta nota enlaza a [[Nota_Destino]]")
            .await
            .unwrap();
        vault
            .write_note("Nota_Destino.md", "Esta es la nota destino")
            .await
            .unwrap();

        // Indexación de la bóveda
        let count = vault.index_all_local().await.unwrap();
        assert_eq!(count, 2);

        // Prueba del motor de búsqueda
        let results = vault.search("destino").await;
        assert!(!results.is_empty());
        assert!(results.iter().any(|r| r.path.contains("Nota_Destino.md")));

        // Prueba de grafo de conocimiento y backlinks
        let backlinks = vault.get_backlinks("Nota_Destino").await;
        assert_eq!(backlinks, vec!["Nota_Origen.md".to_string()]);
    }
}
