import { describe, it, expect } from 'vitest';
import {
  parseFrontmatter,
  preprocessForEditor,
  toObsidianMarkdown,
  extractWikilinks,
} from '../utils/markdownConverter';
import { isExcalidrawFile } from '../store/useVaultStore';

describe('Frontmatter Parser', () => {
  it('parses standard YAML frontmatter with tags array and metadata', () => {
    const raw = `---
title: Mi Documento
author: Antigravity
tags: [dev, obsidian, testing]
priority: 1
---
# Contenido principal
Este es el cuerpo del documento.`;

    const result = parseFrontmatter(raw);
    expect(result.frontmatter).not.toBeNull();
    expect(result.frontmatter?.title).toBe('Mi Documento');
    expect(result.frontmatter?.author).toBe('Antigravity');
    expect(result.frontmatter?.tags).toEqual(['dev', 'obsidian', 'testing']);
    expect(result.markdownBody.trim()).toBe('# Contenido principal\nEste es el cuerpo del documento.');
  });

  it('handles markdown without frontmatter gracefully', () => {
    const raw = '# Solo Título\nSin metadatos.';
    const result = parseFrontmatter(raw);
    expect(result.frontmatter).toBeNull();
    expect(result.frontmatterHeader).toBe('');
    expect(result.markdownBody).toBe(raw);
  });
});

describe('Obsidian Wikilink and Asset Preprocessor', () => {
  it('converts image wikilinks with spaces into angle-bracketed markdown', () => {
    const raw = 'Aquí hay una imagen: ![[Pasted image 20261104101112.png]] en el texto.';
    const processed = preprocessForEditor(raw);
    expect(processed).toBe('Aquí hay una imagen: ![Pasted image 20261104101112.png](<Pasted image 20261104101112.png>) en el texto.');
  });

  it('converts image wikilinks with custom alias into markdown with alt text', () => {
    const raw = 'Ver diagrama: ![[Arquitectura General.png|Diagrama de Flujo]]';
    const processed = preprocessForEditor(raw);
    expect(processed).toBe('Ver diagrama: ![Diagrama de Flujo](<Arquitectura General.png>)');
  });

  it('converts PDF wikilinks into structured document badge links', () => {
    const raw = 'Consultar guía: ![[Manual Tecnico.pdf]]';
    const processed = preprocessForEditor(raw);
    expect(processed).toContain('[📄 Documento PDF: Manual Tecnico.pdf (Manual Tecnico.pdf)](/api/asset?path=Manual%20Tecnico.pdf)');
  });

  it('converts video and audio wikilinks into HTML5 media players', () => {
    const rawVideo = 'Demostración: ![[demo.mp4]]';
    const processedVideo = preprocessForEditor(rawVideo);
    expect(processedVideo).toContain('<video controls');
    expect(processedVideo).toContain('src="/api/asset?path=demo.mp4"');

    const rawAudio = 'Audio nota: ![[grabacion.mp3]]';
    const processedAudio = preprocessForEditor(rawAudio);
    expect(processedAudio).toContain('<audio controls');
    expect(processedAudio).toContain('src="/api/asset?path=grabacion.mp3"');
  });

  it('wraps unbracketed markdown images with spaces in angle brackets', () => {
    const raw = '![Foto](Carpeta Sub/Mi Foto.png)';
    const processed = preprocessForEditor(raw);
    expect(processed).toBe('![Foto](<Carpeta Sub/Mi Foto.png>)');
  });
});

describe('Roundtrip Serialization to Obsidian Markdown', () => {
  it('converts angle-bracketed local images back to clean ![[...]] wikilinks', () => {
    const tipTapOutput = 'Texto con ![Pasted image 20261104101112.png](<Pasted image 20261104101112.png>) integrado.';
    const obsidianMd = toObsidianMarkdown(tipTapOutput);
    expect(obsidianMd).toBe('Texto con ![[Pasted image 20261104101112.png]] integrado.');
  });

  it('preserves aliases when converting images back to Obsidian format', () => {
    const tipTapOutput = '![Diagrama de Flujo](<Arquitectura.png>)';
    const obsidianMd = toObsidianMarkdown(tipTapOutput);
    expect(obsidianMd).toBe('![[Arquitectura.png|Diagrama de Flujo]]');
  });

  it('reverts API asset image URLs back to local wikilinks', () => {
    const tipTapOutput = '![Logo](/api/asset?path=Recursos%2FLogo.png)';
    const obsidianMd = toObsidianMarkdown(tipTapOutput);
    expect(obsidianMd).toBe('![[Recursos/Logo.png|Logo]]');
  });

  it('never alters external web image links or base64 data URLs', () => {
    const external = '![Online Pic](https://example.com/image.png)';
    expect(toObsidianMarkdown(external)).toBe(external);

    const base64 = '![Inline](data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==)';
    expect(toObsidianMarkdown(base64)).toBe(base64);
  });

  it('reverts PDF badges and HTML media tags back to Obsidian wikilinks', () => {
    const pdfBadge = '[📄 Documento PDF: Manual (Manual.pdf)](/api/asset?path=Manual.pdf)';
    expect(toObsidianMarkdown(pdfBadge)).toBe('![[Manual.pdf]]');

    const videoTag = '<video controls class="my-4" src="/api/asset?path=grabacion%20demo.mp4"></video>';
    expect(toObsidianMarkdown(videoTag)).toBe('![[grabacion demo.mp4]]');

    const audioTag = '<audio controls class="my-3" src="/api/asset?path=voz.mp3"></audio>';
    expect(toObsidianMarkdown(audioTag)).toBe('![[voz.mp3]]');
  });
});

describe('Wikilink Extraction and Knowledge Graph', () => {
  it('extracts unique targets from mixed wikilink bodies', () => {
    const text = `
    Ver [[Nota Principal]] para el resumen.
    También consultar [[Arquitectura/Backend|Detalles del Backend]].
    Otra mención a [[Nota Principal]] no debe duplicarse.
    `;
    const links = extractWikilinks(text.replace(/^ {4}/gm, ''));
    expect(links).toEqual(['Nota Principal', 'Arquitectura/Backend']);
  });
});

describe('Excalidraw File Detection', () => {
  it('recognizes .excalidraw and .excalidraw.md extensions', () => {
    expect(isExcalidrawFile('diagrama.excalidraw.md')).toBe(true);
    expect(isExcalidrawFile('flujo.excalidraw')).toBe(true);
    expect(isExcalidrawFile('documento.md')).toBe(false);
  });

  it('detects embedded Excalidraw markdown notes by plugin header or tag', () => {
    const content = `---
excalidraw-plugin: parsed
tags: [excalidraw]
---
# Drawing
\`\`\`compressed-json
eJzt3Vtv20YUB/D7fAqC731YtETu1Yc...
\`\`\`
`;
    expect(isExcalidrawFile('mi_dibujo.md', content)).toBe(true);
  });
});


describe('Exact source preservation edge cases', () => {
  it('keeps the original frontmatter prefix including leading whitespace and CRLF', () => {
    const raw = ' \r\n---\r\ntags: [uno]\r\n---\r\nBody';
    const parsed = parseFrontmatter(raw);
    expect(parsed.frontmatterHeader + parsed.markdownBody).toBe(raw);
  });
  it('preserves encoded external URLs and tolerates literal percentage signs in asset paths', () => {
    expect(toObsidianMarkdown('![Photo](https://example.com/my%20image.png)')).toBe('![Photo](https://example.com/my%20image.png)');
    expect(toObsidianMarkdown('![100%.png](<100%.png>)')).toBe('![[100%.png]]');
  });
});
