import React, { useState, useEffect } from 'react';
import { 
  Database, 
  Server, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Save, 
  Play, 
  Upload, 
  Info, 
  ShieldCheck, 
  HardDrive, 
  Eye, 
  EyeOff, 
  HelpCircle, 
  Cpu, 
  Wifi, 
  WifiOff, 
  ExternalLink,
  ChevronRight,
  ArrowRight,
  Sparkles,
  Layers,
  FileCheck,
  History,
  Terminal,
  FolderSync,
  Clock,
  Timer,
  Zap,
  Check,
  RotateCcw
} from 'lucide-react';
import { useAuditData } from '../context/AuditContext';
import { UnifiedBackupField } from './UnifiedBackupField';
import { NodeDbMigrationManager } from './NodeDbMigrationManager';
import { 
  testDbConfig, 
  saveDbConfig, 
  getDbConfig, 
  syncLocalToMysql, 
  reconnectMysql,
  runSafeDatabaseMigration,
  getAutoSyncStatus,
  updateAutoSyncConfig,
  triggerAutoSyncNow
} from '../lib/apiClient';

interface DbConfigState {
  host: string;
  port: number | string;
  user: string;
  password: string;
  database: string;
  enabled: boolean;
}

interface DatabaseConfigManagerProps {
  onViewTables?: () => void;
}

