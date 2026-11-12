mod folders;
mod security;
use axum::middleware;
use axum::{
    extract::{Query, State},
    http::{header, Method, StatusCode},
    response::{Html, IntoResponse, Json},
    routing::{get, post},
    Router,
};
use security::{SessionSecurity, ORIGINS};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::RwLock;
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use jademd_core::Vault;

struct AppState {
    vault: RwLock<Option<Vault>>,
    session: SessionSecurity,
}

#[derive(Deserialize)]
struct OpenLocalRequest {
    path: String,
    name: Option<String>,
}

#[derive(Deserialize)]
struct OpenWebdavRequest {
    endpoint: String,
    username: Option<String>,
    password: Option<String>,
    root: Option<String>,
    name: Option<String>,
}

#[derive(Deserialize)]
struct OpenGdriveRequest {
    name: Option<String>,
    access_token: Option<String>,
    refresh_token: Option<String>,
    client_id: Option<String>,
    client_secret: Option<String>,
    root: Option<String>,
}

#[derive(Deserialize)]
struct NoteQuery {
    path: String,
    #[serde(default)]
    source: String,
}

#[derive(Deserialize)]
struct SaveNoteRequest {
    path: String,
    content: String,
    #[serde(default)]
    check_version: bool,
    expected_content: Option<String>,
}

#[derive(Deserialize)]
struct CreateEntryRequest {
    path: String,
    content: Option<String>,
    vault_id: Option<String>,
}

#[derive(Deserialize)]
struct SearchQuery {
    q: String,
}

#[derive(Deserialize)]
struct BacklinksQuery {
    title: String,
}

#[derive(Serialize)]
struct ApiResponse<T> {
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

impl<T> ApiResponse<T> {
    fn ok(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    fn err(msg: impl Into<String>) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(msg.into()),
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // The desktop owns this pipe. EOF also occurs when its process crashes or is killed.
    if std::env::args().any(|arg| arg == "--desktop") {
        std::thread::spawn(|| {
            use std::io::Read;
            let mut buffer = [0; 64];
            while let Ok(count) = std::io::stdin().read(&mut buffer) {
                if count == 0 {
                    break;
                }
            }
            std::process::exit(0);
        });
    }
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "jademd=info,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let session = SessionSecurity::new().map_err(std::io::Error::other)?;
    let state = Arc::new(AppState {
        vault: RwLock::new(None),
        session: session.clone(),
    });

    let cors = CorsLayer::new()
        .allow_origin([
            format!("http://127.0.0.1:{}", session.port)
                .parse::<axum::http::HeaderValue>()
                .unwrap(),
            format!("http://localhost:{}", session.port)
                .parse()
                .unwrap(),
            ORIGINS[2].parse().unwrap(),
            ORIGINS[3].parse().unwrap(),
        ])
        .allow_credentials(true)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION]);

    // Check if a default path is passed via CLI args
    let args: Vec<String> = std::env::args().skip(1).collect();
    let open_browser = args.iter().any(|arg| arg == "--open-browser");
    if let Some(initial_path) = args
        .iter()
        .find(|arg| *arg != "--open-browser" && *arg != "--desktop")
    {
        if std::path::Path::new(initial_path).exists() {
            let name = std::path::Path::new(initial_path)
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("Mi Bóveda");
            if let Ok(v) = Vault::new_local(name, initial_path) {
                let _ = v.index_all_local().await;
                *state.vault.write().await = Some(v);
                tracing::info!(
                    "Bóveda abierta inicialmente desde argumentos: {}",
                    initial_path
                );
            }
        }
    }

    let api_routes = api_routes(state.clone());

