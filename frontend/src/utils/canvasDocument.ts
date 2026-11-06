export interface CanvasNode {
  [key: string]: unknown;
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: string;
  text?: string;
  file?: string;
  color?: string;
}
export interface CanvasEdge {
  [key: string]: unknown;
  id: string;
  fromNode: string;
  toNode: string;
  fromSide?: string;
  toSide?: string;
  label?: string;
}
export interface CanvasData {
  [key: string]: unknown;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export function parseCanvas(content: string): CanvasData {
  const parsed = JSON.parse(content, (_key, value) => {
    if (typeof value === 'number' && Number.isInteger(value) && !Number.isSafeInteger(value)) throw new Error('El lienzo contiene un número fuera del rango seguro de edición.');
    return value;
  });
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || (parsed.nodes !== undefined && !Array.isArray(parsed.nodes)) || (parsed.edges !== undefined && !Array.isArray(parsed.edges))) throw new Error('El lienzo debe contener listas nodes y edges.');
  parsed.nodes ??= []; parsed.edges ??= [];
  const ids = new Set<string>();
  for (const node of parsed.nodes) {
    if (!node || typeof node.id !== 'string' || typeof node.type !== 'string' || ids.has(node.id) ||
      ![node.x, node.y, node.width, node.height].every((value) => typeof value === 'number' && Number.isFinite(value))) {
      throw new Error('El lienzo contiene una tarjeta inválida o duplicada.');
    }
    ids.add(node.id);
  }
  const edgeIds = new Set<string>();
  for (const edge of parsed.edges) {
    if (!edge || typeof edge.id !== 'string' || typeof edge.fromNode !== 'string' || typeof edge.toNode !== 'string' || edgeIds.has(edge.id)) {
      throw new Error('El lienzo contiene una conexión inválida.');
    }
    edgeIds.add(edge.id);
  }
  return parsed;
}

export function serializeCanvas(original: string, data: CanvasData): string {
  if (JSON.stringify(parseCanvas(original)) === JSON.stringify(data)) return original;
  const previous = JSON.parse(original);
  const next: Record<string, unknown> = { ...data };
  if (!Object.hasOwn(previous, 'nodes') && !data.nodes.length) delete next.nodes;
  if (!Object.hasOwn(previous, 'edges') && !data.edges.length) delete next.edges;
  const newline = original.includes('\r\n') ? '\r\n' : '\n';
  return JSON.stringify(next, null, 2).replace(/\n/g, newline) + (original.endsWith('\n') ? newline : '');
}

export function canvasColor(color?: string): string {
  const presets: Record<string, string> = { '1': '#ef4444', '2': '#f97316', '3': '#eab308', '4': '#22c55e', '5': '#06b6d4', '6': '#a855f7' };
  return color && (/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(color) ? color : presets[color]) || '#64748b';
}

export function edgeGeometry(from: CanvasNode, to: CanvasNode, edge: CanvasEdge) {
  const defaultFrom = to.x >= from.x ? 'right' : 'left';
  const defaultTo = to.x >= from.x ? 'left' : 'right';
  const anchor = (node: CanvasNode, side: string) => {
    switch (side) {
      case 'top': return { x: node.x + node.width / 2, y: node.y, dx: 0, dy: -1 };
      case 'bottom': return { x: node.x + node.width / 2, y: node.y + node.height, dx: 0, dy: 1 };
      case 'left': return { x: node.x, y: node.y + node.height / 2, dx: -1, dy: 0 };
      default: return { x: node.x + node.width, y: node.y + node.height / 2, dx: 1, dy: 0 };
    }
  };
  const start = anchor(from, edge.fromSide || defaultFrom);
  const end = anchor(to, edge.toSide || defaultTo);
  const distance = Math.max(40, Math.hypot(end.x - start.x, end.y - start.y) / 2);
  return { start, end, control1: { x: start.x + start.dx * distance, y: start.y + start.dy * distance }, control2: { x: end.x + end.dx * distance, y: end.y + end.dy * distance } };
}

export function removeCanvasNode(data: CanvasData, id: string): CanvasData {
  return { ...data, nodes: data.nodes.filter((node) => node.id !== id), edges: data.edges.filter((edge) => edge.fromNode !== id && edge.toNode !== id) };
}
export function connectCanvasNodes(data: CanvasData, from: string, to: string, options: Partial<CanvasEdge> = {}): CanvasData {
  if (!data.nodes.some((node) => node.id === from) || !data.nodes.some((node) => node.id === to)) throw new Error('Selecciona dos tarjetas existentes');
  return { ...data, edges: [...data.edges, { ...options, id: crypto.randomUUID(), fromNode: from, toNode: to }] };
}
export function canvasViewBounds(data: CanvasData, width: number, height: number) {
  if (!data.nodes.length) return { zoom: 1, pan: { x: width/2, y: height/2 } };
  const left = Math.min(...data.nodes.map((node) => node.x)), top = Math.min(...data.nodes.map((node) => node.y));
  const right = Math.max(...data.nodes.map((node) => node.x + node.width)), bottom = Math.max(...data.nodes.map((node) => node.y + node.height));
  const zoom = Math.min(2, Math.max(0.1, Math.min((width-80)/Math.max(1,right-left), (height-80)/Math.max(1,bottom-top))));
  return { zoom, pan: { x: width/2-(left+right)/2*zoom, y: height/2-(top+bottom)/2*zoom } };
}
