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

export function DatabaseConfigManager() {
  const { dbConnected, pullServerToLocal } = useAuditData();

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

  // Countdown timer loop for auto-sync (a cada 5 minutos)
  useEffect(() => {
    if (!autoSyncEnabled) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((nextSyncTimestamp - now) / 1000));
      setSecondsRemaining(diff);

      if (diff === 0 && !manualSyncingNow) {
        handleImmediateSync(true);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [autoSyncEnabled, nextSyncTimestamp, manualSyncingNow]);

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
        text: res.message || (newEnabled ? 'Envio automático a cada 5 minutos ativado!' : 'Envio automático pausado.')
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
      text: 'Valores padrão do XAMPP aplicados! (Host: 127.0.0.1, Porta: 3306, Usuário: root, Senha em branco).'
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
          text: res?.message || 'Configurações salvas, mas o MySQL ainda não respondeu na porta informada.'
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

  const isActuallyConnected = serverInfo?.connected || dbConnected;

  return (
    <div className="space-y-6 text-slate-800">
      
      {/* 1. ASSISTENTE DE MIGRAÇÃO E GESTÃO DO BANCO NATIVO DO NODE.JS */}
      <NodeDbMigrationManager />

      {/* HEADER BANNER */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-sm relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                Configuração Sem Código
              </span>
              <span className="text-slate-400">•</span>
              <span className="text-xs text-slate-300 font-semibold">Painel Gestão HospAudit</span>
            </div>
            <h2 className="text-xl font-black tracking-tight flex items-center gap-2">
              <Database className="w-5 h-5 text-indigo-400" /> Conexão com Banco de Dados (MySQL / XAMPP)
            </h2>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Configure os dados de acesso ao MySQL do seu XAMPP diretamente por aqui, sem precisar editar arquivos de código ou terminais.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {autoSyncEnabled && (
              <div 
                className="px-3 py-1.5 bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5"
                title={`Envio automático ativo a cada ${autoSyncIntervalMinutes} minutos`}
              >
                <Clock size={13} className="text-emerald-400 animate-pulse" />
                <span>Auto-Sync: {formatTimer(secondsRemaining)}</span>
              </div>
            )}
            <button
              type="button"
              onClick={handleReconnect}
              disabled={reconnecting}
              className="px-3.5 py-2 bg-white/10 hover:bg-white/20 active:scale-98 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 border border-white/15 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={13} className={reconnecting ? 'animate-spin' : ''} />
              <span>{reconnecting ? 'Reconectando...' : 'Reconectar'}</span>
            </button>
            <button
              type="button"
              onClick={handleRunMigration}
              disabled={migrating}
              className="px-3.5 py-2 bg-emerald-600/80 hover:bg-emerald-600 active:scale-98 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 border border-emerald-400/30 cursor-pointer disabled:opacity-50"
            >
              <Sparkles size={13} className={migrating ? 'animate-spin' : 'text-amber-300'} />
              <span>{migrating ? 'Migrando...' : 'Migrar Estrutura'}</span>
            </button>
            <button
              type="button"
              onClick={handleSyncToMysql}
              disabled={syncing}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 active:scale-98 text-white rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
            >
              <Upload size={13} className={syncing ? 'animate-spin' : ''} />
              <span>{syncing ? 'Enviando...' : 'Enviar Dados Locais para o Banco'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* FEEDBACK ALERT */}
      {feedback && (
        <div className={`p-4 rounded-xl border flex items-start gap-3 transition-all animate-fade-in ${
          feedback.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
            : feedback.type === 'error'
            ? 'bg-rose-50 border-rose-200 text-rose-900'
            : 'bg-blue-50 border-blue-200 text-blue-900'
        }`}>
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : feedback.type === 'error' ? (
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          ) : (
            <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 text-xs">
            <span className="font-bold">{feedback.type === 'success' ? 'Sucesso: ' : feedback.type === 'error' ? 'Atenção: ' : 'Informação: '}</span>
            <span>{feedback.text}</span>
          </div>
        </div>
      )}

      {/* STATUS OVERVIEW CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Status Conexão */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block font-mono">Status da Comunicação</span>
            <div className="flex items-center gap-2 mt-2">
              <span className={`w-3 h-3 rounded-full shrink-0 ${isActuallyConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              <span className="text-sm font-black text-slate-800">
                {isActuallyConnected ? 'Conectado ao MySQL (XAMPP)' : 'Operando em Modo Local (JSON)'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
              {isActuallyConnected 
                ? 'As alterações são gravadas em tempo real nas tabelas relacionais do MySQL.' 
                : 'O sistema utiliza o modo fallback de segurança (JSON) para que você nunca perca dados mesmo com o MySQL pausado.'}
            </p>
          </div>
          <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-semibold text-slate-500">
            <span>Modo ativo:</span>
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase ${
              isActuallyConnected ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
            }`}>
              {isActuallyConnected ? 'MySQL Relacional' : 'JSON Local'}
            </span>
          </div>
        </div>

        {/* Servidor Ativo */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block font-mono">Endereço do Banco</span>
            <div className="flex items-center gap-2 mt-2">
              <Server className="w-4 h-4 text-indigo-600" />
              <span className="text-sm font-black text-slate-800 font-mono">
                {serverInfo?.host || form.host}:{serverInfo?.port || form.port}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              Base de dados ativa: <strong className="text-indigo-600 font-mono">{serverInfo?.database || form.database}</strong>
            </p>
          </div>
          <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-semibold text-slate-500">
            <span>Usuário:</span>
            <span className="font-mono text-slate-700 font-bold">{serverInfo?.user || form.user}</span>
          </div>
        </div>

        {/* Sincronização Bidirecional */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block font-mono">Tabelas Relacionais</span>
            <div className="flex items-center gap-2 mt-2">
              <HardDrive className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-black text-slate-800">
                14 Tabelas Sincronizadas
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
              Setores, leitos, auditorias, perguntas, usuários, cargos, permissões, logs e módulos do sistema.
            </p>
          </div>
          <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-semibold text-slate-500">
            <span>Sincronismo:</span>
            <span className="text-emerald-600 font-bold flex items-center gap-1">
              <CheckCircle2 size={12} /> Automático & Não-Destrutivo
            </span>
          </div>
        </div>

      </div>

      {/* CARD: ENVIO AUTOMÁTICO PARA O BANCO A CADA 5 MINUTOS */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 space-y-5 relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider flex items-center gap-1 border ${
                autoSyncEnabled 
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                  : 'bg-slate-100 text-slate-500 border-slate-200'
              }`}>
                <span className={`w-2 h-2 rounded-full ${autoSyncEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                {autoSyncEnabled ? `Envio Automático Ativo (A cada ${autoSyncIntervalMinutes}m)` : 'Envio Automático Pausado'}
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-xs text-slate-500 font-semibold">Sincronização Contínua em Segundo Plano</span>
            </div>
            <h3 className="text-lg font-black tracking-tight text-slate-800 flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-600" />
              Envio Automático dos Dados Locais para o Banco MySQL
            </h3>
            <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
              Todas as informações cadastradas ou alteradas no sistema (pacientes, auditorias, leitos, setores, perguntas, formulários) são enviadas periodicamente para o banco de dados central sem travar sua navegação.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => handleImmediateSync(false)}
              disabled={manualSyncingNow || !isActuallyConnected}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white rounded-xl text-xs font-black transition flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
            >
              <Upload size={14} className={manualSyncingNow ? 'animate-spin' : ''} />
              <span>{manualSyncingNow ? 'Enviando para o Banco...' : 'Enviar Agora para o Banco'}</span>
            </button>
          </div>
        </div>

        {/* STATUS & COUNTDOWN BAR */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* Box 1: Relógio Regressivo */}
          <div className="bg-slate-900 text-white rounded-xl p-4 flex items-center justify-between shadow-inner relative overflow-hidden">
            <div className="space-y-1 relative z-10">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block font-mono">
                {autoSyncEnabled ? 'Próximo Envio em:' : 'Status do Agendador:'}
              </span>
              <div className="text-2xl font-black font-mono tracking-tight text-emerald-400 flex items-center gap-2">
                <Timer size={22} className={manualSyncingNow ? 'animate-spin text-amber-400' : 'text-emerald-400'} />
                <span>{autoSyncEnabled ? (manualSyncingNow ? 'Sincronizando...' : formatTimer(secondsRemaining)) : 'PAUSADO'}</span>
              </div>
              <span className="text-[10px] text-slate-400 block">
                {autoSyncEnabled 
                  ? `Ciclo configurado: a cada ${autoSyncIntervalMinutes} minutos` 
                  : 'Ative a chave ao lado para retomar'}
              </span>
            </div>

            {/* Barra de Progresso visual no rodapé do box */}
            {autoSyncEnabled && (
              <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-slate-800 overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-1000 ease-linear"
                  style={{ 
                    width: `${Math.min(100, Math.max(0, ((autoSyncIntervalMinutes * 60 - secondsRemaining) / (autoSyncIntervalMinutes * 60)) * 100))}%` 
                  }}
                />
              </div>
            )}
          </div>

          {/* Box 2: Controles de Intervalo e Ativação */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 flex flex-col justify-between space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">Envio Automático:</span>
              <button
                type="button"
                onClick={() => handleToggleAutoSync(!autoSyncEnabled)}
                disabled={autoSyncLoading}
                className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  autoSyncEnabled ? 'bg-emerald-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                    autoSyncEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-200/60">
              <span className="text-xs font-bold text-slate-700">Intervalo de Envio:</span>
              <select
                value={autoSyncIntervalMinutes}
                onChange={e => handleChangeInterval(Number(e.target.value))}
                disabled={autoSyncLoading || !autoSyncEnabled}
                className="bg-white border border-slate-200 rounded-lg text-xs font-bold px-2 py-1 text-slate-700 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer disabled:opacity-50"
              >
                <option value={1}>1 minuto (Teste Rápido)</option>
                <option value={5}>5 minutos (Padrão Recomendado)</option>
                <option value={10}>10 minutos</option>
                <option value={15}>15 minutos</option>
                <option value={30}>30 minutos</option>
              </select>
            </div>
          </div>

          {/* Box 3: Histórico e Último Envio */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 flex flex-col justify-between space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block font-mono">
              Último Envio Registrado:
            </span>
            <div className="text-xs font-black text-slate-800">
              {lastAutoSyncTime 
                ? `${new Date(lastAutoSyncTime).toLocaleDateString('pt-BR')} às ${new Date(lastAutoSyncTime).toLocaleTimeString('pt-BR')}`
                : 'Aguardando primeiro envio'}
            </div>
            <p className="text-[11px] text-slate-500 truncate" title={lastAutoSyncMessage || ''}>
              {lastAutoSyncMessage || 'Sincronização automática contínua de 14 tabelas.'}
            </p>
            <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px] text-slate-400">
              <span>Garantia de Integridade:</span>
              <span className="font-bold text-emerald-600 flex items-center gap-1">
                <Check size={11} /> Upsert Não-Destrutivo
              </span>
            </div>
          </div>

        </div>
      </div>

      {/* CARD: ATUALIZAÇÃO SEGURA DO SISTEMA & MIGRAÇÃO DO BANCO */}
      <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-900 text-white rounded-2xl p-6 border border-indigo-900/60 shadow-lg relative overflow-hidden space-y-5">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider flex items-center gap-1">
                <ShieldCheck size={12} className="text-emerald-400" />
                Garantia Não-Destrutiva: Zero Perda de Dados
              </span>
              <span className="text-slate-500">•</span>
              <span className="text-xs text-indigo-300 font-semibold">Atualização em Servidor</span>
            </div>
            <h3 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              Atualização de Versão & Migração de Estrutura do Banco
            </h3>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              O banco MySQL é separado do código. Ao atualizar o sistema no servidor, use este botão para verificar e criar automaticamente novas tabelas e novas colunas (utilizando <code className="bg-white/10 px-1 py-0.5 rounded text-amber-200 text-[10px]">CREATE TABLE IF NOT EXISTS</code> e <code className="bg-white/10 px-1 py-0.5 rounded text-amber-200 text-[10px]">ALTER TABLE ADD COLUMN</code>). Todos os dados antigos são preservados 100% intactos com snapshot prévio em <code className="bg-white/10 px-1 py-0.5 rounded text-indigo-200 text-[10px]">backups/</code>!
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowUpdateGuide(!showUpdateGuide)}
              className="px-3.5 py-2 bg-indigo-900/60 hover:bg-indigo-800/80 active:scale-98 text-indigo-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border border-indigo-700/50 cursor-pointer"
            >
              <Terminal size={14} className="text-indigo-400" />
              <span>{showUpdateGuide ? 'Ocultar Guia do Servidor' : 'Como Atualizar no Servidor'}</span>
            </button>
            <button
              type="button"
              onClick={handleRunMigration}
              disabled={migrating}
              className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-98 text-white rounded-xl text-xs font-black transition flex items-center gap-2 shadow-md cursor-pointer disabled:opacity-50"
            >
              {migrating ? (
                <>
                  <RefreshCw size={14} className="animate-spin text-white" />
                  <span>Migrando Estrutura com Segurança...</span>
                </>
              ) : (
                <>
                  <Database size={14} className="text-emerald-200" />
                  <span>Verificar & Atualizar Estrutura do Banco</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* FEEDBACK DE MIGRAÇÃO DETALHADO */}
        {migrationResult && (
          <div className={`p-4 rounded-xl border space-y-3 animate-fade-in ${
            migrationResult.success 
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-100' 
              : 'bg-rose-950/40 border-rose-500/40 text-rose-100'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {migrationResult.success ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
                )}
                <span className="font-extrabold text-sm text-white">
                  {migrationResult.success ? 'Migração Estrutural Concluída com Sucesso!' : 'Falha na Migração Estrutural'}
                </span>
              </div>
              {migrationResult.totalTablesChecked && (
                <span className="text-[10px] font-mono font-bold bg-white/10 px-2.5 py-0.5 rounded-full border border-white/15 text-slate-300">
                  {migrationResult.totalTablesChecked} tabelas inspecionadas
                </span>
              )}
            </div>

            <p className="text-xs text-slate-200 pl-7 leading-relaxed">
              {migrationResult.message}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pl-7 pt-1 text-[11px]">
              <div className="bg-slate-900/60 p-2.5 rounded-lg border border-white/10 space-y-1">
                <span className="text-slate-400 font-bold block text-[10px] uppercase">Snapshot de Backup:</span>
                <span className="font-mono text-amber-300 break-all text-[10px]">
                  {migrationResult.backupSnapshot ? migrationResult.backupSnapshot.split('/').pop() : 'Gravado em backups/'}
                </span>
              </div>
              <div className="bg-slate-900/60 p-2.5 rounded-lg border border-white/10 space-y-1">
                <span className="text-slate-400 font-bold block text-[10px] uppercase">Novas Tabelas:</span>
                <span className="font-bold text-emerald-300">
                  {migrationResult.tablesCreated && migrationResult.tablesCreated.length > 0 
                    ? migrationResult.tablesCreated.join(', ') 
                    : '14/14 tabelas já existentes'}
                </span>
              </div>
              <div className="bg-slate-900/60 p-2.5 rounded-lg border border-white/10 space-y-1">
                <span className="text-slate-400 font-bold block text-[10px] uppercase">Novas Colunas Adicionadas:</span>
                <span className="font-bold text-teal-300">
                  {migrationResult.columnsAdded && migrationResult.columnsAdded.length > 0 
                    ? migrationResult.columnsAdded.join(', ') 
                    : 'Esquemas 100% atualizados'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* GUIA PASSO A PASSO EXPANSÍVEL: COMO ATUALIZAR SERVIDOR DE PRODUÇÃO */}
        {showUpdateGuide && (
          <div className="bg-slate-900/90 border border-indigo-800/60 rounded-xl p-5 space-y-4 animate-fade-in text-slate-200">
            <div className="flex items-center justify-between border-b border-indigo-900/60 pb-3">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <h4 className="font-black text-sm text-white">
                  Passo a Passo: Como Atualizar o Sistema no Servidor Sem Perder Dados
                </h4>
              </div>
              <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded font-mono">
                Produção / Linux / Windows / XAMPP
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
              
              {/* Etapa 1 */}
              <div className="bg-slate-950/60 p-3.5 rounded-xl border border-white/10 space-y-2">
                <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs">
                  <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center font-black text-[10px]">1</span>
                  <span>Banco Separado</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  O MySQL armazena seus dados no diretório do banco de dados (ex: <code className="bg-white/10 px-1 py-0.5 rounded text-[10px]">mysql/data</code>). Atualizar os arquivos do sistema <strong>NUNCA</strong> apaga o banco!
                </p>
              </div>

              {/* Etapa 2 */}
              <div className="bg-slate-950/60 p-3.5 rounded-xl border border-white/10 space-y-2">
                <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs">
                  <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center font-black text-[10px]">2</span>
                  <span>Baixar Novo Código</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  No servidor, faça o download da nova versão:
                </p>
                <code className="block bg-black/60 p-2 rounded text-[10px] font-mono text-emerald-400 border border-white/5">
                  git pull origin main
                </code>
                <p className="text-[10px] text-slate-400">
                  Ou copie os arquivos para a pasta do projeto mantendo seu arquivo <code className="text-amber-300 font-mono">data/mysql_config.json</code>.
                </p>
              </div>

              {/* Etapa 3 */}
              <div className="bg-slate-950/60 p-3.5 rounded-xl border border-white/10 space-y-2">
                <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs">
                  <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center font-black text-[10px]">3</span>
                  <span>Compilar e Reiniciar</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  No terminal do servidor, instale dependências e compile:
                </p>
                <code className="block bg-black/60 p-2 rounded text-[10px] font-mono text-emerald-400 border border-white/5">
                  npm install<br />
                  npm run build<br />
                  pm2 restart hospaudit
                </code>
              </div>

              {/* Etapa 4 */}
              <div className="bg-slate-950/60 p-3.5 rounded-xl border border-white/10 space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center font-black text-[10px]">4</span>
                  <span>Migração em 1 Clique</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Abra o sistema no navegador, venha neste painel e clique no botão verde <strong>"Verificar & Atualizar Estrutura do Banco"</strong>.
                </p>
                <p className="text-[10px] text-emerald-300 font-medium">
                  ✓ Cria novas tabelas se houver.<br />
                  ✓ Adiciona novas colunas.<br />
                  ✓ Mantém 100% dos dados intactos!
                </p>
              </div>

            </div>
          </div>
        )}
      </div>

      {/* GUIA PASSO A PASSO XAMPP (AJUDA PRÁTICA) */}
      <div className="bg-blue-50/50 border border-blue-200/80 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-blue-100 text-blue-700 rounded-lg">
              <HelpCircle className="w-4 h-4" />
            </span>
            <h3 className="font-extrabold text-sm text-slate-800">
              Guia Passo a Passo: Como Conectar com o XAMPP
            </h3>
          </div>
          <button
            type="button"
            onClick={handleApplyXamppDefaults}
            className="text-[11px] font-bold text-blue-700 bg-white hover:bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg shadow-3xs transition cursor-pointer flex items-center gap-1"
          >
            <span>Preencher Dados Padrão do XAMPP</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
          <div className="bg-white p-3.5 rounded-xl border border-blue-100 space-y-1 shadow-3xs">
            <div className="flex items-center gap-1.5 text-blue-700 font-black text-xs">
              <span className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-[10px]">1</span>
              <span>Abrir o XAMPP</span>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Abra o aplicativo <strong>XAMPP Control Panel</strong> no seu computador Windows.
            </p>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-blue-100 space-y-1 shadow-3xs">
            <div className="flex items-center gap-1.5 text-blue-700 font-black text-xs">
              <span className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-[10px]">2</span>
              <span>Iniciar o MySQL</span>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Clique no botão <strong>Start</strong> ao lado de <strong>MySQL</strong>. O botão deve ficar verde e exibir a porta <strong>3306</strong>.
            </p>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-blue-100 space-y-1 shadow-3xs">
            <div className="flex items-center gap-1.5 text-blue-700 font-black text-xs">
              <span className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-[10px]">3</span>
              <span>Credenciais Padrão</span>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Host: <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[10px]">127.0.0.1</code> | Usuário: <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[10px]">root</code> | Senha: <strong>deixe vazia</strong>.
            </p>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-blue-100 space-y-1 shadow-3xs">
            <div className="flex items-center gap-1.5 text-blue-700 font-black text-xs">
              <span className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-[10px]">4</span>
              <span>Criação Automática</span>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              O banco <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[10px]">hospaudit</code> e todas as tabelas são criados automaticamente pelo HospAudit!
            </p>
          </div>
        </div>
      </div>

      {/* FORMULÁRIO DE CONFIGURAÇÃO */}
      <form onSubmit={handleSaveAndConnect} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6 shadow-2xs">
        <div className="border-b border-slate-100 pb-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <h3 className="font-extrabold text-sm text-slate-800 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-indigo-600" /> Parâmetros de Conexão com o MySQL
            </h3>
            <p className="text-xs text-slate-500">
              Altere os parâmetros e clique em <strong>Testar Conexão</strong> para validar antes de salvar.
            </p>
          </div>
          <span className="text-[11px] text-slate-400 font-medium">
            Salvo em: <code className="font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">data/mysql_config.json</code>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 text-xs">
          
          {/* Host */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">
                Host / IP do Servidor <span className="text-rose-500">*</span>
              </label>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, host: '127.0.0.1' }))}
                  className="text-[9px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-1.5 py-0.5 rounded transition cursor-pointer"
                >
                  127.0.0.1
                </button>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, host: 'localhost' }))}
                  className="text-[9px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-1.5 py-0.5 rounded transition cursor-pointer"
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
              placeholder="127.0.0.1 ou localhost"
              className="w-full px-3 py-2.5 border border-slate-250 rounded-xl font-mono text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-slate-800 font-bold transition bg-slate-50/50 focus:bg-white"
            />
            <span className="text-[10px] text-slate-400 block">Endereço local onde o MySQL está rodando.</span>
          </div>

          {/* Porta */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">
                Porta MySQL <span className="text-rose-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, port: 3306 }))}
                className="text-[9px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-1.5 py-0.5 rounded transition cursor-pointer"
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
              className="w-full px-3 py-2.5 border border-slate-250 rounded-xl font-mono text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-slate-800 font-bold transition bg-slate-50/50 focus:bg-white"
            />
            <span className="text-[10px] text-slate-400 block">Porta padrão do XAMPP é 3306.</span>
          </div>

          {/* Nome do Banco */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">
                Nome do Banco de Dados <span className="text-rose-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, database: 'hospaudit' }))}
                className="text-[9px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-1.5 py-0.5 rounded transition cursor-pointer"
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
              className="w-full px-3 py-2.5 border border-slate-250 rounded-xl font-mono text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-slate-800 font-bold transition bg-slate-50/50 focus:bg-white"
            />
            <span className="text-[10px] text-slate-400 block">Criado automaticamente se não existir.</span>
          </div>

          {/* Usuário */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">
                Usuário MySQL <span className="text-rose-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, user: 'root' }))}
                className="text-[9px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-1.5 py-0.5 rounded transition cursor-pointer"
              >
                Padrão root
              </button>
            </div>
            <input
              type="text"
              required
              value={form.user}
              onChange={e => setForm({ ...form, user: e.target.value })}
              placeholder="root"
              className="w-full px-3 py-2.5 border border-slate-250 rounded-xl font-mono text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-slate-800 font-bold transition bg-slate-50/50 focus:bg-white"
            />
            <span className="text-[10px] text-slate-400 block">Usuário padrão do XAMPP é 'root'.</span>
          </div>

          {/* Senha */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">
                Senha do MySQL
              </label>
              <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                No XAMPP: Deixar Vazia
              </span>
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                placeholder="Deixe em branco para o XAMPP padrão"
                className="w-full pl-3 pr-10 py-2.5 border border-slate-250 rounded-xl font-mono text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-slate-800 font-bold transition bg-slate-50/50 focus:bg-white"
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
            <span className="text-[10px] text-slate-400 block">Se você definiu senha no phpMyAdmin, digite-a aqui.</span>
          </div>

          {/* Ativar/Desativar */}
          <div className="space-y-1.5 flex flex-col justify-end">
            <label className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block">
              Ativação do Recurso
            </label>
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">Conectar ao MySQL</span>
              <button
                type="button"
                onClick={() => setForm({ ...form, enabled: !form.enabled })}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  form.enabled ? 'bg-indigo-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                    form.enabled ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            <span className="text-[10px] text-slate-400 block">Se desmarcado, opera 100% em modo local JSON.</span>
          </div>

        </div>

        {/* TEST RESULT CARD (SE HOUVER) */}
        {testResult && (
          <div className={`p-4 rounded-xl border space-y-2 animate-fade-in ${
            testResult.success 
              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950' 
              : 'bg-rose-50/70 border-rose-200 text-rose-950'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {testResult.success ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                )}
                <span className="font-extrabold text-xs">
                  {testResult.success ? 'Diagnóstico Positivo: Comunicação Estabelecida!' : 'Diagnóstico de Conexão: Falha ao Conectar'}
                </span>
              </div>
              {testResult.latencyMs !== undefined && (
                <span className="text-[10px] font-mono font-bold bg-white px-2 py-0.5 rounded-full border border-emerald-200 text-emerald-700">
                  Latência: {testResult.latencyMs}ms
                </span>
              )}
            </div>
            <p className="text-xs leading-relaxed pl-7">
              {testResult.message}
            </p>
            {testResult.rawError && (
              <div className="pl-7 pt-1">
                <code className="text-[10px] bg-white/80 p-2 rounded block font-mono text-rose-700 border border-rose-100 overflow-x-auto">
                  {testResult.rawError}
                </code>
              </div>
            )}
          </div>
        )}

        {/* BOTOES DE AÇÃO */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testing || loading}
            className="w-full sm:w-auto px-5 py-2.5 bg-slate-100 hover:bg-slate-200 active:scale-98 text-slate-700 rounded-xl text-xs font-extrabold transition flex items-center justify-center gap-2 border border-slate-300 cursor-pointer disabled:opacity-50"
          >
            {testing ? <RefreshCw size={14} className="animate-spin text-blue-600" /> : <Play size={14} className="text-blue-600" />}
            <span>{testing ? 'Testando Conexão...' : 'Testar Conexão com XAMPP'}</span>
          </button>

          <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
            <button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white rounded-xl text-xs font-black transition flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
            >
              {loading ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
              <span>{loading ? 'Salvando...' : 'Salvar e Conectar'}</span>
            </button>
          </div>
        </div>

      </form>

      {/* CAMPO UNIFICADO DE IMPORTAÇÃO E EXPORTAÇÃO DE BACKUP */}
      <UnifiedBackupField />

      {/* DICAS DE RESOLUÇÃO DE PROBLEMAS */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-2xs">
        <h3 className="font-extrabold text-sm text-slate-800 flex items-center gap-2">
          <Info className="w-4 h-4 text-slate-500" /> Solução de Dúvidas Frequentes no XAMPP
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-150 space-y-1">
            <span className="font-bold text-slate-800 block">1. Onde fica o phpMyAdmin?</span>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              No navegador, acesse <code className="bg-white px-1 rounded font-mono text-blue-600">http://localhost/phpmyadmin</code> enquanto o Apache e o MySQL estiverem com botão Start verde no XAMPP.
            </p>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-150 space-y-1">
            <span className="font-bold text-slate-800 block">2. Erro "Port 3306 in use"?</span>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Significa que outro serviço (ex: MySQL nativo do Windows) já ocupa a porta. No XAMPP, você pode alterar a porta para 3307 em Config &rarr; my.ini e colocar 3307 no formulário acima.
            </p>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-150 space-y-1">
            <span className="font-bold text-slate-800 block">3. O que acontece se o XAMPP estiver desligado?</span>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              O HospAudit não trava! O sistema grava normalmente nos arquivos locais <code className="bg-white px-1 rounded font-mono text-slate-700">data/*.json</code>. Quando você ligar o XAMPP, basta clicar em "Enviar Dados Locais para o Banco".
            </p>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-150 space-y-1">
            <span className="font-bold text-slate-800 block">4. Como rodar no VS Code?</span>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Abra a pasta no VS Code, abra o terminal e digite <code className="bg-white px-1 rounded font-mono text-emerald-700">npm run dev</code>. O servidor subirá na porta 3000 comunicando-se com seu XAMPP.
            </p>
          </div>
        </div>
      </div>

    </div>
  );
}
