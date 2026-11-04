export type StorageType = 'local' | 'webdav' | 'gdrive';

export interface VaultInfo {
  id: string;
  name: string;
  path: string;
  storage_type: StorageType;
  last_opened: number;
}

export interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  children?: FileNode[];
  size?: number;
  modified_at?: number;
}

export interface HeadingItem {
  level: number;
  text: string;
  line: number;
}

export interface NoteMetadata {
  path: string;
  title: string;
  frontmatter?: Record<string, any>;
  tags: string[];
  outlinks: string[];
  backlinks: string[];
  headings: HeadingItem[];
  word_count: number;
  character_count: number;
}

export interface GraphNode {
  id: string;
  label: string;
  weight: number;
  group: string;
}

export interface GraphLink {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface SearchMatch {
  line: number;
  content: string;
}

export interface SearchResult {
  path: string;
  title: string;
  matches: SearchMatch[];
}
