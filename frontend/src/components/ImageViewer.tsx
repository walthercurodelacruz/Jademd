import React, { useState } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Image as ImageIcon } from 'lucide-react';

interface Props {
  path: string;
}

export const ImageViewer: React.FC<Props> = ({ path }) => {
  const [zoom, setZoom] = useState(1);
  const assetUrl = `/api/asset?path=${encodeURIComponent(path)}`;
  const filename = path.split('/').pop() || path;

  return (
    <div className="h-full w-full flex flex-col bg-[#121214] select-none overflow-hidden relative">
      {/* Top Toolbar */}
      <div className="h-9 px-4 border-b border-obsidian-border bg-obsidian-sidebar/80 backdrop-blur-sm flex items-center justify-between select-none flex-shrink-0 z-10">
        <div className="flex items-center gap-2 text-xs text-obsidian-muted">
          <ImageIcon size={14} className="text-sky-400" />
          <span className="font-medium text-obsidian-text">{filename}</span>
        </div>
        <div className="flex items-center gap-1 text-obsidian-muted">
          <button
            onClick={() => setZoom((z) => Math.min(z * 1.25, 4))}
            title="Acercar"
            className="p-1.5 hover:text-white hover:bg-obsidian-hover rounded"
          >
            <ZoomIn size={14} />
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(z * 0.8, 0.25))}
            title="Alejar"
            className="p-1.5 hover:text-white hover:bg-obsidian-hover rounded"
          >
            <ZoomOut size={14} />
          </button>
          <button
            onClick={() => setZoom(1)}
            title="Restablecer"
            className="p-1.5 hover:text-white hover:bg-obsidian-hover rounded"
          >
            <RotateCcw size={14} />
          </button>
          <span className="text-[11px] font-mono px-2 text-obsidian-muted">
            {Math.round(zoom * 100)}%
          </span>
        </div>
      </div>

      {/* Main Image View Container */}
      <div className="flex-1 w-full flex items-center justify-center p-8 overflow-auto">
        <div
          className="transition-transform duration-100 ease-out"
          style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
        >
          <img
            src={assetUrl}
            alt={filename}
            className="max-w-full max-h-[75vh] object-contain rounded-xl shadow-2xl border border-white/10"
          />
        </div>
      </div>
    </div>
  );
};
