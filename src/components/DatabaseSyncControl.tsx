import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Database,
  CloudUpload,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Server,
  HardDrive,
  ArrowRight,
  Wifi,
  WifiOff,
  X,
  ShieldCheck,
  FileCheck
} from 'lucide-react';
import { useAuditData } from '../context/AuditContext';
import { syncLocalToMysql } from '../lib/apiClient';

interface SyncResult {
  success: boolean;
  message: string;
  syncedTables?: string[];
  totalRecords?: number;
  totalTables?: number;
  timestamp?: string;
  error?: string;
}

export function DatabaseSyncControl({ compact = false }: { compact?: boolean }) {
  const { dbConnected, pushLocalToServer, pullServerToLocal, reconnect, pendingQueue } = useAuditData();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [actionStep, setActionStep] = useState<string>('');
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);
  const [mysqlEnabled, setMysqlEnabled] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/db/config')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setMysqlEnabled(Boolean(data.enabled && data.connected));
      })
      .catch(() => {});
  }, [isOpen]);

  // Sincroniza pendências locais do navegador com o Banco Nativo Node.js (e MySQL se estiver ativo)
  const handleFullSync = async () => {
    setIsLoading(true);
    setLastResult(null);
    setActionStep('Verificando comunicação com o servidor...');

    try {
      await reconnect();

      setActionStep('Enviando alterações pendentes para o banco do servidor...');
      const pushed = await pushLocalToServer();

      if (mysqlEnabled) {
        setActionStep('Replicando dados para o MySQL configurado...');
        await syncLocalToMysql();
      }

      setActionStep('Atualizando cache local com os dados mais recentes...');
      const pulled = await pullServerToLocal();

      const ok = pushed || pulled;
      setLastResult({
        success: ok,
        message: ok
          ? 'Dados sincronizados com sucesso entre o navegador e o banco do servidor!'
          : 'Não foi possível completar a sincronização com o servidor.',
        syncedTables: ['setores', 'leitos', 'auditorias', 'perguntas', 'usuarios', 'cargos', 'permissoes', 'logs'],
        timestamp: new Date().toLocaleTimeString('pt-BR')
      });
    } catch (err: any) {
      setLastResult({
        success: false,
        message: 'Ocorreu um erro durante a sincronização.',
        error: err.message || String(err),
        timestamp: new Date().toLocaleTimeString('pt-BR')
      });
    } finally {
      setActionStep('');
      setIsLoading(false);
    }
  };

  // Puxar dados atualizados do servidor para a tela
  const handlePullToLocal = async () => {
    setIsLoading(true);
    setLastResult(null);
    setActionStep('Buscando dados atualizados no servidor...');
    try {
      const success = await pullServerToLocal();
      setLastResult({
        success,
        message: success
          ? 'Dados atualizados com sucesso a partir do servidor!'
          : 'Falha ao buscar dados atualizados do servidor.',
        timestamp: new Date().toLocaleTimeString('pt-BR')
      });
    } catch (err: any) {
      setLastResult({
        success: false,
        message: 'Erro ao atualizar dados.',
        error: err.message,
        timestamp: new Date().toLocaleTimeString('pt-BR')
      });
    } finally {
      setIsLoading(false);
      setActionStep('');
    }
  };

  const renderModal = () => {
    if (!isOpen || typeof document === 'undefined') return null;

    return createPortal(
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-xs animate-in fade-in duration-150"
        onClick={() => !isLoading && setIsOpen(false)}
      >
        <div
          className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-5 py-4 bg-[#071A26] text-white flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 bg-sky-500/20 text-sky-300 rounded-xl border border-sky-400/30 shrink-0">
                <Database size={19} />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold tracking-tight truncate">
                  Sincronização com o Banco de Dados
                </h3>
                <p className="text-[11px] text-sky-200/80 truncate">
                  {mysqlEnabled ? 'Banco Nativo Node.js + MySQL Ativo' : 'Banco Nativo Integrado (Node.js)'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              disabled={isLoading}
              aria-label="Fechar janela"
              className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 transition cursor-pointer shrink-0 disabled:opacity-50"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-4 overflow-y-auto">
            {/* Status atual */}
            <div className="flex items-center justify-between gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="flex items-center gap-2.5 min-w-0">
                {dbConnected ? (
                  <Wifi size={18} className="text-emerald-600 shrink-0" />
                ) : (
                  <WifiOff size={18} className="text-rose-500 shrink-0" />
                )}
                <div className="min-w-0">
                  <span className="text-xs font-bold text-slate-700 block">
                    Status do Banco de Dados
                  </span>
                  <span className={`text-[11px] font-bold ${dbConnected ? 'text-emerald-700' : 'text-rose-600'}`}>
                    {dbConnected
                      ? 'Conectado e operando normalmente'
                      : 'Sem resposta momentânea do servidor'}
                  </span>
                </div>
              </div>
              <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border shrink-0 ${
                pendingQueue.length > 0
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}>
                {pendingQueue.length > 0 ? `${pendingQueue.length} pendente(s)` : 'Em dia'}
              </span>
            </div>

            {/* Ação Principal */}
            <div className="p-4 bg-sky-50/60 border border-sky-200 rounded-2xl space-y-3">
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-sky-600 text-white rounded-xl shadow-xs shrink-0 mt-0.5">
                  <CloudUpload size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    Sincronizar Dados do Aparelho com o Servidor
                  </h4>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Os salvamentos já ocorrem automaticamente ao gravar cada auditoria. Use este botão para forçar o envio imediato de pendências locais (caso tenha ficado offline) e atualizar todos os registros da tela com o banco do servidor.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleFullSync}
                disabled={isLoading}
                className="w-full py-2.5 px-4 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <RefreshCw size={15} className="animate-spin text-white" />
                    <span>{actionStep || 'Sincronizando...'}</span>
                  </>
                ) : (
                  <>
                    <CloudUpload size={15} />
                    <span>Sincronizar Agora</span>
                  </>
                )}
              </button>

              <div className="flex items-center justify-center gap-2 text-[11px] font-semibold text-slate-500 pt-0.5">
                <span className="flex items-center gap-1 text-slate-700">
                  <HardDrive size={12} className="text-sky-600" /> Navegador
                </span>
                <ArrowRight size={12} className="text-slate-400" />
                <span className="flex items-center gap-1 text-slate-700">
                  <Server size={12} className="text-emerald-600" /> Banco Node.js
                </span>
                <ArrowRight size={12} className="text-slate-400" />
                <span className="flex items-center gap-1 text-slate-700">
                  <ShieldCheck size={12} className="text-sky-700" /> Atualizado
                </span>
              </div>
            </div>

            {/* Ação secundária */}
            <div className="flex items-center justify-between gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="min-w-0">
                <span className="text-xs font-bold text-slate-800 block">
                  Recarregar Dados do Servidor
                </span>
                <span className="text-[11px] text-slate-500 block">
                  Busca auditorias e cadastros atualizados por outros usuários.
                </span>
              </div>
              <button
                type="button"
                onClick={handlePullToLocal}
                disabled={isLoading}
                className="px-3 py-2 text-xs font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shrink-0 whitespace-nowrap"
              >
                <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
                <span>Atualizar</span>
              </button>
            </div>

            {/* Feedback */}
            {lastResult && (
              <div className={`p-3.5 rounded-xl border ${
                lastResult.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}>
                <div className="flex items-start gap-2.5">
                  {lastResult.success ? (
                    <CheckCircle2 size={17} className="text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle size={17} className="text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold">{lastResult.message}</p>
                    {lastResult.error && (
                      <p className="text-[11px] text-rose-700 font-mono mt-1 bg-white/70 p-2 rounded border border-rose-200">
                        {lastResult.error}
                      </p>
                    )}
                    {lastResult.syncedTables && lastResult.syncedTables.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-emerald-200/70">
                        <span className="text-[10px] font-bold uppercase text-emerald-800 tracking-wider flex items-center gap-1 mb-1">
                          <FileCheck size={12} /> Bases verificadas:
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {lastResult.syncedTables.map((tbl) => (
                            <span key={tbl} className="text-[10px] bg-white px-2 py-0.5 rounded border border-emerald-200 font-medium text-slate-700">
                              {tbl}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <span className="text-[10px] text-slate-500 block mt-1.5">
                      Horário: {lastResult.timestamp}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              disabled={isLoading}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-xl transition cursor-pointer disabled:opacity-50"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  if (compact) {
    return (
      <>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all shadow-2xs border cursor-pointer ${
            dbConnected
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
              : 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100 animate-pulse'
          }`}
          title="Sincronizar dados com o banco do servidor"
        >
          <Database size={13} className={isLoading ? 'animate-spin text-sky-600' : (dbConnected ? 'text-emerald-600' : 'text-amber-600')} />
          <span className="hidden sm:inline">
            {dbConnected ? 'Banco Ativo' : 'Reconectar'}
          </span>
          <span className="text-[10px] font-extrabold px-1 rounded bg-white/70 border border-current">
            Sync
          </span>
        </button>

        {renderModal()}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-sky-600 text-xs font-bold transition-all duration-200 cursor-pointer shadow-xs bg-sky-600 hover:bg-sky-700 text-white whitespace-nowrap"
        title="Sincronizar dados com o banco do servidor"
      >
        <CloudUpload size={15} className={isLoading ? 'animate-bounce' : ''} />
        <span className="hidden sm:inline">Sincronizar Banco</span>
        <span className={`w-2 h-2 rounded-full shrink-0 ${dbConnected ? 'bg-emerald-300' : 'bg-amber-300 animate-ping'}`} />
      </button>

      {renderModal()}
    </>
  );
}
