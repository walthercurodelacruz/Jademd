use opendal::{services, Operator};
use thiserror::Error;
use crate::models::StorageType;

#[derive(Error, Debug)]
pub enum StorageError {
    #[error("OpenDAL Error: {0}")]
    OpenDal(#[from] opendal::Error),
    #[error("I/O Error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Not found: {0}")]
    NotFound(String),
}

pub type Result<T> = std::result::Result<T, StorageError>;

#[derive(Clone)]
pub struct StorageManager {
    op: Operator,
    storage_type: StorageType,
    root: String,
}

impl StorageManager {
    pub fn new_local(root_path: &str) -> Result<Self> {
        let builder = services::Fs::default().root(root_path);
        let op = Operator::new(builder)?;
        Ok(Self {
            op,
            storage_type: StorageType::Local,
            root: root_path.to_string(),
        })
    }

    pub fn new_webdav(endpoint: &str, username: Option<&str>, password: Option<&str>, root: &str) -> Result<Self> {
        let mut builder = services::Webdav::default();
        builder = builder.endpoint(endpoint).root(root);
        if let Some(u) = username {
            builder = builder.username(u);
        }
        if let Some(p) = password {
            builder = builder.password(p);
        }
        let op = Operator::new(builder)?;
        Ok(Self {
            op,
            storage_type: StorageType::Webdav,
            root: root.to_string(),
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
        let op = Operator::new(builder)?;
        Ok(Self {
            op,
            storage_type: StorageType::Gdrive,
            root: root.to_string(),
        })
    }

    pub fn storage_type(&self) -> &StorageType {
        &self.storage_type
    }

    pub fn root(&self) -> &str {
        &self.root
    }

    pub async fn read(&self, path: &str) -> Result<String> {
        let clean_path = path.trim_start_matches('/');
        let buffer = self.op.read(clean_path).await?;
        let bytes = buffer.to_vec();
        let content = String::from_utf8_lossy(&bytes).to_string();
        Ok(content)
    }

    pub async fn write(&self, path: &str, content: &str) -> Result<()> {
        let clean_path = path.trim_start_matches('/');
        self.op.write(clean_path, content.as_bytes().to_vec()).await?;
        Ok(())
    }

    pub async fn delete(&self, path: &str) -> Result<()> {
        let clean_path = path.trim_start_matches('/');
        self.op.delete(clean_path).await?;
        Ok(())
    }

    pub async fn exists(&self, path: &str) -> Result<bool> {
        let clean_path = path.trim_start_matches('/');
        let res = self.op.exists(clean_path).await?;
        Ok(res)
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
