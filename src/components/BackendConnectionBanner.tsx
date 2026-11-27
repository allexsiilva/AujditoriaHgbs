import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw, ServerOff, X } from 'lucide-react';
import { BackendHealthResult, checkBackendHealth, resetApiCache } from '../lib/apiClient';
import { ToastContext } from '../context/ToastContext';

export function BackendConnectionChecker() {
  const { showToast } = useContext(ToastContext);
  const [health, setHealth] = useState<BackendHealthResult | null>(null);
  const [isChecking, setIsChecking] = useState<boolean>(true);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);

  const hasWarnedRef = useRef<boolean>(false);
  const wasOfflineRef = useRef<boolean>(false);

  const runCheck = useCallback(async (manual: boolean = false) => {
    setIsChecking(true);
    if (manual) {
      resetApiCache();
    }
    const result = await checkBackendHealth(3500);
    setHealth(result);
    setIsChecking(false);

    if (!result.online) {
      wasOfflineRef.current = true;
      if (!hasWarnedRef.current || manual) {
        hasWarnedRef.current = true;
        showToast(
          'warning',
          'Servidor Backend Indisponível',
          'O serviço Node.js local não respondeu na inicialização. Verifique se o servidor está ativo na porta 3000.'
        );
      }
    } else {
      if (wasOfflineRef.current) {
        wasOfflineRef.current = false;
        hasWarnedRef.current = false;
        setIsMinimized(false);
        showToast(
          'success',
          'Servidor Backend Conectado',
          `Comunicação com o Node.js restabelecida (${result.latencyMs}ms).`
        );
      }
    }
  }, [showToast]);

  // Verificação imediata na inicialização do aplicativo
  useEffect(() => {
    void runCheck(false);

    const handleOnline = () => {
      void runCheck(true);
    };
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [runCheck]);

  // Revalidação periódica leve enquanto o servidor estiver inacessível
  useEffect(() => {
    if (!health || health.online) return;
    const retryInterval = setInterval(() => {
      void runCheck(false);
    }, 15000);
    return () => clearInterval(retryInterval);
  }, [health, runCheck]);

  // Quando estiver online ou ainda na checagem inicial silenciosa, não exibe alerta
  if (!health || health.online) {
    return null;
  }

  if (isMinimized) {
    return (
      <div className="fixed bottom-4 left-4 z-50 print:hidden">
        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold shadow-lg transition-colors cursor-pointer whitespace-nowrap"
          role="alert"
        >
          <ServerOff className="w-4 h-4 shrink-0" />
          <span>Backend Node.js Offline</span>
          <span className="text-rose-200 font-normal">· Detalhes</span>
        </button>
      </div>
    );
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed top-0 inset-x-0 z-50 px-3 sm:px-6 pt-3 pointer-events-none print:hidden"
    >
      <div className="max-w-5xl mx-auto pointer-events-auto bg-white border border-rose-300 rounded-xl shadow-lg px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-700 shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <h3 className="text-sm font-bold text-slate-900">
                Servidor backend local não está respondendo
              </h3>
              <span className="text-xs font-medium text-rose-700">
                Porta 3000 inacessível
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-0.5 truncate" title={health.error}>
              {health.error || 'Verifique se o serviço Node.js está em execução e se o proxy local em /api está acessível.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
          <button
            type="button"
            onClick={() => void runCheck(true)}
            disabled={isChecking}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-rose-700 hover:bg-rose-800 disabled:opacity-60 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
            <span>{isChecking ? 'Verificando...' : 'Testar Conexão'}</span>
          </button>
          <button
            type="button"
            onClick={() => setIsMinimized(true)}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Minimizar aviso"
            aria-label="Minimizar aviso de conexão"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
