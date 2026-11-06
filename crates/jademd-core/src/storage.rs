use crate::local_fs;
use crate::models::StorageType;
use crate::webdav_write::WebdavWrite;
use opendal::{services, Operator};
use std::sync::Arc;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum StorageError {
    #[error("OpenDAL Error: {0}")]
    OpenDal(#[from] opendal::Error),
    #[error("I/O Error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Not found: {0}")]
    NotFound(String),
    #[error("Already exists: {0}")]
    AlreadyExists(String),
    #[error("Conflicto: el archivo cambió fuera de esta edición: {0}")]
    Conflict(String),
    #[error("Unsupported operation: {0}")]
    Unsupported(String),
}

pub type Result<T> = std::result::Result<T, StorageError>;

#[derive(Clone)]
pub struct StorageManager {
    op: Operator,
    storage_type: StorageType,
    root: String,
    local_root: Option<Arc<local_fs::Root>>,
    webdav_write: Option<WebdavWrite>,
}

impl StorageManager {
    pub fn new_local(root_path: &str) -> Result<Self> {
        let canonical = std::fs::canonicalize(root_path)?;
        if !canonical.is_dir() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "La bóveda debe ser un directorio existente",
            )
            .into());
        }
        let root_path = canonical.to_str().ok_or_else(|| {
            std::io::Error::new(std::io::ErrorKind::InvalidInput, "Ruta no UTF-8")
        })?;
        let local_root = Arc::new(local_fs::open_root(&canonical)?);
        let builder = services::Fs::default().root(root_path);
        let op = Operator::new(builder)?;
        Ok(Self {
            op,
            storage_type: StorageType::Local,
            root: root_path.to_string(),
            local_root: Some(local_root),
            webdav_write: None,
        })
    }

    pub fn new_webdav(
        endpoint: &str,
        username: Option<&str>,
        password: Option<&str>,
        root: &str,
    ) -> Result<Self> {
        let mut builder = services::Webdav::default();
        builder = builder.endpoint(endpoint).root(root);
        if let Some(u) = username {
            builder = builder.username(u);
        }
        if let Some(p) = password {
            builder = builder.password(p);
        }
        let transport = crate::remote_http::transport()?;
        let webdav_write = WebdavWrite::new(endpoint, root, username, password, transport.clone())?;
        let op = Operator::new(builder)?
            .with_context(opendal::OperationContext::new().with_http_transport(transport));
        Ok(Self {
            op,
            storage_type: StorageType::Webdav,
            root: root.to_string(),
            local_root: None,
            webdav_write: Some(webdav_write),
        })
    }

    pub fn new_gdrive(
        access_token: Option<&str>,
        refresh_token: Option<&str>,
        client_id: Option<&str>,
        client_secret: Option<&str>,
        root: &str,
    ) -> Result<Self> {
        let mut builder = services::Gdrive::default();
        builder = builder.root(root);
        if let Some(t) = access_token {
            builder = builder.access_token(t);
        }
        if let Some(rt) = refresh_token {
            builder = builder.refresh_token(rt);
        }
        if let Some(cid) = client_id {
            builder = builder.client_id(cid);
        }
        if let Some(cs) = client_secret {
            builder = builder.client_secret(cs);
        }
        let transport = crate::remote_http::transport()?;
        let op = Operator::new(builder)?
            .with_context(opendal::OperationContext::new().with_http_transport(transport));
        Ok(Self {
            op,
            storage_type: StorageType::Gdrive,
            root: root.to_string(),
            local_root: None,
            webdav_write: None,
        })
    }

    #[cfg(test)]
    pub(crate) fn test_remote_fs(root: &str) -> Result<Self> {
        Ok(Self {
            op: Operator::new(services::Fs::default().root(root))?,
            storage_type: StorageType::Webdav,
            root: root.to_owned(),
            local_root: None,
            webdav_write: None,
        })
    }

    pub fn storage_type(&self) -> &StorageType {
        &self.storage_type
    }

    pub fn root(&self) -> &str {
        &self.root
    }

    pub async fn read(&self, path: &str) -> Result<String> {
        String::from_utf8(self.read_bytes(path).await?)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e).into())
    }

    pub async fn read_bytes(&self, path: &str) -> Result<Vec<u8>> {
        local_fs::validate(path)?;
        if let Some(root) = self.local_root.clone() {
            let path = path.to_owned();
            return blocking(move || local_fs::read(&root, &path)).await;
        }
        match self.op.read(path).await {
            Ok(buffer) => Ok(buffer.to_vec()),
            Err(error) if error.kind() == opendal::ErrorKind::NotFound => {
                Err(StorageError::NotFound(path.to_owned()))
            }
            Err(error) => Err(error.into()),
        }
    }

    pub async fn write(&self, path: &str, content: &str) -> Result<()> {
        self.write_bytes(path, content.as_bytes().to_vec()).await
    }

    pub async fn create(&self, path: &str, content: &str) -> Result<()> {
        self.create_bytes(path, content.as_bytes().to_vec()).await
    }
    pub async fn create_bytes(&self, path: &str, bytes: Vec<u8>) -> Result<()> {
        local_fs::validate(path)?;
        if let Some(root) = self.local_root.clone() {
            let path = path.to_owned();
            return blocking(move || local_fs::write(&root, &path, &bytes, true)).await;
        }
        if let Some(webdav) = &self.webdav_write {
            return webdav.create(path, bytes).await;
        }
        // Do not silently downgrade exclusive creation to an exists/write race on cloud storage.
        match self.op.write_with(path, bytes).if_not_exists(true).await {
            Ok(_) => Ok(()),
            Err(error)
                if matches!(
                    error.kind(),
                    opendal::ErrorKind::AlreadyExists | opendal::ErrorKind::ConditionNotMatch
                ) =>
            {
                Err(StorageError::AlreadyExists(path.to_owned()))
            }
            Err(error) if error.kind() == opendal::ErrorKind::Unsupported => {
                Err(StorageError::Unsupported(
                    "El proveedor no admite crear archivos sin riesgo de sobrescritura".into(),
                ))
            }
            Err(error) => Err(error.into()),
        }
    }

    pub(crate) async fn write_checked(
        &self,
        path: &str,
        content: &str,
        expected: Option<&str>,
    ) -> Result<()> {
        local_fs::validate(path)?;
        let conflict = || StorageError::Conflict(path.to_owned());
        let Some(expected) = expected else {
            return self
                .create(path, content)
                .await
                .map_err(|error| match error {
                    StorageError::AlreadyExists(_) => conflict(),
                    StorageError::Io(error)
                        if error.kind() == std::io::ErrorKind::AlreadyExists =>
                    {
                        conflict()
                    }
                    error => error,
                });
        };
        if let Some(root) = self.local_root.clone() {
            let target = path.to_owned();
            let expected = expected.as_bytes().to_vec();
            let bytes = content.as_bytes().to_vec();
            let written =
                blocking(move || local_fs::replace_checked(&root, &target, &expected, &bytes))
                    .await?;
            return if written { Ok(()) } else { Err(conflict()) };
        }
        if let Some(webdav) = &self.webdav_write {
            return webdav
                .replace(path, expected.as_bytes(), content.as_bytes().to_vec())
                .await;
        }
        // Drive currently exposes no atomic conditional write through this backend.
        match self.read(path).await {
            Ok(current) if current == expected => self.write(path, content).await,
            Ok(_) | Err(StorageError::NotFound(_)) => Err(conflict()),
            Err(error) => Err(error),
        }
    }

    pub async fn write_bytes(&self, path: &str, bytes: Vec<u8>) -> Result<()> {
        local_fs::validate(path)?;
        if let Some(root) = self.local_root.clone() {
            let path = path.to_owned();
            return blocking(move || local_fs::write(&root, &path, &bytes, false)).await;
        }
        self.op.write(path, bytes).await?;
        Ok(())
    }

    pub async fn delete(&self, path: &str) -> Result<()> {
        local_fs::validate(path)?;
        if let Some(root) = self.local_root.clone() {
            let path = path.to_owned();
            return blocking(move || local_fs::delete(&root, &path)).await;
        }
        self.op.delete(path).await?;
        Ok(())
    }

    pub async fn exists(&self, path: &str) -> Result<bool> {
        local_fs::validate(path)?;
        if let Some(root) = self.local_root.clone() {
            let path = path.to_owned();
            return blocking(move || local_fs::exists(&root, &path)).await;
        }
        Ok(self.op.exists(path).await?)
    }

    pub async fn rename_local(&self, from: &str, to: &str) -> Result<()> {
        let root = self.local_root.clone().ok_or_else(|| {
            StorageError::Unsupported("Mover y restaurar requiere una bóveda local".into())
        })?;
        let from = from.to_string();
        let to = to.to_string();
        blocking(move || local_fs::rename(&root, &from, &to)).await
    }

    pub async fn create_dir(&self, path: &str) -> Result<()> {
        local_fs::validate(path)?;
        if let Some(root) = self.local_root.clone() {
            let path = path.to_string();
            return blocking(move || local_fs::create_dir(&root, &path)).await;
        }
        self.op
            .create_dir(&format!("{}/", path.trim_end_matches('/')))
            .await?;
        Ok(())
    }

    pub async fn list_local_names(&self, path: &str) -> Result<Vec<String>> {
        let root = self.local_root.clone().ok_or_else(|| {
            StorageError::Unsupported("Esta operación requiere una bóveda local".into())
        })?;
        let path = path.to_string();
        blocking(move || local_fs::list_names(&root, &path)).await
    }

    pub async fn check(&self) -> Result<()> {
        self.op.check().await?;
        Ok(())
    }

    pub async fn list(&self, dir: &str) -> Result<Vec<opendal::Entry>> {
        let clean_dir = if dir.is_empty() || dir == "/" {
            ""
        } else {
            dir.trim_start_matches('/')
        };
        let lister = self.op.list(clean_dir).await?;
        Ok(lister)
    }
}

async fn blocking<T: Send + 'static>(
    job: impl FnOnce() -> std::io::Result<T> + Send + 'static,
) -> Result<T> {
    tokio::task::spawn_blocking(job)
        .await
        .map_err(std::io::Error::other)?
        .map_err(StorageError::Io)
}
