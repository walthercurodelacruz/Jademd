use crate::{
    markdown::visible_markdown,
    models::{FileNode, StorageType},
    storage::{Result, StorageError},
    Vault,
};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::{
    ops::Range,
    sync::{
        atomic::{AtomicU64, Ordering},
        OnceLock,
    },
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrashEntry {
    pub id: String,
    pub path: String,
    pub deleted_at: i64,
}
#[derive(Debug, Clone, Serialize)]
pub struct MoveResult {
    pub from: String,
    pub to: String,
    pub updated_files: Vec<String>,
}
#[derive(Serialize, Deserialize)]
struct Change {
    path: String,
    destination: String,
    before: String,
    after: String,
}

fn operation_id() -> String {
    static NEXT: AtomicU64 = AtomicU64::new(0);
    format!(
        "{:x}-{:x}-{:x}",
        chrono::Utc::now().timestamp_micros(),
        std::process::id(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    )
}
fn user_path(path: &str) -> Result<()> {
    crate::local_fs::validate(path)?;
    if crate::paths::normalize(path).as_deref() != Some(path)
        || path.split('/').any(|part| part.starts_with('.'))
        || path.contains(['#', '|', '[', ']', '\r', '\n', '\0'])
    {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "Utiliza una ruta visible sin caracteres reservados de enlaces",
        )
        .into());
    }
    Ok(())
}
fn remap(path: &str, from: &str, to: &str) -> String {
    if path == from {
        to.to_string()
    } else if let Some(suffix) = path.strip_prefix(&format!("{from}/")) {
        format!("{to}/{suffix}")
    } else {
        path.to_string()
    }
}
fn relative(source: &str, target: &str) -> String {
    let parent = source
        .rsplit_once('/')
        .map(|(parent, _)| parent)
        .unwrap_or("");
    let from: Vec<_> = parent.split('/').filter(|part| !part.is_empty()).collect();
    let to: Vec<_> = target.split('/').collect();
    let common = from.iter().zip(&to).take_while(|(a, b)| a == b).count();
    let parts: Vec<_> = std::iter::repeat_n("..", from.len() - common)
        .chain(to[common..].iter().copied())
        .collect();
    let path = parts.join("/");
    if path.starts_with("../") {
        path
    } else {
        format!("./{path}")
    }
}
struct Reference {
    range: Range<usize>,
    target: String,
    wiki: bool,
}
fn references(source: &str) -> Vec<Reference> {
    static WIKI: OnceLock<Regex> = OnceLock::new();
    static MARKDOWN: OnceLock<Regex> = OnceLock::new();
    let wiki = WIKI.get_or_init(|| Regex::new(r"!?\[\[([^\]\n|]+)(?:\|[^\]\n]*)?\]\]").unwrap());
    let md = MARKDOWN.get_or_init(|| Regex::new(r#"!?\[([^\]\n]*)\]\((?:<([^>\n]*)>|([^\s()]+(?:\([^)]*\)[^\s()]*)*))(?:[ \t]+["'][^\n]*?["'])?\)"#).unwrap());
    let visible = visible_markdown(source);
    let mut refs = Vec::new();
    for (regex, is_wiki) in [(wiki, true), (md, false)] {
        for captures in regex.captures_iter(source) {
            let full = captures.get(0).unwrap();
            if visible.as_bytes().get(full.start()) != source.as_bytes().get(full.start()) {
                continue;
            }
            let target = if is_wiki {
                captures.get(1).unwrap()
            } else {
                captures.get(2).or_else(|| captures.get(3)).unwrap()
            };
            let raw = target.as_str();
            let file = raw.split('#').next().unwrap_or(raw).trim();
            let file = if is_wiki {
                file.trim_end_matches('\\')
            } else {
                file
            };
            if file.is_empty() || file.contains(':') || file.starts_with("//") {
                continue;
            }
            let start = target.start() + raw.find(file).unwrap();
            let target = if is_wiki {
                raw.trim().trim_end_matches('\\').to_string()
            } else {
                percent_encoding::percent_decode_str(raw)
                    .decode_utf8_lossy()
                    .into_owned()
            };
            refs.push(Reference {
                range: start..start + file.len(),
                target,
                wiki: is_wiki,
            });
        }
    }
    refs.sort_by_key(|reference| reference.range.start);
    refs
}

fn document_paths(tree: &FileNode, result: &mut Vec<String>) {
    if !tree.is_dir
        && (tree.path.to_lowercase().ends_with(".md")
            || tree.path.to_lowercase().ends_with(".canvas"))
    {
        result.push(tree.path.clone());
    }
    for child in tree.children.iter().flatten() {
        document_paths(child, result);
    }
}

impl Vault {
    fn local_operations(&self) -> Result<()> {
        if self.storage.storage_type() != &StorageType::Local {
            return Err(StorageError::Unsupported(
                "Mover y recuperar con actualización de enlaces requiere almacenamiento local"
                    .into(),
            ));
        }
        Ok(())
    }

    async fn rewrite_markdown(
        &self,
        source: &str,
        path: &str,
        from: &str,
        to: &str,
    ) -> Result<String> {
        let new_source = remap(path, from, to);
        let mut replacements = Vec::new();
        for reference in references(source) {
            let resolved = match self.resolve_entry(&reference.target, path).await {
                Ok(path) => path,
                Err(_) => continue,
            };
            let destination = remap(&resolved, from, to);
            if destination == resolved && new_source == path {
                continue;
            }
            let old_file = &source[reference.range.clone()];
            let mut target =
                if reference.wiki && destination.contains('/') && !old_file.starts_with('.') {
                    destination.clone()
                } else {
                    relative(&new_source, &destination)
                };
            if reference.wiki
                && !old_file.to_lowercase().ends_with(".md")
                && target.to_lowercase().ends_with(".md")
            {
                target.truncate(target.len() - 3);
            }
            if !reference.wiki {
                const PATH: &percent_encoding::AsciiSet = &percent_encoding::CONTROLS
                    .add(b' ')
                    .add(b'(')
                    .add(b')')
                    .add(b'<')
                    .add(b'>')
                    .add(b'"')
                    .add(b'\\')
                    .add(b'#')
                    .add(b'%');
                target = percent_encoding::utf8_percent_encode(&target, PATH).to_string();
            }
            replacements.push((reference.range, target));
        }
        let mut result = source.to_string();
        let mut previous = source.len();
        for (range, replacement) in replacements.into_iter().rev() {
            if range.end > previous {
                continue;
            }
            previous = range.start;
            result.replace_range(range, &replacement);
        }
        Ok(result)
    }

    async fn rewrite_canvas(
        &self,
        source: &str,
        path: &str,
        from: &str,
        to: &str,
    ) -> Result<String> {
        let mut canvas: serde_json::Value = serde_json::from_str(source)
            .map_err(|error| std::io::Error::new(std::io::ErrorKind::InvalidData, error))?;
        let mut changed = false;
        if let Some(nodes) = canvas
            .get_mut("nodes")
            .and_then(|value| value.as_array_mut())
        {
            for node in nodes {
                for key in ["file", "background"] {
                    let Some(target) = node
                        .get(key)
                        .and_then(|value| value.as_str())
                        .map(str::to_string)
                    else {
                        continue;
                    };
                    let Ok(resolved) = self.resolve_entry(&target, path).await else {
                        continue;
                    };
                    let destination = remap(&resolved, from, to);
                    if destination != resolved || remap(path, from, to) != path {
                        node[key] = serde_json::Value::String(destination);
                        changed = true;
                    }
                }
            }
        }
        if !changed {
            return Ok(source.to_string());
        }
        let newline = if source.contains("\r\n") {
            "\r\n"
        } else {
            "\n"
        };
        Ok(serde_json::to_string_pretty(&canvas)
            .unwrap()
            .replace('\n', newline)
            + if source.ends_with('\n') { newline } else { "" })
    }

    pub async fn move_entry(&self, from: &str, to: &str) -> Result<MoveResult> {
        self.local_operations()?;
        user_path(from)?;
        user_path(to)?;
        if from == to || to.starts_with(&format!("{from}/")) {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "El destino debe ser diferente y estar fuera de la carpeta que se mueve",
            )
            .into());
        }
        let _mutation = self.mutation.lock().await;
        if !self.storage.exists(from).await? {
            return Err(StorageError::NotFound(from.into()));
        }
        if self.storage.exists(to).await? {
            return Err(StorageError::AlreadyExists(to.into()));
        }
        let mut paths = Vec::new();
        document_paths(&self.get_tree().await?, &mut paths);
        let mut changes = Vec::new();
        for path in paths {
            let before = self.storage.read(&path).await?;
            let after = if path.to_lowercase().ends_with(".canvas") {
                self.rewrite_canvas(&before, &path, from, to).await?
            } else {
                self.rewrite_markdown(&before, &path, from, to).await?
            };
            if before != after {
                changes.push(Change {
                    destination: remap(&path, from, to),
                    path,
                    before,
                    after,
                });
            }
        }
        for change in &changes {
            if self.storage.read(&change.path).await? != change.before {
                return Err(std::io::Error::other(
                    "Un documento cambió durante la preparación; vuelve a intentarlo",
                )
                .into());
            }
        }
        let journal = format!(".jademd/operations/{}/manifest.json", operation_id());
        self.storage.create(&journal, &serde_json::json!({ "status": "prepared", "from": from, "to": to, "changes": changes }).to_string()).await?;
        self.storage.rename_local(from, to).await?;
        let mut written = Vec::new();
        let operation: Result<()> = async {
            for (index, change) in changes.iter().enumerate() {
                if self.storage.read(&change.destination).await? != change.before {
                    return Err(
                        std::io::Error::other("Un documento cambió durante el movimiento").into(),
                    );
                }
                // Include a failed write in rollback: fsync may fail after the atomic replacement.
                written.push(index);
                self.storage
                    .write(&change.destination, &change.after)
                    .await?;
            }
            self.index_unlocked().await?;
            Ok(())
        }
        .await;
        if let Err(error) = operation {
            let mut rollback_failed = false;
            for index in written.into_iter().rev() {
                let change = &changes[index];
                match self.storage.read(&change.destination).await {
                    Ok(current) if current == change.after => {
                        if self
                            .storage
                            .write(&change.destination, &change.before)
                            .await
                            .is_err()
                        {
                            rollback_failed = true;
                        }
                    }
                    Ok(current) if current == change.before => {}
                    _ => rollback_failed = true,
                }
            }
            if self.storage.rename_local(to, from).await.is_err() {
                rollback_failed = true;
            }
            let _ = self.index_unlocked().await;
            if !rollback_failed {
                let _ = self.storage.write(&journal, &serde_json::json!({ "status": "rolled_back", "from": from, "to": to, "changes": changes }).to_string()).await;
            }
            return Err(std::io::Error::other(format!(
                "{error}. {} Copia de recuperación: {journal}",
                if rollback_failed {
                    "Se requiere revisar la recuperación."
                } else {
                    "Movimiento revertido."
                }
            ))
            .into());
        }
        if let Err(error) = self.storage.write(&journal, &serde_json::json!({ "status": "committed", "from": from, "to": to, "changes": changes }).to_string()).await {
            tracing::warn!(%error, %journal, "Movimiento completado; no se pudo actualizar el registro de recuperación");
        }
        Ok(MoveResult {
            from: from.into(),
            to: to.into(),
            updated_files: changes
                .iter()
                .map(|change| change.destination.clone())
                .collect(),
        })
    }

    pub async fn trash_entry(&self, path: &str) -> Result<TrashEntry> {
        self.local_operations()?;
        user_path(path)?;
        let _mutation = self.mutation.lock().await;
        if !self.storage.exists(path).await? {
            return Err(StorageError::NotFound(path.into()));
        }
        let entry = TrashEntry {
            id: operation_id(),
            path: path.into(),
            deleted_at: chrono::Utc::now().timestamp(),
        };
        let directory = format!(".jademd/trash/{}", entry.id);
        self.storage
            .create(
                &format!("{directory}/manifest.json"),
                &serde_json::to_string(&entry).unwrap(),
            )
            .await?;
        self.storage
            .rename_local(path, &format!("{directory}/payload"))
            .await?;
        if let Err(error) = self.index_unlocked().await {
            self.storage
                .rename_local(&format!("{directory}/payload"), path)
                .await?;
            let _ = self.index_unlocked().await;
            return Err(error);
        }
        Ok(entry)
    }

    pub async fn list_trash(&self) -> Result<Vec<TrashEntry>> {
        self.local_operations()?;
        if !self.storage.exists(".jademd/trash").await? {
            return Ok(Vec::new());
        }
        let mut entries = Vec::new();
        for id in self.storage.list_local_names(".jademd/trash").await? {
            if !id
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit() || byte == b'-')
            {
                continue;
            }
            if !self
                .storage
                .exists(&format!(".jademd/trash/{id}/payload"))
                .await?
            {
                continue;
            }
            let content = self
                .storage
                .read(&format!(".jademd/trash/{id}/manifest.json"))
                .await?;
            let entry: TrashEntry = serde_json::from_str(&content)
                .map_err(|error| std::io::Error::new(std::io::ErrorKind::InvalidData, error))?;
            if entry.id == id {
                entries.push(entry);
            }
        }
        entries.sort_by_key(|entry| std::cmp::Reverse(entry.deleted_at));
        Ok(entries)
    }

    pub async fn restore_entry(&self, id: &str) -> Result<TrashEntry> {
        self.local_operations()?;
        if id.is_empty()
            || !id
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit() || byte == b'-')
        {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "Identificador de papelera inválido",
            )
            .into());
        }
        let _mutation = self.mutation.lock().await;
        let content = self
            .storage
            .read(&format!(".jademd/trash/{id}/manifest.json"))
            .await?;
        let entry: TrashEntry = serde_json::from_str(&content)
            .map_err(|error| std::io::Error::new(std::io::ErrorKind::InvalidData, error))?;
        user_path(&entry.path)?;
        if entry.id != id {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "El registro de papelera no coincide",
            )
            .into());
        }
        self.storage
            .rename_local(&format!(".jademd/trash/{id}/payload"), &entry.path)
            .await?;
        if let Err(error) = self.index_unlocked().await {
            self.storage
                .rename_local(&entry.path, &format!(".jademd/trash/{id}/payload"))
                .await?;
            let _ = self.index_unlocked().await;
            return Err(error);
        }
        Ok(entry)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoveryOperation {
    pub id: String,
    pub from: String,
    pub to: String,
}
#[derive(Serialize, Deserialize)]
struct MoveJournal {
    status: String,
    from: String,
    to: String,
    changes: Vec<Change>,
}
fn valid_operation_id(id: &str) -> Result<()> {
    if id.is_empty() || !id.bytes().all(|c| c.is_ascii_hexdigit() || c == b'-') {
        return Err(
            std::io::Error::new(std::io::ErrorKind::InvalidInput, "Registro inválido").into(),
        );
    }
    Ok(())
}
impl Vault {
    pub async fn pending_operations(&self) -> Result<Vec<RecoveryOperation>> {
        self.local_operations()?;
        let _mutation = self.mutation.lock().await;
        if !self.storage.exists(".jademd/operations").await? {
            return Ok(vec![]);
        }
        let mut result = vec![];
        for id in self.storage.list_local_names(".jademd/operations").await? {
            if valid_operation_id(&id).is_err() {
                continue;
            }
            let raw = self
                .storage
                .read(&format!(".jademd/operations/{id}/manifest.json"))
                .await?;
            let journal: MoveJournal = serde_json::from_str(&raw).map_err(std::io::Error::other)?;
            if journal.status == "prepared" {
                result.push(RecoveryOperation {
                    id,
                    from: journal.from,
                    to: journal.to,
                });
            }
        }
        result.sort_by(|a, b| a.id.cmp(&b.id));
        Ok(result)
    }
    pub async fn recover_operation(&self, id: &str) -> Result<()> {
        self.local_operations()?;
        valid_operation_id(id)?;
        let _mutation = self.mutation.lock().await;
        let manifest = format!(".jademd/operations/{id}/manifest.json");
        let mut journal: MoveJournal = serde_json::from_str(&self.storage.read(&manifest).await?)
            .map_err(std::io::Error::other)?;
        if journal.status != "prepared" {
            return Ok(());
        }
        user_path(&journal.from)?;
        user_path(&journal.to)?;
        if journal.from == journal.to || journal.to.starts_with(&format!("{}/", journal.from)) {
            return Err(StorageError::Conflict("Registro inconsistente".into()));
        }
        let at_source = self.storage.exists(&journal.from).await?;
        let at_destination = self.storage.exists(&journal.to).await?;
        if at_source == at_destination {
            return Err(StorageError::Conflict(
                "Ambos destinos existen o ambos faltan; revisa el registro manualmente".into(),
            ));
        }
        let mut restores = vec![];
        let mut seen = std::collections::HashSet::new();
        for change in &journal.changes {
            user_path(&change.path)?;
            user_path(&change.destination)?;
            if change.destination != remap(&change.path, &journal.from, &journal.to)
                || !seen.insert(&change.path)
            {
                return Err(StorageError::Conflict("Registro inconsistente".into()));
            }
            let path = if at_source {
                &change.path
            } else {
                &change.destination
            };
            let current = self.storage.read(path).await?;
            if current != change.before && current != change.after {
                return Err(StorageError::Conflict(format!(
                    "{path} tiene cambios posteriores; se conserva sin sobrescribir"
                )));
            }
            if current == change.after {
                restores.push((path.clone(), change));
            }
        }
        // Revalidate each write. A crash while restoring is resumable because before/after are retained.
        for (path, change) in restores {
            if self.storage.read(&path).await? != change.after {
                return Err(StorageError::Conflict(path));
            }
            self.storage.write(&path, &change.before).await?;
        }
        if at_destination {
            self.storage
                .rename_local(&journal.to, &journal.from)
                .await?;
        }
        journal.status = "recovered".into();
        self.storage
            .write(
                &manifest,
                &serde_json::to_string(&journal).map_err(std::io::Error::other)?,
            )
            .await?;
        self.index_unlocked().await?;
        Ok(())
    }
}
