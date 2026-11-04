import React, { useState, useEffect, useRef } from 'react';
import { useVaultStore } from '../store/useVaultStore';
import { Plus, ZoomIn, ZoomOut, RotateCcw, FileText, Move } from 'lucide-react';

interface CanvasNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'text' | 'file' | 'group' | 'link';
  text?: string;
  file?: string;
  color?: string;
}

interface CanvasEdge {
  id: string;
  fromNode: string;
  fromSide?: 'top' | 'right' | 'bottom' | 'left';
  toNode: string;
  toSide?: 'top' | 'right' | 'bottom' | 'left';
  label?: string;
}

interface CanvasData {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export const CanvasView: React.FC = () => {
  const { activePath, activeContent, saveCurrentNote, openNote } = useVaultStore();
  const [data, setData] = useState<CanvasData>({ nodes: [], edges: [] });
  const [pan, setPan] = useState({ x: 400, y: 300 });
  const [zoom, setZoom] = useState(1);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);

  // Parse initial canvas content
  useEffect(() => {
    try {
      if (activeContent.trim()) {
        const parsed = JSON.parse(activeContent);
        setData({
          nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
          edges: Array.isArray(parsed.edges) ? parsed.edges : [],
        });
      } else {
        // Default template
        const initial: CanvasData = {
          nodes: [
            {
              id: 'node-welcome',
              x: 100,
              y: 100,
              width: 260,
              height: 140,
              type: 'text',
              text: '### Lienzo Infinito Jademd\nPuedes agregar ideas, notas conectadas y organizar visualmente tu conocimiento.',
              color: '#10b981',
            },
            {
              id: 'node-note',
              x: 450,
              y: 100,
              width: 260,
              height: 120,
              type: 'file',
              file: 'Bienvenida.md',
              color: '#3b82f6',
            },
          ],
          edges: [
            {
              id: 'edge-1',
              fromNode: 'node-welcome',
              fromSide: 'right',
              toNode: 'node-note',
              toSide: 'left',
              label: 'explora',
            },
          ],
        };
        setData(initial);
        saveCurrentNote(JSON.stringify(initial, null, 2));
      }
    } catch (e) {
      console.warn('No se pudo parsear el archivo .canvas como JSON', e);
    }
  }, [activePath]);

  const saveCanvas = (updated: CanvasData) => {
    setData(updated);
    saveCurrentNote(JSON.stringify(updated, null, 2));
  };

  // Node Dragging Handlers
  const handleMouseDownNode = (e: React.MouseEvent, node: CanvasNode) => {
    e.stopPropagation();
    setDraggingNodeId(node.id);
    setDragOffset({
      x: (e.clientX - pan.x) / zoom - node.x,
      y: (e.clientY - pan.y) / zoom - node.y,
    });
  };

