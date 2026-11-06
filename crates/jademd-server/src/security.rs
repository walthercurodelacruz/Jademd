use axum::{
    extract::{Request, State},
    http::{header, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

pub const ORIGINS: [&str; 4] = [
    "http://127.0.0.1:3030",
    "http://localhost:3030",
    "http://127.0.0.1:5173",
    "http://localhost:5173",
];

#[derive(Clone)]
pub struct SessionSecurity {
    pub token: String,
    pub port: u16,
}

impl SessionSecurity {
    pub fn new() -> Result<Self, getrandom::Error> {
        use base64::Engine;
        let mut bytes = [0; 32];
        getrandom::fill(&mut bytes)?;
        Ok(Self {
            port: std::env::var("JADEMD_PORT")
                .ok()
                .and_then(|value| value.parse().ok())
                .unwrap_or(3030),
            token: base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes),
        })
    }
}

pub async fn authorize(
    State(session): State<SessionSecurity>,
    request: Request,
    next: Next,
) -> Response {
    let denied = |status, message| {
        (status, Json(json!({"success": false, "error": message}))).into_response()
    };
    let headers = request.headers();
    let host = headers
        .get(header::HOST)
        .and_then(|h| h.to_str().ok())
        .unwrap_or("");
    if host != format!("127.0.0.1:{}", session.port)
        && host != format!("localhost:{}", session.port)
    {
        return denied(StatusCode::FORBIDDEN, "Host no permitido");
    }
    if headers.get(header::ORIGIN).is_some_and(|origin| {
        origin.as_bytes() != format!("http://127.0.0.1:{}", session.port).as_bytes()
            && origin.as_bytes() != format!("http://localhost:{}", session.port).as_bytes()
            && !ORIGINS[2..]
                .iter()
                .any(|allowed| origin.as_bytes() == allowed.as_bytes())
    }) {
        return denied(StatusCode::FORBIDDEN, "Origen no permitido");
    }
    if headers
        .get("sec-fetch-site")
        .is_some_and(|site| site == "cross-site")
    {
        return denied(StatusCode::FORBIDDEN, "Solicitud de otro sitio rechazada");
    }
    let is_session = request.uri().path().ends_with("/session");
    if !is_session {
        let bearer = headers
            .get(header::AUTHORIZATION)
            .and_then(|h| h.to_str().ok())
            .and_then(|h| h.strip_prefix("Bearer "));
        let cookie = headers
            .get(header::COOKIE)
            .and_then(|h| h.to_str().ok())
            .and_then(|h| {
                h.split(';')
                    .find_map(|part| part.trim().strip_prefix("jademd_session="))
            });
        if bearer != Some(session.token.as_str()) && cookie != Some(session.token.as_str()) {
            return denied(StatusCode::UNAUTHORIZED, "Se requiere una sesión de Jademd");
        }
    }
    let mut response = next.run(request).await;
    response
        .headers_mut()
        .insert(header::X_CONTENT_TYPE_OPTIONS, "nosniff".parse().unwrap());
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
    response
}
