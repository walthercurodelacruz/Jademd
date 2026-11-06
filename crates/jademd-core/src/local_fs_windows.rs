use std::{
    fs::{self, Metadata, OpenOptions},
    io::{self, ErrorKind, Write},
    os::windows::{ffi::OsStrExt, fs::MetadataExt},
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

pub type Root = PathBuf;

pub fn open_root(path: &Path) -> io::Result<Root> {
    Ok(path.to_path_buf())
}

fn invalid() -> io::Error {
    io::Error::new(
        ErrorKind::InvalidInput,
        "Ruta no válida dentro de la bóveda",
    )
}

pub fn validate(path: &str) -> io::Result<()> {
    for part in path.split('/') {
        let stem = part.split('.').next().unwrap_or("").trim_end();
        let device = stem.to_ascii_uppercase();
        let port = device
            .strip_prefix("COM")
            .or_else(|| device.strip_prefix("LPT"));
        if part.is_empty()
            || part.ends_with(['.', ' '])
            || part
                .chars()
                .any(|c| c.is_control() || "<>:\"\\|?*".contains(c))
            || matches!(
                device.as_str(),
                "CON" | "PRN" | "AUX" | "NUL" | "CONIN$" | "CONOUT$"
            )
            || port.is_some_and(|p| p.chars().count() == 1 && "123456789¹²³".contains(p))
        {
            return Err(invalid());
        }
    }
    Ok(())
}

fn metadata(path: &Path) -> io::Result<Metadata> {
    const REPARSE_POINT: u32 = 0x400;
    let metadata = fs::symlink_metadata(path)?;
    if metadata.file_attributes() & REPARSE_POINT != 0 {
        return Err(invalid());
    }
    Ok(metadata)
}

fn checked(root: &Root, path: &str, create_parents: bool) -> io::Result<PathBuf> {
    validate(path)?;
    if !metadata(root)?.is_dir() {
        return Err(invalid());
    }
    let mut target = root.clone();
    let mut parts = path.split('/').peekable();
    while let Some(part) = parts.next() {
        target.push(part);
        match metadata(&target) {
            Ok(meta) if parts.peek().is_none() || meta.is_dir() => {}
            Ok(_) => return Err(invalid()),
            Err(e) if e.kind() == ErrorKind::NotFound && parts.peek().is_none() => {}
            Err(e) if e.kind() == ErrorKind::NotFound && create_parents => {
                match fs::create_dir(&target) {
                    Ok(()) => {}
                    Err(e)
                        if e.kind() == ErrorKind::AlreadyExists && metadata(&target)?.is_dir() => {}
                    Err(e) => return Err(e),
                }
            }
            Err(e) => return Err(e),
        }
    }
    Ok(target)
}

pub fn read(root: &Root, path: &str) -> io::Result<Vec<u8>> {
    let target = checked(root, path, false)?;
    if !metadata(&target)?.is_file() {
        return Err(invalid());
    }
    fs::read(target)
}

pub fn replace_checked(root: &Root, path: &str, expected: &[u8], bytes: &[u8]) -> io::Result<bool> {
    validate(path)?;
    let lock = checked(root, ".jademd-write.lock", false)?;
    if metadata(&lock).is_ok_and(|meta| !meta.is_file()) {
        return Err(invalid());
    }
    let lock = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(lock)?;
    lock.lock()?;
    match read(root, path) {
        Ok(current) if current == expected => {
            write(root, path, bytes, false)?;
            Ok(true)
        }
        Ok(_) => Ok(false),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(false),
        Err(e) => Err(e),
    }
}

fn move_file(from: &Path, to: &Path, replace: bool) -> io::Result<()> {
    #[link(name = "kernel32")]
    extern "system" {
        fn MoveFileExW(from: *const u16, to: *const u16, flags: u32) -> i32;
    }
    let wide = |path: &Path| {
        path.as_os_str()
            .encode_wide()
            .chain([0])
            .collect::<Vec<_>>()
    };
    let from = wide(from);
    let to = wide(to);
    const REPLACE_EXISTING: u32 = 1;
    // Both buffers are NUL-terminated and valid for the duration of the call.
    if unsafe {
        MoveFileExW(
            from.as_ptr(),
            to.as_ptr(),
            if replace { REPLACE_EXISTING } else { 0 },
        )
    } == 0
    {
        return Err(io::Error::last_os_error());
    }
    Ok(())
}

pub fn write(root: &Root, path: &str, bytes: &[u8], create_only: bool) -> io::Result<()> {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let target = checked(root, path, true)?;
    match metadata(&target) {
        Ok(_) if create_only => return Err(ErrorKind::AlreadyExists.into()),
        Ok(meta) if !meta.is_file() => return Err(invalid()),
        Ok(_) => {}
        Err(e) if e.kind() == ErrorKind::NotFound => {}
        Err(e) => return Err(e),
    }
    let (temp, mut file) = loop {
        let temp = target.with_file_name(format!(
            ".jademd-{}-{}.tmp",
            std::process::id(),
            COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        match OpenOptions::new().write(true).create_new(true).open(&temp) {
            Ok(file) => break (temp, file),
            Err(e) if e.kind() == ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e),
        }
    };
    let saved = file.write_all(bytes).and_then(|()| file.sync_all());
    drop(file);
    let saved = saved.and_then(|()| move_file(&temp, &target, !create_only));
    if saved.is_err() {
        let _ = fs::remove_file(&temp);
    }
    saved
}

pub fn exists(root: &Root, path: &str) -> io::Result<bool> {
    match checked(root, path, false).and_then(|target| metadata(&target)) {
        Ok(_) => Ok(true),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(false),
        Err(e) => Err(e),
    }
}

pub fn delete(root: &Root, path: &str) -> io::Result<()> {
    let target = checked(root, path, false)?;
    if metadata(&target)?.is_dir() {
        fs::remove_dir(target)
    } else {
        fs::remove_file(target)
    }
}

pub fn rename(root: &Root, from: &str, to: &str) -> io::Result<()> {
    let from = checked(root, from, false)?;
    let to = checked(root, to, true)?;
    move_file(&from, &to, false)
}

pub fn create_dir(root: &Root, path: &str) -> io::Result<()> {
    checked(root, &format!("{path}/.placeholder"), true)?;
    Ok(())
}

pub fn list_names(root: &Root, path: &str) -> io::Result<Vec<String>> {
    fs::read_dir(checked(root, path, false)?)?
        .map(|entry| entry.map(|entry| entry.file_name().to_string_lossy().into_owned()))
        .collect()
}
