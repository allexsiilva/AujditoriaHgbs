import React, { useState, useMemo, useEffect, useContext, useCallback, memo } from 'react';
import { useAuditData } from '../context/AuditContext';
import { AuthContext } from '../context/AuthContext';
import { ToastContext } from '../context/ToastContext';
import { Edit2, Trash2, Calendar, ClipboardCheck, Building2, Bed as BedIcon, User, Search, Filter, X, Save, AlertTriangle, FileText, ChevronDown, ChevronUp, RotateCcw, Loader2, ChevronsLeft, ChevronsRight, ArrowUpDown } from 'lucide-react';
import { cn, formatDateTime, getAnswerForQuestion, numericCollator, calculateAuditConformity } from '../lib/utils';
import { fetchPaginatedAudits } from '../lib/apiClient';
import { AuditRecord, AuditQuestion } from '../types';
import { motion, AnimatePresence } from 'motion/react';

type AuditSortOption = 'sector_bed' | 'recent' | 'oldest' | 'score_desc' | 'score_asc';

interface AuditTableRowProps {
  audit: AuditRecord;
  sectorName: string;
  bedNumber: string;
  onView: (audit: AuditRecord) => void;
  onEdit: (audit: AuditRecord) => void;
  onDelete: (id: string) => void;
  onToggleStatus: (audit: AuditRecord, e: React.MouseEvent) => void;
}

const AuditTableRow = memo(function AuditTableRow({
  audit,
  sectorName,
  bedNumber,
  onView,
  onEdit,
  onDelete,
  onToggleStatus
}: AuditTableRowProps) {
  const { conformityScore } = useMemo(
    () => calculateAuditConformity(audit.answers),
    [audit.answers]
  );

  const isIRAS = audit.type === 'IRAS';
  const isActive = (audit.status || 'ATIVO') === 'ATIVO';

  return (
    <div
      onClick={() => onView(audit)}
      className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4 px-4 py-4 lg:px-6 lg:py-3.5 hover:bg-blue-50/20 cursor-pointer transition items-center text-sm"
    >
      {/* Type Column */}
      <div className="col-span-1 lg:col-span-2 flex items-center gap-2">
        <span className={cn(
          "h-2 w-2 rounded-full shrink-0",
          isIRAS ? "bg-purple-500" : "bg-emerald-500"
        )} />
        <span className="font-semibold text-slate-700 lg:hidden text-xs text-slate-400 uppercase tracking-wider">Tipo:</span>
        <span className={cn(
          "text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-md",
          isIRAS
            ? "bg-purple-50/80 text-purple-700 border border-purple-100"
            : "bg-emerald-50/80 text-emerald-700 border border-emerald-100"
        )}>
          {isIRAS ? 'IRAS' : 'Segurança'}
        </span>
      </div>

      {/* Sector & Bed Column */}
      <div className="col-span-1 lg:col-span-3 flex lg:flex-col justify-between lg:justify-center">
        <span className="font-semibold text-slate-700 lg:hidden text-xs text-slate-400 uppercase tracking-wider">Setor/Leito:</span>
        <div className="text-slate-850 font-bold lg:font-semibold">
          {sectorName}{' '}
          <span className="text-blue-650 font-extrabold ml-1 font-mono bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded text-xs">L-{bedNumber}</span>
        </div>
      </div>

      {/* Evaluator Column */}
      <div className="col-span-1 lg:col-span-2 flex lg:flex-col justify-between lg:justify-center">
        <span className="font-semibold text-slate-700 lg:hidden text-xs text-slate-400 uppercase tracking-wider">Avaliador:</span>
        <div className="text-slate-600 font-medium flex items-center gap-1.5">
          <User size={13} className="text-slate-400 hidden lg:inline shrink-0" />
          <span className="truncate max-w-[150px] font-medium" title={audit.evaluator}>{audit.evaluator || 'Não informado'}</span>
        </div>
      </div>

      {/* Date Column */}
      <div className="col-span-1 lg:col-span-2 flex lg:flex-col justify-between lg:justify-center">
        <span className="font-semibold text-slate-700 lg:hidden text-xs text-slate-400 uppercase tracking-wider">Data:</span>
        <div className="text-slate-550 text-xs font-mono">
          {formatDateTime(audit.date)}
        </div>
      </div>

      {/* Conformity Score Column */}
      <div className="col-span-1 lg:col-span-1 flex lg:justify-center justify-between items-center">
        <span className="font-semibold text-slate-700 lg:hidden text-xs text-slate-400 uppercase tracking-wider">Conformidade:</span>
        <span className={cn(
          "px-2.5 py-0.5 rounded-full text-xs font-extrabold font-mono shadow-xs border",
          conformityScore >= 80 ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
          conformityScore >= 50 ? "bg-amber-50 text-amber-700 border-amber-250" :
          "bg-rose-50 text-rose-700 border-rose-200"
        )}>
          {conformityScore}%
        </span>
      </div>

      {/* Status Column */}
      <div className="col-span-1 lg:col-span-1 flex lg:justify-center justify-between items-center">
        <span className="font-semibold text-slate-700 lg:hidden text-xs text-slate-400 uppercase tracking-wider">Status:</span>
        <button
          onClick={(e) => onToggleStatus(audit, e)}
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border transition duration-200 hover:shadow-xs cursor-pointer",
            isActive
              ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
              : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
          )}
          title="Clique para alternar o status Ativo/Inativo"
        >
          <span className={cn(
            "h-1.5 w-1.5 rounded-full",
            isActive ? "bg-emerald-500 animate-pulse" : "bg-slate-400"
          )} />
          {isActive ? 'Ativo' : 'Inativo'}
        </button>
      </div>

      {/* Actions Column */}
      <div className="col-span-1 lg:col-span-1 flex justify-end gap-1 border-t lg:border-t-0 border-slate-100 pt-3 lg:pt-0 mt-2 lg:mt-0">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit(audit);
          }}
          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
          title="Editar"
        >
          <Edit2 size={14} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(audit.id);
          }}
          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
          title="Excluir"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
});

