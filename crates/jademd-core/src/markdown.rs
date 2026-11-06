//! Same analysis contract as frontend/utils/markdownSyntax.ts; source is never rewritten.
use regex::Regex;
use std::sync::OnceLock;

pub fn visible_markdown(source: &str) -> String {
    static QUOTE: OnceLock<Regex> = OnceLock::new();
    static FENCE: OnceLock<Regex> = OnceLock::new();
    let quote = QUOTE.get_or_init(|| Regex::new(r"^(?: {0,3}>[ \t]?)+").unwrap());
    let fence_re = FENCE.get_or_init(|| Regex::new(r"^ {0,3}(`{3,}|~{3,})(.*)$").unwrap());
    let mut fence: Option<(u8, usize)> = None;
    let mut visible = Vec::with_capacity(source.len());
    for line in source.split_inclusive('\n') {
        let candidate = quote.replace(line.trim_end_matches(['\r', '\n']), "");
        let run = fence_re.captures(&candidate);
        let mut masked = fence.is_some();
        if let Some((marker, size)) = fence {
            if run.as_ref().is_some_and(|r| {
                r[1].as_bytes()[0] == marker && r[1].len() >= size && r[2].trim().is_empty()
            }) {
                fence = None;
            }
        } else if let Some(run) = run {
            if !(run[1].starts_with('`') && run[2].contains('`')) {
                fence = Some((run[1].as_bytes()[0], run[1].len()));
                masked = true;
            }
        }
        masked |= candidate.starts_with("    ") || candidate.starts_with('\t');
        visible.extend(line.bytes().map(|byte| {
            if masked && !matches!(byte, b'\n' | b'\r') {
                b' '
            } else {
                byte
            }
        }));
    }
    let text = visible.clone();
    let mut i = 0;
    while i < text.len() {
        let mut end = i;
        if text[i] == b'\\' && text.get(i + 1).is_some_and(|b| b.is_ascii_punctuation()) {
            end = i + 2;
        } else if text[i] == b'`' {
            let mut run_end = i + 1;
            while text.get(run_end) == Some(&b'`') {
                run_end += 1;
            }
            let size = run_end - i;
            let mut next = run_end;
            while next < text.len() {
                if text[next] != b'`' {
                    next += 1;
                    continue;
                }
                let mut close = next + 1;
                while text.get(close) == Some(&b'`') {
                    close += 1;
                }
                if close - next == size {
                    end = close;
                    break;
                }
                next = close;
            }
            if end == i {
                i = run_end;
                continue;
            }
        } else if text[i..].starts_with(b"<!--") || text[i..].starts_with(b"%%") {
            let html = text[i..].starts_with(b"<!--");
            let closing: &[u8] = if html { b"-->" } else { b"%%" };
            let start = i + if html { 4 } else { 2 };
            end = text[start..]
                .windows(closing.len())
                .position(|window| window == closing)
                .map_or(text.len(), |offset| start + offset + closing.len());
        }
        if end > i {
            for byte in &mut visible[i..end] {
                if !matches!(*byte, b'\n' | b'\r') {
                    *byte = b' ';
                }
            }
            i = end;
        } else {
            i += 1;
        }
    }
    String::from_utf8(visible).expect("Masking replaces complete UTF-8 spans with ASCII spaces")
}
