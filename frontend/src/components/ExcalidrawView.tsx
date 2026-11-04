import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Excalidraw, exportToBlob, exportToSvg } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import LZString from 'lz-string';
import { useVaultStore } from '../store/useVaultStore';
import { Download, Copy, Code, Eye, Check, RefreshCw } from 'lucide-react';

interface ExcalidrawSceneData {
  type?: string;
  version?: number;
  source?: string;
  elements?: any[];
  appState?: Record<string, any>;
  files?: Record<string, any>;
}

export const ExcalidrawView: React.FC = () => {
  const { activePath, activeContent, saveCurrentNote } = useVaultStore();
  const [initialData, setInitialData] = useState<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [savingStatus, setSavingStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [showRawMarkdown, setShowRawMarkdown] = useState(false);
  const [copied, setCopied] = useState(false);

  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const latestSceneRef = useRef<{ elements: any[]; appState: any; files: any } | null>(null);
  const excalidrawAPIRef = useRef<any>(null);

  // Determine whether file is markdown-wrapped (.excalidraw.md) or raw JSON (.excalidraw)
  const isMarkdownFormat = activePath ? activePath.endsWith('.md') : false;

  // 1. Parse activeContent into Excalidraw scene data
  useEffect(() => {
    setIsLoaded(false);
    let parsedScene: ExcalidrawSceneData = {
      type: 'excalidraw',
      version: 2,
      source: 'https://jademd.app',
      elements: [],
      appState: {
        theme: 'dark',
        viewBackgroundColor: '#18181b',
        currentItemStrokeColor: '#e4e4e7',
        currentItemBackgroundColor: 'transparent',
      },
      files: {},
    };

    if (activeContent && activeContent.trim().length > 0) {
      try {
        if (isMarkdownFormat) {
          // Check for ```compressed-json
          const compressedMatch = activeContent.match(/```compressed-json\n([\s\S]*?)```/);
          if (compressedMatch) {
            const cleanCompressed = compressedMatch[1].replace(/\s+/g, '');
            const decompressed = LZString.decompressFromBase64(cleanCompressed);
            if (decompressed) {
              const data = JSON.parse(decompressed);
              parsedScene = { ...parsedScene, ...data };
            }
          } else {
            // Check for ```json:excalidraw or ```json
            const jsonMatch = activeContent.match(/```(?:json:excalidraw|json)\n([\s\S]*?)```/);
            if (jsonMatch) {
              const data = JSON.parse(jsonMatch[1]);
              parsedScene = { ...parsedScene, ...data };
            }
          }
        } else {
          // Plain JSON format (.excalidraw)
          const data = JSON.parse(activeContent);
          parsedScene = { ...parsedScene, ...data };
        }
      } catch (err) {
        console.warn('Error al parsear contenido Excalidraw:', err);
      }
    }

    // Ensure dark theme is respected
    const finalAppState = {
      ...(parsedScene.appState || {}),
      theme: 'dark',
      viewBackgroundColor: parsedScene.appState?.viewBackgroundColor || '#18181b',
    };

    setInitialData({
      elements: parsedScene.elements || [],
      appState: finalAppState,
      files: parsedScene.files || {},
    });
    setIsLoaded(true);
  }, [activePath]);

  // 2. Build serialized content for saving
  const serializeScene = useCallback(
    (elements: readonly any[], appState: any, files: any): string => {
      const sceneData: ExcalidrawSceneData = {
        type: 'excalidraw',
        version: 2,
        source: 'https://jademd.app',
        elements: elements ? [...elements] : [],
        appState: {
          viewBackgroundColor: appState?.viewBackgroundColor || '#18181b',
          currentItemStrokeColor: appState?.currentItemStrokeColor,
          currentItemBackgroundColor: appState?.currentItemBackgroundColor,
          gridSize: appState?.gridSize,
        },
        files: files || {},
      };

      if (!isMarkdownFormat) {
        return JSON.stringify(sceneData, null, 2);
      }

      // Obsidian .excalidraw.md format
      const jsonStr = JSON.stringify(sceneData);
      const compressed = LZString.compressToBase64(jsonStr);

      // Check if original content already had frontmatter and template
      if (activeContent && activeContent.includes('```compressed-json')) {
        return activeContent.replace(
          /```compressed-json\n[\s\S]*?```/,
          `\`\`\`compressed-json\n${compressed}\n\`\`\``
        );
      } else if (activeContent && activeContent.includes('```json')) {
        return activeContent.replace(
          /```(?:json:excalidraw|json)\n[\s\S]*?```/,
          `\`\`\`compressed-json\n${compressed}\n\`\`\``
        );
      } else {
        // Standard Obsidian Excalidraw template
        return `---

excalidraw-plugin: parsed
tags: [excalidraw]

---
==⚠  Switch to EXCALIDRAW VIEW in Jademd. ⚠==

# Excalidraw Data

## Text Elements
%%
## Drawing
\`\`\`compressed-json
${compressed}
\`\`\`
%%
`;
      }
    },
    [isMarkdownFormat, activeContent]
  );

  // 3. Handle changes from Excalidraw with debounce
  const handleChange = useCallback(
    (elements: readonly any[], appState: any, files: any) => {
      latestSceneRef.current = { elements: [...elements], appState, files };

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      setSavingStatus('saving');
      saveTimerRef.current = setTimeout(async () => {
        try {
          const serialized = serializeScene(elements, appState, files);
          await saveCurrentNote(serialized);
          setSavingStatus('saved');
          setTimeout(() => setSavingStatus('idle'), 2000);
        } catch (err) {
          console.error('Error al guardar dibujo Excalidraw:', err);
          setSavingStatus('idle');
        }
      }, 700);
    },
    [serializeScene, saveCurrentNote]
  );

  // 4. Export handlers
  const handleExportPNG = async () => {
    if (!latestSceneRef.current) return;
    try {
      const blob = await exportToBlob({
        elements: latestSceneRef.current.elements,
        appState: {
          ...latestSceneRef.current.appState,
          exportWithDarkMode: true,
          exportBackground: true,
        },
        files: latestSceneRef.current.files,
        mimeType: 'image/png',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const baseName = (activePath?.split('/').pop() || 'drawing').replace(/\.(excalidraw|md)$/i, '');
      a.download = `${baseName}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error exportando PNG:', err);
    }
  };

  const handleExportSVG = async () => {
    if (!latestSceneRef.current) return;
    try {
      const svg = await exportToSvg({
        elements: latestSceneRef.current.elements,
        appState: {
          ...latestSceneRef.current.appState,
          exportWithDarkMode: true,
          exportBackground: true,
        },
        files: latestSceneRef.current.files,
      });
      const svgString = new XMLSerializer().serializeToString(svg);
      const blob = new Blob([svgString], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const baseName = (activePath?.split('/').pop() || 'drawing').replace(/\.(excalidraw|md)$/i, '');
      a.download = `${baseName}.svg`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error exportando SVG:', err);
    }
  };

  const handleCopyImage = async () => {
    if (!latestSceneRef.current) return;
    try {
      const blob = await exportToBlob({
        elements: latestSceneRef.current.elements,
        appState: {
          ...latestSceneRef.current.appState,
          exportWithDarkMode: true,
          exportBackground: true,
        },
        files: latestSceneRef.current.files,
        mimeType: 'image/png',
      });
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Error copiando imagen:', err);
    }
  };

  if (!isLoaded || !initialData) {
    return (
      <div className="flex-1 h-full flex flex-col items-center justify-center bg-obsidian-bg text-obsidian-muted">
        <RefreshCw size={24} className="animate-spin text-jade-400 mb-2" />
        <span className="text-xs">Cargando lienzo de Excalidraw...</span>
      </div>
    );
  }

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden bg-obsidian-bg relative">
      {/* Top Floating Control Bar */}
      <div className="h-9 px-3 bg-obsidian-sidebar/95 border-b border-obsidian-border/80 flex items-center justify-between z-10 flex-shrink-0 text-xs backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-jade-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-jade-400 animate-pulse" />
            Excalidraw
          </span>
          <span className="text-2xs text-obsidian-muted truncate max-w-xs">{activePath}</span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Save Status Badge */}
          <div className="mr-2 text-2xs">
            {savingStatus === 'saving' && (
              <span className="text-amber-400 flex items-center gap-1">
                <RefreshCw size={11} className="animate-spin" /> Guardando...
              </span>
            )}
            {savingStatus === 'saved' && (
              <span className="text-jade-400 flex items-center gap-1">
                <Check size={11} /> Guardado
              </span>
            )}
          </div>

          {/* Export PNG */}
          <button
            onClick={handleExportPNG}
            title="Exportar a imagen PNG"
            className="flex items-center gap-1 px-2 py-1 rounded bg-obsidian-card hover:bg-obsidian-hover border border-obsidian-border text-obsidian-text hover:text-white transition text-2xs"
          >
            <Download size={12} />
            <span>PNG</span>
          </button>

          {/* Export SVG */}
          <button
            onClick={handleExportSVG}
            title="Exportar a vector SVG"
            className="flex items-center gap-1 px-2 py-1 rounded bg-obsidian-card hover:bg-obsidian-hover border border-obsidian-border text-obsidian-text hover:text-white transition text-2xs"
          >
            <Download size={12} />
            <span>SVG</span>
          </button>

          {/* Copy PNG to clipboard */}
          <button
            onClick={handleCopyImage}
            title="Copiar imagen al portapapeles"
            className="flex items-center gap-1 px-2 py-1 rounded bg-obsidian-card hover:bg-obsidian-hover border border-obsidian-border text-obsidian-text hover:text-white transition text-2xs"
          >
            {copied ? <Check size={12} className="text-jade-400" /> : <Copy size={12} />}
            <span>{copied ? 'Copiado!' : 'Copiar'}</span>
          </button>

          {/* Switch between visual canvas and raw source */}
          <button
            onClick={() => setShowRawMarkdown(!showRawMarkdown)}
            title={showRawMarkdown ? 'Ver lienzo gráfico' : 'Ver código fuente'}
            className="flex items-center gap-1 px-2 py-1 rounded bg-obsidian-card hover:bg-obsidian-hover border border-obsidian-border text-obsidian-muted hover:text-white transition text-2xs ml-1"
          >
            {showRawMarkdown ? <Eye size={12} /> : <Code size={12} />}
            <span>{showRawMarkdown ? 'Lienzo' : 'Código'}</span>
          </button>
        </div>
      </div>

      {/* Main Canvas Body */}
      <div className="flex-1 w-full h-full relative overflow-hidden bg-obsidian-bg">
        {showRawMarkdown ? (
          <div className="w-full h-full p-4 overflow-auto bg-obsidian-bg font-mono text-xs text-obsidian-text selection:bg-jade-500/30">
            <pre className="whitespace-pre-wrap leading-relaxed">{activeContent}</pre>
          </div>
        ) : (
          <div className="w-full h-full">
            <Excalidraw
              excalidrawAPI={(api) => {
                excalidrawAPIRef.current = api;
              }}
              initialData={initialData}
              onChange={handleChange}
              theme="dark"
              langCode="es-ES"
              UIOptions={{
                canvasActions: {
                  loadScene: true,
                  saveAsImage: true,
                  toggleTheme: false, // dark theme to match Jademd
                },
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};
