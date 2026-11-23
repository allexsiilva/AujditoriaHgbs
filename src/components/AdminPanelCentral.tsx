import React, { useState, useEffect, useContext, useMemo } from 'react';
import { 
  LayoutGrid, 
  Settings, 
  Users, 
  Building2, 
  Bed as BedIcon, 
  Wrench, 
  Folder, 
  Search, 
  Plus, 
  X, 
  Printer, 
  Edit, 
  Trash2, 
  Github, 
  Eye, 
  EyeOff, 
  ChevronRight, 
  ArrowRight, 
  Layout, 
  Activity, 
  Signature, 
  DollarSign, 
  MessageSquare, 
  Video, 
  FlaskConical, 
  Tv, 
  FileText, 
  Database, 
  LogOut, 
  Clock, 
  ArrowLeft, 
  ClipboardList, 
  CheckCircle2, 
  FolderPlus, 
  ShieldAlert, 
  Sparkles, 
  RefreshCw, 
  FileSpreadsheet, 
  Cpu, 
  Info,
  Check
} from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useSystemLogs } from '../context/SystemLogContext';
import { DbMiddleware } from '../services/dbMiddleware';
import { AdminProfileManager } from './AdminProfileManager';
import { AVAILABLE_MODULES } from '../lib/modules';
import { DatabaseConfigManager } from './DatabaseConfigManager';

interface ModuleConfig {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  items: string[];
}

