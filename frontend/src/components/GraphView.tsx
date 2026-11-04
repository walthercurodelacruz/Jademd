import React, { useEffect, useRef, useState } from 'react';
import { useVaultStore } from '../store/useVaultStore';
import { GraphData } from '../types';
import { Maximize2, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react';

interface SimNode {
  id: string;
  label: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  group: string;
}

interface SimLink {
  source: SimNode;
  target: SimNode;
}

export const GraphView: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { graphData, loadGraph, openNote, tree } = useVaultStore();
  const [hoveredNode, setHoveredNode] = useState<SimNode | null>(null);

  const transformRef = useRef({ x: 0, y: 0, scale: 1 });
  const isDraggingCanvas = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const draggedNode = useRef<SimNode | null>(null);

  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);
  const animFrameRef = useRef<number | null>(null);

  // Helper to find relative path from node title
  const findPathForTitle = (title: string, node: any): string | null => {
    if (!node) return null;
    if (!node.is_dir && node.name.replace(/\.md$/, '') === title) {
      return node.path;
    }
    if (node.children) {
      for (const child of node.children) {
        const p = findPathForTitle(title, child);
        if (p) return p;
      }
    }
    return null;
  };

  useEffect(() => {
    loadGraph();
  }, []);

  useEffect(() => {
    if (!graphData || !canvasRef.current) return;

    const width = canvasRef.current.clientWidth || 800;
    const height = canvasRef.current.clientHeight || 600;

    // Initialize nodes with random positions near center
    const simNodes: SimNode[] = graphData.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      x: width / 2 + (Math.random() - 0.5) * 300,
      y: height / 2 + (Math.random() - 0.5) * 300,
      vx: 0,
      vy: 0,
      radius: Math.max(5, Math.min(14, 4 + n.weight * 2)),
      group: n.group,
    }));

    const nodeMap = new Map<string, SimNode>();
    simNodes.forEach((n) => nodeMap.set(n.id, n));

    const simLinks: SimLink[] = [];
    graphData.links.forEach((l) => {
      const src = nodeMap.get(l.source);
      const tgt = nodeMap.get(l.target);
      if (src && tgt) {
        simLinks.push({ source: src, target: tgt });
      }
    });

    nodesRef.current = simNodes;
    linksRef.current = simLinks;

    // Animation / Physics Loop
    let iterations = 0;
    const simulate = () => {
      const nodes = nodesRef.current;
      const links = linksRef.current;

      // Force physics (damping & repulsion)
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        if (a === draggedNode.current) continue;

        // Center gravity
        a.vx += (width / 2 - a.x) * 0.001;
        a.vy += (height / 2 - a.y) * 0.001;

        // Repulsion between nodes
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distSq = dx * dx + dy * dy + 1;
          const dist = Math.sqrt(distSq);
          if (dist < 250) {
            const force = 180 / distSq;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            a.vx -= fx;
            a.vy -= fy;
            b.vx += fx;
            b.vy += fy;
          }
        }
      }

      // Link attraction (Spring force)
      for (const link of links) {
        const dx = link.target.x - link.source.x;
        const dy = link.target.y - link.source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const targetDist = 70;
        const force = (dist - targetDist) * 0.04;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        if (link.source !== draggedNode.current) {
          link.source.vx += fx;
          link.source.vy += fy;
        }
        if (link.target !== draggedNode.current) {
          link.target.vx -= fx;
          link.target.vy -= fy;
        }
      }

      // Apply velocities with friction
      for (const node of nodes) {
        if (node === draggedNode.current) continue;
        node.x += node.vx;
        node.y += node.vy;
        node.vx *= 0.88;
        node.vy *= 0.88;
      }

      // Draw
      renderCanvas();

      iterations++;
      animFrameRef.current = requestAnimationFrame(simulate);
    };

    simulate();

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [graphData]);

  const renderCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    ctx.save();
    ctx.clearRect(0, 0, width, height);

    // Apply pan and zoom
    const { x, y, scale } = transformRef.current;
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    const nodes = nodesRef.current;
    const links = linksRef.current;

    // Draw Links
    for (const link of links) {
      const isConnected =
        hoveredNode &&
        (link.source.id === hoveredNode.id || link.target.id === hoveredNode.id);

      ctx.beginPath();
      ctx.moveTo(link.source.x, link.source.y);
      ctx.lineTo(link.target.x, link.target.y);
      ctx.strokeStyle = isConnected ? '#4ade80' : 'rgba(113, 113, 122, 0.25)';
      ctx.lineWidth = isConnected ? 2 : 1;
      ctx.stroke();
    }

    // Draw Nodes
    for (const node of nodes) {
      const isHovered = hoveredNode?.id === node.id;
      const isLinked =
        hoveredNode &&
        links.some(
          (l) =>
            (l.source.id === hoveredNode.id && l.target.id === node.id) ||
            (l.target.id === hoveredNode.id && l.source.id === node.id)
        );

      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius * (isHovered ? 1.3 : 1), 0, Math.PI * 2);

      if (node.group === 'unresolved') {
        ctx.fillStyle = '#71717a';
      } else if (isHovered || isLinked) {
        ctx.fillStyle = '#4ade80';
      } else {
        ctx.fillStyle = '#10b981';
      }
      ctx.fill();

      // Outer glow for hovered
      if (isHovered) {
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#22c55e';
        ctx.stroke();
      }

      // Draw Label
      ctx.fillStyle = isHovered || isLinked ? '#f4f4f5' : '#a1a1aa';
      ctx.font = `${isHovered ? 'bold 12px' : '11px'} system-ui, sans-serif`;
      ctx.fillText(node.label, node.x + node.radius + 5, node.y + 4);
    }

    ctx.restore();
  };

  // Mouse Interactions
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
    // Check if clicked a node
    const clicked = nodesRef.current.find((n) => {
      const dx = n.x - coords.x;
      const dy = n.y - coords.y;
      return Math.sqrt(dx * dx + dy * dy) <= n.radius + 4;
    });

    if (clicked) {
      draggedNode.current = clicked;
    } else {
      isDraggingCanvas.current = true;
      dragStart.current = { x: e.clientX - transformRef.current.x, y: e.clientY - transformRef.current.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const coords = getCanvasCoords(e);

    if (draggedNode.current) {
      draggedNode.current.x = coords.x;
      draggedNode.current.y = coords.y;
      return;
    }

    if (isDraggingCanvas.current) {
      transformRef.current.x = e.clientX - dragStart.current.x;
      transformRef.current.y = e.clientY - dragStart.current.y;
      return;
    }

    // Hover detection
    const hovered = nodesRef.current.find((n) => {
      const dx = n.x - coords.x;
      const dy = n.y - coords.y;
      return Math.sqrt(dx * dx + dy * dy) <= n.radius + 4;
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
      return Math.sqrt(dx * dx + dy * dy) <= n.radius + 4;
    });

    if (clicked) {
      const path = findPathForTitle(clicked.label, tree);
      if (path) {
        openNote(path);
      }
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newScale = Math.max(0.2, Math.min(3, transformRef.current.scale * zoomFactor));
    transformRef.current.scale = newScale;
  };

  return (
    <div className="h-full w-full relative bg-obsidian-bg overflow-hidden flex flex-col">
      {/* Floating Controls */}
      <div className="absolute top-4 right-4 z-10 flex gap-2 bg-obsidian-card/80 backdrop-blur-md p-1.5 rounded-lg border border-obsidian-border shadow-lg">
        <button
          onClick={() => {
            transformRef.current.scale = Math.min(3, transformRef.current.scale * 1.2);
          }}
          className="p-1.5 text-obsidian-muted hover:text-white hover:bg-obsidian-hover rounded transition"
          title="Zoom In"
        >
          <ZoomIn size={16} />
        </button>
        <button
          onClick={() => {
            transformRef.current.scale = Math.max(0.2, transformRef.current.scale * 0.8);
          }}
          className="p-1.5 text-obsidian-muted hover:text-white hover:bg-obsidian-hover rounded transition"
          title="Zoom Out"
        >
          <ZoomOut size={16} />
        </button>
        <button
          onClick={() => {
            transformRef.current = { x: 0, y: 0, scale: 1 };
          }}
          className="p-1.5 text-obsidian-muted hover:text-white hover:bg-obsidian-hover rounded transition"
          title="Centrar"
        >
          <Maximize2 size={16} />
        </button>
        <button
          onClick={() => loadGraph()}
          className="p-1.5 text-obsidian-muted hover:text-white hover:bg-obsidian-hover rounded transition"
          title="Recargar grafo"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Info indicator */}
      <div className="absolute bottom-4 left-4 z-10 bg-obsidian-card/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-obsidian-border text-xs text-obsidian-muted flex items-center gap-3">
        <span>Notas: <strong className="text-obsidian-text">{graphData?.nodes.length || 0}</strong></span>
        <span>Conexiones: <strong className="text-obsidian-text">{graphData?.links.length || 0}</strong></span>
      </div>

      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onClick={handleClick}
      />
    </div>
  );
};
