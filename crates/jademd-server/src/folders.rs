use serde::Serialize;
use std::{
    fs,
    io::{self, ErrorKind},
    path::{Component, Path, PathBuf},
};

#[derive(Serialize)]
pub struct Folder {
    label: String,
    path: String,
}

#[derive(Serialize)]
pub struct FolderListing {
    current: Option<String>,
    parent: Option<String>,
    folders: Vec<Folder>,
}

fn canonicalize(path: &Path) -> io::Result<PathBuf> {
    let canonical = path.canonicalize()?;
    #[cfg(windows)]
    if let Some(s) = canonical.to_str() {
        if let Some(stripped) = s
            .strip_prefix(r"\\?\")
            .filter(|rest| rest.as_bytes().get(1) == Some(&b':'))
        {
            return Ok(PathBuf::from(stripped));
        }
    }
    Ok(canonical)
}

fn location(path: &Path, label: impl Into<String>) -> Option<Folder> {
    Some(Folder {
        label: label.into(),
        path: path.to_str()?.into(),
    })
}

fn locations() -> Vec<Folder> {
    let mut roots = Vec::new();
    if let Some(home) = std::env::home_dir() {
        roots.push((home, "Carpeta personal"));
    }

    #[cfg(target_os = "linux")]
    {
        roots.extend([
            (PathBuf::from("/mnt"), "Unidades montadas"),
            (PathBuf::from("/media"), "Medios y unidades"),
            (PathBuf::from("/run/media"), "Medios del usuario"),
        ]);
        if let Some(runtime) = std::env::var_os("XDG_RUNTIME_DIR") {
            roots.push((
                PathBuf::from(runtime).join("gvfs"),
                "Recursos de red del explorador",
            ));
        }
        if let Ok(mounts) = fs::read_to_string("/proc/self/mountinfo") {
            roots.extend(mounts.lines().filter_map(|line| {
                let (fields, filesystem) = line.split_once(" - ")?;
                let kind = filesystem.split_whitespace().next()?;
                if !matches!(kind, "cifs" | "smb3" | "smbfs" | "nfs" | "nfs4") {
                    return None;
                }
                let mount = fields.split_whitespace().nth(4)?;
                let mount = mount
                    .replace("\\040", " ")
                    .replace("\\011", "\t")
                    .replace("\\012", "\n")
                    .replace("\\134", "\\");
                Some((PathBuf::from(mount), "Recurso de red montado"))
            }));
        }
    }
    #[cfg(windows)]
    roots.extend(
        (b'A'..=b'Z').map(|drive| (PathBuf::from(format!("{}:\\", char::from(drive))), "Unidad")),
    );
    #[cfg(target_os = "macos")]
    roots.push((PathBuf::from("/Volumes"), "Volúmenes montados"));

    #[cfg(unix)]
    roots.push((PathBuf::from("/"), "Raíz del sistema"));

    let mut seen = std::collections::HashSet::new();
    roots
        .into_iter()
        .filter_map(|(path, label)| {
            let path = canonicalize(&path).ok()?;
            if !path.is_dir() || !seen.insert(path.clone()) {
                return None;
            }
            location(&path, format!("{label} · {}", path.display()))
        })
        .collect()
}

pub fn browse(path: Option<&str>) -> io::Result<FolderListing> {
    browse_at(path, locations())
}

fn browse_at(path: Option<&str>, roots: Vec<Folder>) -> io::Result<FolderListing> {
    let Some(path) = path else {
        return Ok(FolderListing {
            current: None,
            parent: None,
            folders: roots,
        });
    };

    let path = Path::new(path);
    let denied = || {
        io::Error::new(
            ErrorKind::PermissionDenied,
            "Selecciona una ubicación del explorador",
        )
    };
    let permitted_root = |path: &Path| {
        roots.iter().any(|root| {
            path.strip_prefix(&root.path).is_ok_and(|relative| {
                relative.components().all(|part| match part {
                    Component::Normal(name) => !name.to_string_lossy().starts_with('.'),
                    _ => false,
                })
            })
        })
    };
    if !permitted_root(path) {
        return Err(denied());
    }
    let current = canonicalize(path)?;
    if !permitted_root(&current) {
        return Err(denied());
    }
    let mut folders: Vec<_> = fs::read_dir(&current)?
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let name = entry.file_name();
            let name = name.to_str()?;
            if name.starts_with('.') || !entry.file_type().ok()?.is_dir() {
                return None;
            }
            location(&entry.path(), name)
        })
        .collect();
    folders.sort_by(|a, b| {
        a.label
            .to_lowercase()
            .cmp(&b.label.to_lowercase())
            .then_with(|| a.label.cmp(&b.label))
    });
    Ok(FolderListing {
        current: current.to_str().map(str::to_owned),
        parent: current
            .parent()
            .filter(|path| permitted_root(path))
            .and_then(Path::to_str)
            .map(str::to_owned),
        folders,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn follows_parent_from_a_shortcut_to_the_filesystem_root() {
        let temp = tempfile::tempdir().unwrap();
        let disk = canonicalize(temp.path()).unwrap();
        let home = disk.join("home");
        let personal = home.join("usuario");
        fs::create_dir_all(&personal).unwrap();
        let roots = || {
            vec![
                location(&personal, "Carpeta personal").unwrap(),
                location(&disk, "Raíz del sistema").unwrap(),
            ]
        };

        let personal_listing = browse_at(personal.to_str(), roots()).unwrap();
        assert_eq!(personal_listing.parent.as_deref(), home.to_str());
        let home_listing = browse_at(personal_listing.parent.as_deref(), roots()).unwrap();
        assert_eq!(home_listing.parent.as_deref(), disk.to_str());
        let disk_listing = browse_at(home_listing.parent.as_deref(), roots()).unwrap();
        assert!(disk_listing.parent.is_none());
    }

    #[test]
    fn lists_only_visible_directories_and_rejects_escaping_roots() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("mount");
        let child = root.join("Bóveda QA");
        fs::create_dir_all(&child).unwrap();
        fs::create_dir(root.join(".oculta")).unwrap();
        fs::write(root.join("nota.md"), "nota").unwrap();
        let root = canonicalize(&root).unwrap();
        let child = canonicalize(&child).unwrap();
        let roots = || vec![location(&root, "Montaje").unwrap()];

        #[cfg(unix)]
        std::os::unix::fs::symlink(temp.path(), root.join("atajo")).unwrap();

        let listing = browse_at(root.to_str(), roots()).unwrap();
        assert_eq!(listing.folders.len(), 1);
        assert_eq!(listing.folders[0].label, "Bóveda QA");
        assert!(listing.parent.is_none());
        assert_eq!(
            browse_at(child.to_str(), roots())
                .unwrap()
                .parent
                .as_deref(),
            root.to_str()
        );

        for path in [
            root.join(".."),
            root.join(".oculta"),
            temp.path().join("externa"),
        ] {
            assert_eq!(
                browse_at(path.to_str(), roots()).err().unwrap().kind(),
                ErrorKind::PermissionDenied
            );
        }
        #[cfg(unix)]
        assert_eq!(
            browse_at(root.join("atajo").to_str(), roots())
                .err()
                .unwrap()
                .kind(),
            ErrorKind::PermissionDenied
        );
    }
}
