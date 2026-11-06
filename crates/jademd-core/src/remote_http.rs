use http::{Request, Response};
use opendal::{Buffer, Error, ErrorKind, HttpBody, HttpTransport, HttpTransporter};
use std::time::Duration;

pub(crate) fn transport() -> opendal::Result<HttpTransporter> {
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(http_error)?;
    Ok(HttpTransporter::new(RemoteHttp(client)))
}

struct RemoteHttp(reqwest::Client);

impl HttpTransport for RemoteHttp {
    async fn fetch(&self, request: Request<Buffer>) -> opendal::Result<Response<HttpBody>> {
        let (parts, body) = request.into_parts();
        let response = self
            .0
            .request(parts.method, parts.uri.to_string())
            .headers(parts.headers)
            .body(body.to_bytes())
            .send()
            .await
            .map_err(http_error)?;
        let mut builder = Response::builder()
            .status(response.status())
            .version(response.version());
        *builder.headers_mut().expect("valid HTTP response") = response.headers().clone();
        let bytes = response.bytes().await.map_err(http_error)?;
        let size = bytes.len() as u64;
        let stream = futures_util::stream::iter([Ok(Buffer::from(bytes))]);
        builder
            .body(HttpBody::new(stream, Some(size)))
            .map_err(opendal::raw::new_request_build_error)
    }
}

fn http_error(error: reqwest::Error) -> Error {
    // Request URLs can contain authentication data from provider operations.
    let retryable = error.is_timeout() || error.is_connect();
    let result = Error::new(ErrorKind::Unexpected, "Error en el transporte HTTP")
        .set_source(error.without_url());
    if retryable {
        result.set_temporary()
    } else {
        result
    }
}