export function CompletedAudits() {
  const { audits, totalAuditsCount, sectors, beds, questions, updateAudit, deleteAudit, getBedsBySector, getSectorById, getBedById, dbConnected } = useAuditData();
  const { user } = useContext(AuthContext);
  const { showToast } = useContext(ToastContext);

  // Determine if the user is allowed to see all audits or only their own
  const canViewAllAudits = useMemo(() => {
    if (!user) return true;
    if (user.role === 'MASTER' || user.role === 'ADMIN' || user.permissions.includes('ALL')) return true;
    if (user.permissions.includes('COMPLETED_AUDITS') || user.permissions.includes('COMPLETED_AUDITS:READ')) {
      return true;
    }
    return false;
  }, [user]);

  // Filter states
  const [selectedSector, setSelectedSector] = useState<string>('ALL');
  const [selectedBed, setSelectedBed] = useState<string>('ALL');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState<string>('');
  const [filterDate, setFilterDate] = useState<string>('');

  // Advanced filter & sort states
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedConformity, setSelectedConformity] = useState<string>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [sortBy, setSortBy] = useState<AuditSortOption>('recent');
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  // Pagination states
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Server-backed paginated result state
  const [serverRows, setServerRows] = useState<AuditRecord[] | null>(null);
  const [serverTotalFiltered, setServerTotalFiltered] = useState<number>(0);
  const [serverTotalAll, setServerTotalAll] = useState<number>(0);
  const [serverTotalPages, setServerTotalPages] = useState<number>(1);
  const [isFetchingPage, setIsFetchingPage] = useState<boolean>(false);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  // Debounce search input (180ms) so typing never stutters table rendering or server requests
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 180);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedSector, selectedBed, selectedType, debouncedSearchTerm, filterDate, selectedStatus, selectedConformity, startDate, endDate, sortBy]);

  // Fetch current page directly from server when online (true server-side lazy loading & pagination)
  useEffect(() => {
    if (!dbConnected) {
      setServerRows(null);
      return;
    }

    const controller = new AbortController();
    let active = true;
    setIsFetchingPage(true);

    fetchPaginatedAudits(
      {
        page: currentPage,
        limit: pageSize,
        sectorId: selectedSector,
        bedId: selectedBed,
        type: selectedType,
        status: selectedStatus,
        conformity: selectedConformity,
        filterDate,
        startDate,
        endDate,
        search: debouncedSearchTerm,
        sortBy
      },
      controller.signal
    ).then(res => {
      if (!active) return;
      if (res && res.success) {
        setServerRows(res.audits || []);
        setServerTotalFiltered(res.pagination?.total ?? 0);
        setServerTotalAll(res.pagination?.totalAll ?? 0);
        setServerTotalPages(res.pagination?.totalPages ?? 1);
      } else if (!controller.signal.aborted) {
        // Fallback smoothly to cached client-side list
        setServerRows(null);
      }
      setIsFetchingPage(false);
    }).catch(() => {
      if (active && !controller.signal.aborted) {
        setServerRows(null);
        setIsFetchingPage(false);
      }
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [
    dbConnected,
    currentPage,
    pageSize,
    selectedSector,
    selectedBed,
    selectedType,
    selectedStatus,
    selectedConformity,
    filterDate,
    startDate,
    endDate,
    debouncedSearchTerm,
    sortBy,
    refreshTrigger,
    audits.length
  ]);

  // Editing state
  const [editingAudit, setEditingAudit] = useState<AuditRecord | null>(null);
  const [viewingAudit, setViewingAudit] = useState<AuditRecord | null>(null);
  const [editedEvaluator, setEditedEvaluator] = useState<string>('');
  const [editedDate, setEditedDate] = useState<string>('');
  const [editedSectorId, setEditedSectorId] = useState<string>('');
  const [editedBedId, setEditedBedId] = useState<string>('');
  const [editedAnswers, setEditedAnswers] = useState<Record<string, string>>({});

  // Delete confirmation state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Filter beds based on the selected sector in general filters
  const filteredBeds = useMemo(() => {
    if (selectedSector === 'ALL') return beds;
    return getBedsBySector(selectedSector);
  }, [selectedSector, beds, getBedsBySector]);

  // Handle sector change in general filters
  const handleSectorFilterChange = (sectorId: string) => {
    setSelectedSector(sectorId);
    setSelectedBed('ALL');
  };

  // Filter beds for the edit form
  const editFormBeds = useMemo(() => {
    if (!editedSectorId) return [];
    return getBedsBySector(editedSectorId);
  }, [editedSectorId, getBedsBySector]);

  // Handle sector change in editing form
  const handleEditSectorChange = (secId: string) => {
    setEditedSectorId(secId);
    const sectorBeds = getBedsBySector(secId);
    if (sectorBeds.length > 0) {
      setEditedBedId(sectorBeds[0].id);
    } else {
      setEditedBedId('');
    }
  };

  // Client-side fallback filtering & sorting (used only when server pagination is unavailable/offline)
  const localFilteredAudits = useMemo(() => {
    if (serverRows !== null) return [];

    const lowerQuery = debouncedSearchTerm.trim().toLowerCase();
    const list = audits.filter(audit => {
      if (!canViewAllAudits && user) {
        const queryName = (user.name || '').toLowerCase().trim();
        const queryEmail = (user.email || '').toLowerCase().trim();
        const evalName = (audit.evaluator || '').toLowerCase().trim();
        if (evalName !== queryName && evalName !== queryEmail) return false;
      }

      if (selectedSector !== 'ALL' && audit.sectorId !== selectedSector) return false;
      if (selectedBed !== 'ALL' && audit.bedId !== selectedBed) return false;
      if (selectedType !== 'ALL' && audit.type !== selectedType) return false;
      if (filterDate && !audit.date.startsWith(filterDate)) return false;

      if (startDate && audit.date.substring(0, 10) < startDate) return false;
      if (endDate && audit.date.substring(0, 10) > endDate) return false;

      if (selectedStatus !== 'ALL') {
        const isActive = (audit.status || 'ATIVO') === 'ATIVO';
        if (selectedStatus === 'ACTIVE' && !isActive) return false;
        if (selectedStatus === 'INACTIVE' && isActive) return false;
      }

      if (selectedConformity !== 'ALL') {
        const { conformityScore } = calculateAuditConformity(audit.answers);
        if (selectedConformity === 'CONFORME' && conformityScore < 80) return false;
        if (selectedConformity === 'PARCIAL' && (conformityScore < 50 || conformityScore >= 80)) return false;
        if (selectedConformity === 'NAO_CONFORME' && conformityScore >= 50) return false;
      }

      if (lowerQuery !== '') {
        const evalMatch = audit.evaluator?.toLowerCase().includes(lowerQuery);
        const sector = getSectorById(audit.sectorId);
        const bed = getBedById(audit.bedId);
        const secMatch = sector?.name?.toLowerCase().includes(lowerQuery);
        const bedMatch = bed?.number?.toLowerCase().includes(lowerQuery);
        if (!evalMatch && !secMatch && !bedMatch) return false;
      }

      return true;
    });

    if (sortBy === 'recent') {
      return list.sort((a, b) => (new Date(b.date).getTime() || 0) - (new Date(a.date).getTime() || 0));
    }
    if (sortBy === 'oldest') {
      return list.sort((a, b) => (new Date(a.date).getTime() || 0) - (new Date(b.date).getTime() || 0));
    }
    if (sortBy === 'score_desc') {
      return list.sort((a, b) => calculateAuditConformity(b.answers).conformityScore - calculateAuditConformity(a.answers).conformityScore);
    }
    if (sortBy === 'score_asc') {
      return list.sort((a, b) => calculateAuditConformity(a.answers).conformityScore - calculateAuditConformity(b.answers).conformityScore);
    }

    return list.sort((a, b) => {
      const sAName = getSectorById(a.sectorId)?.name || '';
      const sBName = getSectorById(b.sectorId)?.name || '';
      const sectorCompare = numericCollator.compare(sAName, sBName);
      if (sectorCompare !== 0) return sectorCompare;

      const bANumber = getBedById(a.bedId)?.number || '';
      const bBNumber = getBedById(b.bedId)?.number || '';
      const bedCompare = numericCollator.compare(bANumber, bBNumber);
      if (bedCompare !== 0) return bedCompare;

      return (new Date(b.date).getTime() || 0) - (new Date(a.date).getTime() || 0);
    });
  }, [serverRows, audits, selectedSector, selectedBed, selectedType, filterDate, startDate, endDate, selectedStatus, selectedConformity, debouncedSearchTerm, sortBy, getSectorById, getBedById, canViewAllAudits, user]);

  // Unified paginated view metrics (server-backed or offline fallback)
  const isUsingServerPagination = serverRows !== null;
  const totalFilteredCount = isUsingServerPagination ? serverTotalFiltered : localFilteredAudits.length;
  const totalOverallCount = isUsingServerPagination ? serverTotalAll : (totalAuditsCount || audits.length);
  const totalPages = isUsingServerPagination
    ? Math.max(1, serverTotalPages)
    : Math.max(1, Math.ceil(localFilteredAudits.length / pageSize));

  const paginatedAudits = useMemo(() => {
    if (serverRows !== null) return serverRows;
    const startIndex = (currentPage - 1) * pageSize;
    return localFilteredAudits.slice(startIndex, startIndex + pageSize);
  }, [serverRows, localFilteredAudits, currentPage, pageSize]);

  // Smart numbered page sequence (e.g. 1 ... 4 5 6 ... 20)
  const visiblePageNumbers = useMemo(() => {
    const pages: (number | 'ellipsis')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
      return pages;
    }
    pages.push(1);
    if (currentPage > 3) pages.push('ellipsis');
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push('ellipsis');
    pages.push(totalPages);
    return pages;
  }, [currentPage, totalPages]);

  // Alfanumerically sorted sectors for filters using cached numericCollator
  const sortedSectors = useMemo(() => {
    return [...sectors].sort((a, b) => numericCollator.compare(a.name, b.name));
  }, [sectors]);

  const sortedFilteredBeds = useMemo(() => {
    return [...filteredBeds].sort((a, b) => numericCollator.compare(a.number, b.number));
  }, [filteredBeds]);

  const sortedEditFormBeds = useMemo(() => {
    return [...editFormBeds].sort((a, b) => numericCollator.compare(a.number, b.number));
  }, [editFormBeds]);

  // Start editing flow
  const handleStartEdit = useCallback((audit: AuditRecord) => {
    setEditingAudit(audit);
    setEditedEvaluator(audit.evaluator || '');
    setEditedDate(audit.date ? audit.date.trim().substring(0, 10) : (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })());
    setEditedSectorId(audit.sectorId || '');
    setEditedBedId(audit.bedId || '');
    setEditedAnswers({ ...audit.answers });
  }, []);

  // Save changes
  const handleSaveEdit = async () => {
    if (!editingAudit) return;
    if (!editedEvaluator.trim()) {
      showToast('error', 'Campo Obrigatório', 'O nome do avaliador é obrigatório.');
      return;
    }
    if (!editedSectorId || !editedBedId) {
      showToast('error', 'Campos Obrigatórios', 'Setor e Leito são obrigatórios.');
      return;
    }

    try {
      await updateAudit(editingAudit.id, {
        type: editingAudit.type,
        date: editedDate,
        evaluator: editedEvaluator,
        sectorId: editedSectorId,
        bedId: editedBedId,
        answers: editedAnswers,
        status: editingAudit.status
      });

      showToast('success', 'Auditoria Atualizada', 'As alterações na auditoria foram salvas no banco.');
      setEditingAudit(null);
      setRefreshTrigger(t => t + 1);
    } catch (err: any) {
      console.error(err);
      showToast('error', 'Erro ao Atualizar', err.message || 'Não foi possível salvar as alterações da auditoria.');
    }
  };

  const handleToggleAnswer = (questionId: string, value: string) => {
    setEditedAnswers(prev => ({
      ...prev,
      [questionId]: prev[questionId] === value ? '' : value
    }));
  };

  const handleDeleteClick = useCallback((id: string) => {
    setConfirmDeleteId(id);
  }, []);

  const handleConfirmDelete = async () => {
    if (confirmDeleteId) {
      try {
        await deleteAudit(confirmDeleteId);
        showToast('success', 'Auditoria Removida', 'A auditoria foi excluída permanentemente do banco.');
        setConfirmDeleteId(null);
        setRefreshTrigger(t => t + 1);
      } catch (err: any) {
        console.error(err);
        showToast('error', 'Erro ao Excluir', err.message || 'Não foi possível excluir a auditoria do banco de dados.');
      }
    }
  };

  const handleToggleStatus = useCallback(async (audit: AuditRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    const currentStatus = audit.status || 'ATIVO';
    const newStatus = currentStatus === 'ATIVO' ? 'INATIVO' : 'ATIVO';
    try {
      await updateAudit(audit.id, {
        type: audit.type,
        date: audit.date,
        evaluator: audit.evaluator,
        sectorId: audit.sectorId,
        bedId: audit.bedId,
        answers: audit.answers,
        status: newStatus
      });
      showToast('success', 'Status Alterado', `O status da auditoria foi alterado para ${newStatus}.`);
      setRefreshTrigger(t => t + 1);
    } catch (err: any) {
      console.error(err);
      showToast('error', 'Erro ao Alterar Status', err.message || 'Não foi possível alterar o status da auditoria.');
    }
  }, [updateAudit, showToast]);

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Header and Counters */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-blue-600" />
            Auditorias Realizadas
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Histórico completo de auditorias aplicadas, com suporte a filtros detalhados, edição e exclusão.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {isFetchingPage && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-700 bg-sky-50 px-3 py-2 rounded-lg border border-sky-200">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Carregando página...</span>
            </div>
          )}
          <div className="flex bg-blue-50 text-blue-700 px-4 py-2.5 rounded-lg border border-blue-100 text-sm font-semibold items-center gap-2 shadow-sm">
            <FileText className="w-4 h-4 shrink-0" />
            <span>Total Filtrado: {totalFilteredCount} de {totalOverallCount} auditorias</span>
          </div>
        </div>
      </div>

      {/* Filters Box */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-700 uppercase tracking-wider">
            <Filter className="w-4 h-4 text-blue-500" />
            <span>Filtros de Pesquisa</span>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            {/* Sort selector */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as AuditSortOption)}
                aria-label="Ordenação da tabela"
                className="text-xs font-semibold text-slate-700 bg-transparent focus:outline-none cursor-pointer"
              >
                <option value="recent">Mais Recentes</option>
                <option value="oldest">Mais Antigas</option>
                <option value="sector_bed">Setor / Leito</option>
                <option value="score_desc">Maior Conformidade</option>
                <option value="score_asc">Menor Conformidade</option>
              </select>
            </div>

            {/* Clear filters helper if any is active */}
            {(selectedSector !== 'ALL' || selectedBed !== 'ALL' || selectedType !== 'ALL' || searchTerm !== '' || filterDate !== '' || selectedStatus !== 'ALL' || selectedConformity !== 'ALL' || startDate !== '' || endDate !== '') && (
              <button
                onClick={() => {
                  setSelectedSector('ALL');
                  setSelectedBed('ALL');
                  setSelectedType('ALL');
                  setSearchTerm('');
                  setDebouncedSearchTerm('');
                  setFilterDate('');
                  setSelectedStatus('ALL');
                  setSelectedConformity('ALL');
                  setStartDate('');
                  setEndDate('');
                }}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition cursor-pointer border border-transparent"
                title="Limpar todos os filtros ativos"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Limpar Filtros</span>
              </button>
            )}

            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className={cn(
                "flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition cursor-pointer border",
                showAdvanced 
                  ? "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100" 
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              )}
            >
              <span>{showAdvanced ? "Ocultar Filtros Avançados" : "Filtros Avançados"}</span>
              {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Quick / Primary Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Sector Filter */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Setor</label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select
                value={selectedSector}
                onChange={(e) => handleSectorFilterChange(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition cursor-pointer"
              >
                <option value="ALL">Todos os Setores</option>
                {sortedSectors.map(sector => (
                  <option key={sector.id} value={sector.id}>{sector.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Bed Filter */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Leito</label>
            <div className="relative">
              <BedIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select
                value={selectedBed}
                onChange={(e) => setSelectedBed(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition cursor-pointer"
              >
                <option value="ALL">Todos os Leitos</option>
                {sortedFilteredBeds.map(bed => (
                  <option key={bed.id} value={bed.id}>{bed.number}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Checklist Type Filter */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Tipo de Auditoria</label>
            <div className="relative">
              <ClipboardCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition cursor-pointer"
              >
                <option value="ALL">Qualquer Tipo</option>
                <option value="IRAS">Auditoria IRAS</option>
                <option value="SAFETY">Segurança do Paciente</option>
              </select>
            </div>
          </div>

          {/* Search Term */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Busca por Texto</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Avaliador, leito, setor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
              />
            </div>
          </div>
        </div>

        {/* Advanced Filters Expandable Container */}
        {showAdvanced && (
          <div className="pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-in slide-in-from-top-2 duration-200">
            {/* Start Date */}
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Data Inicial</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition cursor-pointer"
                />
              </div>
            </div>

            {/* End Date */}
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Data Final</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition cursor-pointer"
                />
              </div>
            </div>

            {/* Record Status Filter */}
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Status do Registro</label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center font-bold text-slate-400 text-xs">●</div>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition cursor-pointer"
                >
                  <option value="ALL">Qualquer Status</option>
                  <option value="ACTIVE">Ativo</option>
                  <option value="INACTIVE">Inativo</option>
                </select>
              </div>
            </div>

            {/* Conformity Status Filter */}
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Nível de Conformidade</label>
              <div className="relative">
                <ClipboardCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <select
                  value={selectedConformity}
                  onChange={(e) => setSelectedConformity(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition cursor-pointer"
                >
                  <option value="ALL">Qualquer Nível</option>
                  <option value="CONFORME">Conforme (≥ 80%)</option>
                  <option value="PARCIAL">Parcialmente Conforme (50% - 79%)</option>
                  <option value="NAO_CONFORME">Não Conforme (&lt; 50%)</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Grid List of Completed Audits */}
      {isFetchingPage && paginatedAudits.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 space-y-3">
          {Array.from({ length: 5 }).map((_, idx) => (
            <div key={idx} className="h-12 bg-slate-100/80 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : totalFilteredCount === 0 ? (
        <div className="bg-slate-50 border border-dashed border-slate-250 rounded-2xl p-12 text-center max-w-lg mx-auto">
          <ClipboardCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-700">Nenhuma auditoria encontrada</h3>
          <p className="text-xs text-slate-500 mt-1">
            Não há registros de auditorias que correspondam aos filtros selecionados. Tente alterar os filtros ou cadastrar uma nova auditoria.
          </p>
        </div>
      ) : (
        <div className={cn("bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden transition-opacity duration-150", isFetchingPage && "opacity-75")}>
          <div className="overflow-x-auto">
            <div className="w-full min-w-full lg:min-w-[1100px]">
              {/* Table Header (Desktop Only) */}
              <div className="hidden lg:grid lg:grid-cols-12 gap-4 bg-slate-50/80 px-6 py-4 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider items-center">
                <div className="col-span-2">Tipo de Auditoria</div>
                <div className="col-span-3">Setor / Leito</div>
                <div className="col-span-2">Avaliador</div>
                <div className="col-span-2">Data da Avaliação</div>
                <div className="col-span-1 text-center">Conformidade</div>
                <div className="col-span-1 text-center">Status</div>
                <div className="col-span-1 text-right">Ações</div>
              </div>

              {/* Memoized Table Rows */}
              <div className="divide-y divide-slate-100">
                {paginatedAudits.map(audit => {
                  const sector = getSectorById(audit.sectorId);
                  const bed = getBedById(audit.bedId);
                  return (
                    <AuditTableRow
                      key={audit.id}
                      audit={audit}
                      sectorName={sector?.name || 'N/A'}
                      bedNumber={bed?.number || 'N/A'}
                      onView={setViewingAudit}
                      onEdit={handleStartEdit}
                      onDelete={handleDeleteClick}
                      onToggleStatus={handleToggleStatus}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          {/* Pagination Controls */}
          {totalFilteredCount > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 border-t border-slate-100 bg-slate-50/50" id="completed-audits-pagination">
              <div className="text-xs text-slate-500 font-medium">
                Mostrando <span className="font-semibold text-slate-700">{Math.min(totalFilteredCount, (currentPage - 1) * pageSize + 1)}</span> a{' '}
                <span className="font-semibold text-slate-700">{Math.min(totalFilteredCount, currentPage * pageSize)}</span> de{' '}
                <span className="font-semibold text-slate-700">{totalFilteredCount}</span> auditorias
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3">
                {/* Items per Page Select */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Por página:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-2xs focus:ring-1 focus:ring-blue-500 focus:outline-hidden cursor-pointer"
                  >
                    {[10, 20, 50, 100].map(size => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </select>
                </div>

                {/* Page Navigation Buttons */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1 || isFetchingPage}
                    title="Primeira página"
                    className="p-1.5 text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white transition cursor-pointer"
                  >
                    <ChevronsLeft size={14} />
                  </button>
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1 || isFetchingPage}
                    className="px-2.5 py-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white transition cursor-pointer"
                  >
                    Anterior
                  </button>

                  <div className="hidden md:flex items-center gap-1 px-1">
                    {visiblePageNumbers.map((item, idx) =>
                      item === 'ellipsis' ? (
                        <span key={`e-${idx}`} className="px-1.5 text-xs text-slate-400">…</span>
                      ) : (
                        <button
                          key={item}
                          onClick={() => setCurrentPage(item)}
                          disabled={isFetchingPage}
                          className={cn(
                            "min-w-[28px] h-7 px-2 text-xs font-bold rounded-lg border transition cursor-pointer",
                            currentPage === item
                              ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                              : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                          )}
                        >
                          {item}
                        </button>
                      )
                    )}
                  </div>

                  <span className="md:hidden text-xs font-semibold text-slate-600 px-2">
                    {currentPage} / {totalPages}
                  </span>

                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages || isFetchingPage}
                    className="px-2.5 py-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white transition cursor-pointer"
                  >
                    Próxima
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages || isFetchingPage}
                    title="Última página"
                    className="p-1.5 text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white transition cursor-pointer"
                  >
                    <ChevronsRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* LATERAL PANEL (DRAWER) FOR VIEWING AUDIT DETAILS */}
      <AnimatePresence>
        {viewingAudit && (() => {
          const sector = getSectorById(viewingAudit.sectorId);
          const bed = getBedById(viewingAudit.bedId);
          
          const totalAnswered = Object.keys(viewingAudit.answers || {}).length;
          const positiveAnswers = Object.entries(viewingAudit.answers || {}).filter(([_, val]) => val === 'S' || val === 'Sim').length;
          const naAnswers = Object.entries(viewingAudit.answers || {}).filter(([_, val]) => val === 'NA').length;
          const negativeAnswers = totalAnswered - positiveAnswers - naAnswers;
          
          const totalEligible = totalAnswered - naAnswers;
          const conformityScore = totalEligible > 0 ? Math.round((positiveAnswers / totalEligible) * 100) : 0;
          
          const isIRAS = viewingAudit.type === 'IRAS';
          const isActive = (viewingAudit.status || 'ATIVO') === 'ATIVO';

          return (
            <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
              {/* Backdrop Overlay */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setViewingAudit(null)}
                className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs cursor-pointer"
              />

              {/* Sidebar Drawer Container */}
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 220 }}
                className="relative w-full max-w-lg md:max-w-xl bg-white h-full shadow-2xl flex flex-col z-10 overflow-hidden printable-area-parent printable-area"
              >
                {/* Header */}
                <div className={cn(
                  "p-6 text-white flex justify-between items-start shrink-0 relative",
                  isIRAS ? "bg-gradient-to-r from-purple-600 to-indigo-700" : "bg-gradient-to-r from-emerald-600 to-teal-700"
                )}>
                  <div className="space-y-1.5 max-w-[85%]">
                    <span className="text-[10px] font-extrabold uppercase tracking-widest bg-white/20 px-2.5 py-1 rounded-full border border-white/20">
                      {isIRAS ? 'Auditoria IRAS' : 'Segurança do Paciente'}
                    </span>
                    <h3 className="text-xl font-black tracking-tight mt-1.5 flex items-center gap-2">
                      <Building2 size={18} className="text-white/80" />
                      {sector?.name || 'Setor não identificado'}
                    </h3>
                    <p className="text-xs text-white/90 flex items-center gap-1.5">
                      <BedIcon size={14} className="text-white/70" />
                      Leito: <strong className="text-white font-bold">{bed?.number || 'Não identificado'}</strong>
                    </p>
                  </div>
                  
                  <button 
                    onClick={() => setViewingAudit(null)}
                    className="text-white/80 hover:text-white hover:bg-white/10 p-2 rounded-xl transition cursor-pointer print:hidden"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Scrollable Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
                  {/* Status & Date & Evaluator card */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
                    <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                      <div>
                        <p className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">Status da Auditoria</p>
                        <button
                          onClick={(e) => handleToggleStatus(viewingAudit, e)}
                          className={cn(
                            "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border mt-1 transition duration-200 hover:shadow-sm cursor-pointer",
                            isActive
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-slate-100 text-slate-500 border-slate-250"
                          )}
                        >
                          <span className={cn("h-2 w-2 rounded-full", isActive ? "bg-emerald-500 animate-pulse" : "bg-slate-400")} />
                          {isActive ? 'Ativo' : 'Inativo'}
                        </button>
                      </div>

                      <div className="text-right">
                        <p className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">Data Realizada</p>
                        <p className="text-sm font-semibold text-slate-700 font-mono mt-1">{formatDateTime(viewingAudit.date)}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">Avaliador</p>
                        <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mt-1">
                          <User size={14} className="text-slate-400" />
                          {viewingAudit.evaluator || 'Não informado'}
                        </p>
                      </div>

                      <div>
                        <p className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">Resumo de Respostas</p>
                        <p className="text-xs font-bold text-slate-650 mt-1">
                          <span className="text-emerald-600 font-black">{positiveAnswers}</span> Sim /{' '}
                          <span className="text-rose-600 font-black">{negativeAnswers}</span> Não /{' '}
                          <span className="text-slate-400">{naAnswers}</span> N/A
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Conformity score banner */}
                  <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-5 text-white shadow-md flex justify-between items-center relative overflow-hidden">
                    {/* Visual pattern accent */}
                    <div className="absolute right-0 bottom-0 opacity-10 translate-y-1/4 translate-x-1/4">
                      <ClipboardCheck size={200} />
                    </div>

                    <div className="space-y-1 relative z-10">
                      <h4 className="text-xs font-extrabold uppercase tracking-widest text-blue-100">Taxa de Conformidade</h4>
                      <p className="text-sm text-blue-50/80 leading-relaxed font-medium">
                        Cálculo baseado nas perguntas elegíveis (excluindo N/A)
                      </p>
                    </div>

                    <div className="relative z-10 flex flex-col items-center">
                      <div className="bg-white/10 backdrop-blur-md border border-white/20 h-16 w-16 rounded-full flex items-center justify-center shadow-inner">
                        <span className="text-xl font-black">{conformityScore}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Question Checklist categorized by section */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Perguntas & Respostas</h4>
                    
                    {Object.entries(
                      questions
                        .filter(q => q.formType === viewingAudit.type)
                        .reduce<Record<string, AuditQuestion[]>>((accum, quest) => {
                          if (!accum[quest.section]) accum[quest.section] = [];
                          accum[quest.section].push(quest);
                          return accum;
                        }, {})
                    ).map(([sectionName, sectionQuestions]) => (
                      <div key={sectionName} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                        <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 font-bold text-xs text-slate-600 uppercase tracking-wide">
                          {sectionName}
                        </div>
                        <div className="divide-y divide-slate-100">
                          {(sectionQuestions as AuditQuestion[]).map(q => {
                            const ans = getAnswerForQuestion(viewingAudit.answers, q, questions);
                            
                            let badgeClass = "bg-slate-50 text-slate-400 border border-slate-200/60";
                            if (ans === 'Sim' || ans === 'S') badgeClass = "bg-emerald-50 text-emerald-700 border-emerald-200/60";
                            if (ans === 'Não' || ans === 'N') badgeClass = "bg-rose-50 text-rose-700 border-rose-200/60";
                            if (ans === 'NA') badgeClass = "bg-slate-100 text-slate-500 border-slate-250/60";

                            return (
                              <div key={q.id} className="p-4 flex justify-between items-start gap-4 hover:bg-slate-50/30 transition">
                                <span className="text-xs font-semibold text-slate-700 leading-relaxed">{q.label}</span>
                                <span className={cn(
                                  "px-2.5 py-1 text-[10px] font-black rounded-lg uppercase tracking-wider shrink-0 shadow-xs border text-center min-w-[50px]",
                                  badgeClass
                                )}>
                                  {ans || 'N/R'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Footer Action Bar */}
                <div className="p-5 bg-white border-t border-slate-150 flex gap-3 shrink-0 print:hidden">
                  <button
                    onClick={() => {
                      try {
                        const isIframe = window.self !== window.top;
                        if (isIframe) {
                          showToast('info', 'Dica de Impressão', 'Caso a janela de impressão não abra, use o botão no canto superior direito para abrir o app em nova aba.');
                        }
                        window.print();
                      } catch (e) {
                        console.error("Erro ao imprimir:", e);
                        showToast('error', 'Impressão Bloqueada', 'Por favor, abra o aplicativo em uma nova aba para imprimir.');
                      }
                    }}
                    className="flex-1 flex justify-center items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-xs shadow-sm transition cursor-pointer"
                  >
                    <FileText size={13} /> Imprimir Relatório
                  </button>
                  <button
                    onClick={() => {
                      setViewingAudit(null);
                      handleStartEdit(viewingAudit);
                    }}
                    className="flex-1 flex justify-center items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl text-xs shadow-sm transition cursor-pointer"
                  >
                    <Edit2 size={13} /> Editar Registro
                  </button>
                  <button
                    onClick={() => {
                      setViewingAudit(null);
                      handleDeleteClick(viewingAudit.id);
                    }}
                    className="flex-1 flex justify-center items-center gap-2 bg-white hover:bg-rose-55 text-slate-700 border border-slate-200 hover:border-rose-200 hover:text-rose-600 font-bold py-2.5 rounded-xl text-xs transition cursor-pointer"
                  >
                    <Trash2 size={13} /> Excluir Registro
                  </button>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* EDIT MODAL / DIALOG */}
      {editingAudit && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in duration-200">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-5 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-md">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold">Editar Auditoria</h3>
                  <p className="text-xs text-slate-300 mt-0.5 uppercase tracking-wide font-medium">
                    {editingAudit.type === 'IRAS' ? 'Auditoria IRAS' : 'Segurança do Paciente'}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setEditingAudit(null)}
                className="text-slate-400 hover:text-white bg-slate-800 p-2 rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {/* Fields Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                {/* Evaluator */}
                <div className="col-span-1 sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Avaliador</label>
                  <input
                    type="text"
                    value={editedEvaluator}
                    onChange={(e) => setEditedEvaluator(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
                  />
                </div>

                {/* Date */}
                <div className="col-span-1 sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Data da Avaliação</label>
                  <input
                    type="date"
                    value={editedDate}
                    onChange={(e) => setEditedDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
                  />
                </div>

                {/* Sector */}
                <div className="col-span-1 sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Setor</label>
                  <select
                    value={editedSectorId}
                    onChange={(e) => handleEditSectorChange(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
                  >
                    <option value="">Selecione um setor</option>
                    {sortedSectors.map(sec => (
                      <option key={sec.id} value={sec.id}>{sec.name}</option>
                    ))}
                  </select>
                </div>

                {/* Bed */}
                <div className="col-span-1 sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Leito</label>
                  <select
                    value={editedBedId}
                    onChange={(e) => setEditedBedId(e.target.value)}
                    disabled={!editedSectorId}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition disabled:opacity-60"
                  >
                    <option value="">Selecione um leito</option>
                    {sortedEditFormBeds.map(bd => (
                      <option key={bd.id} value={bd.id}>{bd.number}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Checklist Question Answers */}
              <div className="space-y-4">
                <div className="border-b border-slate-200 pb-2">
                  <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider"> Checklist de Respostas</h4>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Gire ou selecione as novas respostas para as perguntas abaixo que farão parte da sua auditoria.
                  </p>
                </div>

                {/* Group questions of this type by section */}
                {Object.entries(
                  questions
                    .filter(q => q.formType === editingAudit.type)
                    .reduce<Record<string, AuditQuestion[]>>((accum, quest) => {
                      if (!accum[quest.section]) accum[quest.section] = [];
                      accum[quest.section].push(quest);
                      return accum;
                    }, {})
                ).map(([sectionName, sectionQuestions]) => (
                  <div key={sectionName} className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
                    <div className="bg-slate-100/80 px-4 py-2 border-b border-slate-200 font-semibold text-xs text-slate-700">
                      {sectionName}
                    </div>
                    <div className="divide-y divide-slate-100">
                      {(sectionQuestions as AuditQuestion[]).map(q => (
                        <div key={q.id} className="p-3 sm:p-4 flex flex-col sm:flex-row justify-between sm:items-center gap-3 hover:bg-slate-50/40">
                          <span className="text-xs font-medium text-slate-700 sm:max-w-md">{q.label}</span>
                          <div className="flex gap-1.5 self-end sm:self-auto">
                            {q.options.map(opt => {
                              const isSelected = editedAnswers[q.id] === opt;
                              return (
                                <button
                                  key={opt}
                                  type="button"
                                  onClick={() => handleToggleAnswer(q.id, opt)}
                                  className={cn(
                                    "px-3 py-1 rounded text-xs font-bold transition-all border min-w-[48px] text-center",
                                    isSelected
                                      ? "bg-blue-600 text-white border-blue-600 shadow-sm scale-105"
                                      : "bg-white text-slate-500 border-slate-250 hover:bg-slate-100"
                                  )}
                                >
                                  {opt}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-5 bg-slate-50 border-t border-slate-200 flex justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setEditingAudit(null)}
                className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-sm text-slate-700 font-medium transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-sm flex items-center gap-2 shadow-sm transition"
              >
                <Save className="w-4 h-4" />
                <span>Salvar Alterações</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE MODAL */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="bg-rose-100 p-2.5 rounded-full shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold">Excluir Auditoria?</h3>
            </div>
            
            <p className="text-sm text-slate-600 leading-relaxed font-medium">
              Tem certeza que deseja excluir esta auditoria? Esta ação é permanente e removerá os dados do servidor.
            </p>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 hover:border-slate-300 text-slate-700 font-medium text-xs rounded-lg transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs rounded-lg transition shadow-sm"
              >
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
