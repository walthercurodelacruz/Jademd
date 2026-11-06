pub fn normalize(path: &str) -> Option<String> {
    if path.contains(['\\', '\0']) {
        return None;
    }
    let mut parts = Vec::new();
    for part in path.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop()?;
            }
            other => parts.push(other),
        }
    }
    Some(parts.join("/"))
}

pub fn candidates(target: &str, source: &str) -> Vec<String> {
    let parent = source
        .rsplit_once('/')
        .map(|(parent, _)| parent)
        .unwrap_or("");
    let root = normalize(target);
    let relative = normalize(&format!("{parent}/{target}"));
    let ordered = if target.starts_with('/') {
        vec![root]
    } else if target.starts_with("./") || target.starts_with("../") {
        vec![relative]
    } else if target.contains('/') {
        vec![root, relative]
    } else {
        vec![relative, root]
    };
    let mut result = Vec::new();
    for path in ordered.into_iter().flatten() {
        if !path.is_empty() && !result.contains(&path) {
            result.push(path);
        }
    }
    result
}
