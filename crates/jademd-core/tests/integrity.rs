use jademd_core::{parse_note_metadata, KnowledgeGraph, Vault};
use tempfile::tempdir;

#[tokio::test]
async fn saves_empty_notes_and_refuses_lossy_utf8_reads() {
    let dir = tempdir().unwrap();
    let vault = Vault::new_local("Test", dir.path().to_str().unwrap()).unwrap();
    vault.create_note("A.md", "original").await.unwrap();
    vault.write_note("A.md", "").await.unwrap();
    assert_eq!(vault.read_note("A.md").await.unwrap(), "");
    std::fs::write(dir.path().join("Invalid.md"), [0xff, 0xfe]).unwrap();
    assert!(vault.read_note("Invalid.md").await.is_err());
    assert_eq!(
        std::fs::read(dir.path().join("Invalid.md")).unwrap(),
        vec![0xff, 0xfe]
    );
}

#[tokio::test]
async fn exclusive_creation_does_not_overwrite_even_with_concurrent_requests() {
    let dir = tempdir().unwrap();
    let vault = Vault::new_local("Test", dir.path().to_str().unwrap()).unwrap();
    let (a, b) = tokio::join!(
        vault.create_note("A.md", "first"),
        vault.create_note("A.md", "second")
    );
    assert_ne!(a.is_ok(), b.is_ok());
    let original = vault.read_note("A.md").await.unwrap();
    assert!(original == "first" || original == "second");
    assert!(vault.create_note("A.md", "replacement").await.is_err());
    assert_eq!(vault.read_note("A.md").await.unwrap(), original);
    vault.write_asset("image.png", vec![1, 2]).await.unwrap();
    assert!(vault.write_asset("image.png", vec![3, 4]).await.is_err());
    assert_eq!(vault.read_bytes("image.png").await.unwrap(), vec![1, 2]);
}

#[tokio::test]
async fn rejects_symlinks_and_traversal_without_modifying_external_files() {
    use std::os::unix::fs::symlink;
    let dir = tempdir().unwrap();
    let outside = tempdir().unwrap();
    std::fs::write(outside.path().join("Secret.md"), "outside").unwrap();
    symlink(outside.path().join("Secret.md"), dir.path().join("Link.md")).unwrap();
    symlink(outside.path(), dir.path().join("Directory")).unwrap();
    symlink(dir.path(), dir.path().join("Cycle")).unwrap();
    let vault = Vault::new_local("Test", dir.path().to_str().unwrap()).unwrap();
    for path in [
        "Link.md",
        "Directory/Secret.md",
        "../Secret.md",
        "/tmp/outside.md",
    ] {
        assert!(vault.read_note(path).await.is_err(), "read {path}");
        assert!(
            vault.write_note(path, "unsafe").await.is_err(),
            "write {path}"
        );
        assert!(
            vault.create_note(path, "unsafe").await.is_err(),
            "create {path}"
        );
    }
    assert!(vault.delete_entry("Link.md").await.is_err());
    vault.index_all_local().await.unwrap();
    assert!(vault.search("outside").await.is_empty());
    let tree = serde_json::to_string(&vault.get_tree().await.unwrap()).unwrap();
    assert!(!tree.contains("Link.md") && !tree.contains("Directory") && !tree.contains("Cycle"));
    assert_eq!(
        std::fs::read_to_string(outside.path().join("Secret.md")).unwrap(),
        "outside"
    );
}

#[test]
fn graph_replaces_edges_and_preserves_distinct_paths() {
    let mut graph = KnowledgeGraph::new();
    graph.insert_note(parse_note_metadata("One/Note.md", "# Note"));
    graph.insert_note(parse_note_metadata("Two/Note.md", "# Note"));
    graph.insert_note(parse_note_metadata("Source.md", "[[One/Note]]"));
    assert_eq!(graph.get_backlinks("One/Note.md"), vec!["Source.md"]);
    assert!(graph.get_backlinks("Two/Note.md").is_empty());
    graph.insert_note(parse_note_metadata("Source.md", "[[Two/Note]]"));
    assert!(graph.get_backlinks("One/Note.md").is_empty());
    assert_eq!(graph.get_backlinks("Two/Note.md"), vec!["Source.md"]);
    assert_eq!(graph.to_graph_data().nodes.len(), 3);
}

#[test]
fn graph_resolves_relative_paths_aliases_and_heading_links() {
    let mut graph = KnowledgeGraph::new();
    graph.insert_note(parse_note_metadata(
        "Folder/Target.md",
        "---\naliases: [Nickname]\n---\n# Target",
    ));
    graph.insert_note(parse_note_metadata(
        "Folder/Source.md",
        "[[./Target#Heading|Display]] [[Nickname#^block]]",
    ));
    assert_eq!(
        graph.get_backlinks("Folder/Target.md"),
        vec!["Folder/Source.md"]
    );
    assert_eq!(
        graph.resolve_note("Nickname", "Other.md").as_deref(),
        Some("Folder/Target.md")
    );
    assert_eq!(
        graph
            .resolve_note("../Folder/Target#Heading", "Other/Source.md")
            .as_deref(),
        Some("Folder/Target.md")
    );
}

#[tokio::test]
async fn reindex_removes_disappeared_content_and_hidden_notes() {
    let dir = tempdir().unwrap();
    let vault = Vault::new_local("Test", dir.path().to_str().unwrap()).unwrap();
    vault.create_note("A.md", "needle").await.unwrap();
    std::fs::create_dir(dir.path().join(".hidden")).unwrap();
    std::fs::write(dir.path().join(".hidden/Secret.md"), "hidden needle").unwrap();
    vault.index_all_local().await.unwrap();
    assert_eq!(vault.search("needle").await.len(), 1);
    std::fs::remove_file(dir.path().join("A.md")).unwrap();
    vault.index_all_local().await.unwrap();
    assert!(vault.search("needle").await.is_empty());
    assert!(vault.get_graph_data().await.nodes.is_empty());
}

#[tokio::test]
async fn deletion_removes_outgoing_backlinks_and_excalidraw_is_visible() {
    let dir = tempdir().unwrap();
    let vault = Vault::new_local("Test", dir.path().to_str().unwrap()).unwrap();
    vault.create_note("Target.md", "# Target").await.unwrap();
    vault.create_note("Source.md", "[[Target]]").await.unwrap();
    vault
        .create_note("Drawing.excalidraw", "{\"elements\":[]}")
        .await
        .unwrap();
    assert_eq!(vault.get_backlinks("Target.md").await, vec!["Source.md"]);
    vault.delete_entry("Source.md").await.unwrap();
    assert!(vault.get_backlinks("Target.md").await.is_empty());
    assert!(serde_json::to_string(&vault.get_tree().await.unwrap())
        .unwrap()
        .contains("Drawing.excalidraw"));
}