export function AdminPanelCentral() {
  const { user, cargos } = useContext(AuthContext);
  const { settings, toggleTheme, updateSettings } = useSettings();
  const { addLog } = useSystemLogs();

  // Navigation states
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'DBCONFIG' | 'USERS' | 'SECTORS' | 'BEDS' | 'BACKUP' | 'LOGS' | 'SETTINGS' | 'GITHUB'>('OVERVIEW');
  const [moduleSearchText, setModuleSearchText] = useState('');
  const [moduleFilterCategory, setModuleFilterCategory] = useState('All');
  
  // Database state
  const [dbModulos, setDbModulos] = useState<any[]>([]);
  const [customModules, setCustomModules] = useState<any[]>([]);
  const [stats, setStats] = useState({
    totalModules: 0,
    activeModules: 0,
    customCount: 0,
    usersCount: 0,
    sectorsCount: 0,
    bedsCount: 0,
    isDbConnected: true
  });

  // Modal creation states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{ id: string; name: string; type: string } | null>(null);
  const [newModuleName, setNewModuleName] = useState('');
  const [newModuleDesc, setNewModuleDesc] = useState('');
  const [newModuleCategory, setNewModuleCategory] = useState('Hospitalar');
  const [newModuleItemInput, setNewModuleItemInput] = useState('');
  const [newModuleItems, setNewModuleItems] = useState<string[]>([]);
  const [cargoPermsToAssign, setCargoPermsToAssign] = useState<Record<string, { pode_visualizar: boolean; pode_criar_editar: boolean; pode_deletar: boolean }>>({});
  
  // Edit Modal States
  const [editingModule, setEditingModule] = useState<any | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editModuleName, setEditModuleName] = useState('');
  const [editModuleDesc, setEditModuleDesc] = useState('');
  const [editModuleCategory, setEditModuleCategory] = useState('Hospitalar');
  const [editModuleItems, setEditModuleItems] = useState<string[]>([]);
  const [editModuleItemInput, setEditModuleItemInput] = useState('');

  // Inline inputs for sub-items
  const [inlineItemInputs, setInlineItemInputs] = useState<Record<string, string>>({});

  // Notification Toast State
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Sync Modules and General Data
  const loadModulesAndStats = async () => {
    try {
      const data = await DbMiddleware.executeRead();
      if (data) {
        // Extract modules
        const modulosList = data.modulos_sistema || [];
        setDbModulos(modulosList);

        // Identify custom modules
        const standardIds = AVAILABLE_MODULES.map(m => m.id);
        const customFromDb = modulosList
          .filter((m: any) => !standardIds.includes(m.id))
          .map((m: any) => ({
            id: m.id,
            name: m.name,
            description: m.description,
            category: m.category || 'Hospitalar',
            status: m.status !== undefined ? m.status : 1,
            items: m.items ? (typeof m.items === 'string' ? JSON.parse(m.items) : m.items) : []
          }));
        setCustomModules(customFromDb);

        // Calculate Stats
        const usersCount = (data.usuarios || []).length;
        const sectorsCount = (data.setores || []).length;
        const bedsCount = (data.leitos || []).length;
        const activeCount = modulosList.filter((m: any) => m.status === 1).length + 
                            (AVAILABLE_MODULES.length - modulosList.filter((m: any) => standardIds.includes(m.id)).length);

        setStats({
          totalModules: AVAILABLE_MODULES.length + customFromDb.length,
          activeModules: activeCount,
          customCount: customFromDb.length,
          usersCount,
          sectorsCount,
          bedsCount,
          isDbConnected: true
        });
      }
    } catch (e) {
      console.warn('[AdminPanelCentral] Erro ao carregar dados:', e);
      setStats(prev => ({ ...prev, isDbConnected: false }));
    }
  };

  useEffect(() => {
    loadModulesAndStats();
    // Listening to sync updates
    window.addEventListener('hospaudit_modules_updated', loadModulesAndStats);
    return () => {
      window.removeEventListener('hospaudit_modules_updated', loadModulesAndStats);
    };
  }, []);

  // Standard modules with dynamic status
  const standardModulesMapped = useMemo(() => {
    return AVAILABLE_MODULES.map(std => {
      const dbMatch = dbModulos.find(m => m.id === std.id);
      const status = dbMatch ? (dbMatch.status !== undefined ? dbMatch.status : 1) : 1;
      let dbItems = std.items || [];
      if (dbMatch && dbMatch.items) {
        try {
          const parsed = typeof dbMatch.items === 'string' ? JSON.parse(dbMatch.items) : dbMatch.items;
          if (Array.isArray(parsed)) {
            dbItems = Array.from(new Set([...dbItems, ...parsed]));
          }
        } catch (e) {}
      }
      return {
        id: std.id,
        name: std.name,
        description: std.description,
        category: std.category,
        icon: std.icon,
        items: dbItems,
        status,
        type: 'standard'
      };
    });
  }, [dbModulos]);

  // Combined module view list
  const combinedModulesList = useMemo(() => {
    const list = [
      {
        id: 'GITHUB_UPDATE',
        name: 'Atualização do Sistema via GitHub',
        description: 'Mantenha o HospAudit atualizado com o repositório remoto. Configure as credenciais do Git, tokens de acesso (PAT) e realize buscas de novos patches.',
        category: 'Gestão',
        icon: 'Github',
        items: ['Sincronizar Repositório', 'Verificar Atualizações', 'Salvar Token (PAT)'],
        status: 1,
        type: 'system_tool'
      },
      ...standardModulesMapped
    ];
    customModules.forEach(cust => {
      if (!list.some(m => m.id === cust.id)) {
        list.push({
          id: cust.id,
          name: cust.name,
          description: cust.description,
          category: cust.category || 'Hospitalar',
          icon: 'FolderPlus',
          items: cust.items || [],
          status: cust.status !== undefined ? cust.status : 1,
          type: 'custom'
        });
      }
    });
    return list;
  }, [standardModulesMapped, customModules]);

  // Filtering module list
  const filteredModules = useMemo(() => {
    return combinedModulesList.filter(m => {
      const name = m?.name || '';
      const description = m?.description || '';
      const id = m?.id || '';
      const matchesSearch = name.toLowerCase().includes(moduleSearchText.toLowerCase()) ||
                            description.toLowerCase().includes(moduleSearchText.toLowerCase()) ||
                            id.toLowerCase().includes(moduleSearchText.toLowerCase());
      const matchesCategory = moduleFilterCategory === 'All' || m?.category === moduleFilterCategory;
      return matchesSearch && matchesCategory;
    });
  }, [combinedModulesList, moduleSearchText, moduleFilterCategory]);

  // Quick launch trigger
  const handleLaunchModule = (viewId: string) => {
    if (viewId === 'GITHUB_UPDATE') {
      setActiveTab('GITHUB');
    } else {
      window.dispatchEvent(new CustomEvent('hospaudit_navigate_view', { detail: { view: viewId } }));
    }
  };

  // Toggle module activation state
  const handleToggleModuleStatus = async (modId: string, currentStatus: number) => {
    const nextStatus = currentStatus === 1 ? 0 : 1;
    const actionLabel = nextStatus === 1 ? 'Ativado' : 'Desativado';
    
    try {
      const res = await fetch('/api.php?action=update_module_status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modulo_id: modId,
          status: nextStatus
        })
      });

      if (res.ok) {
        showToast(`Módulo "${combinedModulesList.find(m => m.id === modId)?.name}" foi ${actionLabel.toLowerCase()} com sucesso!`, 'success');
        if (user) {
          addLog(user.name, 'Módulo ' + actionLabel, `Módulo ${modId} alterado para status ${nextStatus}.`);
        }
        loadModulesAndStats();
        // Notify others
        window.dispatchEvent(new Event('hospaudit_modules_updated'));
      } else {
        throw new Error('Falha ao atualizar status');
      }
    } catch (err: any) {
      showToast('Erro ao alterar status: ' + err.message, 'error');
    }
  };

  // Inline Sub-Item adder
  const handleAddInlineItem = async (moduloId: string) => {
    const inputVal = inlineItemInputs[moduloId]?.trim();
    if (!inputVal) return;

    const targetMod = combinedModulesList.find(m => m.id === moduloId);
    if (!targetMod) return;

    const updatedItems = Array.from(new Set([...(targetMod.items || []), inputVal]));

    try {
      const res = await fetch('/api.php?action=create_custom_module', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: moduloId,
          name: targetMod.name,
          category: targetMod.category,
          description: targetMod.description,
          items: updatedItems
        })
      });

      if (res.ok) {
        setInlineItemInputs(prev => ({ ...prev, [moduloId]: '' }));
        showToast(`Atividade "${inputVal}" adicionada ao módulo!`, 'success');
        loadModulesAndStats();
        window.dispatchEvent(new Event('hospaudit_modules_updated'));
      } else {
        throw new Error('Erro ao salvar');
      }
    } catch (err: any) {
      showToast('Erro ao adicionar atividade: ' + err.message, 'error');
    }
  };

  // Create Module Handler
  const handleCreateModule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newModuleName.trim()) return;

    const slug = 'HOSP_CUSTOM_' + newModuleName.trim().toUpperCase().replace(/[^A-Z0-9]/g, '_');
    const payload = {
      id: slug,
      name: newModuleName.trim(),
      description: newModuleDesc.trim() || 'Módulo customizado do hospital.',
      category: newModuleCategory,
      items: newModuleItems
    };

    try {
      const res = await fetch('/api.php?action=create_custom_module', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error('Falha ao salvar módulo no banco.');

      // Associate initial permissions if defined
      for (const cargoId of Object.keys(cargoPermsToAssign)) {
        const flags = cargoPermsToAssign[cargoId];
        if (flags.pode_visualizar || flags.pode_criar_editar || flags.pode_deletar) {
          const permPayload = {
            cargo_id: cargoId,
            permissions: [
              {
                modulo_id: slug,
                pode_visualizar: flags.pode_visualizar ? 1 : 0,
                pode_criar_editar: flags.pode_criar_editar ? 1 : 0,
                pode_deletar: flags.pode_deletar ? 1 : 0,
                itens: newModuleItems
              }
            ]
          };

          await fetch('/api.php?action=update_permissions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(permPayload)
          });
        }
      }

      showToast(`Módulo "${newModuleName}" criado com sucesso!`, 'success');
      if (user) {
        addLog(user.name, 'Criação de Módulo', `Módulo personalizado "${slug}" criado.`);
      }

      // Reset
      setNewModuleName('');
      setNewModuleDesc('');
      setNewModuleCategory('Hospitalar');
      setNewModuleItems([]);
      setCargoPermsToAssign({});
      setIsCreateModalOpen(false);
      loadModulesAndStats();
      window.dispatchEvent(new Event('hospaudit_modules_updated'));
    } catch (err: any) {
      showToast('Erro ao criar módulo: ' + err.message, 'error');
    }
  };

  // Open Edit Module Modal
  const handleOpenEditModal = (mod: any) => {
    setEditingModule(mod);
    setEditModuleName(mod.name);
    setEditModuleDesc(mod.description || '');
    setEditModuleCategory(mod.category || 'Hospitalar');
    setEditModuleItems(mod.items || []);
    setEditModuleItemInput('');
    setIsEditModalOpen(true);
  };

  const handleSaveEditModule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingModule || !editModuleName.trim()) return;

    const payload = {
      id: editingModule.id,
      name: editModuleName.trim(),
      description: editModuleDesc.trim(),
      category: editModuleCategory,
      items: editModuleItems
    };

    try {
      const res = await fetch('/api.php?action=create_custom_module', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error('Falha ao atualizar o módulo.');

      showToast(`Módulo "${editModuleName}" atualizado com sucesso!`, 'success');
      setIsEditModalOpen(false);
      setEditingModule(null);
      loadModulesAndStats();
      window.dispatchEvent(new Event('hospaudit_modules_updated'));
    } catch (err: any) {
      showToast('Erro ao editar módulo: ' + err.message, 'error');
    }
  };

  // Delete Module (Custom or Standard)
  const handleDeleteModule = (id: string, name: string, type: string) => {
    setDeleteConfirmTarget({ id, name, type });
  };

  const executeDeleteModule = async () => {
    if (!deleteConfirmTarget) return;
    const { id, name, type } = deleteConfirmTarget;
    const isCustom = type === 'custom';

    try {
      // If custom, delete from DB via API
      if (isCustom) {
        const res = await fetch('/api.php?action=delete_custom_module', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        });
        if (!res.ok) throw new Error('Falha ao excluir módulo customizado do banco de dados.');
      } else {
        // If standard, deactivate in DB first
        const res = await fetch('/api.php?action=update_module_status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modulo_id: id, status: 0 })
        });
        if (!res.ok) throw new Error('Falha ao desativar módulo no banco de dados.');
      }

      // Sync settings.installedModules to completely hide it
      const currentInstalled = settings.installedModules || [];
      const nextInstalled = currentInstalled.filter(item => item !== id);
      
      // Handle sub-modules of special modules (e.g. VOTAÇÃO or FORMULÁRIOS)
      let finalInstalled = [...nextInstalled];
      if (id === 'VOTING') {
        finalInstalled = finalInstalled.filter(sub => !['VOTE_MODELS', 'VOTE_IMPORT', 'VOTE_BOOTH', 'VOTE_RESULTS'].includes(sub));
      }
      
      updateSettings({ installedModules: finalInstalled });

      showToast(`Módulo "${name}" excluído com sucesso!`, 'success');
      if (user) {
        addLog(user.name, 'Exclusão de Módulo', `Módulo "${name}" (${id}) excluído/desinstalado.`);
      }

      setDeleteConfirmTarget(null);
      loadModulesAndStats();
      window.dispatchEvent(new Event('hospaudit_modules_updated'));
    } catch (err: any) {
      showToast('Erro ao excluir módulo: ' + err.message, 'error');
    }
  };

  // Add Item to creation list
  const handleAddModalItem = () => {
    const text = newModuleItemInput.trim();
    if (text && !newModuleItems.includes(text)) {
      setNewModuleItems(prev => [...prev, text]);
      setNewModuleItemInput('');
    }
  };

  // Remove Item from creation list
  const handleRemoveModalItem = (index: number) => {
    setNewModuleItems(prev => prev.filter((_, i) => i !== index));
  };

  // Add Item to edit list
  const handleAddEditModalItem = () => {
    const val = editModuleItemInput.trim();
    if (val && !editModuleItems.includes(val)) {
      setEditModuleItems(prev => [...prev, val]);
      setEditModuleItemInput('');
    }
  };

  // Remove Item from edit list
  const handleRemoveEditModalItem = (index: number) => {
    setEditModuleItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleToggleCargoPerm = (cargoId: string, flag: 'pode_visualizar' | 'pode_criar_editar' | 'pode_deletar') => {
    setCargoPermsToAssign(prev => {
      const current = prev[cargoId] || { pode_visualizar: false, pode_criar_editar: false, pode_deletar: false };
      const updatedVal = !current[flag];
      const nextFlags = { ...current, [flag]: updatedVal };
      
      if ((flag === 'pode_criar_editar' || flag === 'pode_deletar') && updatedVal) {
        nextFlags.pode_visualizar = true;
      }
      if (flag === 'pode_visualizar' && !updatedVal) {
        nextFlags.pode_criar_editar = false;
        nextFlags.pode_deletar = false;
      }

      return { ...prev, [cargoId]: nextFlags };
    });
  };

  // Render Icons dynamically
  const renderModuleIcon = (iconName: string) => {
    const standardSize = 16;
    switch (iconName) {
      case 'Activity': return <Activity size={standardSize} />;
      case 'Signature': return <Signature size={standardSize} />;
      case 'Inbox': return <Folder size={standardSize} />;
      case 'DollarSign': return <DollarSign size={standardSize} />;
      case 'FileText': return <FileText size={standardSize} />;
      case 'MessageSquare': return <MessageSquare size={standardSize} />;
      case 'Video': return <Video size={standardSize} />;
      case 'FlaskConical': return <FlaskConical size={standardSize} />;
      case 'Tv': return <Tv size={standardSize} />;
      case 'BarChart2': return <LayoutGrid size={standardSize} />;
      case 'Calendar': return <Clock size={standardSize} />;
      case 'User': return <Users size={standardSize} />;
      case 'LayoutGrid': return <LayoutGrid size={standardSize} />;
      case 'Bed': return <BedIcon size={standardSize} />;
      case 'HelpCircle': return <ClipboardList size={standardSize} />;
      case 'Building2': return <Building2 size={standardSize} />;
      case 'PlusCircle': return <Plus size={standardSize} />;
      case 'ClipboardCheck': return <CheckCircle2 size={standardSize} />;
      case 'ClipboardList': return <ClipboardList size={standardSize} />;
      case 'Vote': return <Sparkles size={standardSize} />;
      case 'FileSpreadsheet': return <FileSpreadsheet size={standardSize} />;
      case 'Users': return <Users size={standardSize} />;
      case 'Wrench': return <Wrench size={standardSize} />;
      case 'Github': return <Github size={standardSize} />;
      default: return <Cpu size={standardSize} />;
    }
  };

  const handleBackToHub = () => {
    setActiveTab('OVERVIEW');
    loadModulesAndStats();
  };

  // If user is not authorized
  const isAdmin = user?.role === 'MASTER' || user?.role === 'ADMIN';
  if (!isAdmin) {
    return (
      <div className="p-8 text-center bg-white border border-slate-200 rounded-3xl max-w-xl mx-auto my-12 space-y-4 shadow-sm">
        <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto animate-bounce" />
        <h2 className="text-lg font-black text-slate-800">Acesso Restrito</h2>
        <p className="text-sm text-slate-500">O Painel de Controle e Gestão de Módulos é reservado apenas para administradores e diretores hospitalares credenciados.</p>
        <button 
          onClick={() => window.dispatchEvent(new CustomEvent('hospaudit_navigate_view', { detail: { view: 'DASHBOARD' } }))}
          className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold transition hover:bg-blue-700 cursor-pointer"
        >
          Voltar ao Início
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-1">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg border text-xs font-bold animate-fade-in ${
          toast.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
            : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          {toast.text}
        </div>
      )}

      {/* TOP HEADER CONSOLE */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900 text-white p-6 rounded-3xl shadow-sm relative overflow-hidden border border-slate-800">
        <div className="relative z-10 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] bg-blue-600 text-white px-2.5 py-0.5 rounded-full font-extrabold tracking-widest uppercase">
              Área Administrativa
            </span>
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-[10px] text-emerald-400 font-bold tracking-tight">Banco Local Ativo</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2.5">
            <Cpu className="text-blue-500 w-6 h-6 animate-pulse" /> Painel Admin
          </h1>
          <p className="text-xs text-slate-400 max-w-2xl font-medium leading-relaxed">
            Configure e centralize todos os recursos do HospAudit. Gerencie as permissões de acesso por cargo, mude status dos módulos, insira atividades de checklist e monitore bancos de dados em lote.
          </p>
        </div>

        {activeTab !== 'OVERVIEW' ? (
          <button
            onClick={handleBackToHub}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold border border-slate-700 transition cursor-pointer"
          >
            <ArrowLeft size={14} /> Voltar ao Painel Geral
          </button>
        ) : (
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-extrabold transition shadow-sm hover:shadow-md cursor-pointer shrink-0"
          >
            <Plus size={14} className="stroke-[3]" /> Cadastrar Módulo Dinâmico
          </button>
        )}

        {/* Decorative elements */}
        <div className="absolute right-0 bottom-0 top-0 w-1/3 bg-radial-gradient from-blue-500/10 via-transparent to-transparent opacity-60 pointer-events-none" />
      </div>

      {/* KPI CONTROL PANEL */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 flex items-center gap-4 hover:shadow-3xs transition duration-200">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
            <LayoutGrid size={18} />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Módulos Totais</span>
            <span className="text-lg font-black text-slate-800 block mt-0.5">{stats.totalModules}</span>
            <span className="text-[10px] text-emerald-600 font-bold block">{stats.activeModules} Ativos</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 flex items-center gap-4 hover:shadow-3xs transition duration-200">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
            <Users size={18} />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Colaboradores</span>
            <span className="text-lg font-black text-slate-800 block mt-0.5">{stats.usersCount}</span>
            <span className="text-[10px] text-indigo-500 font-bold block">Controle RBAC ativo</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 flex items-center gap-4 hover:shadow-3xs transition duration-200">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
            <Building2 size={18} />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Alas & Leitos</span>
            <span className="text-lg font-black text-slate-800 block mt-0.5">{stats.sectorsCount} Setores</span>
            <span className="text-[10px] text-amber-600 font-bold block">{stats.bedsCount} Leitos vinculados</span>
          </div>
        </div>

        <div 
          onClick={() => setActiveTab('DBCONFIG')}
          className="bg-white border border-slate-200/80 rounded-2xl p-4 flex items-center gap-4 hover:shadow-3xs transition duration-200 cursor-pointer group hover:border-indigo-300"
          title="Clique para configurar os dados do banco de dados MySQL / XAMPP"
        >
          <div className="w-10 h-10 rounded-xl bg-teal-50 group-hover:bg-teal-100 flex items-center justify-center text-teal-600 shrink-0 transition">
            <Database size={18} />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Banco de Dados</span>
            <span className="text-xs font-black text-emerald-600 flex items-center gap-1 mt-1 bg-emerald-50 px-2 py-0.5 rounded-full w-max border border-emerald-100">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
              MySQL / XAMPP
            </span>
            <span className="text-[9px] text-blue-600 font-bold block mt-1 hover:underline">Configurar no Painel &rarr;</span>
          </div>
        </div>
      </div>

      {/* MAIN VIEWPORT AND SIDEBAR */}
      <div className="flex flex-col lg:flex-row gap-6">
        
        {/* INNER SIDEBAR FOR ADMIN CATEGORIES */}
        <aside className="w-full lg:w-64 shrink-0 flex flex-col gap-2.5 bg-white p-3 border border-slate-200 rounded-2xl h-max shadow-3xs">
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-3 py-1 block">Navegação Administrativa</span>
          
          <button
            onClick={() => setActiveTab('OVERVIEW')}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-xs text-left transition cursor-pointer ${
              activeTab === 'OVERVIEW' 
                ? 'bg-blue-600 text-white shadow-xs' 
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <LayoutGrid size={15} />
            <span>Central de Módulos</span>
          </button>

          <button
            onClick={() => setActiveTab('DBCONFIG')}
            className={`flex items-center justify-between px-3 py-2.5 rounded-xl font-bold text-xs text-left transition cursor-pointer ${
              activeTab === 'DBCONFIG' 
                ? 'bg-indigo-600 text-white shadow-xs' 
                : 'text-indigo-900 bg-indigo-50/60 hover:bg-indigo-50 hover:text-indigo-950 border border-indigo-100/60'
            }`}
          >
            <div className="flex items-center gap-3">
              <Database size={15} className={activeTab === 'DBCONFIG' ? 'text-white' : 'text-indigo-600'} />
              <span>Conexão MySQL (XAMPP)</span>
            </div>
            <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase tracking-wider ${
              activeTab === 'DBCONFIG' ? 'bg-white/20 text-white' : 'bg-indigo-200/60 text-indigo-800'
            }`}>
              Config
            </span>
          </button>

          <button
            onClick={() => setActiveTab('USERS')}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-xs text-left transition cursor-pointer ${
              activeTab === 'USERS' 
                ? 'bg-blue-600 text-white shadow-xs' 
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Users size={15} />
            <span>Cadastro de Usuários</span>
          </button>

          <div className="h-px bg-slate-100 my-1" />
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-3 py-1 block">Manutenção & Dados</span>

          <button
            onClick={() => setActiveTab('BACKUP')}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-xs text-left transition cursor-pointer ${
              activeTab === 'BACKUP' 
                ? 'bg-blue-600 text-white shadow-xs' 
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Database size={15} />
            <span>Backups & Sincronização</span>
          </button>

          <button
            onClick={() => setActiveTab('LOGS')}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-xs text-left transition cursor-pointer ${
              activeTab === 'LOGS' 
                ? 'bg-blue-600 text-white shadow-xs' 
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <FileText size={15} />
            <span>Logs do Sistema</span>
          </button>

          <button
            onClick={() => setActiveTab('GITHUB')}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-xs text-left transition cursor-pointer ${
              activeTab === 'GITHUB' 
                ? 'bg-blue-600 text-white shadow-xs' 
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Github size={15} />
            <span>Atualização via GitHub</span>
          </button>

          <button
            onClick={() => setActiveTab('SETTINGS')}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-xs text-left transition cursor-pointer ${
              activeTab === 'SETTINGS' 
                ? 'bg-blue-600 text-white shadow-xs' 
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Settings size={15} />
            <span>Configurações Globais</span>
          </button>
        </aside>

        {/* WORKSPACE CONTENT ROUTER */}
        <main className="flex-1 min-w-0">
          
          {/* TAB: DBCONFIG / CONEXÃO BANCO DE DADOS XAMPP */}
          {activeTab === 'DBCONFIG' && (
            <div className="space-y-4">
              <DatabaseConfigManager />
            </div>
          )}

          {/* TAB 1: OVERVIEW / CENTRAL DE MÓDULOS */}
          {activeTab === 'OVERVIEW' && (
            <div className="space-y-4">
              
              {/* SEARCH & FILTERS BAR */}
              <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-4 border border-slate-200 rounded-2xl shadow-3xs">
                <div className="relative w-full lg:w-96">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                    <Search size={14} />
                  </span>
                  <input
                    type="text"
                    placeholder="Filtrar módulos por nome, descrição ou atividade..."
                    value={moduleSearchText}
                    onChange={(e) => setModuleSearchText(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 bg-slate-50/50 border border-slate-250 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition font-medium text-slate-800"
                  />
                  {moduleSearchText && (
                    <button 
                      type="button"
                      onClick={() => setModuleSearchText('')}
                      className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 border-none bg-transparent cursor-pointer"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-1 w-full lg:w-auto justify-start lg:justify-end">
                  {['All', 'Gestão', 'Cadastros', 'Auditoria', 'Relatórios', 'Hospitalar', 'Estatísticas', 'Personalizados'].map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setModuleFilterCategory(cat)}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-extrabold tracking-wide transition border cursor-pointer ${
                        moduleFilterCategory === cat
                          ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {cat === 'All' ? 'Todos' : cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* CARDS GRID OF CENTRALIZED MODULES */}
              {filteredModules.length === 0 ? (
                <div className="p-12 text-center text-slate-400 text-xs font-semibold bg-white border border-slate-200 rounded-2xl shadow-3xs">
                  Nenhum módulo encontrado correspondente aos filtros aplicados.
                </div>
              ) : (
                <div className="flex flex-col gap-2 bg-white rounded-2xl border border-slate-200 p-2 shadow-2xs">
                  {filteredModules.map(m => {
                    const isActive = m.status === 1;
                    
                    const catColors: Record<string, string> = {
                      'Gestão': 'bg-blue-50 text-blue-750 border-blue-150',
                      'Cadastros': 'bg-amber-50 text-amber-750 border-amber-150',
                      'Auditoria': 'bg-indigo-50 text-indigo-750 border-indigo-150',
                      'Relatórios': 'bg-rose-50 text-rose-750 border-rose-150',
                      'Hospitalar': 'bg-emerald-50 text-emerald-750 border-emerald-150',
                      'Estatísticas': 'bg-violet-50 text-violet-750 border-violet-150',
                      'Personalizados': 'bg-sky-50 text-sky-750 border-sky-150',
                    };

                    const iconBgColors: Record<string, string> = {
                      'Gestão': 'bg-blue-500/10 text-blue-600 border border-blue-200/20',
                      'Cadastros': 'bg-amber-500/10 text-amber-600 border border-amber-200/20',
                      'Auditoria': 'bg-indigo-500/10 text-indigo-600 border border-indigo-200/20',
                      'Relatórios': 'bg-rose-500/10 text-rose-600 border border-rose-200/20',
                      'Hospitalar': 'bg-emerald-500/10 text-emerald-600 border border-emerald-200/20',
                      'Estatísticas': 'bg-violet-500/10 text-violet-600 border border-violet-200/20',
                      'Personalizados': 'bg-sky-500/10 text-sky-600 border border-sky-200/20',
                    };

                    return (
                      <div 
                        key={m.id}
                        className={`flex items-center justify-between p-2 px-3 hover:bg-slate-50 rounded-xl transition duration-150 border border-transparent hover:border-slate-100 ${
                          isActive ? 'opacity-100' : 'opacity-65 bg-slate-50/35'
                        }`}
                      >
                        {/* Left: Icon + Name + Category + ID */}
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {/* Icon */}
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            isActive ? iconBgColors[m.category] || 'bg-slate-100 text-slate-600' : 'bg-slate-200 text-slate-450'
                          }`}>
                            {renderModuleIcon(m.icon || 'Cpu')}
                          </div>

                          {/* Info */}
                          <div className="min-w-0 flex items-center gap-2.5">
                            <h3 className="text-xs font-black text-slate-800 truncate" title={m.description}>
                              {m.name}
                            </h3>
                            <span className={`text-[8.5px] font-extrabold uppercase px-1.5 py-0.2 rounded-md border tracking-wide whitespace-nowrap shrink-0 ${
                              catColors[m.category] || 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}>
                              {m.category}
                            </span>
                            {m.type === 'custom' && (
                              <span className="text-[8px] font-black uppercase px-1.5 py-0.2 bg-indigo-50 border border-indigo-150 text-indigo-600 rounded-sm tracking-wider shrink-0 select-none">
                                Custom
                              </span>
                            )}
                            <span className="font-mono text-[8.5px] text-slate-400 select-none">
                              ID: {m.id}
                            </span>
                          </div>
                        </div>

                        {/* Right: Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          {/* Acessar (Launch) Button */}
                          <button
                            type="button"
                            disabled={!isActive}
                            onClick={() => handleLaunchModule(m.id)}
                            className={`px-2.5 py-1 rounded-lg flex items-center gap-1 text-[10px] font-bold transition-all border ${
                              isActive 
                                ? 'bg-blue-50 border-blue-200 text-blue-600 hover:bg-blue-600 hover:text-white cursor-pointer'
                                : 'bg-slate-50 border-slate-100 text-slate-350 cursor-not-allowed'
                            }`}
                          >
                            <ArrowRight size={11} className="stroke-[2.5]" />
                            <span>Acessar</span>
                          </button>

                          {/* Editar */}
                          {m.type !== 'system_tool' && (
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(m)}
                              className="px-2.5 py-1 bg-slate-50 border border-slate-200 hover:bg-amber-50 hover:text-amber-600 text-slate-600 rounded-lg text-[10px] font-bold transition flex items-center gap-1 cursor-pointer"
                            >
                              <Edit size={11} />
                              <span>Editar</span>
                            </button>
                          )}

                          {/* Ocultar / Mostrar */}
                          {m.type !== 'system_tool' && (
                            <button
                              type="button"
                              onClick={() => handleToggleModuleStatus(m.id, isActive ? 1 : 0)}
                              className={`px-2.5 py-1 border text-[10px] font-bold rounded-lg transition flex items-center gap-1 cursor-pointer ${
                                isActive 
                                  ? 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-600'
                                  : 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100 text-emerald-700 font-extrabold'
                              }`}
                            >
                              {isActive ? (
                                <>
                                  <EyeOff size={11} />
                                  <span>Ocultar</span>
                                </>
                              ) : (
                                <>
                                  <Eye size={11} />
                                  <span>Mostrar</span>
                                </>
                              )}
                            </button>
                          )}

                          {/* Excluir */}
                          {m.type === 'custom' && (
                            <button
                              type="button"
                              onClick={() => handleDeleteModule(m.id, m.name, m.type)}
                              className="px-2.5 py-1 bg-slate-50 border border-slate-200 hover:bg-rose-50 hover:text-rose-600 text-slate-600 rounded-lg text-[10px] font-bold transition flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 size={11} />
                              <span>Excluir</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: GESTÃO DE USUÁRIOS & PERMISSÕES */}
          {activeTab === 'USERS' && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-200 bg-slate-50/70">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Cadastro de Usuários & Níveis de Acesso</h3>
                  <p className="text-xs text-slate-500">Gerencie colaboradores, cargos e permissões por módulo.</p>
                </div>
                <button
                  type="button"
                  onClick={handleBackToHub}
                  className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-semibold transition border border-slate-200 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <ArrowLeft size={13} /> Voltar ao Painel
                </button>
              </div>
              <div className="p-5">
                <AdminProfileManager onBackToAudit={handleBackToHub} initialTab="USERS" hideSidebar={true} embedded={true} />
              </div>
            </div>
          )}

          {/* TAB 4: GESTÃO DE SETORES */}
          {activeTab === 'SECTORS' && (
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-2xs space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-black text-slate-800">Mapeamento de Setores & Alas Clínicas</h3>
                  <p className="text-xs text-slate-500">Cadastre e configure as alas hospitalares (UTI, Internação, Clínicas) e seus chefes responsáveis.</p>
                </div>
                <button 
                  onClick={handleBackToHub}
                  className="px-3 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg text-xs font-bold transition border border-slate-200/60 flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft size={12} /> Voltar ao Painel
                </button>
              </div>
              <AdminProfileManager onBackToAudit={handleBackToHub} initialTab="SECTORS" hideSidebar={true} />
            </div>
          )}

          {/* TAB 5: GESTÃO DE LEITOS */}
          {activeTab === 'BEDS' && (
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-2xs space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-black text-slate-800">Gestão de Leitos Hospitalares</h3>
                  <p className="text-xs text-slate-500">Registre e distribua os leitos físicos ativos associando-os às suas alas hospitalares correspondentes.</p>
                </div>
                <button 
                  onClick={handleBackToHub}
                  className="px-3 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg text-xs font-bold transition border border-slate-200/60 flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft size={12} /> Voltar ao Painel
                </button>
              </div>
              <AdminProfileManager onBackToAudit={handleBackToHub} initialTab="BEDS" hideSidebar={true} />
            </div>
          )}

          {/* TAB 6: BACKUPS & DADOS */}
          {activeTab === 'BACKUP' && (
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-2xs space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-black text-slate-800">Manutenção de Dados, Backups & MySQL</h3>
                  <p className="text-xs text-slate-500">Realize dumps SQL, sincronize tabelas fragmentadas ou restaure cópias de segurança.</p>
                </div>
                <button 
                  onClick={handleBackToHub}
                  className="px-3 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg text-xs font-bold transition border border-slate-200/60 flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft size={12} /> Voltar ao Painel
                </button>
              </div>
              <AdminProfileManager onBackToAudit={handleBackToHub} initialTab="BACKUP" hideSidebar={true} />
            </div>
          )}

          {/* TAB 7: LOGS DO SISTEMA */}
          {activeTab === 'LOGS' && (
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-2xs space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-black text-slate-800">Logs e Trilha de Auditoria Geral</h3>
                  <p className="text-xs text-slate-500">Histórico completo de transações e logs de atividade do sistema em tempo de execução.</p>
                </div>
                <button 
                  onClick={handleBackToHub}
                  className="px-3 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg text-xs font-bold transition border border-slate-200/60 flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft size={12} /> Voltar ao Painel
                </button>
              </div>
              <AdminProfileManager onBackToAudit={handleBackToHub} initialTab="LOGS" hideSidebar={true} />
            </div>
          )}



          {/* TAB 9: SETTINGS GLOBAIS */}
          {activeTab === 'SETTINGS' && (
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-2xs space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-black text-slate-800">Configurações Globais do Painel</h3>
                  <p className="text-xs text-slate-500">Altere o nome do hospital, letra do ícone de launcher e temas visuais do HospAudit.</p>
                </div>
                <button 
                  onClick={handleBackToHub}
                  className="px-3 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg text-xs font-bold transition border border-slate-200/60 flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft size={12} /> Voltar ao Painel
                </button>
              </div>
              <AdminProfileManager onBackToAudit={handleBackToHub} initialTab="SETTINGS" hideSidebar={true} />
            </div>
          )}

          {/* TAB 10: SINC & ATUALIZAÇÃO GITHUB */}
          {activeTab === 'GITHUB' && (
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-2xs space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-black text-slate-800">Sincronização & Atualização via GitHub</h3>
                  <p className="text-xs text-slate-500">Mantenha sua cópia local do HospAudit sincronizada e atualizada com o repositório oficial do GitHub.</p>
                </div>
                <button 
                  onClick={handleBackToHub}
                  className="px-3 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg text-xs font-bold transition border border-slate-200/60 flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft size={12} /> Voltar ao Painel
                </button>
              </div>
              <AdminProfileManager onBackToAudit={handleBackToHub} initialTab="GITHUB" hideSidebar={true} />
            </div>
          )}

        </main>
      </div>

      {/* CREATE DYNAMIC MODULE MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-250 max-w-2xl w-full p-6 shadow-2xl relative my-8 max-h-[90vh] overflow-y-auto space-y-5">
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-1">
              <h2 className="text-base font-black text-slate-800 tracking-tight flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-blue-600 animate-pulse" /> Criar Novo Módulo Hospitalar Dinâmico
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Insira as especificações gerais para adicionar o módulo ao controle central e configurar as permissões imediatas.
              </p>
            </div>

            <form onSubmit={handleCreateModule} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Nome do Módulo:</label>
                  <input
                     type="text"
                     required
                     placeholder="Ex: Medicina do Trabalho"
                     value={newModuleName}
                     onChange={(e) => setNewModuleName(e.target.value)}
                     className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-blue-500/30 focus:border-blue-500 outline-none text-slate-800 font-bold"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Categoria do Recurso:</label>
                  <select
                     value={newModuleCategory}
                     onChange={(e) => setNewModuleCategory(e.target.value)}
                     className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-blue-500/30 focus:border-blue-500 outline-none text-slate-700 font-bold"
                  >
                    <option value="Gestão">Gestão</option>
                    <option value="Cadastros">Cadastros</option>
                    <option value="Auditoria">Auditoria</option>
                    <option value="Relatórios">Relatórios</option>
                    <option value="Hospitalar">Hospitalar</option>
                    <option value="Personalizados">Personalizados</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Descrição Funcional:</label>
                <textarea
                  placeholder="Descreva detalhadamente a finalidade do novo módulo para orientação dos usuários..."
                  rows={2}
                  value={newModuleDesc}
                  onChange={(e) => setNewModuleDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-blue-500/30 focus:border-blue-500 outline-none text-slate-700 font-medium"
                />
              </div>

              {/* Items listing inside modal */}
              <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-150">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 block">Atividades / Itens do Checklist Inicial</span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Adicionar atividade, ex: Controle de Vacinas"
                    value={newModuleItemInput}
                    onChange={(e) => setNewModuleItemInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddModalItem();
                      }
                    }}
                    className="flex-1 px-3 py-1.5 bg-white border border-slate-250 rounded-xl text-xs outline-none text-slate-700 font-bold"
                  />
                  <button
                    type="button"
                    onClick={handleAddModalItem}
                    className="px-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    Inserir
                  </button>
                </div>

                {newModuleItems.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {newModuleItems.map((item, index) => (
                      <span 
                        key={index} 
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 text-[10px] font-bold text-slate-700 rounded-lg"
                      >
                        {item}
                        <button 
                          type="button" 
                          onClick={() => handleRemoveModalItem(index)}
                          className="text-slate-400 hover:text-slate-600 font-bold border-none bg-transparent cursor-pointer"
                        >
                          &times;
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-400 italic">Nenhum sub-item adicionado ao checklist inicial ainda.</p>
                )}
              </div>

              {/* RBAC PERMISSIONS ON THE FLY */}
              {cargos && cargos.length > 0 && (
                <div className="space-y-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Definição Imediata de Acesso por Cargo:</span>
                  <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-2xl divide-y divide-slate-150 p-2 space-y-1">
                    {cargos.map((c: any) => {
                      const perm = cargoPermsToAssign[c.id] || { pode_visualizar: false, pode_criar_editar: false, pode_deletar: false };
                      return (
                        <div key={c.id} className="flex items-center justify-between py-2 px-1 text-xs">
                          <span className="font-bold text-slate-700">{c.name}</span>
                          <div className="flex items-center gap-3">
                            <label className="flex items-center gap-1 text-[10px] text-slate-500 font-bold cursor-pointer">
                              <input
                                type="checkbox"
                                checked={perm.pode_visualizar}
                                onChange={() => handleToggleCargoPerm(c.id, 'pode_visualizar')}
                                className="rounded text-blue-600"
                              />
                              <span>Ver</span>
                            </label>
                            <label className="flex items-center gap-1 text-[10px] text-slate-500 font-bold cursor-pointer">
                              <input
                                type="checkbox"
                                checked={perm.pode_criar_editar}
                                onChange={() => handleToggleCargoPerm(c.id, 'pode_criar_editar')}
                                className="rounded text-blue-600"
                              />
                              <span>Criar/Editar</span>
                            </label>
                            <label className="flex items-center gap-1 text-[10px] text-slate-500 font-bold cursor-pointer">
                              <input
                                type="checkbox"
                                checked={perm.pode_deletar}
                                onChange={() => handleToggleCargoPerm(c.id, 'pode_deletar')}
                                className="rounded text-blue-600"
                              />
                              <span>Excluir</span>
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ACTION BUTTONS */}
              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold rounded-xl transition shadow-sm cursor-pointer"
                >
                  Salvar e Habilitar Módulo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MODULE MODAL */}
      {isEditModalOpen && editingModule && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-250 max-w-xl w-full p-6 shadow-2xl relative my-8 max-h-[90vh] overflow-y-auto space-y-5">
            <button
              type="button"
              onClick={() => {
                setIsEditModalOpen(false);
                setEditingModule(null);
              }}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-1">
              <h2 className="text-base font-black text-slate-800 tracking-tight flex items-center gap-2">
                <Edit className="w-5 h-5 text-blue-600" /> Editar Detalhes do Módulo Nível Técnico
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Altere informações básicas, categoria ou a lista estrutural de atividades deste módulo.
              </p>
            </div>

            <form onSubmit={handleSaveEditModule} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Nome do Módulo:</label>
                <input
                   type="text"
                   required
                   value={editModuleName}
                   onChange={(e) => setEditModuleName(e.target.value)}
                   className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-blue-500/30 focus:border-blue-500 outline-none text-slate-800 font-bold"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Categoria:</label>
                <select
                   value={editModuleCategory}
                   onChange={(e) => setEditModuleCategory(e.target.value)}
                   className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-blue-500/30 focus:border-blue-500 outline-none text-slate-700 font-bold"
                >
                  <option value="Gestão">Gestão</option>
                  <option value="Cadastros">Cadastros</option>
                  <option value="Auditoria">Auditoria</option>
                  <option value="Relatórios">Relatórios</option>
                  <option value="Hospitalar">Hospitalar</option>
                  <option value="Personalizados">Personalizados</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Descrição:</label>
                <textarea
                  rows={2}
                  value={editModuleDesc}
                  onChange={(e) => setEditModuleDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-blue-500/30 focus:border-blue-500 outline-none text-slate-700 font-medium"
                />
              </div>

              {/* Edit checklist activities */}
              <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-150">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 block font-mono">Estrutura de Atividades</span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Nova atividade, ex: Controle de Glosas"
                    value={editModuleItemInput}
                    onChange={(e) => setEditModuleItemInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddEditModalItem();
                      }
                    }}
                    className="flex-1 px-3 py-1.5 bg-white border border-slate-250 rounded-xl text-xs outline-none text-slate-700 font-bold"
                  />
                  <button
                    type="button"
                    onClick={handleAddEditModalItem}
                    className="px-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    Inserir
                  </button>
                </div>

                {editModuleItems.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 pt-1 max-h-36 overflow-y-auto">
                    {editModuleItems.map((item, index) => (
                      <span 
                        key={index} 
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 text-[10px] font-bold text-slate-700 rounded-lg"
                      >
                        {item}
                        <button 
                          type="button" 
                          onClick={() => handleRemoveEditModalItem(index)}
                          className="text-slate-400 hover:text-slate-600 font-bold border-none bg-transparent cursor-pointer"
                        >
                          &times;
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-400 italic">Nenhum sub-item estruturado neste módulo.</p>
                )}
              </div>

              {/* ACTION BUTTONS */}
              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setEditingModule(null);
                  }}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold rounded-xl transition shadow-sm cursor-pointer"
                >
                  Confirmar Edição
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirmTarget && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-55">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6">
              <div className="flex items-center gap-4 text-rose-600 mb-4">
                <div className="p-3 bg-rose-50 rounded-full">
                  <Trash2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-800">Confirmar Exclusão</h3>
                  <p className="text-xs text-slate-400">Esta ação é irreversível</p>
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl p-4 mb-4 border border-slate-100">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Módulo Selecionado</p>
                <p className="text-sm font-bold text-slate-800">{deleteConfirmTarget.name}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">ID: {deleteConfirmTarget.id} • Tipo: {deleteConfirmTarget.type === 'custom' ? 'Customizado' : 'Padrão'}</p>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                {deleteConfirmTarget.type === 'custom'
                  ? `Tem certeza que deseja excluir permanentemente o módulo customizado "${deleteConfirmTarget.name}"? Esta ação removerá definitivamente o módulo e todas as suas configurações do banco de dados.`
                  : `Tem certeza que deseja desativar e desinstalar o módulo padrão "${deleteConfirmTarget.name}"? Ele será removido do menu de navegação e desinstalado do sistema.`}
              </p>
            </div>

            <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteConfirmTarget(null)}
                className="px-4 py-2 border border-slate-200 hover:bg-white text-slate-600 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={executeDeleteModule}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold rounded-xl transition shadow-sm cursor-pointer"
              >
                Sim, Excluir Módulo
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export const AdminPanel = AdminPanelCentral;
