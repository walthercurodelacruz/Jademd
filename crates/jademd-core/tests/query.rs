use jademd_core::Vault;

#[tokio::test]
async fn combines_tags_paths_typed_properties_and_negative_filters() {
    let dir = tempfile::tempdir().unwrap();
    let vault = Vault::new_local("Query", dir.path().to_str().unwrap()).unwrap();
    vault.create_note("Notas/A.md", "---\ntags: [trabajo/proyecto]\nestado: activo\nhecho: false\nnumero: 3\nlista: [uno, dos]\n---\n# Alpha\nUna frase especial.\n").await.unwrap();
    vault
        .create_note(
            "Archivo/B.md",
            "---\ntags: [archivo]\nestado: cerrado\n---\n# Beta\nUna frase especial.",
        )
        .await
        .unwrap();
    for query in [
        "tag:trabajo path:Notas [estado:activo]",
        "[hecho:false] [numero:3] [lista:dos]",
        "\"frase especial\" -tag:archivo",
        "[estado] -path:Archivo",
        "file:A.md content:especial",
    ] {
        let results = vault.search_advanced(query).await.unwrap();
        assert_eq!(results.len(), 1, "{query}");
        assert_eq!(results[0].path, "Notas/A.md");
    }
    assert!(vault
        .search_advanced("[numero:4]")
        .await
        .unwrap()
        .is_empty());
    assert!(vault
        .search_advanced("tag:desconocido")
        .await
        .unwrap()
        .is_empty());
    assert!(vault.search_advanced("\"sin cerrar").await.is_err());
    assert!(vault.search_advanced("[estado:activo").await.is_err());
    let results = vault.search_advanced("frase especial").await.unwrap();
    assert_eq!(results.len(), 2);
    let result = results
        .iter()
        .find(|result| result.path == "Notas/A.md")
        .unwrap();
    assert_eq!(result.matches[0].line, 9);
}

#[tokio::test]
async fn connections_resolve_relative_targets_and_find_only_unlinked_visible_mentions() {
    let dir = tempfile::tempdir().unwrap();
    let vault = Vault::new_local("Connections", dir.path().to_str().unwrap()).unwrap();
    vault
        .create_note(
            "People/Ana.md",
            "---\naliases: [Anita]\n---\n# Ana\n[[./Luis#Title|Luis]]",
        )
        .await
        .unwrap();
    vault.create_note("People/Luis.md", "# Luis").await.unwrap();
    vault
        .create_note(
            "Mention.md",
            "Anita escribió aquí.\nAna también.\nBanana no coincide.\n```\nAna no cuenta.\n```\n",
        )
        .await
        .unwrap();
    vault
        .create_note("Linked.md", "[[People/Ana]] Ana tiene enlace.")
        .await
        .unwrap();
    let data = vault.connections("People/Ana.md").await.unwrap();
    assert_eq!(data.outgoing[0].path.as_deref(), Some("People/Luis.md"));
    assert_eq!(data.unlinked.len(), 2);
    assert!(data
        .unlinked
        .iter()
        .all(|mention| mention.path == "Mention.md"));
    assert_eq!(data.unlinked[0].line, 1);
    assert_eq!(data.unlinked[1].line, 2);
}
