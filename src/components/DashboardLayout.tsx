import React, { useState, useContext, useEffect, useRef, lazy, Suspense } from 'react';
import { LayoutDashboard, Building2, Bed as BedIcon, Activity, Settings2, FileText, Menu, X, Search, ShieldAlert, LogOut, Clock, BarChart3, ClipboardList, ClipboardCheck, Wifi, WifiOff, RefreshCw, ChevronDown, ChevronRight, Settings, Database, Network, Smartphone, Bell, AlertCircle, Folder, HeartPulse, Loader2 } from 'lucide-react';
import { cn, getAnswerForQuestion } from '../lib/utils';
import { DashboardHome } from './DashboardHome';
import { AuthContext } from '../context/AuthContext';
import { useAuditData, useAuditSync } from '../context/AuditContext';
import { useSettings } from '../context/SettingsContext';
import { useSystemLogs } from '../context/SystemLogContext';
import { DatabaseSyncControl } from './DatabaseSyncControl';
import { triggerServerBackupJSON } from '../lib/apiClient';
import { DbMiddleware } from '../services/dbMiddleware';
import { AVAILABLE_MODULES } from '../lib/modules';

const localStorage = window.localStorage;

const SectorManager = lazy(() => import('./SectorManager').then(m => ({ default: m.SectorManager })));
const BedManager = lazy(() => import('./BedManager').then(m => ({ default: m.BedManager })));
const NewAuditForm = lazy(() => import('./NewAuditForm').then(m => ({ default: m.NewAuditForm })));
const QuestionManager = lazy(() => import('./QuestionManager').then(m => ({ default: m.QuestionManager })));
const ReportGenerator = lazy(() => import('./ReportGenerator').then(m => ({ default: m.ReportGenerator })));
const CompletedAudits = lazy(() => import('./CompletedAudits').then(m => ({ default: m.CompletedAudits })));
const AdminProfileManager = lazy(() => import('./AdminProfileManager').then(m => ({ default: m.AdminProfileManager })));
const AdminPanelCentral = lazy(() => import('./AdminPanelCentral').then(m => ({ default: m.AdminPanelCentral })));
const ModuleIndicadores = lazy(() => import('./ModuleIndicadores').then(m => ({ default: m.ModuleIndicadores })));
const ComparativeDashboard = lazy(() => import('./ComparativeDashboard').then(m => ({ default: m.ComparativeDashboard })));
const IrasAuditLogsViewer = lazy(() => import('./IrasAuditLogsViewer').then(m => ({ default: m.IrasAuditLogsViewer })));

type View = 'DASHBOARD' | 'INDICADORES' | 'COMPARATIVE' | 'SECTORS' | 'BEDS' | 'NEW_AUDIT' | 'COMPLETED_AUDITS' | 'IRAS_LOGS' | 'QUESTIONS' | 'REPORTS' | 'ADMIN' | 'PROFILE' | 'ADMIN_PROFILE' | 'ADMIN_USERS' | 'USERS_PERMISSIONS' | 'ADMIN_SETTINGS' | 'ADMIN_BACKUP' | 'ADMIN_LOGS' | 'ADMIN_MODULES' | 'ADMIN_APIS' | 'ADMIN_MAINTENANCE' | 'ADMIN_GEMINI' | 'ADMIN_PANEL' | 'ACCESS_DENIED';

function NetworkStatus() {
  const { status, pendingQueue, reconnect } = useAuditSync();

  if (status === 'connected') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 whitespace-nowrap" title="Online - Canal de Sincronização em Tempo Real Ativo">
        <Wifi size={12} className="text-emerald-600 shrink-0" />
        <span>Online</span>
      </span>
    );
  }

  if (status === 'connecting') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-sky-700 whitespace-nowrap" title="Conectando e transmitindo fila em lote...">
        <RefreshCw size={12} className="animate-spin text-sky-600 shrink-0" />
        <span>Sincronizando...</span>
      </span>
    );
  }

  return (
    <button
      onClick={reconnect}
      className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-rose-700 hover:text-rose-800 bg-rose-50 border border-rose-200 rounded-md px-2 py-0.5 transition cursor-pointer whitespace-nowrap"
      title={`Offline - Clique para forçar reconexão. Fila pendente: ${pendingQueue.length} transações.`}
    >
      <WifiOff size={12} className="shrink-0" />
      <span>Offline {pendingQueue.length > 0 && `(${pendingQueue.length})`}</span>
    </button>
  );
}

function DatabaseConnectionStatus() {
  const { dbConnected, dbStatus, dbLastHeartbeat } = useAuditData();

  let textClass = 'text-rose-700';
  let dotClass = 'bg-rose-500';
  let label = 'Banco Desconectado';

  const lastError = typeof window !== 'undefined' ? window.localStorage.getItem('hospaudit_last_api_error') : null;
  let titleText = `Sem comunicação com o Banco. Último heartbeat: ${dbLastHeartbeat}.${lastError ? ' Erro: ' + lastError : ''}`;

  if (dbStatus === 'reconnecting') {
    textClass = 'text-amber-700';
    dotClass = 'bg-amber-500';
    label = 'Reconectando...';
    titleText = `Restabelecendo comunicação com o Banco...`;
  } else if (dbConnected) {
    textClass = 'text-teal-700';
    dotClass = 'bg-teal-500';
    label = 'Banco Ativo';
    titleText = `Banco Conectado e Sincronizado às ${dbLastHeartbeat}.`;
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${textClass} select-none whitespace-nowrap`}
      title={titleText}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotClass} shrink-0`} />
      <Network size={12} className="shrink-0" />
      <span>{label}</span>
    </span>
  );
}