export function DatabaseConfigManager({ onViewTables }: DatabaseConfigManagerProps = {}) {
  const { dbConnected, pullServerToLocal } = useAuditData();

  const [subTab, setSubTab] = useState<'mysql' | 'native' | 'sync' | 'help'>('mysql');

  // Form states
  const [form, setForm] = useState<DbConfigState>({
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: '',
    database: 'hospaudit',
    enabled: true
  });

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [showUpdateGuide, setShowUpdateGuide] = useState(false);
  const [migrationResult, setMigrationResult] = useState<{
    success: boolean;
    message: string;
    tablesCreated?: string[];
    columnsAdded?: string[];
    totalTablesChecked?: number;
    backupSnapshot?: string;
  } | null>(null);

  // Auto-sync (5 minutos) states
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [autoSyncIntervalMinutes, setAutoSyncIntervalMinutes] = useState(5);
  const [nextSyncTimestamp, setNextSyncTimestamp] = useState<number>(Date.now() + 5 * 60 * 1000);
  const [lastAutoSyncTime, setLastAutoSyncTime] = useState<string | null>(null);
  const [lastAutoSyncMessage, setLastAutoSyncMessage] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(300);
  const [autoSyncLoading, setAutoSyncLoading] = useState(false);
  const [manualSyncingNow, setManualSyncingNow] = useState(false);

  // Status and feedback
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    version?: string;
    latencyMs?: number;
    rawError?: string;
  } | null>(null);

  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  const [serverInfo, setServerInfo] = useState<{
    connected: boolean;
    host: string;
    port: number;
    user: string;
    database: string;
    syncMode: string;
    message: string;
  } | null>(null);

  // Load current configuration from server
  const loadConfig = async () => {
    setLoading(true);
    try {
      const data = await getDbConfig();
      if (data) {
        setForm(prev => ({
          ...prev,
          host: data.host || '127.0.0.1',
          port: data.port || 3306,
          user: data.user || 'root',
          database: data.database || 'hospaudit',
          enabled: data.enabled !== false
        }));
        setServerInfo({
          connected: data.connected,
          host: data.host,
          port: data.port,
          user: data.user,
          database: data.database,
          syncMode: data.syncMode,
          message: data.message
        });
      }
    } catch (err: any) {
      console.warn('Erro ao carregar dados do banco:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
    fetchAutoSyncStatus();
  }, []);

  // Fetch initial auto-sync status
  const fetchAutoSyncStatus = async () => {
    try {
      const status = await getAutoSyncStatus();
      if (status) {
        setAutoSyncEnabled(status.enabled !== false);
        setAutoSyncIntervalMinutes(status.intervalMinutes || 5);
        if (status.nextSyncTimestamp) {
          setNextSyncTimestamp(status.nextSyncTimestamp);
          const diff = Math.max(0, Math.floor((status.nextSyncTimestamp - Date.now()) / 1000));
          setSecondsRemaining(diff);
        }
        if (status.lastSyncTimestamp) {
          setLastAutoSyncTime(status.lastSyncTimestamp);
        }
        if (status.lastStatus?.message) {
          setLastAutoSyncMessage(status.lastStatus.message);
        }
      }
    } catch (e) {
      console.warn('Erro ao carregar status do auto-sync:', e);
    }
  };

  const isMysqlConnected = Boolean(serverInfo?.connected);

  // Refresh config when switching sub-tabs
  useEffect(() => {
    loadConfig();
  }, [subTab]);

  // Countdown timer loop for auto-sync (only when MySQL is actually connected)
  useEffect(() => {
    if (!autoSyncEnabled || !isMysqlConnected) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((nextSyncTimestamp - now) / 1000));
      setSecondsRemaining(diff);

      if (diff === 0 && !manualSyncingNow) {
        handleImmediateSync(true);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [autoSyncEnabled, isMysqlConnected, nextSyncTimestamp, manualSyncingNow]);

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleToggleAutoSync = async (newEnabled: boolean) => {
    setAutoSyncLoading(true);
    setAutoSyncEnabled(newEnabled);
    try {
      const res = await updateAutoSyncConfig({
        enabled: newEnabled,
        intervalMinutes: autoSyncIntervalMinutes
      });
      if (res.success && res.nextSyncTimestamp) {
        setNextSyncTimestamp(res.nextSyncTimestamp);
        setSecondsRemaining(autoSyncIntervalMinutes * 60);
      }
      setFeedback({
        type: newEnabled ? 'success' : 'info',
        text: res.message || (newEnabled ? 'Envio automático ativado!' : 'Envio automático pausado.')
      });
    } catch (e: any) {
      setFeedback({ type: 'error', text: 'Falha ao atualizar configuração de envio automático.' });
    } finally {
      setAutoSyncLoading(false);
    }
  };

  const handleChangeInterval = async (minutes: number) => {
    setAutoSyncIntervalMinutes(minutes);
    setAutoSyncLoading(true);
    try {
      const res = await updateAutoSyncConfig({
        enabled: autoSyncEnabled,
        intervalMinutes: minutes
      });
      if (res.success && res.nextSyncTimestamp) {
        setNextSyncTimestamp(res.nextSyncTimestamp);
        setSecondsRemaining(minutes * 60);
      }
      setFeedback({
        type: 'success',
        text: `Intervalo de envio automático atualizado para ${minutes} minutos!`
      });
    } catch (e: any) {
      setFeedback({ type: 'error', text: 'Erro ao alterar intervalo.' });
    } finally {
      setAutoSyncLoading(false);
    }
  };

  const handleImmediateSync = async (isFromTimer: boolean = false) => {
    setManualSyncingNow(true);
    try {
      const res = await triggerAutoSyncNow();
      if (res.success) {
        const now = new Date();
        setLastAutoSyncTime(now.toISOString());
        setLastAutoSyncMessage(res.message);
        const nextTs = Date.now() + autoSyncIntervalMinutes * 60 * 1000;
        setNextSyncTimestamp(nextTs);
        setSecondsRemaining(autoSyncIntervalMinutes * 60);
        await pullServerToLocal();
        if (!isFromTimer) {
          setFeedback({
            type: 'success',
            text: res.message || 'Dados locais enviados e sincronizados com sucesso no banco MySQL!'
          });
        }
      } else {
        if (!isFromTimer) {
          setFeedback({
            type: 'error',
            text: res.message || 'Falha ao sincronizar dados locais com o banco MySQL.'
          });
        }
      }
    } catch (e: any) {
      if (!isFromTimer) {
        setFeedback({
          type: 'error',
          text: 'Erro ao enviar dados locais para o banco MySQL.'
        });
      }
    } finally {
      setManualSyncingNow(false);
    }
  };

  // Quick preset: XAMPP default
  const handleApplyXamppDefaults = () => {
    setForm({
      host: '127.0.0.1',
      port: 3306,
      user: 'root',
      password: '',
      database: 'hospaudit',
      enabled: true
    });
    setFeedback({
      type: 'info',
      text: 'Valores padrão do XAMPP aplicados (127.0.0.1:3306, usuário root, senha em branco).'
    });
  };

  // Test connection without saving
  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    setFeedback(null);
    try {
      const res = await testDbConfig({
        host: form.host,
        port: form.port,
        user: form.user,
        password: form.password,
        name: form.database,
        database: form.database
      });
      setTestResult(res);
      if (res.success) {
        setFeedback({
          type: 'success',
          text: res.message || 'Conexão testada com sucesso! O MySQL do XAMPP está pronto.'
        });
      } else {
        setFeedback({
          type: 'error',
          text: res.message || 'Falha ao conectar ao MySQL.'
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Erro inesperado ao testar conexão.'
      });
      setFeedback({
        type: 'error',
        text: 'Erro ao conectar ao servidor para teste.'
      });
    } finally {
      setTesting(false);
    }
  };

  // Save configuration and connect
  const handleSaveAndConnect = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    setFeedback(null);
    try {
      const res = await saveDbConfig({
        host: form.host,
        port: form.port,
        user: form.user,
        password: form.password,
        name: form.database,
        database: form.database,
        enabled: form.enabled
      });

      if (res && res.success) {
        setFeedback({
          type: 'success',
          text: res.message || 'Configurações salvas e MySQL conectado com sucesso!'
        });
        await pullServerToLocal();
        await loadConfig();
      } else {
        setFeedback({
          type: 'error',
          text: res?.message || 'Configurações salvas. Para MySQL externo, verifique se o XAMPP está ativo.'
        });
        await loadConfig();
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err.message || 'Erro ao salvar configurações do banco de dados.'
      });
    } finally {
      setLoading(false);
    }
  };

  // Reconnect immediately
  const handleReconnect = async () => {
    setReconnecting(true);
    setFeedback(null);
    try {
      const res = await reconnectMysql();
      if (res.success) {
        setFeedback({
          type: 'success',
          text: res.message || 'Conexão restabelecida com sucesso!'
        });
        await pullServerToLocal();
      } else {
        setFeedback({
          type: 'error',
          text: res.message || 'Não foi possível conectar ao MySQL. Verifique o XAMPP.'
        });
      }
      await loadConfig();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err.message || 'Erro ao reconectar.'
      });
    } finally {
      setReconnecting(false);
    }
  };

  // Sync all local files to MySQL
  const handleSyncToMysql = async () => {
    setSyncing(true);
    setFeedback(null);
    try {
      const res = await syncLocalToMysql();
      if (res.success) {
        setFeedback({
          type: 'success',
          text: res.message || 'Todos os dados locais foram enviados e sincronizados com o banco MySQL!'
        });
        await pullServerToLocal();
      } else {
        setFeedback({
          type: 'error',
          text: res.message || 'Falha ao sincronizar com o MySQL.'
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err.message || 'Erro ao sincronizar dados locais para o MySQL.'
      });
    } finally {
      setSyncing(false);
    }
  };

  // Run non-destructive database schema migration
  const handleRunMigration = async () => {
    setMigrating(true);
    setMigrationResult(null);
    setFeedback(null);
    try {
      const res = await runSafeDatabaseMigration();
      setMigrationResult(res);
      if (res.success) {
        setFeedback({
          type: 'success',
          text: res.message || 'Estrutura do banco de dados verificada e migrada com sucesso!'
        });
        await pullServerToLocal();
        await loadConfig();
      } else {
        setFeedback({
          type: 'error',
          text: res.message || 'Falha ao executar a migração segura da estrutura.'
        });
      }
    } catch (err: any) {
      setMigrationResult({
        success: false,
        message: err.message || 'Erro durante a migração da estrutura do banco.'
      });
      setFeedback({
        type: 'error',
        text: 'Erro de comunicação ao executar migração da estrutura.'
      });
    } finally {
      setMigrating(false);
    }
  };

  return (
    <div className="space-y-4 text-slate-800">
      {/* COMPACT TOP STATUS & SEGMENTED NAVIGATION CARD */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3.5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
              isMysqlConnected
                ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                : 'bg-teal-50 border-teal-200 text-teal-600'
            }`}>
              <Database className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-extrabold text-slate-900 tracking-tight">
                  Conexão & Banco de Dados
                </h2>
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                  isMysqlConnected
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-teal-50 text-teal-700 border-teal-200'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isMysqlConnected ? 'bg-emerald-500' : 'bg-teal-500'}`} />
                  {isMysqlConnected ? 'MySQL (XAMPP) Conectado' : 'Banco Local Ativo (Node.js)'}
                </span>
                {autoSyncEnabled && isMysqlConnected && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-100 text-slate-600 border border-slate-200 tabular-nums">
                    <Clock size={11} className="text-sky-600" />
                    Auto-Sync {formatTimer(secondsRemaining)}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                {isMysqlConnected ? (
                  <>
                    MySQL: <strong className="font-mono text-slate-700">{serverInfo?.host || form.host}:{serverInfo?.port || form.port}</strong> • Base: <strong className="font-mono text-slate-700">{serverInfo?.database || form.database}</strong> • 14 tabelas mapeadas
                  </>
                ) : (
                  <>
                    Operando em armazenamento nativo (<strong className="font-mono text-slate-700">/data/*.json</strong>) • MySQL (XAMPP): <strong className="text-slate-700">{serverInfo?.enabled === false ? 'Desativado' : 'Desconectado'}</strong>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleReconnect}
              disabled={reconnecting}
              className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 border border-slate-200 cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <RefreshCw size={13} className={reconnecting ? 'animate-spin text-sky-600' : ''} />
              <span>{reconnecting ? 'Reconectando...' : 'Reconectar MySQL'}</span>
            </button>
            <button
              type="button"
              onClick={handleSyncToMysql}
              disabled={syncing || !isMysqlConnected}
              title={!isMysqlConnected ? 'Conecte ao MySQL (XAMPP) primeiro para enviar os dados locais' : 'Enviar dados locais para o MySQL'}
              className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              <Upload size={13} className={syncing ? 'animate-spin' : ''} />
              <span>{syncing ? 'Enviando...' : 'Enviar para MySQL'}</span>
            </button>
            {onViewTables && (
              <button
                type="button"
                onClick={onViewTables}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 border border-slate-200 cursor-pointer whitespace-nowrap"
              >
                <Layers size={13} />
                <span>Ver Tabelas</span>
              </button>
            )}
          </div>
        </div>

        {/* SUB-NAVIGATION TABS */}
        <div className="pt-2.5 border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto">
          <button
            type="button"
            onClick={() => setSubTab('mysql')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
              subTab === 'mysql'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
            }`}
          >
            <Server size={13} />
            <span>Parâmetros MySQL (XAMPP)</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('native')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
              subTab === 'native'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
            }`}
          >
            <Cpu size={13} />
            <span>Banco Local (Node.js) & JSON</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('sync')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
              subTab === 'sync'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
            }`}
          >
            <Clock size={13} />
            <span>Auto-Sync & Backup</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('help')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
              subTab === 'help'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
            }`}
          >
            <HelpCircle size={13} />
            <span>Guia XAMPP & Estrutura</span>
          </button>
        </div>
      </div>

      {/* GLOBAL FEEDBACK ALERT */}
      {feedback && (
        <div className={`px-4 py-3 rounded-xl border flex items-center gap-2.5 text-xs ${
          feedback.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
            : feedback.type === 'error'
            ? 'bg-rose-50 border-rose-200 text-rose-900'
            : 'bg-sky-50 border-sky-200 text-sky-900'
        }`}>
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : feedback.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          ) : (
            <Info className="w-4 h-4 text-sky-600 shrink-0" />
          )}
          <div className="flex-1">
            <strong className="mr-1">
              {feedback.type === 'success' ? 'Sucesso:' : feedback.type === 'error' ? 'Atenção:' : 'Informação:'}
            </strong>
            <span>{feedback.text}</span>
          </div>
        </div>
      )}

      {/* TAB 1: PARÂMETROS MYSQL (XAMPP) — ALIGNED 3-COLUMN FORM */}
      {subTab === 'mysql' && (
        <form onSubmit={handleSaveAndConnect} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex flex-wrap justify-between items-center gap-2">
            <div>
              <h3 className="font-bold text-sm text-slate-900">Parâmetros de Conexão MySQL (XAMPP)</h3>
              <p className="text-xs text-slate-500">Preencha os dados do servidor MySQL, teste a comunicação e salve.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleApplyXamppDefaults}
                className="text-xs font-semibold text-sky-700 bg-white hover:bg-sky-50 border border-sky-200 px-3 py-1.5 rounded-lg transition cursor-pointer whitespace-nowrap"
              >
                Preencher Padrão XAMPP
              </button>
            </div>
          </div>

          <div className="p-5 space-y-5">
            {/* UNIFORM 3-COLUMN ALIGNED GRID */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-4">
              
              {/* Host */}
              <div className="flex flex-col">
                <div className="h-6 flex items-center justify-between gap-2 mb-1">
                  <label className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">
                    Host / IP <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, host: '127.0.0.1' }))}
                      className="text-[10px] font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 px-1.5 py-0.5 rounded transition cursor-pointer"
                    >
                      127.0.0.1
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, host: 'localhost' }))}
                      className="text-[10px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200 px-1.5 py-0.5 rounded transition cursor-pointer"
                    >
                      localhost
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  required
                  value={form.host}
                  onChange={e => setForm({ ...form, host: e.target.value })}
                  placeholder="127.0.0.1"
                  className="h-10 w-full px-3 border border-slate-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 outline-none text-slate-800 font-semibold transition bg-slate-50/50 focus:bg-white"
                />
                <span className="text-[11px] text-slate-400 mt-1">IP local ou endereço do servidor MySQL.</span>
              </div>

              {/* Porta */}
              <div className="flex flex-col">
                <div className="h-6 flex items-center justify-between gap-2 mb-1">
                  <label className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">
                    Porta MySQL <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, port: 3306 }))}
                    className="text-[10px] font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 px-1.5 py-0.5 rounded transition cursor-pointer"
                  >
                    Padrão 3306
                  </button>
                </div>
                <input
                  type="number"
                  required
                  value={form.port}
                  onChange={e => setForm({ ...form, port: e.target.value })}
                  placeholder="3306"
                  className="h-10 w-full px-3 border border-slate-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 outline-none text-slate-800 font-semibold transition bg-slate-50/50 focus:bg-white"
                />
                <span className="text-[11px] text-slate-400 mt-1">Porta padrão do XAMPP é 3306.</span>
              </div>

              {/* Nome do Banco */}
              <div className="flex flex-col">
                <div className="h-6 flex items-center justify-between gap-2 mb-1">
                  <label className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">
                    Banco de Dados <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, database: 'hospaudit' }))}
                    className="text-[10px] font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 px-1.5 py-0.5 rounded transition cursor-pointer"
                  >
                    hospaudit
                  </button>
                </div>
                <input
                  type="text"
                  required
                  value={form.database}
                  onChange={e => setForm({ ...form, database: e.target.value })}
                  placeholder="hospaudit"
                  className="h-10 w-full px-3 border border-slate-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 outline-none text-slate-800 font-semibold transition bg-slate-50/50 focus:bg-white"
                />
                <span className="text-[11px] text-slate-400 mt-1">Criado automaticamente se não existir.</span>
              </div>

              {/* Usuário */}
              <div className="flex flex-col">
                <div className="h-6 flex items-center justify-between gap-2 mb-1">
                  <label className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">
                    Usuário MySQL <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, user: 'root' }))}
                    className="text-[10px] font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 px-1.5 py-0.5 rounded transition cursor-pointer"
                  >
                    root
                  </button>
                </div>
                <input
                  type="text"
                  required
                  value={form.user}
                  onChange={e => setForm({ ...form, user: e.target.value })}
                  placeholder="root"
                  className="h-10 w-full px-3 border border-slate-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 outline-none text-slate-800 font-semibold transition bg-slate-50/50 focus:bg-white"
                />
                <span className="text-[11px] text-slate-400 mt-1">Usuário padrão do XAMPP é root.</span>
              </div>

              {/* Senha */}
              <div className="flex flex-col">
                <div className="h-6 flex items-center justify-between gap-2 mb-1">
                  <label className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">
                    Senha do MySQL
                  </label>
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                    XAMPP: vazia
                  </span>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    placeholder="Em branco no XAMPP padrão"
                    className="h-10 w-full pl-3 pr-9 border border-slate-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 outline-none text-slate-800 font-semibold transition bg-slate-50/50 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                    title={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <span className="text-[11px] text-slate-400 mt-1">Informe apenas se configurou senha no phpMyAdmin.</span>
              </div>

              {/* Ativar/Desativar */}
              <div className="flex flex-col">
                <div className="h-6 flex items-center justify-between gap-2 mb-1">
                  <label className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">
                    Integração MySQL
                  </label>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                    form.enabled
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}>
                    {form.enabled ? 'Ativada' : 'Local JSON'}
                  </span>
                </div>
                <div className="h-10 px-3 bg-slate-50 border border-slate-300 rounded-xl flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">Usar MySQL externo</span>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, enabled: !form.enabled })}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      form.enabled ? 'bg-sky-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        form.enabled ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
                <span className="text-[11px] text-slate-400 mt-1">Se desativado, opera 100% no Banco Local Node.js.</span>
              </div>
            </div>

            {/* DIAGNOSTIC RESULT CARD */}
            {testResult && (
              <div className={`p-3.5 rounded-xl border space-y-1.5 ${
                testResult.success 
                  ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950' 
                  : 'bg-rose-50/70 border-rose-200 text-rose-950'
              }`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {testResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    )}
                    <span className="font-bold text-xs">
                      {testResult.success ? 'Comunicação MySQL Estabelecida' : 'Falha na Comunicação MySQL'}
                    </span>
                  </div>
                  {testResult.latencyMs !== undefined && (
                    <span className="text-[10px] font-mono font-bold bg-white px-2 py-0.5 rounded-md border border-emerald-200 text-emerald-700">
                      {testResult.latencyMs}ms
                    </span>
                  )}
                </div>
                <p className="text-xs pl-6 leading-relaxed">{testResult.message}</p>
                {testResult.rawError && (
                  <div className="pl-6">
                    <code className="text-[11px] bg-white px-2 py-1.5 rounded-lg block font-mono text-rose-700 border border-rose-200 overflow-x-auto">
                      {testResult.rawError}
                    </code>
                  </div>
                )}
              </div>
            )}

            {/* FOOTER ACTIONS */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-4 border-t border-slate-100">
              <span className="text-[11px] text-slate-400">
                Configuração salva em <code className="font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">data/mysql_config.json</code>
              </span>

              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testing || loading}
                  className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border border-slate-300 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  {testing ? <RefreshCw size={13} className="animate-spin text-sky-600" /> : <Play size={13} className="text-sky-600" />}
                  <span>{testing ? 'Testando...' : 'Testar Conexão'}</span>
                </button>

                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  {loading ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
                  <span>{loading ? 'Salvando...' : 'Salvar e Conectar'}</span>
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* TAB 2: BANCO LOCAL NODE.JS & MIGRAÇÃO JSON */}
      {subTab === 'native' && (
        <NodeDbMigrationManager />
      )}

      {/* TAB 3: AUTO-SYNC & BACKUP UNIFICADO */}
      {subTab === 'sync' && (
        <div className="space-y-4">
          {/* COMPACT AUTO-SYNC STRIP */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-sky-600" />
                    Envio Automático para o MySQL
                  </h3>
                  <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold border ${
                    !isMysqlConnected
                      ? 'bg-slate-100 text-slate-600 border-slate-200'
                      : autoSyncEnabled 
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                        : 'bg-slate-100 text-slate-500 border-slate-200'
                  }`}>
                    {!isMysqlConnected ? 'Inativo (Usando Banco Local)' : autoSyncEnabled ? `Ativo (${autoSyncIntervalMinutes}m)` : 'Pausado'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Sincronização periódica não-destrutiva (Upsert) dos dados locais para as 14 tabelas do MySQL.
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleImmediateSync(false)}
                disabled={manualSyncingNow || !isMysqlConnected}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
              >
                <Upload size={13} className={manualSyncingNow ? 'animate-spin' : ''} />
                <span>{manualSyncingNow ? 'Enviando...' : 'Enviar Agora'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {/* Timer Card (Light Clean Hospital Surface) */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between relative overflow-hidden">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {!isMysqlConnected ? 'Status do MySQL' : autoSyncEnabled ? 'Próximo envio em' : 'Status do agendador'}
                </span>
                <div className="text-xl font-extrabold font-mono text-slate-900 tabular-nums flex items-center gap-2 my-1">
                  <Timer size={18} className={manualSyncingNow ? 'animate-spin text-amber-500' : 'text-sky-600'} />
                  <span>
                    {!isMysqlConnected
                      ? 'LOCAL'
                      : autoSyncEnabled
                        ? (manualSyncingNow ? 'Sincronizando...' : formatTimer(secondsRemaining))
                        : 'PAUSADO'}
                  </span>
                </div>
                <span className="text-[11px] text-slate-500">
                  {!isMysqlConnected
                    ? 'Aguardando conexão ativa com MySQL'
                    : autoSyncEnabled
                      ? `Ciclo a cada ${autoSyncIntervalMinutes} min`
                      : 'Ative para agendar envios'}
                </span>
                {autoSyncEnabled && isMysqlConnected && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-200 overflow-hidden">
                    <div 
                      className="h-full bg-sky-600 transition-all duration-1000 ease-linear"
                      style={{ 
                        width: `${Math.min(100, Math.max(0, ((autoSyncIntervalMinutes * 60 - secondsRemaining) / (autoSyncIntervalMinutes * 60)) * 100))}%` 
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Controls Card */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Envio Automático</span>
                  <button
                    type="button"
                    onClick={() => handleToggleAutoSync(!autoSyncEnabled)}
                    disabled={autoSyncLoading}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      autoSyncEnabled ? 'bg-emerald-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        autoSyncEnabled ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-200/80">
                  <span className="text-xs font-semibold text-slate-600">Intervalo</span>
                  <select
                    value={autoSyncIntervalMinutes}
                    onChange={e => handleChangeInterval(Number(e.target.value))}
                    disabled={autoSyncLoading || !autoSyncEnabled}
                    className="bg-white border border-slate-300 rounded-lg text-xs font-semibold px-2 py-1 text-slate-700 outline-none focus:border-sky-500 cursor-pointer disabled:opacity-50"
                  >
                    <option value={1}>1 minuto</option>
                    <option value={5}>5 minutos (Padrão)</option>
                    <option value={10}>10 minutos</option>
                    <option value={15}>15 minutos</option>
                    <option value={30}>30 minutos</option>
                  </select>
                </div>
              </div>

              {/* Last Sync Card */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Último Envio Registrado
                </span>
                <div className="text-xs font-bold text-slate-800 my-1">
                  {lastAutoSyncTime 
                    ? `${new Date(lastAutoSyncTime).toLocaleDateString('pt-BR')} às ${new Date(lastAutoSyncTime).toLocaleTimeString('pt-BR')}`
                    : 'Aguardando primeiro envio'}
                </div>
                <p className="text-[11px] text-slate-500 truncate" title={lastAutoSyncMessage || ''}>
                  {lastAutoSyncMessage || 'Sincronização contínua de 14 tabelas.'}
                </p>
              </div>
            </div>
          </div>

          <UnifiedBackupField />
        </div>
      )}

      {/* TAB 4: GUIA XAMPP, MIGRAÇÃO DE ESTRUTURA & DÚVIDAS */}
      {subTab === 'help' && (
        <div className="space-y-4">
          {/* Schema Migration Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Verificação & Migração Segura de Estrutura
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 max-w-2xl">
                  Garante que todas as tabelas e colunas existam no MySQL (<code className="bg-slate-100 px-1 rounded text-[11px]">CREATE TABLE IF NOT EXISTS</code> / <code className="bg-slate-100 px-1 rounded text-[11px]">ALTER TABLE</code>) sem apagar registros.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowUpdateGuide(!showUpdateGuide)}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 border border-slate-200 cursor-pointer whitespace-nowrap"
                >
                  <Terminal size={13} />
                  <span>{showUpdateGuide ? 'Ocultar Comandos' : 'Comandos de Atualização'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleRunMigration}
                  disabled={migrating}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  {migrating ? <RefreshCw size={13} className="animate-spin" /> : <Sparkles size={13} />}
                  <span>{migrating ? 'Verificando...' : 'Verificar & Atualizar Estrutura'}</span>
                </button>
              </div>
            </div>

            {migrationResult && (
              <div className={`p-3.5 rounded-xl border space-y-2 ${
                migrationResult.success 
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs flex items-center gap-1.5">
                    {migrationResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}
                    {migrationResult.success ? 'Estrutura Verificada' : 'Falha na Verificação'}
                  </span>
                  {migrationResult.totalTablesChecked && (
                    <span className="text-[10px] font-mono font-bold bg-white px-2 py-0.5 rounded border border-slate-200">
                      {migrationResult.totalTablesChecked} tabelas
                    </span>
                  )}
                </div>
                <p className="text-xs">{migrationResult.message}</p>
              </div>
            )}

            {showUpdateGuide && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1">
                  <span className="font-bold text-sky-700 block">1. Banco Separado</span>
                  <p className="text-[11px] text-slate-600">Os dados ficam em <code className="bg-slate-100 px-1 rounded">mysql/data</code> ou <code className="bg-slate-100 px-1 rounded">data/*.json</code>.</p>
                </div>
                <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1">
                  <span className="font-bold text-sky-700 block">2. Baixar Versão</span>
                  <code className="block bg-slate-900 text-emerald-400 p-1.5 rounded text-[10px] font-mono">git pull origin main</code>
                </div>
                <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1">
                  <span className="font-bold text-sky-700 block">3. Compilar Servidor</span>
                  <code className="block bg-slate-900 text-emerald-400 p-1.5 rounded text-[10px] font-mono">npm install && npm run build</code>
                </div>
                <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1">
                  <span className="font-bold text-emerald-700 block">4. Migrar Estrutura</span>
                  <p className="text-[11px] text-slate-600">Clique em "Verificar & Atualizar Estrutura" acima.</p>
                </div>
              </div>
            )}
          </div>

          {/* 4-Step XAMPP Quickstart */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-sky-600" />
                Passo a Passo: Conectar ao XAMPP
              </h3>
              <button
                type="button"
                onClick={() => {
                  handleApplyXamppDefaults();
                  setSubTab('mysql');
                }}
                className="text-xs font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 px-3 py-1.5 rounded-lg transition cursor-pointer"
              >
                Preencher Padrão & Ir para Parâmetros
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1">
                <span className="font-bold text-sky-700 block">1. Abrir o XAMPP</span>
                <p className="text-[11px] text-slate-600 leading-relaxed">Inicie o <strong>XAMPP Control Panel</strong> no servidor Windows.</p>
              </div>
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1">
                <span className="font-bold text-sky-700 block">2. Iniciar o MySQL</span>
                <p className="text-[11px] text-slate-600 leading-relaxed">Clique em <strong>Start</strong> no módulo MySQL (porta padrão <strong>3306</strong>).</p>
              </div>
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1">
                <span className="font-bold text-sky-700 block">3. Credenciais</span>
                <p className="text-[11px] text-slate-600 leading-relaxed">Host <code className="bg-white px-1 rounded border border-slate-200">127.0.0.1</code>, usuário <code className="bg-white px-1 rounded border border-slate-200">root</code>, senha vazia.</p>
              </div>
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1">
                <span className="font-bold text-sky-700 block">4. Banco Automático</span>
                <p className="text-[11px] text-slate-600 leading-relaxed">A base <code className="bg-white px-1 rounded border border-slate-200">hospaudit</code> e as 14 tabelas são criadas automaticamente.</p>
              </div>
            </div>
          </div>

          {/* FAQ 2x2 */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3.5">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <Info className="w-4 h-4 text-slate-500" /> Dúvidas Frequentes
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <span className="font-bold text-slate-800 block">1. Onde fica o phpMyAdmin?</span>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Acesse <code className="bg-white px-1 rounded font-mono text-sky-700 border border-slate-200">http://localhost/phpmyadmin</code> com Apache e MySQL ativos no XAMPP.
                </p>
              </div>
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <span className="font-bold text-slate-800 block">2. Erro "Port 3306 in use"?</span>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Outro serviço ocupa a porta 3306. Altere para 3307 em <code className="bg-white px-1 rounded border border-slate-200">my.ini</code> no XAMPP e ajuste na aba Parâmetros.
                </p>
              </div>
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <span className="font-bold text-slate-800 block">3. E se o XAMPP estiver desligado?</span>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  O sistema continua gravando em <code className="bg-white px-1 rounded font-mono border border-slate-200">data/*.json</code> e sincroniza quando o MySQL voltar.
                </p>
              </div>
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <span className="font-bold text-slate-800 block">4. Qual banco devo usar em rede local?</span>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  O Banco Nativo Node.js já funciona em rede sem XAMPP; use MySQL apenas se quiser integração SQL externa.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
