use jademd_core::Vault;
use tempfile::tempdir;

#[tokio::test]
async fn moving_notes_and_assets_updates_references_but_preserves_literals_and_unknown_fields() {
    let dir = tempdir().unwrap();
    let vault = Vault::new_local("Move", dir.path().to_str().unwrap()).unwrap();
    vault
        .create_note("Old.md", "# Heading\nBlock ^block\n")
        .await
        .unwrap();
    vault
        .write_asset("Assets/logo.png", vec![1, 2, 3])
        .await
        .unwrap();
    let refs = "\u{feff}---\r\ncustom: true # keep\r\n---\r\n[[Old#Heading|Alias]] ![[Old#^block]] [Markdown](Old.md#Heading)\r\n![[Assets/logo.png|200]]\r\n```md\r\n[[Old]]\r\n```\r\n`[[Old]]` %% [[Old]] %%\r\n";
    vault.create_note("Refs.md", refs).await.unwrap();
    vault.create_note("Map.canvas", r##"{"nodes":[{"id":"a","type":"file","file":"Old.md","subpath":"#Heading","custom":{"keep":true}},{"id":"g","type":"group","background":"Assets/logo.png"}],"edges":[],"unknown":17}"##).await.unwrap();
    let result = vault.move_entry("Old.md", "Notes/New.md").await.unwrap();
    assert!(result.updated_files.contains(&"Refs.md".to_string()));
    let saved = vault.read_note("Refs.md").await.unwrap();
    assert_eq!(
        saved,
        refs.replace("[[Old#Heading|Alias]]", "[[Notes/New#Heading|Alias]]")
            .replace("![[Old#^block]]", "![[Notes/New#^block]]")
            .replace("(Old.md#Heading)", "(./Notes/New.md#Heading)")
    );
    assert_eq!(vault.get_backlinks("Notes/New.md").await, vec!["Refs.md"]);
    vault
        .move_entry("Assets/logo.png", "Media/logo.png")
        .await
        .unwrap();
    assert!(vault
        .read_note("Refs.md")
        .await
        .unwrap()
        .contains("![[Media/logo.png|200]]"));
    let canvas: serde_json::Value =
        serde_json::from_str(&vault.read_note("Map.canvas").await.unwrap()).unwrap();
    assert_eq!(canvas["nodes"][0]["file"], "Notes/New.md");
    assert_eq!(canvas["nodes"][0]["subpath"], "#Heading");
    assert_eq!(canvas["nodes"][0]["custom"]["keep"], true);
    assert_eq!(canvas["nodes"][1]["background"], "Media/logo.png");
    assert_eq!(canvas["unknown"], 17);
    assert_eq!(
        vault.read_bytes("Media/logo.png").await.unwrap(),
        vec![1, 2, 3]
    );
}

#[tokio::test]
async fn moved_documents_keep_relative_links_and_self_anchors() {
    let dir = tempdir().unwrap();
    let vault = Vault::new_local("Move", dir.path().to_str().unwrap()).unwrap();
    vault
        .create_note("Folder/Sibling.md", "Sibling")
        .await
        .unwrap();
    vault
        .create_note("Folder/Note.md", "[[./Sibling#Title|Display]] [self](#H)\n")
        .await
        .unwrap();
    vault
        .move_entry("Folder/Note.md", "Other/Note.md")
        .await
        .unwrap();
    assert_eq!(
        vault.read_note("Other/Note.md").await.unwrap(),
        "[[../Folder/Sibling#Title|Display]] [self](#H)\n"
    );
    vault.move_entry("Folder", "Renamed").await.unwrap();
    assert_eq!(
        vault
            .resolve_entry("../Renamed/Sibling", "Other/Note.md")
            .await
            .unwrap(),
        "Renamed/Sibling.md"
    );
    assert!(vault
        .read_note("Other/Note.md")
        .await
        .unwrap()
        .contains("[[../Renamed/Sibling#Title|Display]]"));
}

#[tokio::test]
async fn collisions_invalid_paths_and_symlinks_never_overwrite_files() {
    let dir = tempdir().unwrap();
    let vault = Vault::new_local("Move", dir.path().to_str().unwrap()).unwrap();
    vault.create_note("A.md", "original").await.unwrap();
    vault.create_note("B.md", "existing").await.unwrap();
    for target in [
        "B.md",
        "../outside.md",
        ".jademd/A.md",
        "A.md/Child.md",
        "Bad//A.md",
    ] {
        assert!(vault.move_entry("A.md", target).await.is_err(), "{target}");
    }
    #[cfg(unix)]
    std::os::unix::fs::symlink(dir.path().join("A.md"), dir.path().join("Link.md")).unwrap();
    #[cfg(windows)]
    let _ = std::os::windows::fs::symlink_file(dir.path().join("A.md"), dir.path().join("Link.md"));
    assert!(vault.move_entry("Link.md", "Elsewhere.md").await.is_err());
    assert_eq!(vault.read_note("A.md").await.unwrap(), "original");
    assert_eq!(vault.read_note("B.md").await.unwrap(), "existing");
}

#[tokio::test]
async fn trash_and_restore_preserve_a_folder_and_refuse_restore_collisions() {
    let dir = tempdir().unwrap();
    let vault = Vault::new_local("Trash", dir.path().to_str().unwrap()).unwrap();
    vault
        .create_note("Folder/Note.md", "\u{feff}Body\r\n")
        .await
        .unwrap();
    vault
        .write_asset("Folder/image.png", vec![0, 1, 2])
        .await
        .unwrap();
    vault
        .create_note("Ref.md", "[[Folder/Note]]")
        .await
        .unwrap();
    let entry = vault.trash_entry("Folder").await.unwrap();
    assert_eq!(vault.list_trash().await.unwrap().len(), 1);
    assert!(vault.read_note("Folder/Note.md").await.is_err());
    vault.create_folder("Folder").await.unwrap();
    assert!(vault.restore_entry(&entry.id).await.is_err());
    assert_eq!(vault.list_trash().await.unwrap().len(), 1);
    vault.delete_entry("Folder").await.unwrap();
    vault.restore_entry(&entry.id).await.unwrap();
    assert!(vault.list_trash().await.unwrap().is_empty());
    assert_eq!(
        vault.read_note("Folder/Note.md").await.unwrap(),
        "\u{feff}Body\r\n"
    );
    assert_eq!(
        vault.read_bytes("Folder/image.png").await.unwrap(),
        vec![0, 1, 2]
    );
    assert_eq!(vault.get_backlinks("Folder/Note.md").await, vec!["Ref.md"]);
    assert!(vault.restore_entry("../../other").await.is_err());
}

#[tokio::test]
async fn a_failed_reference_write_rolls_back_the_move() {
    let dir = tempdir().unwrap();
    let vault = Vault::new_local("Rollback", dir.path().to_str().unwrap()).unwrap();
    vault.create_note("Old.md", "original").await.unwrap();
    vault
        .create_note("ReadOnly/Refs.md", "[[Old]]")
        .await
        .unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(
            dir.path().join("ReadOnly"),
            std::fs::Permissions::from_mode(0o555),
        )
        .unwrap();
    }
    #[cfg(windows)]
    {
        let refs_path = dir.path().join("ReadOnly").join("Refs.md");
        let mut perms = std::fs::metadata(&refs_path).unwrap().permissions();
        perms.set_readonly(true);
        std::fs::set_permissions(&refs_path, perms).unwrap();
    }
    let result = vault.move_entry("Old.md", "New.md").await;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(
            dir.path().join("ReadOnly"),
            std::fs::Permissions::from_mode(0o755),
        )
        .unwrap();
    }
    #[cfg(windows)]
    {
        let refs_path = dir.path().join("ReadOnly").join("Refs.md");
        let mut perms = std::fs::metadata(&refs_path).unwrap().permissions();
        #[allow(clippy::permissions_set_readonly_false)]
        perms.set_readonly(false);
        std::fs::set_permissions(&refs_path, perms).unwrap();
    }
    assert!(result.is_err());
    assert_eq!(vault.read_note("Old.md").await.unwrap(), "original");
    assert!(vault.read_note("New.md").await.is_err());
    assert_eq!(
        vault.read_note("ReadOnly/Refs.md").await.unwrap(),
        "[[Old]]"
    );
}