function ClockHeader() {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-mono tabular-nums font-medium text-slate-500 whitespace-nowrap">
      <Clock size={12} className="text-slate-400 shrink-0" />
      {currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </span>
  );
}

export function DashboardLayout() {
  const [activeView, setActiveView] = useState<View>('DASHBOARD');
  const [openedTabs, setOpenedTabs] = useState<View[]>(['DASHBOARD']);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [auditParams, setAuditParams] = useState<{sectorId: string, bedId: string} | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [formKey, setFormKey] = useState(0);
  const [adminProfileTab, setAdminProfileTab] = useState<'PROFILE' | 'USERS' | 'SETTINGS' | 'BACKUP' | 'LOGS'>('PROFILE');
  // --- Estados de Controle Modular e Permissões de Cargos ---
  const [dbModulos, setDbModulos] = useState<any[]>([]);
  const [dbPermissoes, setDbPermissoes] = useState<any[]>([]);

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    ANALISE: true,
    CADASTROS: true,
    PROCESSAMENTO: true,
    UTILITARIOS: true,
    TABELAS: true,
  });

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  useEffect(() => {
    setOpenedTabs(prev => {
      if (!prev.includes(activeView)) {
        return [...prev, activeView];
      }
      return prev;
    });
  }, [activeView]);

  useEffect(() => {
    const redirect = window.localStorage.getItem('admin_redirect_view');
    if (redirect) {
      window.localStorage.removeItem('admin_redirect_view');
      setActiveView(redirect as any);
    }
  }, [activeView]);

  const handleCloseTab = (view: View, e: React.MouseEvent) => {
    e.stopPropagation();
    const newTabs = openedTabs.filter(t => t !== view);
    
    if (newTabs.length === 0) {
      setOpenedTabs(['DASHBOARD']);
      setActiveView('DASHBOARD');
    } else {
      setOpenedTabs(newTabs);
      if (activeView === view) {
        setActiveView(newTabs[newTabs.length - 1]);
      }
    }
  };

  const { user, users, logout, cargos } = useContext(AuthContext);
  const { settings, toggleTheme } = useSettings();
  const { addLog } = useSystemLogs();
  const auditRunRef = useRef(false);

  // Sincronizar módulos e permissões do servidor
  useEffect(() => {
    const loadModulesAndPerms = async () => {
      try {
        const data = await DbMiddleware.executeRead();
        if (data) {
          if (data.modulos_sistema) {
            setDbModulos(data.modulos_sistema);
          }
          if (data.permissoes) {
            setDbPermissoes(data.permissoes);
          }
        }
      } catch (e) {
        console.warn('[DashboardLayout] Erro ao sincronizar controle modular:', e);
      }
    };
    loadModulesAndPerms();

    // Sincronização em tempo real reativa ao salvar as configurações
    window.addEventListener('hospaudit_modules_updated', loadModulesAndPerms);

    const interval = setInterval(loadModulesAndPerms, 60000);
    return () => {
      window.removeEventListener('hospaudit_modules_updated', loadModulesAndPerms);
      clearInterval(interval);
    };
  }, []);

  const getModuleIdForView = (viewId: string): string | null => {
    if (viewId === 'ADMIN_USERS') return 'USERS_PERMISSIONS';
    
    const knownViews = [
      'DASHBOARD', 'INDICADORES', 'COMPARATIVE', 'SECTORS', 'BEDS', 'QUESTIONS', 'NEW_AUDIT', 'COMPLETED_AUDITS', 'IRAS_LOGS', 'REPORTS'
    ];
    if (knownViews.includes(viewId)) return viewId;
    return null;
  };

  const isModuleActiveGlobally = (modId: string | null): boolean => {
    if (!modId) return true;
    const dbMod = dbModulos.find(m => m.id === modId);
    if (dbMod) {
      return dbMod.status === 1;
    }
    return true; // default to active
  };

  const hasVisualizarPermission = (modId: string | null): boolean => {
    if (user?.role === 'MASTER' || user?.role === 'ADMIN') return true;
    if (!modId) return true;
    
    // 1. Prioridade para as permissões individuais do próprio usuário colaborador
    const userPerms = user?.permissions || [];
    if (userPerms.includes(modId) || userPerms.includes('ALL')) {
      return true;
    }
    
    // 2. Fallback para as permissões configuradas no cargo (Grupo)
    const userCargo = (cargos || []).find(c => c.name === user?.cargo || c.id === user?.cargo);
    const userCargoId = userCargo ? userCargo.id : null;
    
    if (userCargoId) {
      const perm = dbPermissoes.find(p => p.cargo_id === userCargoId && p.modulo_id === modId);
      if (perm) {
        return Number(perm.pode_visualizar) === 1 || perm.pode_visualizar === true || perm.pode_visualizar === '1';
      }
    }
    
    return false;
  };

  const isSubItemVisible = (modId: string, itemName: string): boolean => {
    if (user?.role === 'MASTER' || user?.role === 'ADMIN') return true;
    
    // 1. Prioridade para as permissões individuais do próprio usuário colaborador
    const userPerms = user?.permissions || [];
    if (userPerms.includes(modId) || userPerms.includes('ALL')) {
      return true;
    }
    
    // 2. Fallback para as permissões configuradas no cargo (Grupo)
    const userCargo = (cargos || []).find(c => c.name === user?.cargo || c.id === user?.cargo);
    const userCargoId = userCargo ? userCargo.id : null;
    if (userCargoId) {
      const perm = dbPermissoes.find(p => p.cargo_id === userCargoId && p.modulo_id === modId);
      if (perm) {
        const podeVis = Number(perm.pode_visualizar) === 1 || perm.pode_visualizar === true || perm.pode_visualizar === '1';
        if (!podeVis) return false;
        if (perm.itens) {
          const arr = Array.isArray(perm.itens) ? perm.itens : [];
          return arr.includes(itemName);
        }
        return true;
      }
      return false;
    }
    return false;
  };

  // Interceptar mudanças de visão para redirecionar para ACCESS_DENIED se desativado ou sem permissão
  const dbModulosStr = JSON.stringify(dbModulos);
  const dbPermissoesStr = JSON.stringify(dbPermissoes);
  const userRoleAndCargoAndPerms = `${user?.id || ''}:${user?.role || ''}:${user?.cargo || ''}:${(user?.permissions || []).join(',')}`;

  useEffect(() => {
    const modId = getModuleIdForView(activeView);
    if (modId) {
      const isInactive = !isModuleActiveGlobally(modId);
      const isUnauthorized = !hasVisualizarPermission(modId);
      if (isInactive || isUnauthorized) {
        if (activeView !== 'ACCESS_DENIED') {
          setActiveView('ACCESS_DENIED');
        }
      }
    }
  }, [activeView, dbModulosStr, dbPermissoesStr, userRoleAndCargoAndPerms]);

  // Log detalhado para rastreamento de permissões ao carregar o dashboard
  useEffect(() => {
    if (user) {
      console.log('--- [DASHBOARD LOADED / USER STATUS] ---');
      console.log('ID do Usuário:', user.id);
      console.log('Nome do Usuário:', user.name);
      console.log('Email do Usuário:', user.email);
      console.log('Nível de Acesso:', user.role);
      console.log('Permissões Ativas (Calculadas/Banco de Dados):', user.permissions);
      console.log('Módulos Instalados Globalmente:', settings.installedModules);
      
      const allowed = [
        { id: 'DASHBOARD', name: 'Estatística Principal' },
        { id: 'SECTORS', name: 'Cadastro Setores' },
        { id: 'BEDS', name: 'Cadastro Leitos' },
        { id: 'QUESTIONS', name: 'Cadastro de Perguntas' },
        { id: 'NEW_AUDIT', name: 'Nova Auditoria' },
        { id: 'COMPLETED_AUDITS', name: 'Auditorias Realizadas' },
        { id: 'REPORTS', name: 'Gerar Relatórios' }
      ].filter(item => {
        const isInstalled = (settings.installedModules || []).includes(item.id);
        const hasPerm = user.role === 'MASTER' || (user.permissions || []).includes(item.id);
        return isInstalled && hasPerm;
      });
      
      console.log('Módulos Disponíveis para este Usuário:', allowed.map(a => `${a.name} (${a.id})`));
      console.log('----------------------------------------');
    } else {
      console.log('[DASHBOARD LOADED] Nenhum usuário logado.');
    }
  }, [user, settings.installedModules]);

  // Função de verificação para exibir avisos de inconsistência entre módulos habilitados globalmente e o contexto do usuário, além de auditar todos os usuários do painel
  useEffect(() => {
    if (!user || !users || users.length === 0 || !settings.installedModules || auditRunRef.current) return;
    
    console.log('--- [SISTEMA DE VERIFICAÇÃO DE CONSISTÊNCIA DE INICIALIZAÇÃO] ---');
    const installed = settings.installedModules || [];
    const inconsistencies: string[] = [];
    const generalInconsistencies: string[] = [];
    
    const knownModules = [
      'DASHBOARD', 'COMPARATIVE', 'SECTORS', 'BEDS', 'QUESTIONS', 'NEW_AUDIT', 'COMPLETED_AUDITS', 'IRAS_LOGS', 'REPORTS'
    ];

    // 1. Verificar o usuário atual para aviso rápido no console
    if (user.role !== 'MASTER') {
      const userPerms = user.permissions || [];
      userPerms.forEach(perm => {
        if (knownModules.includes(perm) && !installed.includes(perm)) {
          inconsistencies.push(`Usuário atual possui permissão ativa para o módulo "${perm}", porém este módulo está DESATIVADO globalmente nas configurações do hospital.`);
        }
      });
      
      const isAuditoriaActive = installed.includes('AUDITORIA');
      if (!isAuditoriaActive) {
        const auditPerms = ['NEW_AUDIT', 'COMPLETED_AUDITS', 'QUESTIONS', 'BEDS', 'SECTORS', 'COMPARATIVE', 'DASHBOARD', 'REPORTS'];
        const userHasAuditPerms = userPerms.some(p => auditPerms.includes(p));
        if (userHasAuditPerms) {
          inconsistencies.push(`O Módulo Central de Auditoria ("AUDITORIA") está desativado globalmente, mas o usuário atual possui permissões de sub-recursos ativos em seu perfil.`);
        }
      }
    }

    // 2. Realizar auditoria de permissões em relação aos módulos ativos para TODOS os usuários do painel
    users.forEach(u => {
      if (u.role === 'MASTER') return; // MASTER tem acesso total e automático, sem divergências
      
      const uPerms = u.permissions || [];
      
      // Se um usuário tem permissão para um módulo que está inativo globalmente, temos uma divergência
      uPerms.forEach(perm => {
        if (knownModules.includes(perm) && !installed.includes(perm)) {
          generalInconsistencies.push(`Usuário ${u.name} (${u.email}) possui permissão para o módulo "${perm}", mas o mesmo encontra-se inativo globalmente.`);
        }
      });
    });

    if (inconsistencies.length > 0) {
      console.warn('⚠️ [AVISO DE INCONSISTÊNCIA DETECTADO NO USUÁRIO ATUAL]:');
      inconsistencies.forEach(inc => console.warn(`  - ${inc}`));
    }

    // Disparar o log de inconsistência caso haja divergência entre as permissões do painel de usuários e os módulos ativos
    if (generalInconsistencies.length > 0) {
      auditRunRef.current = true;
      const logDetails = generalInconsistencies.join(' | ');
      addLog('Sistema', 'Divergência de Permissões', `Auditoria identificou divergências de permissões de módulos ativos para usuários do painel: ${logDetails}`);
      console.warn('⚠️ [AUDITORIA DE CARREGAMENTO] Divergência registrada nos logs do sistema:', logDetails);
    } else {
      auditRunRef.current = true;
      console.log('✅ Tudo verificado! Não existem inconsistências entre as configurações do hospital e as permissões de acesso de todos os usuários do painel.');
    }
    console.log('-----------------------------------------------------------------');
  }, [user, users, settings.installedModules, addLog]);

  const { sectors, beds, audits, questions, syncDatabases, divergences } = useAuditData();
  const [isSyncing, setIsSyncing] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);

  // Fechar popover de notificações ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setIsNotificationOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const pendingAuditsList = React.useMemo(() => {
    if (!audits || !questions || !beds || !sectors) return [];
    
    const map: Record<string, { bedId: string; bedNumber: string; sectorName: string; lastDate: string; auditId: string }> = {};
    const latestAuditPerBed: Record<string, any> = {};
    
    audits.forEach(audit => {
      const existing = latestAuditPerBed[audit.bedId];
      if (!existing || new Date(audit.date) > new Date(existing.date)) {
        latestAuditPerBed[audit.bedId] = audit;
      }
    });

    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const now = new Date().getTime();

    Object.values(latestAuditPerBed).forEach(audit => {
      const auditTime = new Date(audit.date).getTime();
      if (now - auditTime > SEVEN_DAYS_MS) return;

      const applicableQs = questions.filter(q => q.formType === audit.type);
      const hasPendingField = applicableQs.some(q => {
        const answer = getAnswerForQuestion(audit.answers, q, questions);
        return !answer || answer.trim() === '';
      });

      if (hasPendingField) {
        const bed = beds.find(b => b.id === audit.bedId);
        const sector = sectors.find(s => s.id === audit.sectorId);
        const bedNum = bed?.number || audit.bedId || 'N/A';
        const sectorName = sector?.name || 'N/A';
        
        map[audit.bedId] = {
          bedId: audit.bedId,
          bedNumber: bedNum,
          sectorName: sectorName,
          lastDate: audit.date,
          auditId: audit.id
        };
      }
    });

    return Object.values(map);
  }, [audits, beds, sectors, questions]);

  const handleForceSync = async () => {
    setIsSyncing(true);
    try {
      await syncDatabases();
    } finally {
      setTimeout(() => setIsSyncing(false), 1000);
    }
  };

  // Session inactivity timeout is fully handled at the top-level App.tsx with Toast notifications

  // Listener para navegação dinâmica disparada de outros componentes (como o Painel Geral Admin)
  useEffect(() => {
    const handleNavigate = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail && customEvent.detail.view) {
        setActiveView(customEvent.detail.view);
      }
    };
    window.addEventListener('hospaudit_navigate_view', handleNavigate);
    return () => {
      window.removeEventListener('hospaudit_navigate_view', handleNavigate);
    };
  }, []);

  // Redirecionamento automático se a tela ativa não for permitida ou instalada
  const installedModulesStr = (settings.installedModules || []).join(',');
  const userPermissionsStr = (user?.permissions || []).join(',');

  useEffect(() => {
    if (activeView === 'ACCESS_DENIED' || activeView === 'ADMIN_PROFILE' || activeView === 'ADMIN' || activeView === 'PROFILE' || activeView.startsWith('ADMIN_') || activeView === 'ADMIN_PANEL') return;
    const allowedIds = menuItems.map(item => item.id);
    if (allowedIds.length > 0 && !allowedIds.includes(activeView)) {
      setActiveView(allowedIds[0] as View);
    }
  }, [installedModulesStr, userPermissionsStr, activeView, dbModulosStr, dbPermissoesStr]);

  // Automated Backup (with 25-minute cooldown to prevent redundant triggers on re-mounts/syncs)
  useEffect(() => {
    if (user?.role !== 'MASTER' && user?.role !== 'ADMIN') return;

    const doBackup = async (force = false) => {
      try {
        const lastTs = Number(localStorage.getItem('hospaudit_last_auto_backup_ts') || '0');
        const now = Date.now();
        if (!force && now - lastTs < 25 * 60 * 1000) {
          return;
        }
        const payload = {
          settings: localStorage.getItem('hospaudit_settings'),
          syslogs: localStorage.getItem('hospaudit_syslogs'),
          users: localStorage.getItem('hospaudit_users'),
          sectors: localStorage.getItem('hospaudit_sectors'),
          beds: localStorage.getItem('hospaudit_beds'),
          audits: localStorage.getItem('hospaudit_audits'),
          questions: localStorage.getItem('hospaudit_questions_v4')
        };
        
        const res = await triggerServerBackupJSON(payload);
        if (res.success) {
          localStorage.setItem('hospaudit_last_auto_backup_ts', String(Date.now()));
          addLog(user?.name || 'Sistema (Backup)', 'Backup Automático', `Backup automático em segundo plano realizado com sucesso. Arquivo: ${res.filename}`);
        }
      } catch (err) {
        console.warn('Auto backup failed', err);
      }
    };

    const initTimer = setTimeout(() => doBackup(false), 15000);
    const intervalTimer = setInterval(() => doBackup(true), 1800000);

    return () => {
      clearTimeout(initTimer);
      clearInterval(intervalTimer);
    };
  }, [user?.role, user?.name, addLog]);

  const getIconForModule = (id: string) => {
    switch (id) {
      case 'DASHBOARD': return <LayoutDashboard size={20} />;
      case 'INDICADORES': return <BarChart3 size={20} />;
      case 'COMPARATIVE': return <Activity size={20} />;
      case 'SECTORS': return <Building2 size={20} />;
      case 'BEDS': return <BedIcon size={20} />;
      case 'QUESTIONS': return <Settings2 size={20} />;
      case 'NEW_AUDIT': return <ClipboardList size={20} />;
      case 'COMPLETED_AUDITS': return <ClipboardCheck size={20} />;
      case 'IRAS_LOGS': return <ShieldAlert size={20} />;
      case 'REPORTS': return <FileText size={20} />;
      default: return <Smartphone size={20} />;
    }
  };

  const getDisplayCategory = (cat: string): string => {
    switch (cat) {
      case 'Estatísticas':
        return 'Análise De Dados';
      case 'Cadastros':
        return 'Cadastros';
      case 'Auditoria':
      case 'Relatórios':
        return 'Processamento';
      case 'Personalizados':
      case 'Gestão':
        return 'Utilitários';
      case 'Hospitalar':
        return 'Tabelas';
      default:
        return 'Outros';
    }
  };

  let rawMenuItems: any[] = [
    ...AVAILABLE_MODULES.map(mod => ({
      id: mod.id,
      label: mod.name,
      icon: getIconForModule(mod.id),
      category: mod.category,
      items: mod.items || []
    })),
    {
      id: 'ADMIN_PANEL',
      label: 'Painel Admin',
      icon: <Settings size={20} />,
      category: 'Gestão',
      items: []
    }
  ];

  // Filtrar os itens com base em módulos instalados e permissões de usuário
  let menuItems = rawMenuItems.filter(item => {
    // 1. Verificar se o módulo está ativo globalmente e se o cargo do usuário possui permissão de visualizar
    const modId = getModuleIdForView(item.id);
    if (modId) {
      if (!isModuleActiveGlobally(modId)) return false;
      if (!hasVisualizarPermission(modId)) return false;
    }

    const isAdminItem = item.id.startsWith('ADMIN_');
    if (isAdminItem) {
      if (item.id === 'ADMIN_USERS') {
        const isUsersPermissionsInstalled = (settings.installedModules || []).includes('USERS_PERMISSIONS');
        if (!isUsersPermissionsInstalled) return false;
        const userPerms = user?.permissions || [];
        if (userPerms.includes('ADMIN_USERS') || userPerms.includes('ALL')) return true;
      }
      return user?.role === 'MASTER' || user?.role === 'ADMIN';
    }

    // Se o item tem um sub-módulo específico, ele deve estar instalado
    if (item.id !== 'DASHBOARD' && item.id !== 'ADMIN_PANEL') {
      if (item.moduleKey) {
        const isSubInstalled = (settings.installedModules || []).includes(item.moduleKey);
        if (!isSubInstalled) return false;
      } else {
        const isInstalled = (settings.installedModules || []).includes(item.id);
        if (!isInstalled) return false;
      }
    }

    // 2. Verificar se o usuário tem permissão de acesso
    if (user?.role === 'MASTER' || user?.role === 'ADMIN') return true;

    // Se for um módulo do banco de dados, a permissão já foi validada pelo hasVisualizarPermission acima
    if (modId && modId !== 'DASHBOARD') {
      return true;
    }
    
    const permKey = item.id;
    const userPerms = user?.permissions || [];
    let hasPermission = userPerms.includes(permKey) || 
                          userPerms.includes(`${permKey}:READ`) || 
                          userPerms.includes(`${permKey}:WRITE`) ||
                          userPerms.includes('ALL');

    return hasPermission;
  });

  const categories = [
    { id: 'ANALISE', label: 'Análise De Dados' },
    { id: 'CADASTROS', label: 'Cadastros' },
    { id: 'PROCESSAMENTO', label: 'Processamento' },
    { id: 'UTILITARIOS', label: 'Utilitários' },
    { id: 'TABELAS', label: 'Tabelas' }
  ];

  const menuGroups = categories.map(cat => {
    return {
      id: cat.id,
      label: cat.label,
      items: menuItems.filter(item => item.id !== 'ADMIN_PANEL' && getDisplayCategory(item.category) === cat.label)
    };
  }).filter(group => group.items.length > 0);

  // Auto-expand group of active view
  useEffect(() => {
    let itemCategory = '';
    const activeItem = AVAILABLE_MODULES.find(item => item.id === activeView);
    if (activeItem) {
      itemCategory = activeItem.category;
    } else if (activeView === 'ADMIN_PANEL') {
      itemCategory = 'Gestão';
    }

    if (itemCategory) {
      const displayCat = getDisplayCategory(itemCategory);
      const catKey = displayCat === 'Análise De Dados' ? 'ANALISE' :
                     displayCat === 'Cadastros' ? 'CADASTROS' :
                     displayCat === 'Processamento' ? 'PROCESSAMENTO' :
                     displayCat === 'Utilitários' ? 'UTILITARIOS' :
                     displayCat === 'Tabelas' ? 'TABELAS' : '';
      if (catKey) {
        setExpandedGroups(p => ({ ...p, [catKey]: true }));
      }
    }
  }, [activeView]);

  const handleAuditClick = (sectorId: string, bedId: string) => {
    setAuditParams({ sectorId, bedId });
    setActiveView('NEW_AUDIT');
    setFormKey(prev => prev + 1);
  };

  const handleNewAuditClick = () => {
    setAuditParams(null);
    setActiveView('NEW_AUDIT');
    setFormKey(prev => prev + 1);
  };

  const renderAccessDenied = () => {
    const modId = getModuleIdForView(activeView);
    const isInactive = modId ? !isModuleActiveGlobally(modId) : false;

    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center animate-fade-in bg-white rounded-2xl border border-slate-100 shadow-xs max-w-2xl mx-auto my-12">
        <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mb-6 shadow-xs border border-rose-100 animate-pulse">
          <ShieldAlert size={32} />
        </div>
        <h3 className="text-xl font-bold text-slate-800 mb-2">Acesso Restrito / Módulo Inativo</h3>
        <p className="text-slate-500 text-sm max-w-md mb-6 leading-relaxed">
          {isInactive 
            ? `O módulo correspondente está temporariamente desativado globalmente nas configurações administrativas.`
            : `Seu cargo (${user?.cargo || 'Não definido'}) não possui a permissão de visualização necessária para acessar este módulo/recurso.`}
        </p>
        <button
          onClick={() => setActiveView('DASHBOARD')}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-850 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer border-none"
        >
          Voltar para a Estatística Principal
        </button>
      </div>
    );
  };

  const renderContent = () => {
    switch (activeView) {
      case 'DASHBOARD': return <DashboardHome searchTerm={searchTerm} onNavigate={setActiveView} />;
      case 'INDICADORES': return <ModuleIndicadores />;
      case 'COMPARATIVE': return <ComparativeDashboard />;
      case 'SECTORS': return <SectorManager />;
      case 'BEDS': return <BedManager onAuditClick={handleAuditClick} />;
      case 'QUESTIONS': return <QuestionManager />;
      case 'NEW_AUDIT': return <NewAuditForm key={`new-audit-${formKey}`} initialParams={auditParams} onClearParams={() => setAuditParams(null)} />;
      case 'COMPLETED_AUDITS': return <CompletedAudits />;
      case 'IRAS_LOGS': return <IrasAuditLogsViewer />;
      case 'REPORTS': return <ReportGenerator />;
      case 'ADMIN': 
        return (
          <AdminProfileManager 
            onBackToAudit={() => setActiveView('DASHBOARD')} 
            initialTab="SETTINGS" 
            hideSidebar={true}
          />
        );
      case 'PROFILE': 
        return (
          <AdminProfileManager 
            onBackToAudit={() => setActiveView('DASHBOARD')} 
            initialTab="PROFILE" 
            hideSidebar={true}
          />
        );
      case 'ADMIN_PROFILE': 
        return (
          <AdminProfileManager 
            onBackToAudit={() => setActiveView('DASHBOARD')} 
            initialTab={adminProfileTab} 
            hideSidebar={true}
          />
        );
      case 'ADMIN_PANEL':
        return (
          <AdminPanelCentral />
        );
      case 'ADMIN_USERS':
      case 'USERS_PERMISSIONS':
        return (
          <AdminProfileManager 
            onBackToAudit={() => setActiveView('DASHBOARD')} 
            initialTab="USERS" 
            hideSidebar={true}
          />
        );

      case 'ACCESS_DENIED':
        return renderAccessDenied();
    }
  };

  return (
    <div className="flex h-screen bg-[#F3F7FA] font-sans overflow-hidden w-full flex-col lg:flex-row print:overflow-visible print:h-auto">
      {/* Mobile Top Header */}
      <div className="lg:hidden bg-[#071A26] text-white p-3.5 flex justify-between items-center shrink-0 border-b border-[#113144] print:hidden">
        <div className="font-bold text-base flex items-center gap-2.5">
          <div className="w-8 h-8 bg-gradient-to-tr from-sky-600 to-teal-500 rounded-xl flex items-center justify-center shadow-md shadow-sky-900/30">
            <HeartPulse size={17} className="text-white" />
          </div>
          <div>
            <span className="text-slate-100 font-extrabold text-sm block leading-tight">{settings.appName}</span>
            <span className="text-[11px] text-sky-300 font-medium">Unidade Hospitalar</span>
          </div>
        </div>
        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 transition"
          aria-label="Alternar menu"
        >
          {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Hospital Clinical Sidebar */}
      <aside className={cn(
        "bg-[#071A26] border-r border-[#113144] w-72 max-w-[85vw] lg:w-72 flex-shrink-0 flex flex-col transition-all duration-300 lg:static fixed z-30 h-full print:hidden shadow-2xl lg:shadow-none",
        isMobileMenuOpen ? 'left-0' : '-left-full'
      )}>
        {/* Brand Block */}
        <div className="p-5 border-b border-[#113144] flex items-center gap-3 bg-gradient-to-r from-[#071A26] to-[#0A2434]">
          <div className="w-10 h-10 bg-gradient-to-tr from-sky-600 via-sky-500 to-teal-500 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-sky-900/40">
            <HeartPulse size={20} className="text-white" />
          </div>
          <div className="text-left overflow-hidden">
            <span className="font-extrabold text-sm text-white block truncate leading-tight tracking-tight">{settings.appName}</span>
            <span className="text-[11px] text-sky-300/90 font-medium block mt-0.5 truncate">Auditoria e Segurança Clínica</span>
          </div>
        </div>

        {/* Sidebar Search Bar */}
        <div className="px-4 py-3 border-b border-[#113144]/80 shrink-0 bg-[#061620]">
          <div className="relative flex items-center bg-[#0B2333] hover:bg-[#0D2A3D] rounded-xl border border-[#163A50] focus-within:border-sky-500/70 transition-all duration-200">
            <Search size={14} className="text-slate-400 absolute left-3 pointer-events-none" />
            <input 
              type="text" 
              placeholder="Pesquisar módulo..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-transparent pl-9 pr-3 py-2 text-xs text-slate-100 focus:outline-none placeholder-slate-400 font-medium" 
            />
          </div>
        </div>

        {/* Section Header */}
        <div className="px-5 pt-3.5 pb-1 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-slate-400 select-none">
            Setores e Módulos Clínicos
          </span>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {menuGroups.map(group => (
            <div key={group.id} className="mb-1">
              <button
                onClick={() => toggleGroup(group.id)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-slate-300 hover:text-white hover:bg-[#0C2738] transition-all text-left select-none cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-lg bg-[#0D2B3E] border border-[#17415A] flex items-center justify-center text-sky-400 group-hover:text-sky-300 group-hover:border-sky-500/40 transition-all shrink-0">
                    <Folder size={13} />
                  </div>
                  <span className="text-xs font-bold text-slate-200 group-hover:text-white transition-colors">
                    {group.label}
                  </span>
                </div>
                {expandedGroups[group.id] ? (
                  <ChevronDown size={14} className="text-slate-400 group-hover:text-slate-200 transition-colors" />
                ) : (
                  <ChevronRight size={14} className="text-slate-400 group-hover:text-slate-200 transition-colors" />
                )}
              </button>
              
              {expandedGroups[group.id] && (
                <div className="space-y-1 pl-4 mt-1 border-l border-[#14374D] ml-4 animate-fade-slide">
                  {group.items.map(item => {
                    const isActive = activeView === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          setActiveView(item.id);
                          setIsMobileMenuOpen(false);
                        }}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-150 text-left",
                          isActive 
                            ? "bg-gradient-to-r from-sky-600 to-teal-600 text-white shadow-md shadow-sky-950/40 font-bold" 
                            : "text-slate-300/85 hover:bg-[#0C2738] hover:text-white"
                        )}
                      >
                        <div className={cn("shrink-0", isActive ? "text-white" : "text-sky-400/80")}>
                          {item.icon}
                        </div>
                        <span className="truncate flex-1">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </nav>

        {/* User Profile Footer */}
        <div className="mt-auto border-t border-[#113144] p-3.5 bg-[#05141E]">
          <div className="flex items-center justify-between gap-2 bg-[#0A2231] border border-[#14374D] rounded-xl p-2">
            <button 
              onClick={() => { 
                setActiveView('PROFILE'); 
                setIsMobileMenuOpen(false); 
              }}
              className="flex items-center gap-2.5 flex-1 min-w-0 text-left cursor-pointer"
              title="Meu Perfil"
            >
              <div className="w-8 h-8 bg-gradient-to-tr from-sky-600 to-teal-500 rounded-lg flex items-center justify-center text-white font-black text-xs shrink-0 shadow-sm">
                {user?.name?.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-100 truncate leading-tight">{user?.name}</p>
                <p className="text-[11px] text-sky-300/90 font-medium mt-0.5 truncate">{user?.cargo || user?.role}</p>
              </div>
            </button>
            <button 
              onClick={logout}
              title="Sair do Sistema"
              className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-500/15 hover:text-rose-300 transition cursor-pointer"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-20 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden print:overflow-visible print:w-full print:h-auto bg-[#F3F7FA]">
        
        {/* Executive Clinical Topbar */}
        <header className="dash-glass-header h-16 px-4 lg:px-8 flex items-center justify-between shrink-0 gap-4 print:hidden sticky top-0 z-20">
          {/* Breadcrumb & Context */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
              <span className="hidden sm:inline truncate max-w-[180px]">{settings.appName || 'Hospital Geral'}</span>
              <span className="text-slate-300 hidden sm:inline">/</span>
              <span className="text-slate-500 hidden md:inline">Auditoria Clínica</span>
              <span className="text-slate-300 hidden md:inline">/</span>
              <h2 className="text-sm lg:text-base font-bold text-slate-900 truncate inline-block">
                {menuItems.find(m => m.id === activeView)?.label || (activeView === 'PROFILE' ? 'Meu Perfil' : activeView === 'ADMIN_PANEL' ? 'Painel de Gestão' : 'Dashboard')}
              </h2>
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <ClockHeader />
              <span aria-hidden="true" className="text-slate-300 text-xs">·</span>
              <NetworkStatus />
              <span aria-hidden="true" className="text-slate-300 text-xs hidden sm:inline">·</span>
              <span className="hidden sm:inline-flex"><DatabaseConnectionStatus /></span>
            </div>
          </div>
          
          {/* Right Header Actions */}
          <div className="flex items-center gap-2.5 shrink-0" ref={notificationRef}>
            <DatabaseSyncControl />

            {(user?.role === 'ADMIN' || user?.role === 'MASTER') && (
              <button
                onClick={() => setActiveView('ADMIN_PANEL')}
                className={cn(
                  "dash-tab-btn transition-all font-bold text-xs py-2 px-3",
                  activeView === 'ADMIN_PANEL'
                    ? "bg-sky-700 text-white border-sky-700 shadow-sm"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                )}
                title="Painel de Gestão"
              >
                <Settings size={15} />
                <span className="hidden sm:inline">Painel de Gestão</span>
              </button>
            )}

            {/* Notification Bell */}
            <div className="relative">
              <button 
                onClick={() => setIsNotificationOpen(!isNotificationOpen)}
                className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:text-slate-900 hover:border-slate-300 transition relative cursor-pointer shadow-3xs"
                title="Avisos e Pendências do Sistema"
              >
                <Bell size={17} className={pendingAuditsList.length > 0 ? "text-amber-500" : ""} />
                {pendingAuditsList.length > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-[9px] font-black text-white shadow-xs">
                    {pendingAuditsList.length}
                  </span>
                )}
              </button>

              {isNotificationOpen && (
                <div className="absolute right-0 top-11 w-80 bg-white border border-slate-200/90 rounded-2xl shadow-xl z-50 overflow-hidden animate-fade-slide text-left">
                  <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/70">
                    <h3 className="text-xs font-bold text-slate-800">Avisos e Pendências</h3>
                    {pendingAuditsList.length > 0 && (
                      <span className="text-[11px] font-bold text-amber-700">
                        {pendingAuditsList.length} leito(s)
                      </span>
                    )}
                  </div>
                  
                  <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                    <div className="p-3 flex items-start gap-2.5 hover:bg-slate-50 transition-colors">
                      <Database size={15} className={cn("mt-0.5 shrink-0", divergences?.serverOnline ? "text-emerald-500" : "text-rose-500")} />
                      <div>
                        <p className="text-xs font-bold text-slate-800">Banco de Dados</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {divergences?.serverOnline ? "Sincronizado e operando normalmente." : "Desconectado do servidor central."}
                        </p>
                      </div>
                    </div>

                    {pendingAuditsList.length > 0 ? (
                      pendingAuditsList.map((item, idx) => (
                        <div key={idx} className="p-3 flex items-start gap-2.5 hover:bg-slate-50 transition-colors">
                          <AlertCircle size={15} className="text-amber-500 mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-800 truncate">
                              Leito {item.bedNumber} ({item.sectorName})
                            </p>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              Possui checklist com perguntas pendentes.
                            </p>
                            <button
                              onClick={() => {
                                setActiveView('REPORTS');
                                setIsNotificationOpen(false);
                              }}
                              className="mt-1 text-[11px] font-bold text-sky-700 hover:text-sky-800 cursor-pointer"
                            >
                              Ir para Correção &rarr;
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-5 text-center">
                        <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-2">
                          <ClipboardCheck size={18} />
                        </div>
                        <p className="text-xs font-bold text-slate-700">Tudo em dia!</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">Nenhuma divergência clínica ativa.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

          </div>
        </header>

        {/* Modern Tabs Bar */}
        <div id="main-tabs-container" className="bg-white/90 border-b border-slate-200/80 px-4 lg:px-8 py-2 flex items-center gap-1.5 overflow-x-auto print:hidden shrink-0" style={{ scrollbarWidth: 'none' }}>
          {openedTabs.map(tabId => {
            const menuItem = menuItems.find(m => m.id === tabId);
            const label = menuItem?.label || (tabId === 'PROFILE' ? 'Meu Perfil' : tabId === 'ADMIN_PANEL' ? 'Painel de Gestão' : 'Dashboard');
            const isActive = activeView === tabId;
            return (
              <div
                key={tabId}
                onClick={() => setActiveView(tabId)}
                className={cn(
                  "dash-tab-btn group",
                  isActive ? "active" : ""
                )}
              >
                <span>{label}</span>
                {tabId !== 'DASHBOARD' && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleCloseTab(tabId, e); }}
                    className="ml-1 p-0.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                    title="Fechar aba"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Viewport Content */}
        <div className="flex-1 overflow-x-hidden overflow-y-auto print:overflow-visible p-4 lg:p-6">
          <Suspense fallback={
            <div className="flex flex-col items-center justify-center min-h-[45vh] gap-3 text-slate-500">
              <Loader2 className="w-7 h-7 animate-spin text-sky-600" />
              <span className="text-xs font-semibold">Carregando módulo clínico...</span>
            </div>
          }>
            {renderContent()}
          </Suspense>
        </div>
      </main>
    </div>
  );
}
