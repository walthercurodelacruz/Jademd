import { usePaneState } from '../store/PaneContext';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Excalidraw, exportToBlob, exportToSvg } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { parseScene, serializeScene as serializeDocument, sceneFingerprint } from '../utils/excalidrawDocument';
import { useVaultStore } from '../store/useVaultStore';
import { Download, Copy, Code, Eye, Check, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback: (error: Error, reset: () => void) => React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ExcalidrawErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: any) {
    console.error('Excalidraw Error Caught:', error, info);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return this.props.fallback(this.state.error || new Error('Unknown error'), this.reset);
    }
    return this.props.children;
  }
}

export const ExcalidrawView: React.FC = () => {
  const { activePath, activeContent, queueNoteSave, isSaving, drafts, saveError, setNoteMode } = usePaneState();
  const [initialData, setInitialData] = useState<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const savingStatus = isSaving || (activePath && Object.hasOwn(drafts, activePath)) ? 'saving' : 'saved';
  const [parseError, setParseError] = useState<string | null>(null);
  const [showRawMarkdown, setShowRawMarkdown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportBackground, setExportBackground] = useState(true);
  const [exportDark, setExportDark] = useState(true);

  const latestSceneRef = useRef<{ elements: any[]; appState: any; files: any } | null>(null);
  const excalidrawAPIRef = useRef<any>(null);
  const savedFingerprintRef = useRef<string>('');
  const interactionRef = useRef(false);
  const lastQueuedContentRef = useRef<string | null>(null);

  const isMarkdownFormat = activePath ? activePath.endsWith('.md') : false;
  // Parse once per mounted document; a failed parse never creates a replacement scene.
  useEffect(() => {
    try {
      const scene = parseScene(activeContent, isMarkdownFormat);
      const appState = { ...scene.appState, theme: 'dark', viewBackgroundColor: scene.appState?.viewBackgroundColor || '#18181b' };
      const files = scene.files || {};
      savedFingerprintRef.current = sceneFingerprint(scene.elements, appState, files);
      latestSceneRef.current = { elements: scene.elements, appState, files };
      setInitialData({ ...scene, appState });
      setIsLoaded(true);
      setParseError(null);
    } catch (e) {
      setIsLoaded(false);
      setParseError(e instanceof Error ? e.message : String(e));
    }
  }, [activePath]);

  useEffect(() => {
    if (activeContent === lastQueuedContentRef.current) return;
    if (!isLoaded) {
      try {
        const scene = parseScene(activeContent, isMarkdownFormat);
        const appState = { ...scene.appState, theme: 'dark', viewBackgroundColor: scene.appState?.viewBackgroundColor || '#18181b' };
        const files = scene.files || {}; savedFingerprintRef.current = sceneFingerprint(scene.elements, appState, files);
        latestSceneRef.current = { elements: scene.elements, appState, files }; setInitialData({ ...scene, appState }); setIsLoaded(true); setParseError(null);
      } catch (error) { setParseError(error instanceof Error ? error.message : String(error)); }
      return;
    }
    if (!excalidrawAPIRef.current) return;
    try {
      const scene = parseScene(activeContent, isMarkdownFormat);
      setParseError(null);
      const appState = { ...scene.appState, theme: 'dark', viewBackgroundColor: scene.appState?.viewBackgroundColor || '#18181b' };
      const fingerprint = sceneFingerprint(scene.elements, appState, scene.files || {});
      if (fingerprint === savedFingerprintRef.current) return;
      interactionRef.current = false; lastQueuedContentRef.current = null;
      savedFingerprintRef.current = fingerprint;
      latestSceneRef.current = { elements: scene.elements, appState, files: scene.files || {} };
      excalidrawAPIRef.current.addFiles(Object.values(scene.files || {}));
      excalidrawAPIRef.current.updateScene({ elements: scene.elements, appState });
    } catch (error) { setParseError(error instanceof Error ? error.message : String(error)); }
  }, [activeContent, isLoaded, isMarkdownFormat]);

  const handleChange = useCallback((elements: readonly any[], appState: any, files: any) => {
    if (!isLoaded || !activePath || !excalidrawAPIRef.current || parseError) return;
    latestSceneRef.current = { elements: [...elements], appState, files };
    const fingerprint = sceneFingerprint(elements, appState, files);
    if (!interactionRef.current) { savedFingerprintRef.current = fingerprint; return; }
    if (fingerprint === savedFingerprintRef.current) return;
    try {
      const content = serializeDocument(activeContent, isMarkdownFormat, elements, appState, files);
      lastQueuedContentRef.current = content;
      queueNoteSave(content, activePath, 800);
      // This is the last queued scene, not an acknowledgement of a successful disk write.
      savedFingerprintRef.current = fingerprint;
    } catch (e) { setParseError(e instanceof Error ? e.message : String(e)); }
  }, [isLoaded, activePath, activeContent, isMarkdownFormat, parseError, queueNoteSave]);

  const registerAPI = useCallback((api: any) => {
    excalidrawAPIRef.current = api;
    if (!api || !activePath) return;
    try {
      const root = useVaultStore.getState();
      const content = root.drafts[activePath] ?? root.documents[activePath]?.content ?? activeContent;
      const scene = parseScene(content, isMarkdownFormat);
      const appState = { ...scene.appState, theme: 'dark', viewBackgroundColor: scene.appState?.viewBackgroundColor || '#18181b' };
      interactionRef.current = false;
      savedFingerprintRef.current = sceneFingerprint(scene.elements, appState, scene.files || {});
      latestSceneRef.current = { elements: scene.elements, appState, files: scene.files || {} };
      api.addFiles(Object.values(scene.files || {})); api.updateScene({ elements: scene.elements, appState });
    } catch (error) { setParseError(error instanceof Error ? error.message : String(error)); }
  }, [activePath, isMarkdownFormat]);

  // 4. Export handlers
  const handleExportPNG = async () => {
    if (!latestSceneRef.current) return;
    setExportError(null);
    try {
      const blob = await exportToBlob({
        elements: latestSceneRef.current.elements,
        appState: {
          ...latestSceneRef.current.appState,
          exportWithDarkMode: exportDark,
          exportBackground,
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
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setExportError(`No se pudo exportar PNG: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleExportSVG = async () => {
    if (!latestSceneRef.current) return;
    setExportError(null);
    try {
      const svg = await exportToSvg({
        elements: latestSceneRef.current.elements,
        appState: {
          ...latestSceneRef.current.appState,
          exportWithDarkMode: exportDark,
          exportBackground,
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
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setExportError(`No se pudo exportar SVG: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleCopyImage = async () => {
    if (!latestSceneRef.current) return;
    setExportError(null);
    try {
      const blob = await exportToBlob({
        elements: latestSceneRef.current.elements,
        appState: {
          ...latestSceneRef.current.appState,
          exportWithDarkMode: exportDark,
          exportBackground,
        },
        files: latestSceneRef.current.files,
        mimeType: 'image/png',
      });
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setExportError(`No se pudo copiar: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  if (parseError) return <div role="alert" className="p-6 text-rose-300">No se puede editar el dibujo: {parseError}. El archivo original se conserva.</div>;

  if (!isLoaded || !initialData) {
    return (
      <div className="flex-1 h-full flex flex-col items-center justify-center bg-obsidian-bg text-obsidian-muted">
        <RefreshCw size={24} className="animate-spin text-jade-400 mb-2" />
        <span className="text-xs">Cargando lienzo de Excalidraw...</span>
      </div>
    );
  }



  return (
    <div className="flex-1 h-full w-full flex flex-col overflow-hidden bg-obsidian-bg relative isolate min-h-0">
      {exportError && <p role="alert" className="p-2 text-xs text-rose-300">{exportError}</p>}
      <div className="flex flex-wrap gap-3 p-2 text-xs bg-obsidian-sidebar">
        <label><input type="checkbox" checked={exportBackground} onChange={(event) => setExportBackground(event.target.checked)} /> Incluir fondo</label>
        <label><input type="checkbox" checked={exportDark} onChange={(event) => setExportDark(event.target.checked)} /> Exportar en oscuro</label>
        <button className="underline text-jade-300" onClick={() => {
          if (!latestSceneRef.current) return;
          setExportError(null);
          try {
            const scene = latestSceneRef.current;
            const native = serializeDocument(JSON.stringify({ type: 'excalidraw', version: 2, source: 'Jademd', ...parseScene(activeContent, isMarkdownFormat) }), false, scene.elements, scene.appState, scene.files);
            const url = URL.createObjectURL(new Blob([native], { type: 'application/json' }));
            const link = document.createElement('a'); link.href = url; link.download = (activePath?.split('/').pop() || 'dibujo').replace(/(?:\.excalidraw)?(?:\.md)?$/, '') + '.excalidraw'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
          } catch (error) { setExportError(error instanceof Error ? error.message : String(error)); }
        }}>Descargar escena editable</button>
      </div>
      {/* Top Floating Control Bar */}
      <div className="h-9 px-3 bg-obsidian-sidebar border-b border-obsidian-border flex items-center justify-between z-20 flex-shrink-0 text-xs select-none">
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

      {/* Main Canvas Body strictly isolated */}
      <div className="flex-1 w-full relative overflow-hidden bg-obsidian-bg min-h-0 excalidraw-container-wrapper" onPointerDownCapture={() => { interactionRef.current = true; }} onKeyDownCapture={() => { interactionRef.current = true; }} onPasteCapture={() => { interactionRef.current = true; }} onDropCapture={() => { interactionRef.current = true; }}>
        {showRawMarkdown ? (
          <div className="w-full h-full p-4 overflow-auto bg-obsidian-bg font-mono text-xs text-obsidian-text selection:bg-jade-500/30">
            <pre className="whitespace-pre-wrap leading-relaxed">{activeContent}</pre>
          </div>
        ) : (
          <div className="w-full h-full absolute inset-0">
            <ExcalidrawErrorBoundary
              fallback={(error, reset) => (
                <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-obsidian-bg text-obsidian-text">
                  <div className="w-12 h-12 rounded-xl bg-rose-950/60 border border-rose-800/50 flex items-center justify-center text-rose-400 mb-3 shadow-lg">
                    <Code size={24} />
                  </div>
                  <h3 className="text-base font-semibold text-white mb-1">
                    No se pudo cargar el lienzo gráfico
                  </h3>
                  <p className="text-xs text-obsidian-muted max-w-md mb-4">
                    {error.message || 'Error interno al inicializar el componente de dibujo.'}
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setShowRawMarkdown(true)}
                      className="px-3 py-1.5 rounded-lg bg-obsidian-card hover:bg-obsidian-hover border border-obsidian-border text-xs text-obsidian-text transition"
                    >
                      Ver Código Fuente
                    </button>
                    <button
                      onClick={reset}
                      className="px-3 py-1.5 rounded-lg bg-jade-600 hover:bg-jade-500 text-xs text-white font-medium transition"
                    >
                      Reintentar
                    </button>
                  </div>
                </div>
              )}
            >
              <Excalidraw
                excalidrawAPI={registerAPI}
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
            </ExcalidrawErrorBoundary>
          </div>
        )}
      </div>
    </div>
  );
};