    // Try serving dist if built
    let frontend_dist = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|dir| dir.join("frontend/dist")))
        .filter(|dist| dist.join("index.html").is_file())
        .unwrap_or_else(|| std::path::PathBuf::from("frontend/dist"));
    let mut app = Router::new().nest("/api", api_routes).layer(cors);

    if frontend_dist.exists() {
        let index_file = frontend_dist.join("index.html");
        let serve_dir = ServeDir::new(&frontend_dist)
            .fallback(tower_http::services::ServeFile::new(index_file));
        app = app.fallback_service(serve_dir);
    } else {
        app = app.fallback(get(|| async {
            Html(r#"<!DOCTYPE html>
<html>
<head><title>Jademd Server</title><meta charset="utf-8"></head>
<body style="font-family: sans-serif; background: #18181b; color: #f4f4f5; padding: 40px; text-align: center;">
  <h1 style="color: #4ade80;">Jademd Backend Server Activo</h1>
  <p>El servidor API de Rust está escuchando correctamente en el puerto 3030.</p>
  <p>Ejecuta <code>npm run dev</code> en la carpeta <code>frontend</code> para acceder a la UI de desarrollo.</p>
</body>
</html>"#)
        }));
    }

    let addr = SocketAddr::from(([127, 0, 0, 1], session.port));
    tracing::info!("Jademd Server iniciado en http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    println!("JADEMD_READY http://{addr}");
    if open_browser {
        if let Err(error) = open::that_detached(format!("http://{addr}")) {
            tracing::warn!(%error, "Abre JadeMD manualmente en el navegador: http://{addr}");
        }
    }
    axum::serve(listener, app).await?;

    Ok(())
}

fn api_routes(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/vault/open-local", post(open_local_vault))
        .route("/vault/folders", get(browse_folders))
        .route("/vault/open-webdav", post(open_webdav_vault))
        .route("/vault/open-gdrive", post(open_gdrive_vault))
        .route("/vault/info", get(get_vault_info))
        .route("/vault/tree", get(get_vault_tree))
        .route("/vault/reindex", post(reindex_vault))
        .route("/vault/refresh", post(refresh_local))
        .route("/recovery", get(pending_operations))
        .route("/recovery/restore", post(recover_operation))
        .route("/note", get(read_note).post(save_note).delete(delete_entry))
        .route("/note/create", post(create_note))
        .route("/folder/create", post(create_folder))
        .route("/graph", get(get_graph))
        .route("/backlinks", get(get_backlinks))
        .route("/connections", get(connections))
        .route("/tags", get(tags))
        .route("/notes/properties", get(indexed_notes))
        .route("/search", get(search_notes))
        .route("/resolve", get(resolve_entry))
        .route("/entry/move", post(move_entry))
        .route("/trash", get(list_trash).post(trash_entry))
        .route("/trash/restore", post(restore_entry))
        .route("/asset", get(get_asset).post(save_asset))
        .route("/session", get(start_session))
        .layer(middleware::from_fn_with_state(
            state.session.clone(),
            security::authorize,
        ))
        .with_state(state)
}

async fn start_session(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    (
        [(
            header::SET_COOKIE,
            format!(
                "jademd_session={}; HttpOnly; SameSite=Strict; Path=/api",
                state.session.token
            ),
        )],
        Json(ApiResponse::ok(state.session.token.clone())),
    )
}

fn storage_status(error: &jademd_core::StorageError) -> StatusCode {
    match error {
        jademd_core::StorageError::Conflict(_) => StatusCode::CONFLICT,
        jademd_core::StorageError::AlreadyExists(_) => StatusCode::CONFLICT,
        jademd_core::StorageError::NotFound(_) => StatusCode::NOT_FOUND,
        jademd_core::StorageError::Unsupported(_) => StatusCode::NOT_IMPLEMENTED,
        jademd_core::StorageError::Io(e) if e.kind() == std::io::ErrorKind::NotFound => {
            StatusCode::NOT_FOUND
        }
        jademd_core::StorageError::Io(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
            StatusCode::CONFLICT
        }
        jademd_core::StorageError::Io(e) if e.kind() == std::io::ErrorKind::InvalidInput => {
            StatusCode::BAD_REQUEST
        }
        jademd_core::StorageError::Io(e) if e.kind() == std::io::ErrorKind::PermissionDenied => {
            StatusCode::FORBIDDEN
        }
        _ => StatusCode::INTERNAL_SERVER_ERROR,
    }
}

#[derive(Deserialize)]
struct BrowseFoldersQuery {
    path: Option<String>,
}

async fn browse_folders(Query(query): Query<BrowseFoldersQuery>) -> impl IntoResponse {
    match tokio::task::spawn_blocking(move || folders::browse(query.path.as_deref())).await {
        Ok(Ok(listing)) => (StatusCode::OK, Json(ApiResponse::ok(listing))),
        Ok(Err(error)) => (
            storage_status(&jademd_core::StorageError::Io(error)),
            Json(ApiResponse::err("No se pudo acceder a esa carpeta. Comprueba que esté montada y que tengas permisos.")),
        ),
        Err(_) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::err("No se pudo iniciar el explorador de carpetas")),
        ),
    }
}

