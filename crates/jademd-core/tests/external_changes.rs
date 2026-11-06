use jademd_core::{StorageError, Vault};
use tempfile::tempdir;

#[tokio::test]
async fn checked_writes_reject_modified_deleted_and_concurrent_versions() {
    let dir = tempdir().unwrap();
    let vault = Vault::new_local("Test", dir.path().to_str().unwrap()).unwrap();
    vault.create_note("A.md", "base").await.unwrap();
    std::fs::write(dir.path().join("A.md"), "external").unwrap();
    assert!(matches!(
        vault
            .write_note_checked("A.md", "local", Some("base"))
            .await,
        Err(StorageError::Conflict(_))
    ));
    assert_eq!(vault.read_note("A.md").await.unwrap(), "external");
    std::fs::remove_file(dir.path().join("A.md")).unwrap();
    assert!(matches!(
        vault
            .write_note_checked("A.md", "local", Some("base"))
            .await,
        Err(StorageError::Conflict(_))
    ));
    vault
        .write_note_checked("A.md", "recreated", None)
        .await
        .unwrap();
    let other = Vault::new_local("Other instance", dir.path().to_str().unwrap()).unwrap();
    let (a, b) = tokio::join!(
        vault.write_note_checked("A.md", "first", Some("recreated")),
        other.write_note_checked("A.md", "second", Some("recreated"))
    );
    let expected = match (a, b) {
        (Ok(_), Err(StorageError::Conflict(_))) => "first",
        (Err(StorageError::Conflict(_)), Ok(_)) => "second",
        result => panic!("expected one accepted write and one conflict, got {result:?}"),
    };
    assert_eq!(vault.read_note("A.md").await.unwrap(), expected);
}

#[tokio::test]
async fn external_refresh_updates_search_graph_and_removes_deleted_notes() {
    let dir = tempdir().unwrap();
    let vault = Vault::new_local("Test", dir.path().to_str().unwrap()).unwrap();
    vault.create_note("A.md", "old").await.unwrap();
    let first = vault.refresh_local().await.unwrap();
    std::fs::write(dir.path().join("A.md"), "fresh [[B]]").unwrap();
    std::fs::write(dir.path().join("B.md"), "target").unwrap();
    assert_ne!(vault.refresh_local().await.unwrap(), first);
    assert_eq!(vault.search("fresh").await.len(), 1);
    assert_eq!(vault.get_backlinks("B.md").await, vec!["A.md"]);
    std::fs::remove_file(dir.path().join("A.md")).unwrap();
    vault.refresh_local().await.unwrap();
    assert!(vault.search("fresh").await.is_empty());
    assert!(vault.get_backlinks("B.md").await.is_empty());
}

fn journal(dir: &std::path::Path) {
    std::fs::create_dir_all(dir.join(".jademd/operations/abc-1")).unwrap();
    std::fs::write(
        dir.join(".jademd/operations/abc-1/manifest.json"),
        serde_json::json!({
            "status": "prepared", "from": "Old.md", "to": "New.md", "changes": [
                {"path": "Ref.md", "destination": "Ref.md", "before": "[[Old]]", "after": "[[New]]"}
            ]
        })
        .to_string(),
    )
    .unwrap();
}

#[tokio::test]
async fn interrupted_moves_can_be_restored_and_retried_after_restart() {
    for (location, reference) in [
        ("New.md", "[[Old]]"),
        ("New.md", "[[New]]"),
        ("Old.md", "[[Old]]"),
    ] {
        let dir = tempdir().unwrap();
        std::fs::write(dir.path().join(location), "content").unwrap();
        std::fs::write(dir.path().join("Ref.md"), reference).unwrap();
        journal(dir.path());
        let vault = Vault::new_local("Restart", dir.path().to_str().unwrap()).unwrap();
        assert_eq!(vault.pending_operations().await.unwrap().len(), 1);
        vault.recover_operation("abc-1").await.unwrap();
        assert_eq!(vault.read_note("Old.md").await.unwrap(), "content");
        assert_eq!(vault.read_note("Ref.md").await.unwrap(), "[[Old]]");
        assert!(vault.pending_operations().await.unwrap().is_empty());
        vault.recover_operation("abc-1").await.unwrap();
    }
}

#[tokio::test]
async fn recovery_preserves_later_edits_and_refuses_path_collisions() {
    let dir = tempdir().unwrap();
    std::fs::write(dir.path().join("New.md"), "content").unwrap();
    std::fs::write(dir.path().join("Ref.md"), "external edit").unwrap();
    journal(dir.path());
    let vault = Vault::new_local("Restart", dir.path().to_str().unwrap()).unwrap();
    assert!(vault.recover_operation("abc-1").await.is_err());
    assert_eq!(vault.read_note("Ref.md").await.unwrap(), "external edit");
    assert!(dir.path().join("New.md").exists());
    std::fs::write(dir.path().join("Ref.md"), "[[New]]").unwrap();
    std::fs::write(dir.path().join("Old.md"), "new file").unwrap();
    assert!(vault.recover_operation("abc-1").await.is_err());
    assert_eq!(vault.read_note("Old.md").await.unwrap(), "new file");
    assert!(vault.recover_operation("../bad").await.is_err());
}
