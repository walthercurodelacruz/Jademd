import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useVaultStore } from '../store/useVaultStore';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RefreshCw,
  Search,
  Eye,
  EyeOff,
  Sliders,
  X,
  Link2,
  Sparkles,
  ExternalLink,
} from 'lucide-react';

interface SimNode {
  id: string;
  label: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  degree: number;
  group: string;
}

interface SimLink {
  source: SimNode;
  target: SimNode;
}

export const GraphView: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { vault, graphData, graphLoading, graphError, loadGraph, openNote, setViewMode } = useVaultStore();

  // Graph Filters and Controls
  const [hideOrphans, setHideOrphans] = useState(false);
  const [hideUnresolved, setHideUnresolved] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [labelMode, setLabelMode] = useState<'hubs' | 'hover' | 'always'>('hubs');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [repulsionStrength, setRepulsionStrength] = useState(350);
  const [linkDistance, setLinkDistance] = useState(90);

  // Interaction State
  const [hoveredNode, setHoveredNode] = useState<SimNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<SimNode | null>(null);

  // Transform and Physics Refs
  const transformRef = useRef({ x: 0, y: 0, scale: 0.85 });
  const isDraggingCanvas = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const draggedNode = useRef<SimNode | null>(null);

  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);
  const redrawRef = useRef(true);
  const simulationAlpha = useRef(1.0);
  const renderRef = useRef<() => void>(() => {});

  // Filter raw graph data according to user settings
  const filteredData = useMemo(() => {
    if (!graphData) return { nodes: [], links: [], degreeMap: new Map<string, number>() };

    // Calculate node degree (in + out links)
    const degreeMap = new Map<string, number>();
    graphData.links.forEach((l) => {
      degreeMap.set(l.source, (degreeMap.get(l.source) || 0) + 1);
      degreeMap.set(l.target, (degreeMap.get(l.target) || 0) + 1);
    });

    let nodes = graphData.nodes.filter((n) => {
      const degree = degreeMap.get(n.id) || 0;
      if (hideOrphans && degree === 0) return false;
      if (hideUnresolved && n.group === 'unresolved') return false;
      return true;
    });

    const visibleNodeIds = new Set(nodes.map((n) => n.id));
    const links = graphData.links.filter(
      (l) => visibleNodeIds.has(l.source) && visibleNodeIds.has(l.target)
    );

    return { nodes, links, degreeMap };
  }, [graphData, hideOrphans, hideUnresolved]);

  // Center and scale view to fit all nodes
  const fitToScreen = useCallback(() => {
    const canvas = canvasRef.current;
    const nodes = nodesRef.current;
    if (!canvas || nodes.length === 0) return;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    nodes.forEach((n) => {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    });

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    const boundsW = Math.max(200, maxX - minX + 160);
    const boundsH = Math.max(200, maxY - minY + 160);

    const scale = Math.min(1.5, w / boundsW, h / boundsH);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    transformRef.current = {
      x: w / 2 - centerX * scale,
      y: h / 2 - centerY * scale,
      scale,
    };
    redrawRef.current = true;
  }, []);

  // Initialize or re-layout nodes using sunflower phyllotaxis spiral to avoid clumping
  const initSimulation = useCallback(() => {
    if (!canvasRef.current) return;
    redrawRef.current = true;
    draggedNode.current = null;
    setHoveredNode(null);
    setSelectedNode(null);
    if (filteredData.nodes.length === 0) {
      nodesRef.current = [];
      linksRef.current = [];
      simulationAlpha.current = 0;
      return;
    }

    const width = canvasRef.current.clientWidth || 900;
    const height = canvasRef.current.clientHeight || 700;
    const centerX = width / 2;
    const centerY = height / 2;

    const nodeCount = filteredData.nodes.length;
    const simNodes: SimNode[] = filteredData.nodes.map((n, idx) => {
      const degree = filteredData.degreeMap.get(n.id) || 0;
      // Sunflower phyllotaxis arrangement
      const phi = 137.5 * (Math.PI / 180);
      const r = Math.sqrt(idx + 1) * (nodeCount > 500 ? 24 : 32);
      const theta = idx * phi;

      const baseRadius = Math.max(3.5, Math.min(15, 3 + Math.sqrt(degree) * 2.8));

      return {
        id: n.id,
        label: n.label,
        x: centerX + Math.cos(theta) * r,
        y: centerY + Math.sin(theta) * r,
        vx: 0,
        vy: 0,
        radius: baseRadius,
        degree,
        group: n.group,
      };
    });

    const nodeMap = new Map<string, SimNode>();
    simNodes.forEach((n) => nodeMap.set(n.id, n));

    const simLinks: SimLink[] = [];
    filteredData.links.forEach((l) => {
      const src = nodeMap.get(l.source);
      const tgt = nodeMap.get(l.target);
      if (src && tgt) {
        simLinks.push({ source: src, target: tgt });
      }
    });

    nodesRef.current = simNodes;
    linksRef.current = simLinks;
    simulationAlpha.current = 1.0;

    // Auto-fit to view
    fitToScreen();
  }, [filteredData, fitToScreen]);

  useEffect(() => {
    initSimulation();
  }, [initSimulation]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(fitToScreen);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [fitToScreen]);

  // Main Simulation & Render Loop
  useEffect(() => {
    let animId: number;

    const simulate = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const nodes = nodesRef.current;
      const links = linksRef.current;
      const alpha = simulationAlpha.current;

      if (alpha > 0.01) {
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        const centerX = width / 2;
        const centerY = height / 2;

        // 1. Center Gravity
        for (let i = 0; i < nodes.length; i++) {
          const a = nodes[i];
          if (a === draggedNode.current) continue;
          a.vx += (centerX - a.x) * 0.0006 * alpha;
          a.vy += (centerY - a.y) * 0.0006 * alpha;
        }

        // 2. Node Repulsion
        const repulsion = repulsionStrength * alpha;
        for (let i = 0; i < nodes.length; i++) {
          const a = nodes[i];
          for (let j = i + 1; j < nodes.length; j++) {
            const b = nodes[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const distSq = dx * dx + dy * dy + 1;
            if (distSq < 400 * 400) {
              const dist = Math.sqrt(distSq);
              const force = repulsion / distSq;
              const fx = (dx / dist) * force;
              const fy = (dy / dist) * force;

              if (a !== draggedNode.current) {
                a.vx -= fx;
                a.vy -= fy;
              }
              if (b !== draggedNode.current) {
                b.vx += fx;
                b.vy += fy;
              }
            }
          }
        }

        // 3. Link Spring Attraction
        for (let i = 0; i < links.length; i++) {
          const link = links[i];
          const dx = link.target.x - link.source.x;
          const dy = link.target.y - link.source.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = (dist - linkDistance) * 0.04 * alpha;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          // Bound the total spring strength on highly connected notes.
          if (link.source !== draggedNode.current) {
            const weight = Math.max(1, link.source.degree / 8);
            link.source.vx += fx / weight;
            link.source.vy += fy / weight;
          }
          if (link.target !== draggedNode.current) {
            const weight = Math.max(1, link.target.degree / 8);
            link.target.vx -= fx / weight;
            link.target.vy -= fy / weight;
          }
        }

        // 4. Velocity damping & position updates
        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i];
          if (node === draggedNode.current) continue;
          node.x += node.vx;
          node.y += node.vy;
          node.vx *= 0.82;
          node.vy *= 0.82;
        }

        // Cool down
        simulationAlpha.current *= 0.992;
      }

      // Draw canvas
      if (alpha > 0.01 || redrawRef.current) {
        renderRef.current();
        redrawRef.current = false;
      }
      animId = requestAnimationFrame(simulate);
    };

    animId = requestAnimationFrame(simulate);
    return () => cancelAnimationFrame(animId);
  }, [repulsionStrength, linkDistance]);

  // Canvas Drawing
  const renderCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;

    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Apply pan & zoom
    const { x, y, scale } = transformRef.current;
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    const nodes = nodesRef.current;
    const links = linksRef.current;

    // Search query lowercase
    const q = searchQuery.trim().toLowerCase();

    // Set of connected nodes if a node is hovered or selected
    const activeFocusNode = hoveredNode || selectedNode;
    const connectedSet = new Set<string>();
    if (activeFocusNode) {
      connectedSet.add(activeFocusNode.id);
      links.forEach((l) => {
        if (l.source.id === activeFocusNode.id) connectedSet.add(l.target.id);
        if (l.target.id === activeFocusNode.id) connectedSet.add(l.source.id);
      });
    }

    // 1. Draw Links / Edges
    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      const isConnected =
        activeFocusNode &&
        (link.source.id === activeFocusNode.id || link.target.id === activeFocusNode.id);

      ctx.beginPath();
      ctx.moveTo(link.source.x, link.source.y);
      ctx.lineTo(link.target.x, link.target.y);

      if (activeFocusNode) {
        if (isConnected) {
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 2.2 / scale;
          ctx.stroke();
        } else {
          ctx.strokeStyle = 'rgba(113, 113, 122, 0.04)';
          ctx.lineWidth = 0.8 / scale;
          ctx.stroke();
        }
      } else {
        ctx.strokeStyle = 'rgba(161, 161, 170, 0.14)';
        ctx.lineWidth = 1 / scale;
        ctx.stroke();
      }
    }

    // 2. Draw Nodes
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const isHovered = hoveredNode?.id === node.id;
      const isSelected = selectedNode?.id === node.id;
      const isConnected = connectedSet.has(node.id);
      const isMatch = q && node.label.toLowerCase().includes(q);

      ctx.beginPath();
      const nodeRadius = node.radius * (isHovered || isSelected ? 1.35 : 1);
      ctx.arc(node.x, node.y, nodeRadius, 0, Math.PI * 2);

      // Node Colors & Alpha
      if (activeFocusNode) {
        if (isHovered || isSelected) {
          ctx.fillStyle = '#34d399';
        } else if (isConnected) {
          ctx.fillStyle = '#10b981';
        } else {
          ctx.fillStyle = 'rgba(113, 113, 122, 0.15)';
        }
      } else if (q) {
        if (isMatch) {
          ctx.fillStyle = '#4ade80';
        } else {
          ctx.fillStyle = 'rgba(113, 113, 122, 0.15)';
        }
      } else {
        if (node.group === 'unresolved') {
          ctx.fillStyle = '#71717a';
        } else if (node.degree >= 5) {
          ctx.fillStyle = '#34d399'; // Major hub
        } else {
          ctx.fillStyle = '#10b981';
        }
      }
      ctx.fill();

      // Outer glow / border ring for hovered or match
      if (isHovered || isSelected || isMatch) {
        ctx.lineWidth = (isHovered ? 3 : 2) / scale;
        ctx.strokeStyle = '#22c55e';
        ctx.stroke();
      }

      // 3. Intelligent Label Rendering (NEVER show all 800 labels at once!)
      let shouldShowLabel = false;

      if (isHovered || isSelected) {
        shouldShowLabel = true;
      } else if (activeFocusNode && isConnected) {
        shouldShowLabel = true;
      } else if (isMatch) {
        shouldShowLabel = true;
      } else if (labelMode === 'always' && scale >= 0.7) {
        shouldShowLabel = true;
      } else if (labelMode === 'hubs' && node.degree >= 4 && scale >= 0.6) {
        shouldShowLabel = true;
      } else if (scale >= 1.4) {
        shouldShowLabel = true;
      }

      if (shouldShowLabel) {
        const isHighlight = isHovered || isSelected || isMatch;
        const fontSize = Math.max(10, Math.min(14, 11 / Math.sqrt(scale)));
        ctx.font = `${isHighlight ? 'bold ' : ''}${fontSize}px system-ui, sans-serif`;

        const labelText = node.label;
        const textX = node.x + nodeRadius + 5;
        const textY = node.y + fontSize * 0.35;

        // Draw pill backdrop for crisp readability
        const textMetrics = ctx.measureText(labelText);
        const padding = 3;
        ctx.fillStyle = isHighlight
          ? 'rgba(18, 18, 20, 0.92)'
          : 'rgba(24, 24, 27, 0.75)';
        ctx.fillRect(
          textX - padding,
          textY - fontSize + padding,
          textMetrics.width + padding * 2,
          fontSize + padding
        );

        ctx.fillStyle = isHighlight ? '#ffffff' : '#d4d4d8';
        ctx.fillText(labelText, textX, textY);
      }
    }

    ctx.restore();
  };
  useEffect(() => {
    renderRef.current = renderCanvas;
    redrawRef.current = true;
  });

  // Coordinates Mapping
  const getCanvasCoords = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    const { x, y, scale } = transformRef.current;
    return {
      x: (clientX - x) / scale,
      y: (clientY - y) / scale,
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const coords = getCanvasCoords(e);
    const clicked = nodesRef.current.find((n) => {
      const dx = n.x - coords.x;
      const dy = n.y - coords.y;
      return Math.sqrt(dx * dx + dy * dy) <= n.radius + 6;
    });

    if (clicked) {
      draggedNode.current = clicked;
      setSelectedNode(clicked);
      simulationAlpha.current = 0.4; // Wake up physics
    } else {
      isDraggingCanvas.current = true;
      dragStart.current = {
        x: e.clientX - transformRef.current.x,
        y: e.clientY - transformRef.current.y,
      };
      setSelectedNode(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const coords = getCanvasCoords(e);

    if (draggedNode.current) {
      draggedNode.current.x = coords.x;
      draggedNode.current.y = coords.y;
      simulationAlpha.current = 0.3;
      return;
    }

    if (isDraggingCanvas.current) {
      transformRef.current.x = e.clientX - dragStart.current.x;
      transformRef.current.y = e.clientY - dragStart.current.y;
      redrawRef.current = true;
      return;
    }

    // Hover detection with generous radius
    const hovered = nodesRef.current.find((n) => {
      const dx = n.x - coords.x;
      const dy = n.y - coords.y;
      return Math.sqrt(dx * dx + dy * dy) <= n.radius + 6;
    });

    setHoveredNode(hovered || null);
  };

  const handleMouseUp = () => {
    draggedNode.current = null;
    isDraggingCanvas.current = false;
  };

  const handleClick = (e: React.MouseEvent) => {
    const coords = getCanvasCoords(e);
    const clicked = nodesRef.current.find((n) => {
      const dx = n.x - coords.x;
      const dy = n.y - coords.y;
      return Math.sqrt(dx * dx + dy * dy) <= n.radius + 6;
    });

    if (clicked && !clicked.id.startsWith('unresolved:')) {
      setViewMode('editor');
      void openNote(clicked.id);
    }
  };

  const zoom = useCallback((factor: number, x?: number, y?: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const old = transformRef.current;
    const scale = Math.min(4, Math.max(Math.min(0.02, old.scale), old.scale * factor));
    const anchorX = x ?? canvas.clientWidth / 2;
    const anchorY = y ?? canvas.clientHeight / 2;
    transformRef.current = {
      x: anchorX - (anchorX - old.x) * (scale / old.scale),
      y: anchorY - (anchorY - old.y) * (scale / old.scale),
      scale,
    };
    redrawRef.current = true;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      zoom(event.deltaY < 0 ? 1.15 : 0.85, event.clientX - rect.left, event.clientY - rect.top);
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [zoom]);

  return (
    <div className="h-full w-full relative bg-[#121214] overflow-hidden flex flex-col select-none">
      {/* Search & Top Action Bar (HUD) */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
        {/* Search Input */}
        <div className="relative flex items-center">
          <Search size={14} className="absolute left-3 text-obsidian-muted pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filtrar notas en el grafo..."
            className="pl-8 pr-7 py-1.5 w-64 bg-obsidian-card/90 backdrop-blur-md border border-obsidian-border rounded-lg text-xs text-obsidian-text placeholder-obsidian-muted focus:outline-none focus:border-jade-500 shadow-xl transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 p-0.5 text-obsidian-muted hover:text-white rounded"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Hide Orphans Toggle */}
        <button
          onClick={() => {
            setHideOrphans(!hideOrphans);
            simulationAlpha.current = 0.8;
          }}
          aria-pressed={hideOrphans}
          title="Ocultar notas sin enlaces"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border backdrop-blur-md shadow-lg transition ${
            hideOrphans
              ? 'bg-jade-950/80 text-jade-300 border-jade-600/50'
              : 'bg-obsidian-card/90 text-obsidian-muted border-obsidian-border hover:text-white'
          }`}
        >
          {hideOrphans ? <EyeOff size={13} className="text-jade-400" /> : <Eye size={13} />}
          <span>Ocultar Huérfanas</span>
        </button>

        {/* Settings / Filters Drawer Toggle */}
        <button
          onClick={() => setSettingsOpen(!settingsOpen)}
          className={`p-2 rounded-lg border backdrop-blur-md shadow-lg transition ${
            settingsOpen
              ? 'bg-jade-950/80 text-jade-300 border-jade-600/50'
              : 'bg-obsidian-card/90 text-obsidian-muted border-obsidian-border hover:text-white'
          }`}
          title="Filtros y Física del Grafo"
        >
          <Sliders size={15} />
        </button>
      </div>

      {/* Floating Settings Drawer */}
      {settingsOpen && (
        <div className="absolute top-16 left-4 z-20 w-72 bg-obsidian-card/95 backdrop-blur-xl border border-obsidian-border rounded-xl p-4 shadow-2xl text-xs space-y-4 animate-in fade-in duration-150">
          <div className="flex items-center justify-between border-b border-obsidian-border/60 pb-2">
            <span className="font-semibold text-obsidian-text flex items-center gap-1.5">
              <Sparkles size={14} className="text-jade-400" />
              <span>Controles del Grafo</span>
            </span>
            <button
              onClick={() => setSettingsOpen(false)}
              className="p-1 text-obsidian-muted hover:text-white rounded"
            >
              <X size={13} />
            </button>
          </div>

          {/* Label Display Mode */}
          <div>
            <label className="text-3xs uppercase tracking-wider font-semibold text-obsidian-muted mb-1.5 block">
              Etiquetas de Texto
            </label>
            <div className="grid grid-cols-3 gap-1 bg-obsidian-bg p-1 rounded-lg border border-obsidian-border/50 text-2xs">
              <button
                onClick={() => setLabelMode('hover')}
                className={`py-1 rounded text-center transition ${
                  labelMode === 'hover' ? 'bg-jade-600 text-white font-medium' : 'text-obsidian-muted hover:text-white'
                }`}
              >
                Al pasar
              </button>
              <button
                onClick={() => setLabelMode('hubs')}
                className={`py-1 rounded text-center transition ${
                  labelMode === 'hubs' ? 'bg-jade-600 text-white font-medium' : 'text-obsidian-muted hover:text-white'
                }`}
              >
                Principales
              </button>
              <button
                onClick={() => setLabelMode('always')}
                className={`py-1 rounded text-center transition ${
                  labelMode === 'always' ? 'bg-jade-600 text-white font-medium' : 'text-obsidian-muted hover:text-white'
                }`}
              >
                Todas
              </button>
            </div>
          </div>

          {/* Repulsion Force Slider */}
          <div>
            <div className="flex justify-between text-2xs mb-1 text-obsidian-muted">
              <span>Fuerza de Repulsión (Espaciado)</span>
              <strong className="text-obsidian-text">{repulsionStrength}</strong>
            </div>
            <input
              type="range"
              min="100"
              max="900"
              step="50"
              value={repulsionStrength}
              onChange={(e) => {
                setRepulsionStrength(Number(e.target.value));
                simulationAlpha.current = 0.5;
              }}
              className="w-full accent-jade-500 cursor-pointer"
            />
          </div>

          {/* Link Distance Slider */}
          <div>
            <div className="flex justify-between text-2xs mb-1 text-obsidian-muted">
              <span>Distancia de Enlaces</span>
              <strong className="text-obsidian-text">{linkDistance}px</strong>
            </div>
            <input
              type="range"
              min="40"
              max="200"
              step="10"
              value={linkDistance}
              onChange={(e) => {
                setLinkDistance(Number(e.target.value));
                simulationAlpha.current = 0.5;
              }}
              className="w-full accent-jade-500 cursor-pointer"
            />
          </div>

          {/* Unresolved Links Toggle */}
          <div className="flex items-center justify-between pt-1 border-t border-obsidian-border/50 text-2xs">
            <span className="text-obsidian-muted">Ocultar notas no creadas</span>
            <input
              type="checkbox"
              checked={hideUnresolved}
              onChange={(e) => setHideUnresolved(e.target.checked)}
              className="rounded accent-jade-500"
            />
          </div>
        </div>
      )}

      {/* Floating Zoom & Layout Controls */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5 bg-obsidian-card/90 backdrop-blur-md p-1 rounded-lg border border-obsidian-border shadow-xl">
        <button
          onClick={() => zoom(1.25)}
          className="p-1.5 text-obsidian-muted hover:text-white hover:bg-obsidian-hover rounded transition"
          title="Zoom In (+)"
        >
          <ZoomIn size={15} />
        </button>
        <button
          onClick={() => zoom(0.8)}
          className="p-1.5 text-obsidian-muted hover:text-white hover:bg-obsidian-hover rounded transition"
          title="Zoom Out (-)"
        >
          <ZoomOut size={15} />
        </button>
        <button
          onClick={fitToScreen}
          className="p-1.5 text-obsidian-muted hover:text-white hover:bg-obsidian-hover rounded transition"
          title="Ajustar a Pantalla (Centrar)"
        >
          <Maximize2 size={15} />
        </button>
        <button
          onClick={() => {
            initSimulation();
          }}
          className="p-1.5 text-obsidian-muted hover:text-jade-400 hover:bg-obsidian-hover rounded transition"
          title="Reiniciar y recalcular física"
        >
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Active Node Floating Tooltip / Card */}
      {hoveredNode && (
        <div className="absolute bottom-5 right-5 z-20 bg-obsidian-card/95 backdrop-blur-xl border border-jade-500/40 rounded-xl p-3.5 shadow-2xl text-xs max-w-xs animate-in fade-in duration-100 pointer-events-none">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-jade-400 shadow-sm shadow-jade-400/80" />
            <strong className="text-obsidian-text truncate text-sm">{hoveredNode.label}</strong>
          </div>
          <div className="text-3xs text-obsidian-muted space-y-1">
            <div className="flex items-center gap-1.5">
              <Link2 size={11} className="text-jade-400" />
              <span>Conexiones totales: <strong className="text-obsidian-text">{hoveredNode.degree}</strong></span>
            </div>
            {hoveredNode.group && hoveredNode.group !== 'note' && (
              <div className="text-jade-300">
                Grupo / Tag: #{hoveredNode.group}
              </div>
            )}
          </div>
          <div className="mt-2 text-3xs text-jade-400/80 flex items-center gap-1 font-mono">
            <ExternalLink size={10} />
            <span>Haz clic para abrir nota</span>
          </div>
        </div>
      )}

      {graphError ? (
        <div role="alert" className="absolute inset-x-4 top-16 z-10 mx-auto w-fit rounded-lg bg-obsidian-card p-3 text-sm text-rose-300">
          No se pudo cargar el grafo. {graphError}{' '}
          <button className="underline" onClick={() => void loadGraph()}>Reintentar</button>
        </div>
      ) : !filteredData.nodes.length && (
        <p role="status" className="pointer-events-none absolute inset-0 z-10 grid place-items-center p-8 text-center text-sm text-obsidian-muted">
          {!vault ? 'Abre una bóveda para ver el grafo.' :
            graphLoading || !graphData ? 'Cargando grafo…' :
              graphData.nodes.length ? 'Los filtros ocultan todas las notas.' : 'La bóveda aún no tiene notas indexadas.'}
        </p>
      )}

      {/* Bottom Info Pill */}
      <div className="absolute bottom-4 left-4 z-10 bg-obsidian-card/85 backdrop-blur-md px-3 py-1.5 rounded-full border border-obsidian-border text-3xs text-obsidian-muted flex items-center gap-3 shadow-lg">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-jade-500" />
          <span>Notas en pantalla: <strong className="text-obsidian-text">{filteredData.nodes.length}</strong></span>
        </span>
        <span className="text-obsidian-border">·</span>
        <span>Conexiones: <strong className="text-obsidian-text">{filteredData.links.length}</strong></span>
      </div>

      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { handleMouseUp(); setHoveredNode(null); }}
        onClick={handleClick}
      />
    </div>
  );
};