async fn open_local_vault(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<OpenLocalRequest>,
) -> impl IntoResponse {
    let name = payload.name.unwrap_or_else(|| {
        std::path::Path::new(&payload.path)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("Bóveda Local")
            .to_string()
    });

    match Vault::new_local(&name, &payload.path) {
        Ok(vault) => {
            let indexed_count = match vault.index_all_local().await {
                Ok(count) => count,
                Err(e) => {
                    return (
                        StatusCode::BAD_REQUEST,
                        Json(ApiResponse::err(e.to_string())),
                    )
                }
            };
            let info = vault.info().clone();
            *state.vault.write().await = Some(vault);
            tracing::info!(
                "Bóveda abierta: {} ({} notas indexadas)",
                payload.path,
                indexed_count
            );
            (StatusCode::OK, Json(ApiResponse::ok(info)))
        }
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::err(format!("Error al abrir la bóveda: {}", e))),
        ),
    }
}

async fn prepare_remote_vault(vault: &Vault) -> jademd_core::Result<()> {
    tokio::time::timeout(std::time::Duration::from_secs(90), async {
        vault.check().await?;
        vault.reindex().await?;
        Ok(())
    })
    .await
    .map_err(|_| {
        std::io::Error::new(
            std::io::ErrorKind::TimedOut,
            "La indexación remota tardó más de 90 segundos",
        )
    })?
}

async fn open_webdav_vault(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<OpenWebdavRequest>,
) -> impl IntoResponse {
    let name = payload
        .name
        .unwrap_or_else(|| "Bóveda Nextcloud / WebDAV".to_string());
    let root = payload.root.unwrap_or_else(|| "/".to_string());

    match Vault::new_webdav(
        &name,
        &payload.endpoint,
        payload.username.as_deref(),
        payload.password.as_deref(),
        &root,
    ) {
        Ok(vault) => {
            if let Err(e) = prepare_remote_vault(&vault).await {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(ApiResponse::err(e.to_string())),
                );
            }
            let info = vault.info().clone();
            *state.vault.write().await = Some(vault);
            (StatusCode::OK, Json(ApiResponse::ok(info)))
        }
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::err(format!(
                "Error al conectar con WebDAV: {}",
                e
            ))),
        ),
    }
}

async fn open_gdrive_vault(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<OpenGdriveRequest>,
) -> impl IntoResponse {
    let name = payload
        .name
        .unwrap_or_else(|| "Bóveda Google Drive".to_string());
    let root = payload.root.unwrap_or_else(|| "/".to_string());

    match Vault::new_gdrive(
        &name,
        payload.access_token.as_deref(),
        payload.refresh_token.as_deref(),
        payload.client_id.as_deref(),
        payload.client_secret.as_deref(),
        &root,
    ) {
        Ok(vault) => {
            if let Err(e) = prepare_remote_vault(&vault).await {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(ApiResponse::err(e.to_string())),
                );
            }
            let info = vault.info().clone();
            *state.vault.write().await = Some(vault);
            (StatusCode::OK, Json(ApiResponse::ok(info)))
        }
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::err(format!(
                "Error al conectar con Google Drive: {}",
                e
            ))),
        ),
    }
}

async fn get_vault_info(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let lock = state.vault.read().await;
    match &*lock {
        Some(v) => (StatusCode::OK, Json(ApiResponse::ok(v.info().clone()))),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::err(
                "No hay ninguna bóveda abierta actualmente",
            )),
        ),
    }
}

async fn get_vault_tree(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let lock = state.vault.read().await;
    match &*lock {
        Some(v) => match v.get_tree().await {
            Ok(tree) => (StatusCode::OK, Json(ApiResponse::ok(tree))),
            Err(e) => (storage_status(&e), Json(ApiResponse::err(e.to_string()))),
        },
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::err("No hay ninguna bóveda abierta")),
        ),
    }
}

async fn reindex_vault(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let lock = state.vault.read().await;
    match &*lock {
        Some(v) => match v.reindex().await {
            Ok(count) => (StatusCode::OK, Json(ApiResponse::ok(count))),
            Err(e) => (storage_status(&e), Json(ApiResponse::err(e.to_string()))),
        },
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::err("No hay ninguna bóveda abierta")),
        ),
    }
}

async fn indexed_notes(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let lock = state.vault.read().await;
    match &*lock {
        Some(vault) => (
            StatusCode::OK,
            Json(ApiResponse::ok(vault.indexed_notes().await)),
        ),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::err("No hay bóveda abierta")),
        ),
    }
}

async fn tags(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let lock = state.vault.read().await;
    match &*lock {
        Some(v) => (StatusCode::OK, Json(ApiResponse::ok(v.tags().await))),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::err("No hay bóveda abierta")),
        ),
    }
}

