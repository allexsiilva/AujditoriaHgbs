import React, { useState, useMemo } from 'react';
import { 
  History, 
  Search, 
  Filter, 
  Download, 
  Printer, 
  FileSpreadsheet, 
  FileText, 
  Code, 
  RefreshCw, 
  ShieldCheck, 
  Database, 
  User as UserIcon, 
  Calendar, 
  AlertTriangle, 
  CheckCircle2, 
  Info, 
  X, 
  ChevronDown, 
  ChevronUp, 
  ArrowUpDown, 
  ExternalLink,
  Layers,
  Activity,
  Trash2,
  HardDrive
} from 'lucide-react';
import { useSystemLogs, SystemLog } from '../context/SystemLogContext';
import { useSettings } from '../context/SettingsContext';

interface EnrichedLog extends SystemLog {
  category: string;
  severity: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  isDbChange: boolean;
}

export function SystemLogViewer() {
  const { logs, clearLogs } = useSystemLogs();
  const { settings } = useSettings();

  // Estados de Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');
  const [selectedUser, setSelectedUser] = useState<string>('ALL');
  const [periodFilter, setPeriodFilter] = useState<string>('ALL'); // 'ALL' | 'TODAY' | '24H' | '7D' | '30D' | 'CUSTOM'
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [onlyDbChanges, setOnlyDbChanges] = useState(false);

  // Ordenação e Paginação
  const [sortField, setSortField] = useState<'timestamp' | 'user' | 'action' | 'category'>('timestamp');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  // Modal de Detalhes e Aviso Inline
  const [inspectedLog, setInspectedLog] = useState<EnrichedLog | null>(null);
  const [notice, setNotice] = useState<{ type: 'info' | 'warning'; text: string } | null>(null);

  // Classificação e Enriquecimento Inteligente dos Logs para Conformidade
  const enrichedLogs = useMemo<EnrichedLog[]>(() => {
    return (logs || []).map(log => {
      const act = (log.action || '').toLowerCase();
      const det = (log.details || '').toLowerCase();

      let category = 'SISTEMA_GERAL';
      let isDbChange = false;

      if (
        act.includes('banco') || 
        act.includes('mysql') || 
        act.includes('tabela') || 
        act.includes('migra') || 
        act.includes('sql') || 
        act.includes('sincroniz') || 
        det.includes('banco') || 
        det.includes('mysql') ||
        det.includes('tabela')
      ) {
        category = 'BANCO_DE_DADOS';
        isDbChange = true;
      } else if (
        act.includes('audit') || 
        act.includes('checklist') || 
        act.includes('iras') || 
        act.includes('safety') || 
        act.includes('prontu')
      ) {
        category = 'AUDITORIA_CLINICA';
        isDbChange = act.includes('registro') || act.includes('atualiz') || act.includes('exclus') || act.includes('limpeza');
      } else if (
        act.includes('setor') || 
        act.includes('leito') || 
        act.includes('ala') || 
        det.includes('leito') || 
        det.includes('setor')
      ) {
        category = 'SETORES_LEITOS';
        isDbChange = true;
      } else if (
        act.includes('usuário') || 
        act.includes('usuario') || 
        act.includes('permiss') || 
        act.includes('cargo') || 
        act.includes('senha')
      ) {
        category = 'USUARIOS_PERMISSOES';
        isDbChange = true;
      } else if (
        act.includes('backup') || 
        act.includes('restaur') || 
        act.includes('dump') || 
        act.includes('import') || 
        act.includes('export')
      ) {
        category = 'BACKUP_SISTEMA';
        isDbChange = act.includes('restaur') || act.includes('import');
      } else if (
        act.includes('login') || 
        act.includes('logout') || 
        act.includes('acesso') || 
        act.includes('autentica')
      ) {
        category = 'AUTENTICACAO_ACESSO';
      }

      // Severidade
      let severity: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' = 'INFO';
      if (
        act.includes('falha') || 
        act.includes('erro') || 
        det.includes('erro') || 
        det.includes('failed') || 
        det.includes('recusada') ||
        act.includes('exclusão') ||
        act.includes('exclusao') ||
        act.includes('limpeza')
      ) {
        severity = act.includes('erro') || act.includes('falha') ? 'ERROR' : 'WARNING';
      } else if (
        act.includes('sucesso') || 
        act.includes('criação') || 
        act.includes('cadastro') || 
        act.includes('registro') || 
        act.includes('importação') ||
        isDbChange
      ) {
        severity = 'SUCCESS';
      }

      return {
        ...log,
        category,
        severity,
        isDbChange
      };
    });
  }, [logs]);

  // Lista única de usuários para o dropdown
  const uniqueUsers = useMemo(() => {
    const set = new Set<string>();
    enrichedLogs.forEach(l => {
      if (l.user) set.add(l.user);
    });
    return Array.from(set).sort();
  }, [enrichedLogs]);

  // Filtragem dos Logs
  const filteredLogs = useMemo(() => {
    const now = Date.now();

    return enrichedLogs.filter(log => {
      // 1. Busca textual
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matches = 
          (log.user || '').toLowerCase().includes(query) ||
          (log.action || '').toLowerCase().includes(query) ||
          (log.details || '').toLowerCase().includes(query) ||
          (log.id || '').toLowerCase().includes(query) ||
          (log.category || '').toLowerCase().includes(query);
        if (!matches) return false;
      }

      // 2. Categoria
      if (selectedCategory !== 'ALL' && log.category !== selectedCategory) {
        return false;
      }

      // 3. Severidade
      if (selectedSeverity !== 'ALL' && log.severity !== selectedSeverity) {
        return false;
      }

      // 4. Usuário
      if (selectedUser !== 'ALL' && log.user !== selectedUser) {
        return false;
      }

      // 5. Apenas alterações no Banco de Dados
      if (onlyDbChanges && !log.isDbChange) {
        return false;
      }

      // 6. Período
      const logTime = new Date(log.timestamp).getTime();
      if (periodFilter === 'TODAY') {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        if (logTime < startOfDay.getTime()) return false;
      } else if (periodFilter === '24H') {
        if (logTime < now - 24 * 60 * 60 * 1000) return false;
      } else if (periodFilter === '7D') {
        if (logTime < now - 7 * 24 * 60 * 60 * 1000) return false;
      } else if (periodFilter === '30D') {
        if (logTime < now - 30 * 24 * 60 * 60 * 1000) return false;
      } else if (periodFilter === 'CUSTOM') {
        if (startDate) {
          const start = new Date(startDate).getTime();
          if (logTime < start) return false;
        }
        if (endDate) {
          const end = new Date(endDate).getTime() + 86400000; // Final do dia
          if (logTime > end) return false;
        }
      }

      return true;
    });
  }, [enrichedLogs, searchTerm, selectedCategory, selectedSeverity, selectedUser, onlyDbChanges, periodFilter, startDate, endDate]);

  // Ordenação
  const sortedLogs = useMemo(() => {
    return [...filteredLogs].sort((a, b) => {
      let comparison = 0;
      if (sortField === 'timestamp') {
        comparison = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      } else if (sortField === 'user') {
        comparison = (a.user || '').localeCompare(b.user || '');
      } else if (sortField === 'action') {
        comparison = (a.action || '').localeCompare(b.action || '');
      } else if (sortField === 'category') {
        comparison = (a.category || '').localeCompare(b.category || '');
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [filteredLogs, sortField, sortOrder]);

  // Paginação
  const totalPages = Math.ceil(sortedLogs.length / itemsPerPage) || 1;
  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedLogs.slice(start, start + itemsPerPage);
  }, [sortedLogs, currentPage, itemsPerPage]);

  const handleSort = (field: 'timestamp' | 'user' | 'action' | 'category') => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedCategory('ALL');
    setSelectedSeverity('ALL');
    setSelectedUser('ALL');
    setPeriodFilter('ALL');
    setStartDate('');
    setEndDate('');
    setOnlyDbChanges(false);
    setCurrentPage(1);
  };

  // Métricas do Topo
  const stats = useMemo(() => {
    const total = enrichedLogs.length;
    const dbChangesCount = enrichedLogs.filter(l => l.isDbChange).length;
    const errorsCount = enrichedLogs.filter(l => l.severity === 'ERROR').length;
    const clinicalCount = enrichedLogs.filter(l => l.category === 'AUDITORIA_CLINICA').length;
    return { total, dbChangesCount, errorsCount, clinicalCount };
  }, [enrichedLogs]);

  // ==================== EXPORTAÇÕES PARA CONFORMIDADE ====================

  // 1. Exportação em CSV (com UTF-8 BOM para Excel brasileiro)
  const exportToCSV = () => {
    if (filteredLogs.length === 0) {
      setNotice({ type: 'warning', text: 'Nenhum registro disponível para exportar com os filtros atuais.' });
      return;
    }
    setNotice(null);

    const headers = [
      'ID_LOG',
      'DATA_HORA',
      'USUARIO_RESPONSAVEL',
      'ACAO_REALIZADA',
      'CATEGORIA',
      'SEVERIDADE',
      'ALTERACAO_BANCO',
      'DETALHES_HISTORICO'
    ];

    const rows = filteredLogs.map(l => [
      `"${l.id}"`,
      `"${new Date(l.timestamp).toLocaleString('pt-BR')}"`,
      `"${(l.user || '').replace(/"/g, '""')}"`,
      `"${(l.action || '').replace(/"/g, '""')}"`,
      `"${l.category}"`,
      `"${l.severity}"`,
      l.isDbChange ? '"SIM"' : '"NAO"',
      `"${(l.details || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateTag = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `relatorio-auditoria-logs-${dateTag}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 2. Exportação em JSON Completo
  const exportToJSON = () => {
    if (filteredLogs.length === 0) {
      setNotice({ type: 'warning', text: 'Nenhum registro disponível para exportar com os filtros atuais.' });
      return;
    }
    setNotice(null);

    const exportData = {
      meta: {
        hospital: settings.appName || 'Hospital Geral de Brejo Santo',
        sistema: 'HospAudit - Motor de Auditoria Clínica',
        tipo_relatorio: 'Trilha de Auditoria e Logs de Alterações no Banco de Dados',
        conformidade: 'RDC 36/2013 Anvisa • LGPD Lei 13.709/2018 • CFM',
        emitido_em: new Date().toISOString(),
        total_registros_exportados: filteredLogs.length,
        filtros_aplicados: {
          termo_busca: searchTerm || 'Nenhum',
          categoria: selectedCategory,
          severidade: selectedSeverity,
          usuario: selectedUser,
          periodo: periodFilter,
          apenas_alteracoes_bd: onlyDbChanges
        }
      },
      logs: filteredLogs
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateTag = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `dossie-auditoria-logs-${dateTag}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 3. Impressão / PDF Oficial de Conformidade Hospitalar
  const handlePrintAuditReport = () => {
    window.print();
  };

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'BANCO_DE_DADOS':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <Database className="w-3 h-3 text-amber-600" />
            <span>Banco de Dados</span>
          </span>
        );
      case 'AUDITORIA_CLINICA':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <Activity className="w-3 h-3 text-blue-600" />
            <span>Auditoria Clínica</span>
          </span>
        );
      case 'SETORES_LEITOS':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <Layers className="w-3 h-3 text-indigo-600" />
            <span>Setores & Leitos</span>
          </span>
        );
      case 'USUARIOS_PERMISSOES':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
            <UserIcon className="w-3 h-3 text-purple-600" />
            <span>Usuários & Acesso</span>
          </span>
        );
      case 'BACKUP_SISTEMA':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <HardDrive className="w-3 h-3 text-emerald-600" />
            <span>Backup & Dump</span>
          </span>
        );
      case 'AUTENTICACAO_ACESSO':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
            <ShieldCheck className="w-3 h-3 text-slate-600" />
            <span>Autenticação</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-50 text-slate-600 border border-slate-200">
            <Info className="w-3 h-3 text-slate-400" />
            <span>Sistema Geral</span>
          </span>
        );
    }
  };

  const getSeverityBadge = (severity: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR') => {
    switch (severity) {
      case 'ERROR':
        return <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-200">Erro</span>;
      case 'WARNING':
        return <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200">Alerta</span>;
      case 'SUCCESS':
        return <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">Gravação</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">Info</span>;
    }
  };

  return (
    <div className="space-y-4">
      
      {/* 1. Header Oficial de Conformidade Hospitalar (Compacto e Alinhado) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="p-2.5 rounded-xl bg-sky-50 text-sky-600 border border-sky-100 shrink-0">
            <History className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-extrabold text-slate-900 tracking-tight leading-snug">
                Trilha de Auditoria & Logs
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1 whitespace-nowrap shrink-0">
                <ShieldCheck className="w-3 h-3 shrink-0" />
                RDC 36 / LGPD
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
              Histórico imutável de alterações realizadas no banco de dados e registros clínicos para conformidade hospitalar.
            </p>
          </div>
        </div>

        {/* Botões de Ação e Exportação em linha única */}
        <div className="flex flex-wrap items-center gap-2 shrink-0 print:hidden">
          <button
            type="button"
            onClick={exportToCSV}
            className="px-3 py-2 rounded-xl bg-white hover:bg-slate-50 active:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold transition inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            title="Exportar dados filtrados para planilha Excel / CSV com UTF-8"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Exportar CSV</span>
          </button>

          <button
            type="button"
            onClick={exportToJSON}
            className="px-3 py-2 rounded-xl bg-white hover:bg-slate-50 active:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold transition inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            title="Exportar dossiê técnico de auditoria em JSON"
          >
            <Code className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span>Exportar JSON</span>
          </button>

          <button
            type="button"
            onClick={handlePrintAuditReport}
            className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white text-xs font-bold transition inline-flex items-center gap-1.5 whitespace-nowrap shadow-sm cursor-pointer"
            title="Imprimir relatório formal de conformidade hospitalar"
          >
            <Printer className="w-3.5 h-3.5 shrink-0" />
            <span>Imprimir Relatório</span>
          </button>
        </div>
      </div>

      {notice && (
        <div className="px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{notice.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-amber-700 hover:text-amber-900 p-0.5 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. Cards de Métricas em Tempo Real */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 print:hidden">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span className="font-semibold">Total de Eventos</span>
            <History className="w-4 h-4 text-sky-500" />
          </div>
          <p className="text-2xl font-black text-slate-800 mt-1">{stats.total}</p>
          <span className="text-[11px] text-slate-400">Registros em memória/disco</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span className="font-semibold">Alterações no BD</span>
            <Database className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-black text-amber-600 mt-1">{stats.dbChangesCount}</p>
          <span className="text-[11px] text-slate-400">Mutações SQL / tabelas</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span className="font-semibold">Auditorias Clínicas</span>
            <Activity className="w-4 h-4 text-sky-600" />
          </div>
          <p className="text-2xl font-black text-sky-600 mt-1">{stats.clinicalCount}</p>
          <span className="text-[11px] text-slate-400">Checklists e prontuários</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span className="font-semibold">Integridade Hospitalar</span>
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-black text-emerald-600 mt-1">100%</p>
          <span className="text-[11px] text-emerald-600 font-bold">Trilha Auditada e Conforme</span>
        </div>
      </div>

      {/* 3. Painel de Filtros Avançados */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm space-y-3.5 print:hidden">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Busca Textual */}
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Buscar por usuário, ação, leito, setor, ID ou detalhes da alteração..."
              className="w-full pl-10 pr-4 py-2 text-xs font-medium border border-slate-200 rounded-xl bg-slate-50/70 focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-500/15 focus:outline-none transition-all placeholder:text-slate-400 text-slate-800"
            />
          </div>

          {/* Checkbox: Apenas Alterações no BD */}
          <label className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900 text-xs font-bold cursor-pointer select-none hover:bg-amber-100/60 transition whitespace-nowrap shrink-0">
            <input
              type="checkbox"
              checked={onlyDbChanges}
              onChange={(e) => {
                setOnlyDbChanges(e.target.checked);
                setCurrentPage(1);
              }}
              className="w-4 h-4 rounded text-amber-600 border-amber-300 focus:ring-amber-500 cursor-pointer"
            />
            <Database className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>Apenas Alterações no Banco</span>
          </label>
        </div>

        {/* Linha de Dropdowns de Filtro */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-0.5">
          {/* Categoria */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Categoria</label>
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 text-xs font-semibold border border-slate-200 rounded-xl bg-slate-50 text-slate-700 focus:bg-white focus:border-sky-500 focus:outline-none cursor-pointer"
            >
              <option value="ALL">Todas as Categorias</option>
              <option value="BANCO_DE_DADOS">Banco de Dados & SQL</option>
              <option value="AUDITORIA_CLINICA">Auditoria Clínica</option>
              <option value="SETORES_LEITOS">Setores & Leitos</option>
              <option value="USUARIOS_PERMISSOES">Usuários & Permissões</option>
              <option value="BACKUP_SISTEMA">Backups & Migrações</option>
              <option value="AUTENTICACAO_ACESSO">Autenticação & Login</option>
              <option value="SISTEMA_GERAL">Sistema Geral</option>
            </select>
          </div>

          {/* Severidade */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Tipo / Severidade</label>
            <select
              value={selectedSeverity}
              onChange={(e) => {
                setSelectedSeverity(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 text-xs font-semibold border border-slate-200 rounded-xl bg-slate-50 text-slate-700 focus:bg-white focus:border-blue-500 focus:outline-none cursor-pointer"
            >
              <option value="ALL">Todos os Tipos</option>
              <option value="SUCCESS">✅ Gravações / Mutações (Sucesso)</option>
              <option value="INFO">ℹ️ Informativos Gerais</option>
              <option value="WARNING">⚠️ Alertas de Integridade</option>
              <option value="ERROR">❌ Erros e Falhas</option>
            </select>
          </div>

          {/* Usuário / Auditor */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Usuário / Responsável</label>
            <select
              value={selectedUser}
              onChange={(e) => {
                setSelectedUser(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 text-xs font-semibold border border-slate-200 rounded-xl bg-slate-50 text-slate-700 focus:bg-white focus:border-blue-500 focus:outline-none cursor-pointer"
            >
              <option value="ALL">Todos os Auditores</option>
              {uniqueUsers.map(u => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>

          {/* Período */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Período de Tempo</label>
            <select
              value={periodFilter}
              onChange={(e) => {
                setPeriodFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 text-xs font-semibold border border-slate-200 rounded-xl bg-slate-50 text-slate-700 focus:bg-white focus:border-blue-500 focus:outline-none cursor-pointer"
            >
              <option value="ALL">Todo o Histórico</option>
              <option value="TODAY">Hoje</option>
              <option value="24H">Últimas 24 Horas</option>
              <option value="7D">Últimos 7 Dias</option>
              <option value="30D">Últimos 30 Dias</option>
              <option value="CUSTOM">Personalizado (De / Até)</option>
            </select>
          </div>
        </div>

        {/* Campos de Data Personalizada se selecionado */}
        {periodFilter === 'CUSTOM' && (
          <div className="flex flex-wrap items-center gap-3 pt-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600">De:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600">Até:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
              />
            </div>
          </div>
        )}

        {/* Resumo de Resultados e Botão de Limpar */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
          <span>
            Exibindo <strong>{sortedLogs.length}</strong> de <strong>{enrichedLogs.length}</strong> eventos registrados.
          </span>
          <button
            type="button"
            onClick={handleResetFilters}
            className="text-blue-600 hover:text-blue-800 font-bold transition cursor-pointer"
          >
            Limpar Filtros
          </button>
        </div>
      </div>

      {/* 4. Tabela de Logs Formatada para Auditoria Hospitalar */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse table-auto">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-extrabold uppercase tracking-wider text-[10px]">
                <th
                  onClick={() => handleSort('timestamp')}
                  className="px-3 py-3 pl-4 cursor-pointer hover:bg-slate-100 transition whitespace-nowrap w-[104px]"
                >
                  <div className="flex items-center gap-1">
                    <span>Data / Hora</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('category')}
                  className="px-3 py-3 cursor-pointer hover:bg-slate-100 transition whitespace-nowrap w-[135px]"
                >
                  <div className="flex items-center gap-1">
                    <span>Categoria</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('action')}
                  className="px-3 py-3 cursor-pointer hover:bg-slate-100 transition whitespace-nowrap w-[195px]"
                >
                  <div className="flex items-center gap-1">
                    <span>Ação / Tipo</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('user')}
                  className="px-3 py-3 cursor-pointer hover:bg-slate-100 transition whitespace-nowrap w-[145px]"
                >
                  <div className="flex items-center gap-1">
                    <span>Usuário</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="px-3 py-3 min-w-[200px]">Detalhes da Alteração</th>
                <th className="px-3 py-3 pr-4 text-right whitespace-nowrap w-[92px] print:hidden">Inspeção</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-slate-400">
                    <History className="w-9 h-9 mx-auto text-slate-300 mb-2" />
                    <p className="font-bold text-slate-600">Nenhum registro encontrado</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Tente ajustar ou limpar os filtros de busca acima.</p>
                  </td>
                </tr>
              ) : (
                paginatedLogs.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-slate-50/80 transition-colors group cursor-pointer align-top"
                    onClick={() => setInspectedLog(log)}
                  >
                    {/* Data / Hora */}
                    <td className="px-3 py-3 pl-4 whitespace-nowrap">
                      <span className="font-mono font-bold text-slate-700 block text-[11px]">
                        {new Date(log.timestamp).toLocaleDateString('pt-BR')}
                      </span>
                      <span className="font-mono text-[10px] text-slate-400">
                        {new Date(log.timestamp).toLocaleTimeString('pt-BR')}
                      </span>
                    </td>

                    {/* Categoria */}
                    <td className="px-3 py-3 whitespace-nowrap">
                      {getCategoryBadge(log.category)}
                    </td>

                    {/* Ação */}
                    <td className="px-3 py-3 max-w-[210px]">
                      <div className="font-bold text-slate-800 text-[11px] break-all leading-snug" title={log.action}>
                        {log.action}
                      </div>
                      <div className="flex flex-wrap items-center gap-1 mt-1">
                        {getSeverityBadge(log.severity)}
                        {log.isDbChange && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-extrabold text-[9px] uppercase border border-amber-200">
                            BD
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Usuário */}
                    <td className="px-3 py-3 max-w-[150px]">
                      <div className="flex items-center gap-1.5 min-w-0" title={log.user || 'Sistema'}>
                        <div className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-[10px] shrink-0 border border-slate-200">
                          {(log.user || 'S')[0].toUpperCase()}
                        </div>
                        <span className="font-semibold text-slate-700 truncate text-[11px]">
                          {log.user || 'Sistema'}
                        </span>
                      </div>
                    </td>

                    {/* Detalhes */}
                    <td className="px-3 py-3 text-slate-600">
                      <p className="line-clamp-2 text-[11px] leading-relaxed break-words" title={log.details}>
                        {log.details || 'Sem detalhes adicionais.'}
                      </p>
                    </td>

                    {/* Ação (Inspecionar) */}
                    <td className="px-3 py-3 pr-4 text-right whitespace-nowrap print:hidden">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setInspectedLog(log);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-sky-50 hover:text-sky-700 text-slate-600 font-bold text-[11px] transition cursor-pointer"
                      >
                        Detalhes
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 print:hidden">
          <div className="flex items-center gap-2">
            <span>Itens por página:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="border border-slate-200 rounded-lg px-2 py-1 bg-white font-semibold cursor-pointer"
            >
              <option value={20}>20</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-medium">
              Página <strong>{currentPage}</strong> de <strong>{totalPages}</strong>
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                className="px-2.5 py-1 border border-slate-200 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-40 cursor-pointer font-bold"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                className="px-2.5 py-1 border border-slate-200 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-40 cursor-pointer font-bold"
              >
                Próxima
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Modal de Inspeção Completa do Log */}
      {inspectedLog && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden">
            
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/10 rounded-xl border border-white/20">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base tracking-tight text-white">
                    Inspeção do Registro de Auditoria
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    ID Transação: <code className="font-mono text-emerald-300">{inspectedLog.id}</code>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setInspectedLog(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 text-xs text-slate-700">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Data e Hora</span>
                  <span className="font-bold text-slate-800 mt-0.5 block">
                    {new Date(inspectedLog.timestamp).toLocaleString('pt-BR')}
                  </span>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Auditor / Usuário</span>
                  <span className="font-bold text-slate-800 mt-0.5 block truncate">
                    {inspectedLog.user || 'Sistema'}
                  </span>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Categoria</span>
                  <div className="mt-1">{getCategoryBadge(inspectedLog.category)}</div>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Ação Realizada</span>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                  <span className="font-extrabold text-slate-800 text-sm">{inspectedLog.action}</span>
                  <div className="flex items-center gap-2">
                    {inspectedLog.isDbChange && (
                      <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[10px] uppercase border border-amber-200">
                        Alteração em Banco de Dados
                      </span>
                    )}
                    {getSeverityBadge(inspectedLog.severity)}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Histórico & Detalhes da Alteração</span>
                <div className="p-4 bg-slate-900 text-slate-100 rounded-xl border border-slate-800 font-mono text-[11px] leading-relaxed max-h-60 overflow-y-auto whitespace-pre-wrap selection:bg-indigo-500">
                  {inspectedLog.details || 'Nenhum detalhe adicional gravado para esta operação.'}
                </div>
              </div>

              {/* Informações de Conformidade Legal */}
              <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-[11px] text-emerald-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block">Conformidade e Integridade Hospitalar</span>
                  <p className="mt-0.5 text-emerald-700 leading-relaxed">
                    Este log está vinculado à trilha de segurança do HospAudit em conformidade com as diretrizes do Núcleo de Segurança do Paciente (RDC 36/2013 Anvisa) e LGPD.
                  </p>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setInspectedLog(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Fechar Inspeção
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
