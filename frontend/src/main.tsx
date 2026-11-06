import React, { Component, ErrorInfo, ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';
import { useVaultStore } from './store/useVaultStore';

(window as any).useVaultStore = useVaultStore;

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in Jademd:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-[#18181b] text-white p-6">
          <div className="max-w-md w-full bg-[#202024] border border-rose-500/40 rounded-xl p-6 shadow-2xl text-center">
            <div className="w-12 h-12 bg-rose-500/10 text-rose-400 rounded-full flex items-center justify-center mx-auto mb-4 text-xl">
              ⚠️
            </div>
            <h2 className="text-base font-semibold mb-2">Error al renderizar la interfaz</h2>
            <p className="text-xs text-zinc-400 mb-4 font-mono break-words bg-black/40 p-3 rounded-lg border border-zinc-800 text-left">
              {this.state.error?.message || 'Error desconocido'}
            </p>
            <button
              onClick={() => {
                window.location.reload();
              }}
              className="px-4 py-2 bg-jade-600 hover:bg-jade-500 text-white rounded-lg text-xs font-medium transition shadow-md"
            >
              Recargar Jademd
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
