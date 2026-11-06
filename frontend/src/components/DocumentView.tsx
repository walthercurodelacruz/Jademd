import { usePaneState } from '../store/PaneContext';
import React, { lazy, Suspense } from 'react';
import { useVaultStore, isExcalidrawFile } from '../store/useVaultStore';
import { CodeMirrorEditor } from '../editor/CodeMirrorEditor';
import { AnchorNavigator } from './AnchorNavigator';
import { LiveView } from './LiveView';
import { CanvasView } from './CanvasView';
import { BaseView } from './BaseView';
import { ImageViewer } from './ImageViewer';

const ExcalidrawView = lazy(() => import('./ExcalidrawView').then((module) => ({ default: module.ExcalidrawView })));

interface Props {
  onToggleBacklinks?: () => void;
  backlinksOpen?: boolean;
}

export function DocumentView({ onToggleBacklinks, backlinksOpen }: Props) {
  const { activePath: path, activeContent: content, noteLoadState, noteError, openNote,
    knownExcalidrawNotes, noteMode, isLoading } = usePaneState();
  if (isLoading || noteLoadState === 'loading') return <div role="status" className="p-6 text-obsidian-muted">Cargando documento…</div>;
  if (!path) return <div className="p-6 text-obsidian-muted">Selecciona una nota.</div>;
  if (noteLoadState === 'error') return <div role="alert" className="p-6 text-rose-300">
    <p>{noteError}</p><button onClick={() => void openNote(path)} className="mt-3 underline">Reintentar apertura</button>
  </div>;
  if (noteLoadState !== 'ready') return null;

  let view: React.ReactNode;
  if (/\.base$/i.test(path)) view = noteMode === 'source'
    ? <CodeMirrorEditor key={path} path={path} initialContent={content} />
    : <BaseView key={path} content={content} />;
  else if (noteMode === 'source' && (path.endsWith('.canvas') || knownExcalidrawNotes[path] || isExcalidrawFile(path, content))) view = <CodeMirrorEditor key={path} path={path} initialContent={content} />;
  else if (path.endsWith('.canvas')) view = <CanvasView key={path} />;
  else if (knownExcalidrawNotes[path] || isExcalidrawFile(path, content)) view = <ExcalidrawView key={path} />;
  else if (/\.(png|jpe?g|gif|svg|webp|avif|bmp|ico)$/i.test(path)) view = <ImageViewer key={path} path={path} />;
  else if (/\.pdf$/i.test(path)) view = <iframe title={path} className="w-full h-full border-0" src={`/api/asset?path=${encodeURIComponent(path)}`} />;
  else if (noteMode === 'source') view = <CodeMirrorEditor key={path} path={path} initialContent={content} />;
  else if (noteMode === 'split-preview') view = <div className="flex w-full h-full min-w-0">
    <div className="w-1/2 h-full border-r border-obsidian-border"><CodeMirrorEditor key={path} path={path} initialContent={content} /></div>
    <div className="w-1/2 h-full overflow-auto"><LiveView key={`${path}:preview`} path={path} content={content} readOnly onToggleBacklinks={onToggleBacklinks} backlinksOpen={backlinksOpen} /></div>
  </div>;
  else view = <LiveView key={`${path}:${noteMode}`} path={path} content={content} readOnly={noteMode === 'reading'} onToggleBacklinks={onToggleBacklinks} backlinksOpen={backlinksOpen} />;
  return <><AnchorNavigator /><Suspense fallback={<div role="status" className="p-6">Cargando editor…</div>}>{view}</Suspense></>;
}
