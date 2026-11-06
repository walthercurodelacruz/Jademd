//! Linux vault operations anchored to directory descriptors. Symlinks are not followed.
use rustix::fs::{self, AtFlags, Mode, OFlags, RenameFlags, ResolveFlags};
use std::fs::File;
use std::io::{self, Read, Write};
use std::path::{Component, Path};
use std::sync::atomic::{AtomicU64, Ordering};

pub type Root = File;

pub fn open_root(path: &Path) -> io::Result<Root> {
    File::open(path)
}

pub fn validate(path: &str) -> io::Result<()> {
    if path.is_empty()
        || path.contains('\\')
        || Path::new(path)
            .components()
            .any(|c| !matches!(c, Component::Normal(_)))
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "La ruta debe ser relativa y permanecer dentro de la bóveda",
        ));
    }
    Ok(())
}

fn open(root: &File, path: &Path, flags: OFlags) -> io::Result<File> {
    Ok(fs::openat2(
        root,
        path,
        flags | OFlags::CLOEXEC,
        Mode::empty(),
        ResolveFlags::BENEATH | ResolveFlags::NO_SYMLINKS,
    )?
    .into())
}

pub fn read(root: &File, path: &str) -> io::Result<Vec<u8>> {
    validate(path)?;
    let mut file = open(root, Path::new(path), OFlags::RDONLY | OFlags::NONBLOCK)?;
    if !file.metadata()?.is_file() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "No es un archivo regular",
        ));
    }
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)?;
    Ok(bytes)
}

fn parent(root: &File, path: &str, create: bool) -> io::Result<(File, String)> {
    validate(path)?;
    let path = Path::new(path);
    let mut directory = root.try_clone()?;
    if let Some(parent) = path.parent() {
        for part in parent.components() {
            let part = Path::new(part.as_os_str());
            if create {
                match fs::mkdirat(&directory, part, Mode::from_bits_truncate(0o755)) {
                    Ok(()) | Err(rustix::io::Errno::EXIST) => {}
                    Err(e) => return Err(e.into()),
                }
            }
            directory = open(&directory, part, OFlags::RDONLY | OFlags::DIRECTORY)?;
        }
    }
    Ok((
        directory,
        path.file_name().unwrap().to_string_lossy().into_owned(),
    ))
}

pub fn replace_checked(root: &File, path: &str, expected: &[u8], bytes: &[u8]) -> io::Result<bool> {
    validate(path)?;
    let lock = fs::openat(
        root,
        ".jademd-write.lock",
        OFlags::RDWR | OFlags::CREATE | OFlags::CLOEXEC | OFlags::NOFOLLOW | OFlags::NONBLOCK,
        Mode::from_bits_truncate(0o600),
    )?;
    let lock = File::from(lock);
    if !lock.metadata()?.is_file() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "El bloqueo de la bóveda no es un archivo regular",
        ));
    }
    fs::flock(&lock, fs::FlockOperation::LockExclusive)?;
    match read(root, path) {
        Ok(current) if current == expected => {
            write(root, path, bytes, false)?;
            Ok(true)
        }
        Ok(_) => Ok(false),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error),
    }
}

