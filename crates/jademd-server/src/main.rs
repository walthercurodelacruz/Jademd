use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::RwLock;
use axum::{
    extract::{Query, State},
    http::{header, Method, StatusCode},
    response::{Html, IntoResponse, Json},
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::ServeDir;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use jademd_core::Vault;

struct AppState {
    vault: RwLock<Option<Vault>>,
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
}

#[derive(Deserialize)]
struct SaveNoteRequest {
    path: String,
    content: String,
}

#[derive(Deserialize)]
struct CreateEntryRequest {
    path: String,
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
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "jademd=info,tower_http=info".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let state = Arc::new(AppState {
        vault: RwLock::new(None),
    });

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE, Method::OPTIONS])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION]);

    // Check if a default path is passed via CLI args
    let args: Vec<String> = std::env::args().collect();
    if args.len() > 1 {
        let initial_path = &args[1];
        if std::path::Path::new(initial_path).exists() {
            let name = std::path::Path::new(initial_path)
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("Mi Bóveda");
            if let Ok(v) = Vault::new_local(name, initial_path) {
                let _ = v.index_all_local().await;
                *state.vault.write().await = Some(v);
                tracing::info!("Bóveda abierta inicialmente desde argumentos: {}", initial_path);
            }
        }
    }

    let api_routes = Router::new()
        .route("/vault/open-local", post(open_local_vault))
        .route("/vault/open-webdav", post(open_webdav_vault))
        .route("/vault/open-gdrive", post(open_gdrive_vault))
        .route("/vault/info", get(get_vault_info))
        .route("/vault/tree", get(get_vault_tree))
        .route("/vault/reindex", post(reindex_vault))
        .route("/note", get(read_note).post(save_note).delete(delete_entry))
        .route("/note/create", post(create_note))
        .route("/folder/create", post(create_folder))
        .route("/graph", get(get_graph))
        .route("/backlinks", get(get_backlinks))
        .route("/search", get(search_notes))
        .route("/asset", get(get_asset));

    // Try serving dist if built
    let frontend_dist = std::path::PathBuf::from("frontend/dist");
    let mut app = Router::new()
        .nest("/api", api_routes)
        .layer(cors)
        .with_state(state);

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

    let addr = SocketAddr::from(([127, 0, 0, 1], 3030));
    tracing::info!("Jademd Server iniciado en http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
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
            let indexed_count = vault.index_all_local().await.unwrap_or(0);
            let info = vault.info().clone();
            *state.vault.write().await = Some(vault);
            tracing::info!("Bóveda abierta: {} ({} notas indexadas)", payload.path, indexed_count);
            (StatusCode::OK, Json(ApiResponse::ok(info)))
        }
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::err(format!("Error al abrir la bóveda: {}", e))),
        ),
    }
}

async fn open_webdav_vault(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<OpenWebdavRequest>,
) -> impl IntoResponse {
    let name = payload.name.unwrap_or_else(|| "Bóveda Nextcloud / WebDAV".to_string());
    let root = payload.root.unwrap_or_else(|| "/".to_string());

    match Vault::new_webdav(&name, &payload.endpoint, payload.username.as_deref(), payload.password.as_deref(), &root) {
        Ok(vault) => {
            let info = vault.info().clone();
            *state.vault.write().await = Some(vault);
            (StatusCode::OK, Json(ApiResponse::ok(info)))
        }
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::err(format!("Error al conectar con WebDAV: {}", e))),
        ),
    }
}

async fn open_gdrive_vault(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<OpenGdriveRequest>,
) -> impl IntoResponse {
    let name = payload.name.unwrap_or_else(|| "Bóveda Google Drive".to_string());
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
            let info = vault.info().clone();
            *state.vault.write().await = Some(vault);
            (StatusCode::OK, Json(ApiResponse::ok(info)))
        }
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::err(format!("Error al conectar con Google Drive: {}", e))),
        ),
    }
}

async fn get_vault_info(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let lock = state.vault.read().await;
    match &*lock {
        Some(v) => (StatusCode::OK, Json(ApiResponse::ok(v.info().clone()))),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::err("No hay ninguna bóveda abierta actualmente")),
        ),
    }
}

async fn get_vault_tree(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let lock = state.vault.read().await;
    match &*lock {
        Some(v) => match v.get_tree().await {
            Ok(tree) => (StatusCode::OK, Json(ApiResponse::ok(tree))),
            Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::err(e.to_string()))),
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
        Some(v) => match v.index_all_local().await {
            Ok(count) => (StatusCode::OK, Json(ApiResponse::ok(count))),
            Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::err(e.to_string()))),
        },
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::err("No hay ninguna bóveda abierta")),
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
            Err(e) => (StatusCode::NOT_FOUND, Json(ApiResponse::err(e.to_string()))),
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
    let lock = state.vault.read().await;
    match &*lock {
        Some(v) => match v.write_note(&payload.path, &payload.content).await {
            Ok(meta) => (StatusCode::OK, Json(ApiResponse::ok(meta))),
            Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::err(e.to_string()))),
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
            let initial_content = format!("# {}\n\n", std::path::Path::new(&payload.path).file_stem().and_then(|s| s.to_str()).unwrap_or("Nueva Nota"));
            match v.write_note(&payload.path, &initial_content).await {
                Ok(meta) => (StatusCode::CREATED, Json(ApiResponse::ok(meta))),
                Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::err(e.to_string()))),
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
    let lock = state.vault.read().await;
    match &*lock {
        Some(v) => {
            let keep_file = format!("{}/.keep", payload.path.trim_end_matches('/'));
            match v.write_note(&keep_file, "").await {
                Ok(_) => (StatusCode::CREATED, Json(ApiResponse::ok(true))),
                Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::err(e.to_string()))),
            }
        }
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
            Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::err(e.to_string()))),
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
        Some(v) => {
            let results = v.search(&q.q).await;
            (StatusCode::OK, Json(ApiResponse::ok(results)))
        }
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::err("No hay ninguna bóveda abierta")),
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

    match vault.read_bytes(&query.path).await {
        Ok(bytes) => {
            let mime = mime_guess::from_path(&query.path).first_or_octet_stream();
            (
                StatusCode::OK,
                [
                    (header::CONTENT_TYPE, mime.as_ref().to_string()),
                    (header::CACHE_CONTROL, "public, max-age=3600".to_string()),
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