  const handleMouseDownCanvas = (e: React.MouseEvent) => {
    if (e.button === 0 || e.button === 1) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    } else if (draggingNodeId) {
      const mouseX = (e.clientX - pan.x) / zoom;
      const mouseY = (e.clientY - pan.y) / zoom;
      const newNodes = data.nodes.map((n) => {
        if (n.id === draggingNodeId) {
          return {
            ...n,
            x: Math.round(mouseX - dragOffset.x),
            y: Math.round(mouseY - dragOffset.y),
          };
        }
        return n;
      });
      setData((prev) => ({ ...prev, nodes: newNodes }));
    }
  };

  const handleMouseUp = () => {
    if (draggingNodeId) {
      saveCanvas(data);
      setDraggingNodeId(null);
    }
    if (isPanning) {
      setIsPanning(false);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.min(Math.max(zoom * factor, 0.2), 3);
    setZoom(newZoom);
  };

  const addCard = () => {
    const newNode: CanvasNode = {
      id: `node-${Date.now()}`,
      x: Math.round((-pan.x + 300) / zoom),
      y: Math.round((-pan.y + 200) / zoom),
      width: 250,
      height: 140,
      type: 'text',
      text: 'Nueva tarjeta\nEscribe aquí tus ideas...',
      color: '#10b981',
    };
    saveCanvas({
      ...data,
      nodes: [...data.nodes, newNode],
    });
  };

  const updateNodeText = (id: string, text: string) => {
    const updated = {
      ...data,
      nodes: data.nodes.map((n) => (n.id === id ? { ...n, text } : n)),
    };
    saveCanvas(updated);
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDownCanvas}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      className="relative w-full h-full bg-[#141416] overflow-hidden select-none cursor-grab active:cursor-grabbing"
      style={{
        backgroundImage: `radial-gradient(circle, #27272a 1px, transparent 1px)`,
        backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
        backgroundPosition: `${pan.x}px ${pan.y}px`,
      }}
    >
      {/* Floating Toolbar */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-1 bg-obsidian-card/90 border border-obsidian-border rounded-lg p-1 shadow-lg backdrop-blur-sm">
        <button
          onClick={addCard}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-white bg-jade-600 hover:bg-jade-500 transition shadow-sm"
          title="Agregar tarjeta"
        >
          <Plus size={14} />
          <span>Agregar Tarjeta</span>
        </button>
        <div className="w-[1px] h-5 bg-obsidian-border mx-1" />
        <button
          onClick={() => setZoom((z) => Math.min(z * 1.15, 3))}
          className="p-1.5 text-obsidian-muted hover:text-white rounded hover:bg-obsidian-hover"
          title="Acercar"
        >
          <ZoomIn size={16} />
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(z * 0.85, 0.2))}
          className="p-1.5 text-obsidian-muted hover:text-white rounded hover:bg-obsidian-hover"
          title="Alejar"
        >
          <ZoomOut size={16} />
        </button>
        <button
          onClick={() => {
            setZoom(1);
            setPan({ x: 300, y: 200 });
          }}
          className="p-1.5 text-obsidian-muted hover:text-white rounded hover:bg-obsidian-hover"
          title="Restablecer vista"
        >
          <RotateCcw size={16} />
        </button>
        <span className="text-[11px] text-obsidian-muted px-2 font-mono">
          {Math.round(zoom * 100)}%
        </span>
      </div>

      {/* SVG Connecting Edges */}
      <svg
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          width: '100%',
          height: '100%',
        }}
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="6"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#10b981" />
          </marker>
        </defs>
        {data.edges.map((edge) => {
          const from = data.nodes.find((n) => n.id === edge.fromNode);
          const to = data.nodes.find((n) => n.id === edge.toNode);
          if (!from || !to) return null;

          // Compute centers transformed to screen coords
          const sx = (from.x + from.width) * zoom + pan.x;
          const sy = (from.y + from.height / 2) * zoom + pan.y;
          const tx = to.x * zoom + pan.x;
          const ty = (to.y + to.height / 2) * zoom + pan.y;

          const dx = tx - sx;
          const cp1x = sx + dx * 0.5;
          const cp1y = sy;
          const cp2x = tx - dx * 0.5;
          const cp2y = ty;

          return (
            <g key={edge.id}>
              <path
                d={`M ${sx} ${sy} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${tx} ${ty}`}
                fill="none"
                stroke="#10b981"
                strokeWidth={2 * zoom}
                strokeOpacity={0.7}
                markerEnd="url(#arrow)"
              />
              {edge.label && (
                <text
                  x={(sx + tx) / 2}
                  y={(sy + ty) / 2 - 8}
                  fill="#94a3b8"
                  fontSize={11 * zoom}
                  textAnchor="middle"
                  className="select-none font-mono"
                >
                  {edge.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Nodes Container */}
      <div
        className="absolute inset-0 pointer-events-none z-10"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
      >
        {data.nodes.map((node) => (
          <div
            key={node.id}
            onMouseDown={(e) => handleMouseDownNode(e, node)}
            style={{
              position: 'absolute',
              left: `${node.x}px`,
              top: `${node.y}px`,
              width: `${node.width}px`,
              minHeight: `${node.height}px`,
              borderColor: node.color || '#27272a',
            }}
            className="pointer-events-auto bg-[#18181b]/95 border-2 rounded-xl shadow-xl backdrop-blur-sm flex flex-col overflow-hidden transition-shadow hover:shadow-2xl group cursor-move"
          >
            {/* Node Header */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-[#202024] border-b border-obsidian-border/50 text-[11px] text-obsidian-muted">
              <div className="flex items-center gap-1.5 truncate">
                {node.type === 'file' ? (
                  <FileText size={13} className="text-jade-400 shrink-0" />
                ) : (
                  <Move size={12} className="text-obsidian-muted shrink-0" />
                )}
                <span className="truncate font-medium">
                  {node.type === 'file' ? node.file : 'Nota'}
                </span>
              </div>
              {node.type === 'file' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (node.file) openNote(node.file);
                  }}
                  className="px-1.5 py-0.5 rounded bg-jade-600/30 text-jade-300 hover:bg-jade-600/50 text-[10px]"
                >
                  Abrir
                </button>
              )}
            </div>

            {/* Node Content */}
            <div className="p-3 text-xs text-obsidian-text flex-1">
              {node.type === 'text' ? (
                <textarea
                  value={node.text || ''}
                  onChange={(e) => updateNodeText(node.id, e.target.value)}
                  onMouseDown={(e) => e.stopPropagation()}
                  placeholder="Escribe Markdown aquí..."
                  className="w-full h-full min-h-[80px] bg-transparent outline-none resize-none text-obsidian-text text-xs leading-relaxed font-sans"
                />
              ) : (
                <div className="text-obsidian-muted flex flex-col justify-center items-center h-full py-4 text-center">
                  <FileText size={24} className="mb-2 text-jade-400" />
                  <span className="font-semibold text-white">{node.file}</span>
                  <span className="text-[10px] mt-1">Archivo de bóveda vinculado</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
