use crate::storage::{Result, StorageError};
use http::{header, HeaderValue, Method, Request, StatusCode, Uri};
use opendal::raw::{format_authorization_by_basic, normalize_root, percent_encode_path};
use opendal::{Buffer, HttpTransporter};
use std::io;

#[derive(Clone)]
pub(crate) struct WebdavWrite {
    transport: HttpTransporter,
    endpoint: String,
    root: String,
    authorization: Option<String>,
}

impl WebdavWrite {
    pub(crate) fn new(
        endpoint: &str,
        root: &str,
        username: Option<&str>,
        password: Option<&str>,
        transport: HttpTransporter,
    ) -> Result<Self> {
        let invalid = || io::Error::new(io::ErrorKind::InvalidInput, "URL WebDAV inválida");
        let uri: Uri = endpoint.parse().map_err(|_| invalid())?;
        if endpoint.contains(['#', '\\'])
            || !matches!(uri.scheme_str(), Some("http" | "https"))
            || uri
                .authority()
                .is_none_or(|authority| authority.as_str().contains('@'))
            || uri.query().is_some()
        {
            return Err(invalid().into());
        }
        let root = normalize_root(root);
        if root != "/" {
            crate::local_fs::validate(root.trim_matches('/'))?;
        }
        let authorization = username
            .map(|user| format_authorization_by_basic(user, password.unwrap_or_default()))
            .transpose()?;
        Ok(Self {
            transport,
            endpoint: endpoint.trim_end_matches('/').to_owned(),
            root,
            authorization,
        })
    }

    fn request(&self, method: Method, path: &str) -> Result<http::request::Builder> {
        crate::local_fs::validate(path)?;
        let path =
            opendal::raw::build_rooted_abs_path(&self.root, &opendal::raw::normalize_path(path));
        let mut request = Request::builder()
            .method(method)
            .uri(format!("{}{}", self.endpoint, percent_encode_path(&path)))
            .header(header::ACCEPT_ENCODING, "identity");
        if let Some(authorization) = &self.authorization {
            request = request.header(header::AUTHORIZATION, authorization);
        }
        Ok(request)
    }

    pub(crate) async fn create(&self, path: &str, bytes: Vec<u8>) -> Result<()> {
        self.put(
            path,
            bytes,
            header::IF_NONE_MATCH,
            HeaderValue::from_static("*"),
        )
        .await
    }

    pub(crate) async fn replace(&self, path: &str, expected: &[u8], bytes: Vec<u8>) -> Result<()> {
        let request = self
            .request(Method::GET, path)?
            .body(Buffer::new())
            .map_err(opendal::raw::new_request_build_error)?;
        let response = self.transport.send(request).await?;
        match response.status() {
            StatusCode::OK => {}
            StatusCode::NOT_FOUND => return Err(StorageError::Conflict(path.to_owned())),
            status => return Err(status_error("leer", status)),
        }
        if response.body().to_vec() != expected {
            return Err(StorageError::Conflict(path.to_owned()));
        }
        let tag = response
            .headers()
            .get(header::ETAG)
            .filter(|tag| strong_tag(tag))
            .ok_or_else(|| {
                StorageError::Unsupported(
                    "El servidor WebDAV no devolvió un ETag fuerte para guardar de forma segura"
                        .into(),
                )
            })?;
        self.put(path, bytes, header::IF_MATCH, tag.clone()).await
    }

    async fn put(
        &self,
        path: &str,
        bytes: Vec<u8>,
        condition: header::HeaderName,
        tag: HeaderValue,
    ) -> Result<()> {
        let creating = condition == header::IF_NONE_MATCH;
        let request = self
            .request(Method::PUT, path)?
            .header(condition, tag)
            .header(header::CONTENT_LENGTH, bytes.len())
            .body(Buffer::from(bytes))
            .map_err(opendal::raw::new_request_build_error)?;
        let response = self.transport.send(request).await?;
        match response.status() {
            StatusCode::OK | StatusCode::CREATED | StatusCode::NO_CONTENT => Ok(()),
            StatusCode::PRECONDITION_FAILED if creating => {
                Err(StorageError::AlreadyExists(path.to_owned()))
            }
            StatusCode::PRECONDITION_FAILED | StatusCode::NOT_FOUND if !creating => {
                Err(StorageError::Conflict(path.to_owned()))
            }
            status => Err(status_error("guardar", status)),
        }
    }
}

fn strong_tag(tag: &HeaderValue) -> bool {
    let bytes = tag.as_bytes();
    bytes.len() >= 2
        && bytes.first() == Some(&b'"')
        && bytes.last() == Some(&b'"')
        && bytes[1..bytes.len() - 1]
            .iter()
            .all(|byte| matches!(byte, 0x21 | 0x23..=0x7e | 0x80..=0xff))
}

fn status_error(operation: &str, status: StatusCode) -> StorageError {
    let kind = match status {
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => io::ErrorKind::PermissionDenied,
        _ => io::ErrorKind::Other,
    };
    io::Error::new(
        kind,
        format!("WebDAV devolvió HTTP {} al {operation}", status.as_u16()),
    )
    .into()
}