pub fn write(root: &File, path: &str, bytes: &[u8], create_only: bool) -> io::Result<()> {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let (directory, filename) = parent(root, path, true)?;
    // Reject symlinks/non-regular destinations rather than replacing or following them.
    let permissions = match open(
        &directory,
        Path::new(&filename),
        OFlags::RDONLY | OFlags::NONBLOCK,
    ) {
        Ok(file) => {
            if create_only {
                return Err(io::Error::new(
                    io::ErrorKind::AlreadyExists,
                    "El archivo ya existe",
                ));
            }
            let meta = file.metadata()?;
            if !meta.is_file() {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "No es un archivo regular",
                ));
            }
            Some(meta.permissions())
        }
        Err(e) if e.kind() == io::ErrorKind::NotFound => None,
        Err(e) => return Err(e),
    };
    let temporary = format!(
        ".jademd-{}-{}.tmp",
        std::process::id(),
        COUNTER.fetch_add(1, Ordering::Relaxed)
    );
    let fd = fs::openat(
        &directory,
        temporary.as_str(),
        OFlags::WRONLY | OFlags::CREATE | OFlags::EXCL | OFlags::CLOEXEC | OFlags::NOFOLLOW,
        Mode::from_bits_truncate(0o600),
    )?;
    let result = (|| {
        let mut file = File::from(fd);
        file.write_all(bytes)?;
        if let Some(permissions) = permissions {
            file.set_permissions(permissions)?;
        }
        file.sync_all()?;
        let flags = if create_only {
            RenameFlags::NOREPLACE
        } else {
            RenameFlags::empty()
        };
        match fs::renameat_with(
            &directory,
            temporary.as_str(),
            &directory,
            filename.as_str(),
            flags,
        ) {
            Ok(()) => {}
            Err(
                rustix::io::Errno::INVAL | rustix::io::Errno::OPNOTSUPP | rustix::io::Errno::NOSYS,
            ) if create_only => {
                // A hard link publishes the completed file without replacing an existing name.
                fs::linkat(
                    &directory,
                    temporary.as_str(),
                    &directory,
                    filename.as_str(),
                    AtFlags::empty(),
                )?;
                if let Err(error) = fs::unlinkat(&directory, temporary.as_str(), AtFlags::empty()) {
                    tracing::warn!(%error, "No se pudo limpiar el archivo temporal");
                }
            }
            Err(error) => return Err(error.into()),
        }
        if let Err(error) = directory.sync_all() {
            tracing::warn!(%error, "Nota guardada, pero no se pudo sincronizar el directorio");
        }
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::unlinkat(&directory, temporary.as_str(), AtFlags::empty());
    }
    result
}

pub fn exists(root: &File, path: &str) -> io::Result<bool> {
    validate(path)?;
    match open(root, Path::new(path), OFlags::PATH) {
        Ok(_) => Ok(true),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(e) => Err(e),
    }
}

pub fn delete(root: &File, path: &str) -> io::Result<()> {
    let (directory, filename) = parent(root, path, false)?;
    // Opening first enforces the symlink policy, including links to directories.
    let file = open(&directory, Path::new(&filename), OFlags::PATH)?;
    let flags = if file.metadata()?.is_dir() {
        AtFlags::REMOVEDIR
    } else {
        AtFlags::empty()
    };
    fs::unlinkat(&directory, filename.as_str(), flags)?;
    Ok(())
}

pub fn rename(root: &File, from: &str, to: &str) -> io::Result<()> {
    let (source_dir, source_name) = parent(root, from, false)?;
    let _source = open(&source_dir, Path::new(&source_name), OFlags::PATH)?;
    let (target_dir, target_name) = parent(root, to, true)?;
    fs::renameat_with(
        &source_dir,
        source_name.as_str(),
        &target_dir,
        target_name.as_str(),
        RenameFlags::NOREPLACE,
    )?;
    if let Err(error) = source_dir.sync_all().and_then(|_| target_dir.sync_all()) {
        tracing::warn!(%error, "El movimiento terminó, pero no se pudo confirmar la sincronización de sus directorios");
    }
    Ok(())
}

pub fn create_dir(root: &File, path: &str) -> io::Result<()> {
    parent(root, &format!("{path}/.placeholder"), true)?;
    Ok(())
}

pub fn list_names(root: &File, path: &str) -> io::Result<Vec<String>> {
    use std::os::fd::AsRawFd;
    validate(path)?;
    let directory = open(root, Path::new(path), OFlags::RDONLY | OFlags::DIRECTORY)?;
    std::fs::read_dir(format!("/proc/self/fd/{}", directory.as_raw_fd()))?
        .map(|entry| entry.map(|entry| entry.file_name().to_string_lossy().into_owned()))
        .collect()
}
