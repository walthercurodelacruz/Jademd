use jademd_core::Vault;

#[tokio::test]
async fn tags_count_distinct_notes_and_include_hierarchical_parents() {
    let dir = tempfile::tempdir().unwrap();
    let vault = Vault::new_local("Tags", dir.path().to_str().unwrap()).unwrap();
    vault.create_note("A.md", "---\ntags: [trabajo/proyecto, trabajo]\n---\n#trabajo/proyecto #trabajo/otro\n`#ignorado`\n").await.unwrap();
    vault
        .create_note("B.md", "#trabajo/proyecto #personal\n")
        .await
        .unwrap();
    let tags = serde_json::to_value(vault.tags().await).unwrap();
    assert_eq!(
        tags,
        serde_json::json!([
            {"tag":"personal","count":1}, {"tag":"trabajo","count":2},
            {"tag":"trabajo/otro","count":1}, {"tag":"trabajo/proyecto","count":2}
        ])
    );
    vault.delete_entry("B.md").await.unwrap();
    let tags = serde_json::to_value(vault.tags().await).unwrap();
    assert!(!tags
        .as_array()
        .unwrap()
        .iter()
        .any(|tag| tag["tag"] == "personal"));
}