async fn connections(
    State(state): State<Arc<AppState>>,
    Query(q): Query<NoteQuery>,
) -> impl IntoResponse {
    let lock = state.vault.read().await;
    match &*lock {
        Some(v) => match v.connections(&q.path).await {
            Ok(value) => (StatusCode::OK, Json(ApiResponse::ok(value))),
            Err(error) => (
                storage_status(&error),
                Json(ApiResponse::err(error.to_string())),
            ),
        },
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::err("No hay bóveda abierta")),
        ),
    }
}

async fn pending_operations(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let lock = state.vault.read().await;
    match &*lock {
        Some(v) => match v.pending_operations().await {
            Ok(value) => (StatusCode::OK, Json(ApiResponse::ok(value))),
            Err(e) => (storage_status(&e), Json(ApiResponse::err(e.to_string()))),
        },
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::err("No hay bóveda abierta")),
        ),
    }
}
async fn recover_operation(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<RestoreRequest>,
) -> impl IntoResponse {
    let lock = state.vault.read().await;
    match &*lock {
        Some(v) => match v.recover_operation(&payload.id).await {
            Ok(()) => (StatusCode::OK, Json(ApiResponse::ok(true))),
            Err(e) => (storage_status(&e), Json(ApiResponse::err(e.to_string()))),
        },
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::err("No hay bóveda abierta")),
        ),
    }
}

async fn refresh_local(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let lock = state.vault.read().await;
    match &*lock {
        Some(v) => match v.refresh_local().await {
            Ok(value) => (StatusCode::OK, Json(ApiResponse::ok(value))),
            Err(error) => (
                storage_status(&error),
                Json(ApiResponse::err(error.to_string())),
            ),
        },
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::err("No hay bóveda abierta")),
        ),
    }
}

async fn read_note(
    State(state): State<Arc<AppState>>,
    Query(q): Query<NoteQuery>,
) -> impl IntoResponse {
    let lock = state.vault.read().await;
    match &*lock {
        Some(v) => match v.read_note(&q.path).await {
            Ok(content) => (StatusCode::OK, Json(ApiResponse::ok(content))),
            Err(e) => (storage_status(&e), Json(ApiResponse::err(e.to_string()))),
        },
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::err("No hay ninguna bóveda abierta")),
        ),
    }
}

async fn save_note(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<SaveNoteRequest>,
) -> impl IntoResponse {
    if !payload.check_version {
        return (
            StatusCode::PRECONDITION_REQUIRED,
            Json(ApiResponse::err(
                "Se requiere check_version y la versión base para guardar",
            )),
        );
    }
    let lock = state.vault.read().await;
    match &*lock {
        Some(v) => match v
            .write_note_checked(
                &payload.path,
                &payload.content,
                payload.expected_content.as_deref(),
            )
            .await
        {
            Ok(meta) => (StatusCode::OK, Json(ApiResponse::ok(meta))),
            Err(e) => (storage_status(&e), Json(ApiResponse::err(e.to_string()))),
        },
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::err("No hay ninguna bóveda abierta")),
        ),
    }
}

async fn create_note(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateEntryRequest>,
) -> impl IntoResponse {
    let lock = state.vault.read().await;
    match &*lock {
        Some(v) => {
            if payload
                .vault_id
                .as_ref()
                .is_some_and(|id| id != &v.info().id)
            {
                return (
                    StatusCode::CONFLICT,
                    Json(ApiResponse::err(
                        "La bóveda activa cambió. Vuelve a elegir el destino.",
                    )),
                );
            }

            let initial_content = if payload.path.ends_with(".canvas") {
                r#"{"nodes":[],"edges":[]}"#.to_string()
            } else if payload.path.to_lowercase().ends_with(".base") {
                "views:\n  - type: table\n    name: Notas\n    order: [file.name]\n".to_string()
            } else if payload.path.ends_with(".excalidraw.md") {
                r#"---

excalidraw-plugin: parsed
tags: [excalidraw]

---
==⚠  Switch to EXCALIDRAW VIEW in Jademd. ⚠==

# Excalidraw Data

## Text Elements
%%
## Drawing
```compressed-json
N4IgLgngDgpiBcIYA8DGBDANgSwCYCd0B3EAGhADcZ8BnbAewDsEAmcm+gV31TkQAswYKDXgB6MQCt0uGAFtcAOnRQoZJJnkxGYGggDaAXXIqoAZTDowfUGH5aEIXOnwBrdRWwwiAIXSpXAHN8LkZcAGF6THp8RwBiAEYADmSEgCMQAF9yADNsTT14YEzMoA
```
%%
"#.to_string()
            } else if payload.path.ends_with(".excalidraw") {
                r##"{"type":"excalidraw","version":2,"source":"https://jademd.app","elements":[],"appState":{"theme":"dark","viewBackgroundColor":"#18181b"},"files":{}}"##.to_string()
            } else {
                format!(
                    "# {}\n\n",
                    std::path::Path::new(&payload.path)
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or("Nueva Nota")
                )
            };
            match v
                .create_note(
                    &payload.path,
                    payload.content.as_deref().unwrap_or(&initial_content),
                )
                .await
            {
                Ok(meta) => (StatusCode::CREATED, Json(ApiResponse::ok(meta))),
                Err(jademd_core::StorageError::Io(e)) if e.raw_os_error() == Some(30) && cfg!(target_os = "linux") =>
                    (StatusCode::FORBIDDEN, Json(ApiResponse::err("La bóveda está en un volumen de solo lectura. Monta el volumen con permisos de escritura o abre otra bóveda."))),
                Err(e) => (storage_status(&e), Json(ApiResponse::err(e.to_string()))),
            }
        }
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::err("No hay ninguna bóveda abierta")),
        ),
    }
}

