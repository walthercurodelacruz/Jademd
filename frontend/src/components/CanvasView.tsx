import { MarkdownPreview } from './MarkdownPreview';
import { usePaneState } from '../store/PaneContext';
import React, { useState, useEffect, useRef } from 'react';
import { useVaultStore } from '../store/useVaultStore';
import { Plus, ZoomIn, ZoomOut, RotateCcw, FileText, Move, Play, ExternalLink, Globe } from 'lucide-react';

import { CanvasData, CanvasNode, parseCanvas, serializeCanvas, canvasColor, edgeGeometry, removeCanvasNode, connectCanvasNodes, canvasViewBounds, extractYouTubeId } from '../utils/canvasDocument';

export const CanvasView: React.FC = () => {
  const { activePath, activeContent, queueNoteSave, openNote, navigateToLink, setNoteMode } = usePaneState();
  const [data, setData] = useState<CanvasData>({ nodes: [], edges: [] });
  const [pan, setPan] = useState({ x: 400, y: 300 });
  const [zoom, setZoom] = useState(1);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState(false);
  const [activeVideoIds, setActiveVideoIds] = useState<Record<string, boolean>>({});
  const [operationError, setOperationError] = useState('');
  const [arrowId] = useState(() => `canvas-arrow-${crypto.randomUUID()}`);
  const point = (event: React.MouseEvent) => { const rect = containerRef.current!.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; };
  const [parseError, setParseError] = useState<string | null>(null);
  useEffect(() => {
    try {
      // Keep extension fields intact when editing another application's Canvas.
      setData(parseCanvas(activeContent));
      setParseError(null);
    } catch (e) {
      setParseError(`No se puede editar este lienzo: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [activePath, activeContent]);

  const saveCanvas = (updated: CanvasData) => {
    setData(updated);
    if (activePath && !parseError) {
      const content = serializeCanvas(activeContent, updated);
      if (content !== activeContent) queueNoteSave(content, activePath);
    }
  };

  // Node Dragging Handlers
  const handleMouseDownNode = (e: React.MouseEvent, node: CanvasNode) => {
    e.stopPropagation();
    if ((e.target as HTMLElement).closest('button,a,input,textarea')) return;
    setSelectedId(node.id);
    setDraggingNodeId(node.id);
    setDragOffset({
      x: (point(e).x - pan.x) / zoom - node.x,
      y: (point(e).y - pan.y) / zoom - node.y,
    });
  };

  const handleMouseDownCanvas = (e: React.MouseEvent) => {
    if (e.button === 0 || e.button === 1) {
      setIsPanning(true);
      setPanStart({ x: point(e).x - pan.x, y: point(e).y - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: point(e).x - panStart.x,
        y: point(e).y - panStart.y,
      });
    } else if (draggingNodeId) {
      const mouseX = (point(e).x - pan.x) / zoom;
      const mouseY = (point(e).y - pan.y) / zoom;
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
      id: crypto.randomUUID(),
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

  const addNode = (type: 'group' | 'file' | 'link') => {
    const value = type === 'group' ? 'Grupo' : prompt(type === 'file' ? 'Ruta del archivo en la bóveda:' : 'URL del enlace (https://…):');
    if (!value?.trim()) return;
    if (type === 'link' && !/^https?:\/\//i.test(value.trim())) { setOperationError('Utiliza una URL HTTP o HTTPS'); return; }
    const node: CanvasNode = { id: crypto.randomUUID(), type, x: Math.round(-pan.x/zoom+100), y: Math.round(-pan.y/zoom+100), width: type === 'group' ? 500 : 280, height: type === 'group' ? 350 : 180, ...(type === 'group' ? { label: value } : type === 'file' ? { file: value.trim() } : { url: value.trim() }) };
    saveCanvas({ ...data, nodes: [...data.nodes, node] }); setSelectedId(node.id);
  };
  const selected = data.nodes.find((node) => node.id === selectedId);
  if (parseError) return <div role="alert" className="p-6 text-rose-300">{parseError} El archivo original se conserva.</div>;

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
      {operationError && <p role="alert" className="absolute bottom-4 left-4 z-30 bg-obsidian-bg p-2 text-rose-300 text-xs">{operationError}</p>}
      {selected && <aside aria-label="Propiedades de tarjeta" className="absolute top-16 right-3 z-30 w-64 max-h-[80%] overflow-auto bg-obsidian-card border border-obsidian-border rounded p-3 text-xs" onMouseDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
        <div className="flex justify-between mb-2"><strong>Propiedades de tarjeta</strong><button onClick={() => setSelectedId(null)}>Cerrar</button></div>
        <form key={JSON.stringify(selected)} onSubmit={(event) => {
          event.preventDefault(); const values = new FormData(event.currentTarget);
          const patch: Record<string, unknown> = {};
          for (const key of ['x', 'y', 'width', 'height']) patch[key] = Number(values.get(key));
          for (const key of ['color', 'label', 'file', 'url', 'background']) if (values.has(key)) patch[key] = String(values.get(key));
          if (![patch.x, patch.y, patch.width, patch.height].every((value) => typeof value === 'number' && Number.isFinite(value)) || Number(patch.width) < 40 || Number(patch.height) < 40) { setOperationError('Dimensiones mínimas: 40 × 40'); return; }
          if (patch.url && !/^https?:\/\//i.test(String(patch.url))) { setOperationError('Utiliza una URL HTTP o HTTPS'); return; }
          saveCanvas({ ...data, nodes: data.nodes.map((node) => node.id === selected.id ? { ...node, ...patch } : node) }); setOperationError('');
        }}>
          {['x', 'y', 'width', 'height'].map((key) => <label key={key} className="block mb-2">{key}<input aria-label={`Tarjeta ${key}`} name={key} type="number" required defaultValue={Number(selected[key])} className="w-full bg-obsidian-bg p-1" /></label>)}
          {['color', ...(selected.type === 'group' ? ['label', 'background'] : selected.type === 'file' ? ['file'] : selected.type === 'link' ? ['url'] : [])].map((key) => <label key={key} className="block mb-2">{key}<input aria-label={`Tarjeta ${key}`} name={key} defaultValue={String(selected[key] || '')} className="w-full bg-obsidian-bg p-1" /></label>)}
          <button className="text-jade-300 underline">Aplicar propiedades</button>
        </form>
        <div className="flex gap-3 my-3"><button className="underline" onClick={() => { const copy = { ...selected, id: crypto.randomUUID(), x: selected.x+30, y: selected.y+30 }; saveCanvas({ ...data, nodes: [...data.nodes, copy] }); setSelectedId(copy.id); }}>Duplicar</button><button className="text-rose-300 underline" onClick={() => { if (confirm('¿Eliminar la tarjeta y sus conexiones?')) { saveCanvas(removeCanvasNode(data, selected.id)); setSelectedId(null); } }}>Eliminar</button></div>
        <form className="border-t border-obsidian-border pt-2 space-y-2" onSubmit={(event) => {
          event.preventDefault(); const values = new FormData(event.currentTarget);
          try { saveCanvas(connectCanvasNodes(data, selected.id, String(values.get('to')), { label: String(values.get('label')), fromSide: String(values.get('fromSide')), toSide: String(values.get('toSide')), toEnd: 'arrow' })); setOperationError(''); } catch (error) { setOperationError(String(error)); }
        }}>
          <strong>Crear conexión</strong><select name="to" aria-label="Conectar con" className="w-full bg-obsidian-bg p-1">{data.nodes.filter((node) => node.id !== selected.id).map((node) => <option key={node.id} value={node.id}>{String(node.label || node.file || node.text || node.id).slice(0, 50)}</option>)}</select>
          <input name="label" aria-label="Etiqueta de conexión" placeholder="Etiqueta" className="w-full bg-obsidian-bg p-1" />
          {['fromSide', 'toSide'].map((key) => <label key={key} className="block">{key}<select name={key} className="w-full bg-obsidian-bg p-1" defaultValue={key === 'fromSide' ? 'right' : 'left'}>{['top', 'right', 'bottom', 'left'].map((side) => <option key={side}>{side}</option>)}</select></label>)}
          <button className="text-jade-300 underline" disabled={data.nodes.length < 2}>Crear conexión</button>
        </form>
        {data.edges.filter((edge) => edge.fromNode === selected.id || edge.toNode === selected.id).map((edge) => <div key={edge.id} className="mt-2 border-t border-obsidian-border pt-2"><span>{String(edge.label || 'Conexión')}</span><button className="ml-2 underline" onClick={() => { const label = prompt('Etiqueta de conexión:', edge.label || ''); if (label !== null) saveCanvas({ ...data, edges: data.edges.map((item) => item.id === edge.id ? { ...item, label } : item) }); }}>Editar</button><button className="ml-2 text-rose-300" onClick={() => saveCanvas({ ...data, edges: data.edges.filter((item) => item.id !== edge.id) })}>Quitar</button></div>)}
      </aside>}
      {/* Floating Toolbar */}
      <div onMouseDown={(event) => event.stopPropagation()} className="absolute top-4 left-4 max-w-[95%] overflow-x-auto z-20 flex items-center gap-1 bg-obsidian-card/90 border border-obsidian-border rounded-lg p-1 shadow-lg backdrop-blur-sm">
        <button
          onClick={addCard}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-white bg-jade-600 hover:bg-jade-500 transition shadow-sm"
          title="Agregar tarjeta"
        >
          <Plus size={14} />
          <span>Agregar Tarjeta</span>
        </button>
        <button className="px-2 text-xs" onClick={() => addNode('group')}>Grupo</button>
        <button className="px-2 text-xs" onClick={() => addNode('file')}>Archivo</button>
        <button className="px-2 text-xs" onClick={() => addNode('link')}>Enlace</button>
        <button className="px-2 text-xs" onClick={() => setPreviewText(!previewText)}>{previewText ? 'Editar texto' : 'Vista previa'}</button>
        <button className="px-2 text-xs" onClick={() => { const rect = containerRef.current!.getBoundingClientRect(); const view = canvasViewBounds(data, rect.width, rect.height); setZoom(view.zoom); setPan(view.pan); }}>Ajustar vista</button>
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
            id={arrowId}
            viewBox="0 0 10 10"
            refX="6"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
          </marker>
        </defs>
        {data.edges.map((edge) => {
          const from = data.nodes.find((n) => n.id === edge.fromNode);
          const to = data.nodes.find((n) => n.id === edge.toNode);
          if (!from || !to) return null;

          const geometry = edgeGeometry(from, to, edge);
          const sx = geometry.start.x * zoom + pan.x, sy = geometry.start.y * zoom + pan.y;
          const tx = geometry.end.x * zoom + pan.x, ty = geometry.end.y * zoom + pan.y;
          const cp1x = geometry.control1.x * zoom + pan.x, cp1y = geometry.control1.y * zoom + pan.y;
          const cp2x = geometry.control2.x * zoom + pan.x, cp2y = geometry.control2.y * zoom + pan.y;

          return (
            <g key={edge.id}>
              <path
                d={`M ${sx} ${sy} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${tx} ${ty}`}
                fill="none"
                stroke={canvasColor(typeof edge.color === 'string' ? edge.color : undefined)}
                strokeWidth={2 * zoom}
                strokeOpacity={0.7}
                markerStart={edge.fromEnd === 'arrow' ? `url(#${arrowId})` : undefined}
                markerEnd={edge.toEnd === 'none' ? undefined : `url(#${arrowId})`}
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
        {[...data.nodes].sort((a, b) => Number(b.type === 'group') - Number(a.type === 'group')).map((node) => (
          <div
            key={node.id}
            onClick={() => setSelectedId(node.id)}
            onFocusCapture={() => setSelectedId(node.id)}
            onMouseDown={(e) => handleMouseDownNode(e, node)}
            style={{
              position: 'absolute',
              left: `${node.x}px`,
              top: `${node.y}px`,
              width: `${node.width}px`,
              height: `${node.height}px`,
              borderColor: canvasColor(node.color),
              ...(node.type === 'group' ? { backgroundColor: 'rgba(24,24,27,0.35)', borderStyle: 'dashed' } : {}),
            }}
            className="pointer-events-auto bg-[#18181b]/95 border-2 rounded-xl shadow-xl backdrop-blur-sm flex flex-col overflow-hidden transition-shadow hover:shadow-2xl group cursor-move"
          >
            {/* Node Header */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-[#202024] border-b border-obsidian-border/50 text-[11px] text-obsidian-muted">
              <div className="flex items-center gap-1.5 truncate">
                {node.type === 'file' ? (
                  <FileText size={13} className="text-jade-400 shrink-0" />
                ) : node.type === 'link' ? (
                  <Globe size={13} className="text-jade-400 shrink-0" />
                ) : (
                  <Move size={12} className="text-obsidian-muted shrink-0" />
                )}
                <span className="truncate font-medium">
                  {node.type === 'file' ? node.file : node.type === 'group' ? String(node.label || 'Grupo') : node.type === 'link' ? String(node.url || 'Enlace') : 'Nota'}
                </span>
              </div>
              {node.type === 'file' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (node.file && activePath) void navigateToLink(`${node.file}${node.subpath || ''}`, activePath);
                  }}
                  className="px-1.5 py-0.5 rounded bg-jade-600/30 text-jade-300 hover:bg-jade-600/50 text-[10px]"
                >
                  Abrir
                </button>
              )}
              {node.type === 'link' && activeVideoIds[node.id] && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveVideoIds((prev) => ({ ...prev, [node.id]: false }));
                  }}
                  className="px-1.5 py-0.5 rounded bg-obsidian-card text-obsidian-muted hover:text-white text-[10px] shrink-0"
                >
                  Miniatura
                </button>
              )}
            </div>

            {/* Node Content */}
            <div className={`${node.type === 'link' ? 'p-0' : 'p-3'} text-xs text-obsidian-text flex-1 flex flex-col min-h-0 overflow-hidden`}>
              {node.type === 'text' && previewText ? (<div className="h-full overflow-auto" onMouseDown={(event) => event.stopPropagation()}><MarkdownPreview content={node.text || ''} path={activePath || ''} /></div>) : node.type === 'text' ? (
                <textarea
                  value={node.text || ''}
                  onChange={(e) => updateNodeText(node.id, e.target.value)}
                  onMouseDown={(e) => e.stopPropagation()}
                  placeholder="Escribe Markdown aquí..."
                  className="w-full h-full min-h-[80px] bg-transparent outline-none resize-none text-obsidian-text text-xs leading-relaxed font-sans"
                />
              ) : node.type === 'group' ? (
                typeof node.background === 'string' && <div className="w-full h-full opacity-40" style={{
                  backgroundImage: `url("/api/asset?path=${encodeURIComponent(node.background)}&source=${encodeURIComponent(activePath || '')}")`,
                  backgroundSize: node.backgroundStyle === 'ratio' ? 'contain' : node.backgroundStyle === 'repeat' ? 'auto' : 'cover',
                  backgroundRepeat: node.backgroundStyle === 'repeat' ? 'repeat' : 'no-repeat', backgroundPosition: 'center',
                }} />
              ) : node.type === 'link' ? (() => {
                const rawUrl = typeof node.url === 'string' && /^https?:\/\//i.test(node.url) ? node.url : '';
                const ytId = extractYouTubeId(rawUrl);
                if (ytId) {
                  const isPlaying = Boolean(activeVideoIds[node.id]);
                  return (
                    <div className="relative w-full h-full flex flex-col bg-black overflow-hidden">
                      {isPlaying ? (
                        <iframe
                          title={`YouTube ${ytId}`}
                          src={`https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&rel=0`}
                          className="w-full flex-1 border-0"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          referrerPolicy="strict-origin-when-cross-origin"
                          allowFullScreen
                        />
                      ) : (
                        <div className="relative w-full flex-1 min-h-0 group/yt overflow-hidden bg-zinc-950 flex items-center justify-center">
                          <img
                            draggable={false}
                            src={`https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`}
                            alt={`Vista previa de YouTube (${ytId})`}
                            className="w-full h-full object-cover opacity-90 group-hover/yt:scale-[1.02] group-hover/yt:opacity-100 transition duration-200"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />
                          <button
                            type="button"
                            aria-label="Reproducir video de YouTube"
                            title="Reproducir video en el lienzo"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveVideoIds((prev) => ({ ...prev, [node.id]: true }));
                            }}
                            className="absolute z-10 w-14 h-10 rounded-xl bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-xl shadow-black/60 transition transform group-hover/yt:scale-110 cursor-pointer"
                          >
                            <Play size={20} className="fill-white ml-0.5" />
                          </button>
                          <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/75 border border-white/10 text-[10px] font-semibold text-red-400 tracking-wide">
                            YouTube
                          </div>
                        </div>
                      )}
                      <div className="px-3 py-1.5 bg-[#18181b] border-t border-obsidian-border/50 flex items-center justify-between gap-2 shrink-0">
                        <a
                          href={rawUrl || undefined}
                          onMouseDown={(event) => event.stopPropagation()}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-jade-300 hover:text-jade-200 underline truncate text-[11px] flex items-center gap-1"
                        >
                          <span className="truncate">{rawUrl}</span>
                          <ExternalLink size={11} className="shrink-0" />
                        </a>
                      </div>
                    </div>
                  );
                }
                return (
                  <div className="p-3 h-full flex flex-col justify-between">
                    <a
                      href={rawUrl || undefined}
                      onMouseDown={(event) => event.stopPropagation()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-jade-300 hover:text-jade-200 underline break-all flex items-start gap-1.5"
                    >
                      <span>{String(node.url || '')}</span>
                      <ExternalLink size={12} className="shrink-0 mt-0.5" />
                    </a>
                  </div>
                );
              })() : node.type === 'file' && /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(node.file || '') ? (<img draggable={false} alt={node.file} className="w-full h-full object-contain" src={`/api/asset?path=${encodeURIComponent(node.file!)}&source=${encodeURIComponent(activePath || '')}`} />) : (
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
