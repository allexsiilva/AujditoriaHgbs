import React, { useEffect, useState, useCallback } from 'react';
import { getDbStatus, getSqlErrors, clearSqlErrors, syncLocalToMysql, reconnectMysql, SqlErrorLogItem } from '../lib/apiClient';
import { subscribeToSqlErrors } from '../lib/socketClient';
import { 
  Database, 
  Activity, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  RefreshCw, 
  Server, 
  HardDrive, 
  Zap, 
  Wifi, 
  WifiOff,
  Bug,
  Trash2,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  Search,
  FileSpreadsheet,
  UploadCloud,
  CheckCircle,
  HelpCircle,
  ArrowRight
} from 'lucide-react';

interface SystemStatusCardProps {
  onRefreshCompleted?: () => void;
}

export function SystemStatusCard({ onRefreshCompleted }: SystemStatusCardProps) {
  const [status, setStatus] = useState<{
    loading: boolean;
    online: boolean;
    mysqlConnected: boolean;
    host: string;
    port: string;
    database: string;
    user: string;
    pingMessage: string;
    uptimeFormatted: string;
    uptimeSeconds: number;
    syncMode: string;
    lastCheck: string;
  }>({
    loading: true,
    online: false,
    mysqlConnected: false,
    host: '127.0.0.1',
    port: '3306',
    database: 'hospaudit',
    user: 'root',
    pingMessage: 'Verificando conectividade...',
    uptimeFormatted: '--:--:--',
    uptimeSeconds: 0,
    syncMode: 'ANALISANDO',
    lastCheck: ''
  });

  const [sqlErrors, setSqlErrors] = useState<SqlErrorLogItem[]>([]);
  const [showSqlLogs, setShowSqlLogs] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [syncingLocal, setSyncingLocal] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    success: boolean;
    message: string;
    details?: { totalTables: number; totalRecords: number; syncedTables: string[] };
  } | null>(null);

  const handleReconnectMysql = async () => {
    setReconnecting(true);
    setSyncResult(null);
    try {
      const res = await reconnectMysql();
      await fetchSystemStatus();
      setSyncResult({
        success: res.success,
        message: res.message
      });
    } catch (e: any) {
      setSyncResult({
        success: false,
        message: e.message || 'Erro ao tentar reconectar com o MySQL do XAMPP.'
      });
    } finally {
      setReconnecting(false);
    }
  };

  const handleSyncLocalToMysql = async () => {
    setSyncingLocal(true);
    setSyncResult(null);
    try {
      const res = await syncLocalToMysql();
      setSyncResult(res);
      await fetchSystemStatus();
    } catch (e: any) {
      setSyncResult({
        success: false,
        message: e.message || 'Erro inesperado ao sincronizar arquivos locais com o MySQL.'
      });
    } finally {
      setSyncingLocal(false);
    }
  };

  const fetchSystemStatus = useCallback(async () => {
    setRefreshing(true);
    try {
      const [data, errorsData] = await Promise.all([
        getDbStatus(),
        getSqlErrors()
      ]);
      
      const nowTime = new Date().toLocaleTimeString('pt-BR');
      setSqlErrors(errorsData || []);
      
      if (data && data.success) {
        setStatus({
          loading: false,
          online: true,
          mysqlConnected: !!data.isUsingPostgres,
          host: data.connectionDetails?.host || '127.0.0.1',
          port: data.connectionDetails?.port || '3306',
          database: data.connectionDetails?.name || 'hospaudit',
          user: data.connectionDetails?.user || 'root',
          pingMessage: data.ping?.message || 'Conexão ativa.',
          uptimeFormatted: data.uptimeFormatted || 'Online',
          uptimeSeconds: data.uptimeSeconds || 0,
          syncMode: data.syncMode || (data.isUsingPostgres ? 'MYSQL_RELATIONAL' : 'LOCAL_JSON'),
          lastCheck: nowTime
        });
      } else {
        setStatus(prev => ({
          ...prev,
          loading: false,
          online: false,
          mysqlConnected: false,
          pingMessage: 'Servidor API offline ou indisponível.',
          lastCheck: nowTime
        }));
      }
    } catch (err) {
      setStatus(prev => ({
        ...prev,
        loading: false,
        online: false,
        mysqlConnected: false,
        pingMessage: 'Erro de conexão de rede.',
        lastCheck: new Date().toLocaleTimeString('pt-BR')
      }));
    } finally {
      setRefreshing(false);
      if (onRefreshCompleted) onRefreshCompleted();
    }
  }, [onRefreshCompleted]);

  const handleClearSqlErrors = async () => {
    const success = await clearSqlErrors();
    if (success) {
      setSqlErrors([]);
    }
  };

  useEffect(() => {
    fetchSystemStatus();
    // Real-time polling every 10 seconds
    const interval = setInterval(() => {
      fetchSystemStatus();
    }, 10000);

    // Subscribe to instant Socket.IO SQL Error broadcasts
    const unsubscribe = subscribeToSqlErrors((newError) => {
      setSqlErrors(prev => [newError, ...prev].slice(0, 50));
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [fetchSystemStatus]);

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs transition-all hover:shadow-sm" id="system-status-card">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl ${status.mysqlConnected ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'} shrink-0`}>
            <Database size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900">Status do Sistema e Banco de Dados</h3>
              <span className="flex h-2 w-2 relative">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${status.mysqlConnected ? 'bg-emerald-400' : 'bg-amber-400'} opacity-75`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${status.mysqlConnected ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
              </span>
            </div>
            <p className="text-xs text-slate-500">Sincronização em tempo real com MySQL (XAMPP)</p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {sqlErrors.length > 0 && (
            <button
              onClick={() => setShowSqlLogs(!showSqlLogs)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg transition cursor-pointer"
              title="Ver alertas do Interceptador SQL"
            >
              <Bug size={14} className="animate-bounce text-rose-600" />
              <span>{sqlErrors.length} {sqlErrors.length === 1 ? 'Erro SQL' : 'Erros SQL'}</span>
              {showSqlLogs ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          )}

          <span className="text-[11px] text-slate-400 font-mono hidden md:inline">
            Última verificação: {status.lastCheck || '--:--'}
          </span>
          <button
            onClick={fetchSystemStatus}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition disabled:opacity-50 cursor-pointer"
            title="Atualizar conexão com o MySQL agora"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin text-blue-600' : ''} />
            <span>{refreshing ? 'Verificando...' : 'Sincronizar Agora'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
        {/* Metric 1: Banco MySQL (XAMPP) */}
        <div className="bg-slate-50/80 border border-slate-100 rounded-xl p-3.5 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span className="flex items-center gap-1.5">
              <HardDrive size={14} className="text-slate-400" />
              Banco MySQL (XAMPP)
            </span>
            {status.mysqlConnected ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800">
                <CheckCircle2 size={11} /> ATIVO
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800">
                <AlertTriangle size={11} /> LOCAL JSON
              </span>
            )}
          </div>
          <div className="text-sm font-bold text-slate-900 truncate font-mono">
            {status.host}:{status.port} / {status.database}
          </div>
          <div className="text-[11px] text-slate-500 truncate" title={status.pingMessage}>
            {status.mysqlConnected ? 'Conectado em tempo real' : 'XAMPP offline (JSON Local)'}
          </div>
        </div>

        {/* Metric 2: Servidor e Porta */}
        <div className="bg-slate-50/80 border border-slate-100 rounded-xl p-3.5 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span className="flex items-center gap-1.5">
              <Server size={14} className="text-slate-400" />
              Servidor Node.js
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800">
              PORTA 3000
            </span>
          </div>
          <div className="text-sm font-bold text-slate-900 truncate font-mono">
            http://localhost:3000
          </div>
          <div className="text-[11px] text-slate-500">
            API REST & WebSockets Prontos
          </div>
        </div>

        {/* Metric 3: Tempo de Atividade (Uptime) */}
        <div className="bg-slate-50/80 border border-slate-100 rounded-xl p-3.5 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span className="flex items-center gap-1.5">
              <Clock size={14} className="text-slate-400" />
              Tempo de Atividade (Uptime)
            </span>
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
              ONLINE
            </span>
          </div>
          <div className="text-sm font-bold text-slate-900 font-mono tracking-tight">
            {status.uptimeFormatted}
          </div>
          <div className="text-[11px] text-slate-500">
            Serviço estável sem interrupções
          </div>
        </div>

        {/* Metric 4: Sincronização e Modo */}
        <div className="bg-slate-50/80 border border-slate-100 rounded-xl p-3.5 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span className="flex items-center gap-1.5">
              <Zap size={14} className="text-slate-400" />
              Modo de Sincronia
            </span>
            {status.mysqlConnected ? (
              <span className="text-[10px] font-extrabold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                POOL MYSQL
              </span>
            ) : (
              <span className="text-[10px] font-extrabold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                CACHE LOCAL
              </span>
            )}
          </div>
          <div className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
            {status.mysqlConnected ? (
              <>
                <Wifi size={14} className="text-emerald-500" />
                <span className="text-emerald-700 font-semibold text-xs">Tempo Real (MySQL Pool)</span>
              </>
            ) : (
              <>
                <WifiOff size={14} className="text-amber-500" />
                <span className="text-amber-700 font-semibold text-xs">Fallback Local Ativo</span>
              </>
            )}
          </div>
          <div className="text-[11px] text-slate-500">
            {status.mysqlConnected ? 'Persistência no banco MySQL' : 'Inicie o MySQL no XAMPP'}
          </div>
        </div>
      </div>

      {/* PAINEL DE SINCRONIZAÇÃO MYSQL & XAMPP */}
      <div className="mt-4 border-t border-slate-100 pt-4">
        <div className={`border rounded-2xl p-4 transition-all ${
          status.mysqlConnected 
            ? 'bg-gradient-to-r from-emerald-50/70 via-teal-50/50 to-blue-50/50 border-emerald-200/80' 
            : 'bg-gradient-to-r from-amber-50/70 via-orange-50/50 to-rose-50/50 border-amber-200/80'
        }`}>
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className={`p-3 rounded-xl shadow-xs shrink-0 text-white ${
                status.mysqlConnected ? 'bg-emerald-600' : 'bg-amber-600'
              }`}>
                <Database size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm font-bold text-slate-900">
                    {status.mysqlConnected ? 'Sincronização Ativa com MySQL (XAMPP)' : 'MySQL (XAMPP) Desconectado — Modo Arquivos Locais'}
                  </h4>
                  <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                    status.mysqlConnected ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {status.mysqlConnected ? 'Banco Online 3306' : 'Ação Necessária no XAMPP'}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  {status.mysqlConnected 
                    ? `Conexão ativa em ${status.host}:${status.port} (base "${status.database}"). Você pode sincronizar ou atualizar as tabelas do MySQL a qualquer momento com os arquivos locais.` 
                    : 'O Node.js não conseguiu conectar à porta 3306. O sistema salvou seus dados nos arquivos locais (data/*.json) como garantia de segurança.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full lg:w-auto flex-wrap sm:flex-nowrap">
              <button
                type="button"
                onClick={handleReconnectMysql}
                disabled={reconnecting || syncingLocal}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-bold bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-xl shadow-xs transition disabled:opacity-50 cursor-pointer"
                title="Tenta restabelecer a conexão com o MySQL na porta 3306"
              >
                <RefreshCw size={14} className={reconnecting ? 'animate-spin text-blue-600' : ''} />
                <span>{reconnecting ? 'Testando Conexão...' : 'Testar / Reconectar'}</span>
              </button>

              <button
                type="button"
                onClick={handleSyncLocalToMysql}
                disabled={syncingLocal || reconnecting}
                className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold text-white rounded-xl shadow-xs transition disabled:opacity-50 cursor-pointer ${
                  status.mysqlConnected
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-amber-600 hover:bg-amber-700'
                }`}
                title="Envia todos os dados dos arquivos locais JSON (data/*.json) diretamente para o banco MySQL do XAMPP"
              >
                <UploadCloud size={14} className={syncingLocal ? 'animate-pulse' : ''} />
                <span>{syncingLocal ? 'Enviando ao MySQL...' : 'Enviar Dados Locais para o MySQL'}</span>
              </button>
            </div>
          </div>

          {/* GUIA PASSO A PASSO QUANDO ESTIVER DESCONECTADO */}
          {!status.mysqlConnected && (
            <div className="mt-4 pt-3 border-t border-amber-200/60 bg-amber-100/40 p-3.5 rounded-xl text-xs text-amber-950 space-y-2">
              <div className="flex items-center gap-1.5 font-bold text-amber-900">
                <HelpCircle size={15} className="shrink-0 text-amber-700" />
                <span>Como resolver a conexão com o XAMPP no VS Code (3 passos rápidos):</span>
              </div>
              <ol className="list-decimal list-inside space-y-1 text-slate-700 text-[11px] leading-relaxed">
                <li>
                  <strong className="text-slate-900">Inicie o MySQL:</strong> Abra o <strong>XAMPP Control Panel</strong> no seu computador e clique no botão <strong>Start</strong> ao lado de <em>MySQL</em> (a porta 3306 deve ficar verde).
                </li>
                <li>
                  <strong className="text-slate-900">Verifique o arquivo .env:</strong> Certifique-se de que o <code className="bg-white/80 px-1 py-0.5 rounded font-mono text-[10px]">DB_HOST="127.0.0.1"</code> e <code className="bg-white/80 px-1 py-0.5 rounded font-mono text-[10px]">DB_PASSWORD=""</code> (vazia por padrão no XAMPP).
                </li>
                <li>
                  <strong className="text-slate-900">Envie os dados:</strong> Clique no botão verde <strong>"Enviar Dados Locais para o MySQL"</strong> acima. Ele criará o banco <em>hospaudit</em> e todas as tabelas com seus dados automaticamente!
                </li>
              </ol>
            </div>
          )}

          {/* MENSAGEM DE RESULTADO DA SINCRONIZAÇÃO */}
          {syncResult && (
            <div className={`mt-3 p-3 rounded-xl border text-xs font-medium animate-in fade-in duration-200 ${
              syncResult.success 
                ? 'bg-emerald-100/70 border-emerald-300 text-emerald-950' 
                : 'bg-rose-100/70 border-rose-300 text-rose-950'
            }`}>
              <div className="flex items-center justify-between font-bold mb-1">
                <div className="flex items-center gap-1.5">
                  {syncResult.success ? (
                    <CheckCircle size={16} className="text-emerald-700" />
                  ) : (
                    <AlertTriangle size={16} className="text-rose-700" />
                  )}
                  <span>{syncResult.success ? 'Sincronização Realizada com Sucesso!' : 'Aviso na Conexão / Sincronização'}</span>
                </div>
                {syncResult.details && (
                  <span className="bg-emerald-200/80 text-emerald-900 px-2 py-0.5 rounded font-mono text-[11px]">
                    {syncResult.details.totalTables} Tabelas • {syncResult.details.totalRecords} Registros
                  </span>
                )}
              </div>
              <p className="text-[11px] leading-relaxed">{syncResult.message}</p>
            </div>
          )}
        </div>
      </div>

      {/* PAINEL DO INTERCEPTADOR DE ERROS SQL */}
      {showSqlLogs && sqlErrors.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ShieldAlert size={16} className="text-rose-600" />
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Interceptador de Erros de SQL & Conexão ({sqlErrors.length})
              </h4>
            </div>
            <button
              onClick={handleClearSqlErrors}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:text-rose-700 hover:bg-rose-50 rounded transition cursor-pointer"
            >
              <Trash2 size={12} />
              <span>Limpar Registros</span>
            </button>
          </div>

          <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
            {sqlErrors.map((err) => (
              <div key={err.id} className="bg-rose-50/60 border border-rose-200/80 rounded-xl p-3 text-xs space-y-1">
                <div className="flex items-center justify-between font-mono font-bold text-rose-900">
                  <span className="bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded text-[10px]">
                    Tabela/Contexto: {err.context}
                  </span>
                  <span className="text-[10px] text-rose-600">{err.timestamp} • Código: {err.code}</span>
                </div>
                <p className="font-semibold text-rose-950">
                  💡 {err.friendlyMessage}
                </p>
                <div className="bg-slate-900 text-slate-200 p-2 rounded font-mono text-[11px] overflow-x-auto whitespace-pre-wrap select-all">
                  {err.query || err.message}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