async fn create_folder(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateEntryRequest>,
) -> impl IntoResponse {
    let clean = payload.path.trim().trim_matches('/');
    if clean.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::err(
                "El nombre de la carpeta no puede estar vacío",
            )),
        );
    }
    let lock = state.vault.read().await;
    match &*lock {
        Some(v) => match v.create_folder(clean).await {
            Ok(_) => (StatusCode::CREATED, Json(ApiResponse::ok(true))),
            Err(e) => (storage_status(&e), Json(ApiResponse::err(e.to_string()))),
        },
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::err("No hay ninguna bóveda abierta")),
        ),
    }
}

async fn delete_entry(
    State(state): State<Arc<AppState>>,
    Query(q): Query<NoteQuery>,
) -> impl IntoResponse {
    let lock = state.vault.read().await;
    match &*lock {
        Some(v) => match v.delete_entry(&q.path).await {
            Ok(_) => (StatusCode::OK, Json(ApiResponse::ok(true))),
            Err(e) => (storage_status(&e), Json(ApiResponse::err(e.to_string()))),
        },
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::err("No hay ninguna bóveda abierta")),
        ),
    }
}

async fn get_graph(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let lock = state.vault.read().await;
    match &*lock {
        Some(v) => {
            let data = v.get_graph_data().await;
            (StatusCode::OK, Json(ApiResponse::ok(data)))
        }
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::err("No hay ninguna bóveda abierta")),
        ),
    }
}

async fn get_backlinks(
    State(state): State<Arc<AppState>>,
    Query(q): Query<BacklinksQuery>,
) -> impl IntoResponse {
    let lock = state.vault.read().await;
    match &*lock {
        Some(v) => {
            let backlinks = v.get_backlinks(&q.title).await;
            (StatusCode::OK, Json(ApiResponse::ok(backlinks)))
        }
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::err("No hay ninguna bóveda abierta")),
        ),
    }
}

async fn search_notes(
    State(state): State<Arc<AppState>>,
    Query(q): Query<SearchQuery>,
) -> impl IntoResponse {
    let lock = state.vault.read().await;
    match &*lock {
        Some(v) => match v.search_advanced(&q.q).await {
            Ok(results) => (StatusCode::OK, Json(ApiResponse::ok(results))),
            Err(error) => (
                storage_status(&error),
                Json(ApiResponse::err(error.to_string())),
            ),
        },
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::err("No hay ninguna bóveda abierta")),
        ),
    }
}

#[derive(Deserialize)]
struct MoveEntryRequest {
    from: String,
    to: String,
}
#[derive(Deserialize)]
struct RestoreRequest {
    id: String,
}

async fn move_entry(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<MoveEntryRequest>,
) -> impl IntoResponse {
    let lock = state.vault.read().await;
    match &*lock {
        Some(vault) => match vault.move_entry(&payload.from, &payload.to).await {
            Ok(result) => (StatusCode::OK, Json(ApiResponse::ok(result))),
            Err(error) => (
                storage_status(&error),
                Json(ApiResponse::err(error.to_string())),
            ),
        },
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::err("No hay una bóveda abierta")),
        ),
    }
}
async fn trash_entry(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateEntryRequest>,
) -> impl IntoResponse {
    let lock = state.vault.read().await;
    match &*lock {
        Some(vault) => match vault.trash_entry(&payload.path).await {
            Ok(result) => (StatusCode::OK, Json(ApiResponse::ok(result))),
            Err(error) => (
                storage_status(&error),
                Json(ApiResponse::err(error.to_string())),
            ),
        },
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::err("No hay una bóveda abierta")),
        ),
    }
}
async fn list_trash(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let lock = state.vault.read().await;
    match &*lock {
        Some(vault) => match vault.list_trash().await {
            Ok(result) => (StatusCode::OK, Json(ApiResponse::ok(result))),
            Err(error) => (
                storage_status(&error),
                Json(ApiResponse::err(error.to_string())),
            ),
        },
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::err("No hay una bóveda abierta")),
        ),
    }
}
async fn restore_entry(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<RestoreRequest>,
) -> impl IntoResponse {
    let lock = state.vault.read().await;
    match &*lock {
        Some(vault) => match vault.restore_entry(&payload.id).await {
            Ok(result) => (StatusCode::OK, Json(ApiResponse::ok(result))),
            Err(error) => (
                storage_status(&error),
                Json(ApiResponse::err(error.to_string())),
            ),
        },
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::err("No hay una bóveda abierta")),
        ),
    }
}