#[cfg(test)]
mod tests {
    use super::*;
    use http::Response;
    use opendal::{HttpBody, HttpTransport};
    use std::sync::{Arc, Mutex};
    use tokio::sync::Barrier;

    #[derive(Clone)]
    struct DavServer {
        state: Arc<Mutex<Resource>>,
        readers: Option<Arc<Barrier>>,
    }

    struct Resource {
        bytes: Option<Vec<u8>>,
        revision: u32,
        weak: bool,
        puts: usize,
    }

    impl DavServer {
        fn writer(&self) -> WebdavWrite {
            WebdavWrite::new(
                "https://dav.example.test/remote.php/dav/",
                "/Mi bóveda/",
                Some("ana"),
                Some("clave"),
                HttpTransporter::new(self.clone()),
            )
            .unwrap()
        }
    }

    impl HttpTransport for DavServer {
        async fn fetch(&self, request: Request<Buffer>) -> opendal::Result<Response<HttpBody>> {
            assert_eq!(
                request.uri().path(),
                "/remote.php/dav/Mi%20b%C3%B3veda/A%20%23.md"
            );
            assert!(request.headers()[header::AUTHORIZATION].is_sensitive());
            let (status, tag, bytes) = {
                let mut state = self.state.lock().unwrap();
                let tag = format!("\"{}\"", state.revision);
                if request.method() == Method::GET {
                    match &state.bytes {
                        Some(bytes) => {
                            let tag = if state.weak { format!("W/{tag}") } else { tag };
                            (StatusCode::OK, Some(tag), bytes.clone())
                        }
                        None => (StatusCode::NOT_FOUND, None, vec![]),
                    }
                } else {
                    assert_eq!(request.method(), Method::PUT);
                    state.puts += 1;
                    let valid = if request
                        .headers()
                        .get(header::IF_NONE_MATCH)
                        .is_some_and(|value| value == "*")
                    {
                        state.bytes.is_none()
                    } else {
                        assert!(request.headers().contains_key(header::IF_MATCH));
                        state.bytes.is_some() && request.headers()[header::IF_MATCH] == tag
                    };
                    if valid {
                        state.bytes = Some(request.body().to_vec());
                        state.revision += 1;
                        (StatusCode::NO_CONTENT, None, vec![])
                    } else {
                        (StatusCode::PRECONDITION_FAILED, None, vec![])
                    }
                }
            };
            if request.method() == Method::GET {
                if let Some(readers) = &self.readers {
                    readers.wait().await;
                }
            }
            let mut response = Response::builder().status(status);
            if let Some(tag) = tag {
                response = response.header(header::ETAG, tag);
            }
            Ok(response
                .body(HttpBody::new(
                    futures_util::stream::iter([Ok(Buffer::from(bytes))]),
                    None,
                ))
                .unwrap())
        }
    }

    fn dav(bytes: Option<&[u8]>, weak: bool) -> DavServer {
        DavServer {
            state: Arc::new(Mutex::new(Resource {
                bytes: bytes.map(<[u8]>::to_vec),
                revision: 1,
                weak,
                puts: 0,
            })),
            readers: None,
        }
    }

    #[tokio::test]
    async fn simultaneous_webdav_writers_cannot_replace_the_same_revision() {
        let mut server = dav(Some(b"base"), false);
        server.readers = Some(Arc::new(Barrier::new(2)));
        let first = server.writer();
        let second = server.writer();
        let (first_result, second_result) = tokio::join!(
            first.replace("A #.md", b"base", b"first".to_vec()),
            second.replace("A #.md", b"base", b"second".to_vec()),
        );
        let expected: &[u8] = match (first_result, second_result) {
            (Ok(()), Err(StorageError::Conflict(_))) => b"first",
            (Err(StorageError::Conflict(_)), Ok(())) => b"second",
            result => panic!("expected one accepted write and one conflict, got {result:?}"),
        };
        let state = server.state.lock().unwrap();
        assert_eq!(state.puts, 2);
        assert_eq!(state.bytes.as_deref(), Some(expected));
    }

    #[tokio::test]
    async fn stale_content_and_weak_etags_never_send_a_put() {
        let server = dav(Some(b"base"), true);
        let writer = server.writer();
        assert!(matches!(
            writer.replace("A #.md", b"stale", vec![]).await,
            Err(StorageError::Conflict(_))
        ));
        assert!(matches!(
            writer.replace("A #.md", b"base", vec![]).await,
            Err(StorageError::Unsupported(_))
        ));
        assert_eq!(server.state.lock().unwrap().puts, 0);
    }

    #[tokio::test]
    async fn conditional_creation_preserves_the_existing_file() {
        let server = dav(None, false);
        let writer = server.writer();
        writer.create("A #.md", b"original".to_vec()).await.unwrap();
        assert!(matches!(
            writer.create("A #.md", b"overwrite".to_vec()).await,
            Err(StorageError::AlreadyExists(_))
        ));
        assert_eq!(
            server.state.lock().unwrap().bytes.as_deref(),
            Some(b"original".as_slice())
        );
    }
}
