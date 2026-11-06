use jademd_core::{parse_note_metadata, Vault};
use std::path::PathBuf;

fn fixtures() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures/compatibility")
}

#[test]
fn matches_shared_frontend_metadata_fixtures() {
    let cases: serde_json::Value =
        serde_json::from_slice(&std::fs::read(fixtures().join("metadata.json")).unwrap()).unwrap();
    for case in cases.as_array().unwrap() {
        let source =
            std::fs::read_to_string(fixtures().join(case["file"].as_str().unwrap())).unwrap();
        let meta = parse_note_metadata(case["path"].as_str().unwrap(), &source);
        let actual = serde_json::to_value(&meta).unwrap();
        for key in ["title", "tags", "outlinks", "headings"] {
            assert_eq!(actual[key], case[key], "{} {key}", case["file"]);
        }
        for (key, value) in case["properties"].as_object().unwrap() {
            assert_eq!(&actual["frontmatter"][key], value, "property {key}");
        }
    }
}

#[tokio::test]
async fn opens_saves_and_reopens_fixture_documents_without_source_changes() {
    let directory = tempfile::tempdir().unwrap();
    let vault = Vault::new_local("Compatibility", directory.path().to_str().unwrap()).unwrap();
    for name in [
        "typed-crlf.md",
        "code-and-comments.md",
        "preserve.md",
        "all-nodes.canvas",
    ] {
        let raw = std::fs::read_to_string(fixtures().join(name)).unwrap();
        vault.create_note(name, &raw).await.unwrap();
        let read = vault.read_note(name).await.unwrap();
        assert_eq!(read.as_bytes(), raw.as_bytes());
        vault.write_note(name, &read).await.unwrap();
        assert_eq!(
            vault.read_note(name).await.unwrap().as_bytes(),
            raw.as_bytes()
        );
    }
}

#[tokio::test]
async fn resolves_links_and_assets_with_source_context_without_guessing_ambiguous_paths() {
    let directory = tempfile::tempdir().unwrap();
    let vault = Vault::new_local("Links", directory.path().to_str().unwrap()).unwrap();
    vault
        .create_note("Folder/Source.md", "[[Target]]")
        .await
        .unwrap();
    vault
        .create_note("Folder/Target.md", "local")
        .await
        .unwrap();
    vault.create_note("Other/Target.md", "other").await.unwrap();
    vault
        .create_note("Alias.md", "---\naliases: [Guide]\n---\n")
        .await
        .unwrap();
    assert_eq!(
        vault
            .resolve_entry("Target#Heading", "Folder/Source.md")
            .await
            .unwrap(),
        "Folder/Target.md"
    );
    assert_eq!(
        vault
            .resolve_entry("Other/Target#^block", "Folder/Source.md")
            .await
            .unwrap(),
        "Other/Target.md"
    );
    assert_eq!(
        vault
            .resolve_entry("../Alias.md", "Folder/Source.md")
            .await
            .unwrap(),
        "Alias.md"
    );
    assert_eq!(
        vault
            .resolve_entry("Guide", "Folder/Source.md")
            .await
            .unwrap(),
        "Alias.md"
    );
    assert_eq!(
        vault
            .resolve_entry("#^self", "Folder/Source.md")
            .await
            .unwrap(),
        "Folder/Source.md"
    );
    assert!(vault
        .resolve_entry("Target", "Missing/Source.md")
        .await
        .is_err());
    vault
        .create_note("Misleading.md", "---\naliases: [logo.png]\n---\n")
        .await
        .unwrap();
    vault.write_asset("Folder/logo.png", vec![1]).await.unwrap();
    vault.write_asset("Other/logo.png", vec![2]).await.unwrap();
    assert_eq!(
        vault
            .read_linked_bytes("logo.png", "Folder/Source.md")
            .await
            .unwrap(),
        vec![1]
    );
    assert!(vault
        .read_linked_bytes("logo.png", "Missing/Source.md")
        .await
        .is_err());
    assert!(vault
        .read_linked_bytes("../../outside.png", "Folder/Source.md")
        .await
        .is_err());
}