async fn resolve_entry(
    State(state): State<Arc<AppState>>,
    Query(query): Query<NoteQuery>,
) -> impl IntoResponse {
    let lock = state.vault.read().await;
    match &*lock {
        Some(vault) => match vault.resolve_entry(&query.path, &query.source).await {
            Ok(path) => (StatusCode::OK, Json(ApiResponse::ok(path))),
            Err(error) => (
                StatusCode::NOT_FOUND,
                Json(ApiResponse::err(error.to_string())),
            ),
        },
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::err("No hay una bóveda abierta")),
        ),
    }
}

async fn get_asset(
    State(state): State<Arc<AppState>>,
    Query(query): Query<NoteQuery>,
) -> impl IntoResponse {
    let lock = state.vault.read().await;
    let vault = match &*lock {
        Some(v) => v,
        None => {
            return (
                StatusCode::NOT_FOUND,
                [(header::CONTENT_TYPE, "text/plain")],
                "No hay ninguna bóveda abierta".as_bytes().to_vec(),
            )
                .into_response()
        }
    };

    match vault.read_linked_bytes(&query.path, &query.source).await {
        Ok(bytes) => {
            let mime = mime_guess::from_path(&query.path).first_or_octet_stream();
            (
                StatusCode::OK,
                [
                    (header::CONTENT_TYPE, mime.as_ref().to_string()),
                    (header::CACHE_CONTROL, "no-store".to_string()),
                    (
                        header::CONTENT_SECURITY_POLICY,
                        "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:"
                            .to_string(),
                    ),
                ],
                bytes,
            )
                .into_response()
        }
        Err(e) => (
            StatusCode::NOT_FOUND,
            [(header::CONTENT_TYPE, "text/plain".to_string())],
            format!("Asset not found: {}", e).into_bytes(),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
struct SaveAssetRequest {
    path: String,
    content_base64: String,
}

async fn save_asset(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<SaveAssetRequest>,
) -> impl IntoResponse {
    let lock = state.vault.read().await;
    let vault = match &*lock {
        Some(v) => v,
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(ApiResponse::err("No hay ninguna bóveda abierta")),
            );
        }
    };

    use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
    let clean_base64 = payload
        .content_base64
        .split(',')
        .next_back()
        .unwrap_or(&payload.content_base64);

    let bytes = match BASE64.decode(clean_base64.trim()) {
        Ok(b) => b,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::err(format!(
                    "Error decodificando base64: {}",
                    e
                ))),
            );
        }
    };

    match vault.write_asset(&payload.path, bytes).await {
        Ok(_) => (StatusCode::OK, Json(ApiResponse::ok(payload.path))),
        Err(e) => (
            storage_status(&e),
            Json(ApiResponse::err(format!("Error guardando asset: {}", e))),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::{to_bytes, Body},
        http::Request,
    };
    use tower::ServiceExt;

    async fn application() -> (Router, String, tempfile::TempDir) {
        let dir = tempfile::tempdir().unwrap();
        let vault = Vault::new_local("Test", dir.path().to_str().unwrap()).unwrap();
        vault.write_note("A.md", "original").await.unwrap();
        let session = SessionSecurity::new().unwrap();
        let token = session.token.clone();
        (
            api_routes(Arc::new(AppState {
                vault: RwLock::new(Some(vault)),
                session,
            })),
            token,
            dir,
        )
    }

    #[tokio::test]
    async fn creates_visible_bases_and_serves_only_note_properties() {
        let (app, token, _dir) = application().await;
        let request = Request::builder()
            .method("POST")
            .uri("/note/create")
            .header("host", "127.0.0.1:3030")
            .header("authorization", format!("Bearer {token}"))
            .header("content-type", "application/json")
            .body(Body::from(r#"{"path":"Projects.base"}"#))
            .unwrap();
        let response = app.clone().oneshot(request).await.unwrap();
        assert!(response.status().is_success());
        for (route, expected) in [
            ("/vault/tree", "Projects.base"),
            ("/note?path=Projects.base", "type: table"),
            ("/notes/properties", "A.md"),
        ] {
            let request = Request::builder()
                .uri(route)
                .header("host", "127.0.0.1:3030")
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty())
                .unwrap();
            let response = app.clone().oneshot(request).await.unwrap();
            assert!(response.status().is_success());
            let bytes = to_bytes(response.into_body(), 1_000_000).await.unwrap();
            let body = String::from_utf8(bytes.to_vec()).unwrap();
            assert!(body.contains(expected), "{body}");
            if route == "/notes/properties" {
                assert!(!body.contains("Projects.base"));
                assert!(!body.contains("original"));
            }
        }
    }

    #[tokio::test]
    async fn creates_folders_and_nested_folders_over_api() {
        let (app, token, _dir) = application().await;
        for path in ["Projects", "Projects/Frontend", "/Notes/Work/"] {
            let request = Request::builder()
                .method("POST")
                .uri("/folder/create")
                .header("host", "127.0.0.1:3030")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(format!(r#"{{"path":"{path}"}}"#)))
                .unwrap();
            let response = app.clone().oneshot(request).await.unwrap();
            assert_eq!(response.status(), StatusCode::CREATED);
        }

        let request = Request::builder()
            .uri("/vault/tree")
            .header("host", "127.0.0.1:3030")
            .header("authorization", format!("Bearer {token}"))
            .body(Body::empty())
            .unwrap();
        let response = app.clone().oneshot(request).await.unwrap();
        assert!(response.status().is_success());
        let bytes = to_bytes(response.into_body(), 1_000_000).await.unwrap();
        let body = String::from_utf8(bytes.to_vec()).unwrap();
        assert!(body.contains("Projects"), "{body}");
        assert!(body.contains("Frontend"), "{body}");
        assert!(body.contains("Notes"), "{body}");
        assert!(body.contains("Work"), "{body}");
    }

    #[tokio::test]
    async fn folder_explorer_requires_the_local_session() {
        let (app, token, _dir) = application().await;
        let request = || {
            Request::builder()
                .uri("/vault/folders")
                .header("host", "127.0.0.1:3030")
        };
        let response = app
            .clone()
            .oneshot(request().body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        let response = app
            .oneshot(
                request()
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body: serde_json::Value =
            serde_json::from_slice(&to_bytes(response.into_body(), 1_000_000).await.unwrap())
                .unwrap();
        assert!(body["data"]["folders"].is_array());
    }

    #[tokio::test]
    async fn rejects_unauthorized_foreign_origins_and_rebinding_hosts() {
        let (app, _, _dir) = application().await;
        let request = Request::builder()
            .uri("/vault/info")
            .header("host", "127.0.0.1:3030")
            .body(Body::empty())
            .unwrap();
        assert_eq!(
            app.clone().oneshot(request).await.unwrap().status(),
            StatusCode::UNAUTHORIZED
        );
        let request = Request::builder()
            .uri("/session")
            .header("host", "127.0.0.1:3030")
            .header("origin", "https://foreign.example")
            .body(Body::empty())
            .unwrap();
        assert_eq!(
            app.clone().oneshot(request).await.unwrap().status(),
            StatusCode::FORBIDDEN
        );
        let request = Request::builder()
            .uri("/session")
            .header("host", "foreign.example:3030")
            .body(Body::empty())
            .unwrap();
        assert_eq!(
            app.oneshot(request).await.unwrap().status(),
            StatusCode::FORBIDDEN
        );
    }

    #[tokio::test]
    async fn bootstraps_session_and_supports_cookie_authenticated_assets() {
        let (app, token, _dir) = application().await;
        let request = Request::builder()
            .uri("/session")
            .header("host", "127.0.0.1:3030")
            .body(Body::empty())
            .unwrap();
        let response = app.clone().oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let cookie = response
            .headers()
            .get(header::SET_COOKIE)
            .unwrap()
            .to_str()
            .unwrap();
        assert!(cookie.contains("HttpOnly; SameSite=Strict"));
        let request = Request::builder()
            .uri("/asset?path=A.md")
            .header("host", "127.0.0.1:3030")
            .header(header::COOKIE, format!("jademd_session={token}"))
            .body(Body::empty())
            .unwrap();
        let response = app.oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert!(response.headers()[header::CONTENT_SECURITY_POLICY]
            .to_str()
            .unwrap()
            .contains("sandbox"));
        assert_eq!(
            &to_bytes(response.into_body(), 1024).await.unwrap()[..],
            b"original"
        );
    }

    #[tokio::test]
    async fn duplicate_creation_returns_conflict_and_keeps_original() {
        let (app, token, dir) = application().await;
        let request = Request::builder()
            .method("POST")
            .uri("/note/create")
            .header("host", "127.0.0.1:3030")
            .header(header::AUTHORIZATION, format!("Bearer {token}"))
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(r#"{"path":"A.md"}"#))
            .unwrap();
        assert_eq!(
            app.oneshot(request).await.unwrap().status(),
            StatusCode::CONFLICT
        );
        assert_eq!(
            std::fs::read_to_string(dir.path().join("A.md")).unwrap(),
            "original"
        );
    }

    #[tokio::test]
    async fn moves_trashes_and_restores_through_authenticated_api() {
        let (app, token, dir) = application().await;
        for (uri, payload) in [
            (
                "/entry/move",
                serde_json::json!({"from": "A.md", "to": "Folder/B.md"}),
            ),
            ("/trash", serde_json::json!({"path": "Folder/B.md"})),
        ] {
            let request = Request::builder()
                .method("POST")
                .uri(uri)
                .header("host", "127.0.0.1:3030")
                .header(header::AUTHORIZATION, format!("Bearer {token}"))
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(payload.to_string()))
                .unwrap();
            assert_eq!(
                app.clone().oneshot(request).await.unwrap().status(),
                StatusCode::OK
            );
        }
        assert!(!dir.path().join("A.md").exists());
        assert!(!dir.path().join("Folder/B.md").exists());
        let request = Request::builder()
            .uri("/trash")
            .header("host", "127.0.0.1:3030")
            .header(header::AUTHORIZATION, format!("Bearer {token}"))
            .body(Body::empty())
            .unwrap();
        let response = app.clone().oneshot(request).await.unwrap();
        let body: serde_json::Value =
            serde_json::from_slice(&to_bytes(response.into_body(), 8192).await.unwrap()).unwrap();
        let id = body["data"][0]["id"].as_str().unwrap();
        let request = Request::builder()
            .method("POST")
            .uri("/trash/restore")
            .header("host", "127.0.0.1:3030")
            .header(header::AUTHORIZATION, format!("Bearer {token}"))
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(serde_json::json!({"id": id}).to_string()))
            .unwrap();
        assert_eq!(app.oneshot(request).await.unwrap().status(), StatusCode::OK);
        assert_eq!(
            std::fs::read_to_string(dir.path().join("Folder/B.md")).unwrap(),
            "original"
        );
    }

    #[tokio::test]
    async fn requires_a_base_version_and_rejects_stale_writes() {
        let (app, token, dir) = application().await;
        for (body, status) in [
            (
                serde_json::json!({"path":"A.md","content":"unsafe"}),
                StatusCode::PRECONDITION_REQUIRED,
            ),
            (
                serde_json::json!({"path":"A.md","content":"stale","check_version":true,"expected_content":"old"}),
                StatusCode::CONFLICT,
            ),
        ] {
            let request = Request::builder()
                .method("POST")
                .uri("/note")
                .header("host", "127.0.0.1:3030")
                .header(header::AUTHORIZATION, format!("Bearer {token}"))
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(body.to_string()))
                .unwrap();
            assert_eq!(app.clone().oneshot(request).await.unwrap().status(), status);
        }
        assert_eq!(
            std::fs::read_to_string(dir.path().join("A.md")).unwrap(),
            "original"
        );
    }

    #[tokio::test]
    async fn save_empty_note_and_read_it_back_over_api() {
        let (app, token, _dir) = application().await;
        let request = Request::builder()
            .method("POST")
            .uri("/note")
            .header("host", "127.0.0.1:3030")
            .header(header::AUTHORIZATION, format!("Bearer {token}"))
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(r#"{"path":"A.md","content":"","check_version":true,"expected_content":"original"}"#))
            .unwrap();
        assert_eq!(
            app.clone().oneshot(request).await.unwrap().status(),
            StatusCode::OK
        );
        let request = Request::builder()
            .uri("/note?path=A.md")
            .header("host", "127.0.0.1:3030")
            .header(header::AUTHORIZATION, format!("Bearer {token}"))
            .body(Body::empty())
            .unwrap();
        let response = app.oneshot(request).await.unwrap();
        let body: serde_json::Value =
            serde_json::from_slice(&to_bytes(response.into_body(), 1024).await.unwrap()).unwrap();
        assert_eq!(body["data"], "");
    }
}
