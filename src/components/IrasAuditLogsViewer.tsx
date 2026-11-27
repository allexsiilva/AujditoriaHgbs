import React, { useEffect, useMemo, useState } from 'react';
import { useAuditData } from '../context/AuditContext';
import { AuditQuestion, AuditRecord } from '../types';
import {
  calculateAuditConformity,
  cn,
  formatDateTime,
  getAnswerForQuestion,
  getYearMonthDay,
  numericCollator,
} from '../lib/utils';
import {
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Eye,
  Filter,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  User,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type DatePreset = 'ALL' | 'TODAY' | '7D' | '30D' | 'CUSTOM';
type OccurrenceFilter =
  | 'ALL'
  | 'NAO_CONFORMIDADE'
  | 'CONFORME'
  | 'PENDENTE'
  | 'BUNDLE_CS'
  | 'BUNDLE_PAV'
  | 'BUNDLE_SVD'
  | 'INATIVO';
type SortOrder = 'recent' | 'oldest' | 'score_asc' | 'score_desc' | 'sector_bed';

interface BundleSummary {
  id: 'CS' | 'PAV' | 'SVD';
  label: string;
  shortLabel: string;
  assessedCount: number;
  failureCount: number;
}

interface AnalyzedIrasLog {
  audit: AuditRecord;
  sectorName: string;
  bedNumber: string;
  conformityScore: number;
  totalAnswered: number;
  positiveAnswers: number;
  negativeAnswers: number;
  pendingCount: number;
  isInactive: boolean;
  hasNonConformity: boolean;
  isCompliant: boolean;
  primaryOccurrenceLabel: string;
  primaryOccurrenceType: 'NAO_CONFORMIDADE' | 'PENDENTE' | 'CONFORME' | 'INATIVO';
  failedItems: Array<{ id: string; label: string; section: string; answer: string }>;
  pendingItems: Array<{ id: string; label: string; section: string }>;
  activeBundles: BundleSummary[];
}

function getBundleKeyFromQuestion(q: AuditQuestion): 'CS' | 'PAV' | 'SVD' | null {
  const idLower = (q.id || '').toLowerCase();
  const sectionLower = (q.section || '').toLowerCase();
  if (idLower.startsWith('cs_') || sectionLower.includes('corrente sangu')) return 'CS';
  if (idLower.startsWith('pav_') || sectionLower.includes('pneumonia') || sectionLower.includes('ventila')) return 'PAV';
  if (idLower.startsWith('svd_') || sectionLower.includes('urin') || sectionLower.includes('svd')) return 'SVD';
  return null;
}

function isNegativeAnswer(ans: string): boolean {
  const norm = String(ans || '').trim().toLowerCase();
  return ['n', 'não', 'nao', 'ne', 'não estéril', 'nao esteril', 'não conforme', 'nao conforme', 'p', 'avp'].includes(norm);
}

function isNeutralDescriptiveAnswer(ans: string): boolean {
  const norm = String(ans || '').trim().toLowerCase();
  return ['c', 'p', 'ch', 'e', 'na', 'avc'].includes(norm);
}

function getLocalYmdString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getAuditYmdString(dateStr: string | undefined | null): string {
  const ymd = getYearMonthDay(dateStr);
  if (!ymd) return '';
  return `${ymd.year}-${String(ymd.month).padStart(2, '0')}-${String(ymd.day).padStart(2, '0')}`;
}

function getAuditTimestamp(dateStr: string | undefined | null): number {
  if (!dateStr) return 0;
  const trimmed = dateStr.trim();
  const normalized = trimmed.includes(' ') && !trimmed.includes('T')
    ? trimmed.replace(' ', 'T')
    : trimmed;
  const parsed = Date.parse(normalized);
  if (!Number.isNaN(parsed)) return parsed;
  const ymd = getYearMonthDay(dateStr);
  if (!ymd) return 0;
  return new Date(ymd.year, ymd.month - 1, ymd.day, 12, 0, 0).getTime();
}

export function IrasAuditLogsViewer() {
  const {
    audits,
    sectors,
    questions,
    ensureAllAuditsLoaded,
    isLoadingAudits,
    isLoadingMoreAudits,
    getSectorById,
    getBedById,
    dbConnected,
    syncDatabases,
  } = useAuditData();

  // Filter state
  const [datePreset, setDatePreset] = useState<DatePreset>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedSector, setSelectedSector] = useState<string>('ALL');
  const [selectedOccurrence, setSelectedOccurrence] = useState<OccurrenceFilter>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('recent');

  // Pagination & UI state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(15);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [selectedLog, setSelectedLog] = useState<AnalyzedIrasLog | null>(null);

  // Carrega o histórico completo de auditorias ao abrir a visualização central
  useEffect(() => {
    void ensureAllAuditsLoaded();
  }, [ensureAllAuditsLoaded]);

  // Volta para página 1 sempre que filtros ou ordenação mudarem
  useEffect(() => {
    setCurrentPage(1);
  }, [datePreset, startDate, endDate, selectedSector, selectedOccurrence, searchTerm, sortOrder, pageSize]);

  const irasQuestions = useMemo(() => {
    return questions.filter(q => q.formType === 'IRAS');
  }, [questions]);

  const sortedSectors = useMemo(() => {
    return [...sectors].sort((a, b) => numericCollator.compare(a.name || '', b.name || ''));
  }, [sectors]);

  const handlePresetSelect = (preset: DatePreset) => {
    setDatePreset(preset);
    if (preset === 'ALL') {
      setStartDate('');
      setEndDate('');
      return;
    }
    const today = new Date();
    const todayStr = getLocalYmdString(today);
    if (preset === 'TODAY') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === '7D') {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      setStartDate(getLocalYmdString(start));
      setEndDate(todayStr);
    } else if (preset === '30D') {
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      setStartDate(getLocalYmdString(start));
      setEndDate(todayStr);
    }
  };

  const handleClearFilters = () => {
    setDatePreset('ALL');
    setStartDate('');
    setEndDate('');
    setSelectedSector('ALL');
    setSelectedOccurrence('ALL');
    setSearchTerm('');
    setSortOrder('recent');
  };

  const hasActiveFilters = Boolean(
    datePreset !== 'ALL' ||
    startDate ||
    endDate ||
    selectedSector !== 'ALL' ||
    selectedOccurrence !== 'ALL' ||
    searchTerm.trim()
  );

  // Analisa e classifica todos os logs de auditoria IRAS do contexto
  const analyzedIrasLogs = useMemo<AnalyzedIrasLog[]>(() => {
    const irasOnly = audits.filter(a => a.type === 'IRAS');

    return irasOnly.map(audit => {
      const sector = getSectorById(audit.sectorId);
      const bed = getBedById(audit.bedId);
      const sectorName = sector?.name || 'Setor não identificado';
      const bedNumber = bed?.number || audit.bedId || 'S/N';

      const {
        totalAnswered,
        positiveAnswers,
        negativeAnswers,
        conformityScore,
      } = calculateAuditConformity(audit.answers);

      const failedItems: Array<{ id: string; label: string; section: string; answer: string }> = [];
      const pendingItems: Array<{ id: string; label: string; section: string }> = [];

      const bundleAcc: Record<'CS' | 'PAV' | 'SVD', BundleSummary> = {
        CS: { id: 'CS', label: 'Corrente Sanguínea (ICS)', shortLabel: 'ICS', assessedCount: 0, failureCount: 0 },
        PAV: { id: 'PAV', label: 'Pneumonia Assoc. à VM (PAV)', shortLabel: 'PAV', assessedCount: 0, failureCount: 0 },
        SVD: { id: 'SVD', label: 'Trato Urinário (ITU-SVD)', shortLabel: 'ITU-SVD', assessedCount: 0, failureCount: 0 },
      };

      irasQuestions.forEach(q => {
        const answer = getAnswerForQuestion(audit.answers, q, irasQuestions);
        const bundleKey = getBundleKeyFromQuestion(q);

        if (!answer || answer.trim() === '') {
          pendingItems.push({ id: q.id, label: q.label, section: q.section });
          return;
        }

        const trimmed = answer.trim();
        if (trimmed.toUpperCase() !== 'NA') {
          if (bundleKey) {
            bundleAcc[bundleKey].assessedCount += 1;
          }
          if (isNegativeAnswer(trimmed)) {
            failedItems.push({
              id: q.id,
              label: q.label,
              section: q.section,
              answer: trimmed,
            });
            if (bundleKey) {
              bundleAcc[bundleKey].failureCount += 1;
            }
          }
        }
      });

      // Fallback caso existam chaves extras em answers que não estejam no catálogo atual de perguntas
      if (failedItems.length === 0 && negativeAnswers > 0 && audit.answers) {
        Object.entries(audit.answers).forEach(([key, val]) => {
          const strVal = String(val || '').trim();
          if (strVal && strVal.toUpperCase() !== 'NA' && !isNeutralDescriptiveAnswer(strVal) && isNegativeAnswer(strVal)) {
            const exists = failedItems.some(item => item.id === key);
            if (!exists) {
              const matchedQ = irasQuestions.find(q => q.id === key);
              failedItems.push({
                id: key,
                label: matchedQ?.label || `Critério ${key}`,
                section: matchedQ?.section || 'Protocolo IRAS',
                answer: strVal,
              });
            }
          }
        });
      }

      const isInactive = audit.status === 'INATIVO';
      const hasNonConformity = failedItems.length > 0 || negativeAnswers > 0;
      const pendingCount = pendingItems.length;
      const isCompliant = !isInactive && !hasNonConformity && pendingCount === 0 && totalAnswered > 0;

      let primaryOccurrenceType: AnalyzedIrasLog['primaryOccurrenceType'] = 'CONFORME';
      let primaryOccurrenceLabel = 'Em Conformidade';

      if (isInactive) {
        primaryOccurrenceType = 'INATIVO';
        primaryOccurrenceLabel = 'Registro Inativo';
      } else if (hasNonConformity) {
        const count = Math.max(failedItems.length, negativeAnswers);
        primaryOccurrenceType = 'NAO_CONFORMIDADE';
        primaryOccurrenceLabel = `${count} Não Conformidade${count > 1 ? 's' : ''}`;
      } else if (pendingCount > 0) {
        primaryOccurrenceType = 'PENDENTE';
        primaryOccurrenceLabel = `${pendingCount} Pendência${pendingCount > 1 ? 's' : ''}`;
      }

      const activeBundles = (['CS', 'PAV', 'SVD'] as const)
        .map(k => bundleAcc[k])
        .filter(b => b.assessedCount > 0);

      return {
        audit,
        sectorName,
        bedNumber,
        conformityScore,
        totalAnswered,
        positiveAnswers,
        negativeAnswers,
        pendingCount,
        isInactive,
        hasNonConformity,
        isCompliant,
        primaryOccurrenceLabel,
        primaryOccurrenceType,
        failedItems,
        pendingItems,
        activeBundles,
      };
    });
  }, [audits, getBedById, getSectorById, irasQuestions]);

  // Aplica filtros por data, setor, tipo de ocorrência, busca e ordenação
  const filteredLogs = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    const filtered = analyzedIrasLogs.filter(entry => {
      // 1. Filtro por Data
      if (startDate || endDate) {
        const auditYmd = getAuditYmdString(entry.audit.date);
        if (!auditYmd) return false;
        if (startDate && auditYmd < startDate) return false;
        if (endDate && auditYmd > endDate) return false;
      }

      // 2. Filtro por Setor
      if (selectedSector !== 'ALL') {
        if (String(entry.audit.sectorId) !== String(selectedSector)) return false;
      }

      // 3. Filtro por Tipo de Ocorrência
      switch (selectedOccurrence) {
        case 'NAO_CONFORMIDADE':
          if (!entry.hasNonConformity) return false;
          break;
        case 'CONFORME':
          if (!entry.isCompliant) return false;
          break;
        case 'PENDENTE':
          if (entry.pendingCount === 0) return false;
          break;
        case 'BUNDLE_CS':
          if (!entry.activeBundles.some(b => b.id === 'CS')) return false;
          break;
        case 'BUNDLE_PAV':
          if (!entry.activeBundles.some(b => b.id === 'PAV')) return false;
          break;
        case 'BUNDLE_SVD':
          if (!entry.activeBundles.some(b => b.id === 'SVD')) return false;
          break;
        case 'INATIVO':
          if (!entry.isInactive) return false;
          break;
        default:
          break;
      }

      // 4. Busca textual
      if (query) {
        const matchesText =
          entry.sectorName.toLowerCase().includes(query) ||
          entry.bedNumber.toLowerCase().includes(query) ||
          (entry.audit.evaluator || '').toLowerCase().includes(query) ||
          (entry.audit.id || '').toLowerCase().includes(query) ||
          entry.primaryOccurrenceLabel.toLowerCase().includes(query) ||
          entry.failedItems.some(f => f.label.toLowerCase().includes(query));
        if (!matchesText) return false;
      }

      return true;
    });

    // Ordenação
    return [...filtered].sort((a, b) => {
      if (sortOrder === 'recent') {
        return getAuditTimestamp(b.audit.date) - getAuditTimestamp(a.audit.date);
      }
      if (sortOrder === 'oldest') {
        return getAuditTimestamp(a.audit.date) - getAuditTimestamp(b.audit.date);
      }
      if (sortOrder === 'score_asc') {
        return a.conformityScore - b.conformityScore;
      }
      if (sortOrder === 'score_desc') {
        return b.conformityScore - a.conformityScore;
      }
      const secCmp = numericCollator.compare(a.sectorName, b.sectorName);
      if (secCmp !== 0) return secCmp;
      return numericCollator.compare(a.bedNumber, b.bedNumber);
    });
  }, [analyzedIrasLogs, endDate, searchTerm, selectedOccurrence, selectedSector, sortOrder, startDate]);

  // Métricas e visualizações calculadas a partir dos logs filtrados
  const summaryMetrics = useMemo(() => {
    const total = filteredLogs.length;
    const withNonConformity = filteredLogs.filter(l => l.hasNonConformity).length;
    const totalFailures = filteredLogs.reduce((acc, l) => acc + Math.max(l.failedItems.length, l.negativeAnswers), 0);
    const avgConformity = total > 0
      ? Math.round(filteredLogs.reduce((acc, l) => acc + l.conformityScore, 0) / total)
      : 0;
    const monitoredSectors = new Set(filteredLogs.map(l => l.audit.sectorId)).size;
    const nonConformityRate = total > 0 ? Math.round((withNonConformity / total) * 100) : 0;

    return {
      total,
      withNonConformity,
      totalFailures,
      avgConformity,
      monitoredSectors,
      nonConformityRate,
    };
  }, [filteredLogs]);

  const sectorChartData = useMemo(() => {
    const map = new Map<string, { sector: string; conformes: number; naoConformes: number; pendentes: number }>();

    filteredLogs.forEach(entry => {
      const current = map.get(entry.audit.sectorId) || {
        sector: entry.sectorName,
        conformes: 0,
        naoConformes: 0,
        pendentes: 0,
      };
      if (entry.hasNonConformity) {
        current.naoConformes += 1;
      } else if (entry.pendingCount > 0) {
        current.pendentes += 1;
      } else {
        current.conformes += 1;
      }
      map.set(entry.audit.sectorId, current);
    });

    return Array.from(map.values())
      .sort((a, b) => (b.naoConformes + b.conformes + b.pendentes) - (a.naoConformes + a.conformes + a.pendentes))
      .slice(0, 8);
  }, [filteredLogs]);

  const bundleStats = useMemo(() => {
    const totals: Record<'CS' | 'PAV' | 'SVD', { label: string; assessedAudits: number; auditsWithFailure: number; totalFailures: number }> = {
      CS: { label: 'Corrente Sanguínea (ICS)', assessedAudits: 0, auditsWithFailure: 0, totalFailures: 0 },
      PAV: { label: 'Pneumonia Assoc. à VM (PAV)', assessedAudits: 0, auditsWithFailure: 0, totalFailures: 0 },
      SVD: { label: 'Trato Urinário (ITU-SVD)', assessedAudits: 0, auditsWithFailure: 0, totalFailures: 0 },
    };

    filteredLogs.forEach(entry => {
      entry.activeBundles.forEach(b => {
        totals[b.id].assessedAudits += 1;
        if (b.failureCount > 0) {
          totals[b.id].auditsWithFailure += 1;
          totals[b.id].totalFailures += b.failureCount;
        }
      });
    });

    return (['CS', 'PAV', 'SVD'] as const).map(id => {
      const item = totals[id];
      const adherence = item.assessedAudits > 0
        ? Math.round(((item.assessedAudits - item.auditsWithFailure) / item.assessedAudits) * 100)
        : null;
      return {
        id,
        ...item,
        adherence,
      };
    });
  }, [filteredLogs]);

  // Paginação
  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedLogs = useMemo(() => {
    const startIdx = (safePage - 1) * pageSize;
    return filteredLogs.slice(startIdx, startIdx + pageSize);
  }, [filteredLogs, pageSize, safePage]);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await syncDatabases();
      await ensureAllAuditsLoaded();
    } finally {
      setIsSyncing(false);
    }
  };

  const handleExportCsv = () => {
    if (filteredLogs.length === 0) return;

    const escapeCsv = (val: string | number) => {
      const str = String(val ?? '').replace(/"/g, '""');
      return `"${str}"`;
    };

    const headers = [
      'ID Auditoria',
      'Data/Hora',
      'Setor',
      'Leito',
      'Avaliador',
      'Tipo de Ocorrência',
      'Não Conformidades',
      'Pendências',
      'Protocolos Avaliados',
      'Conformidade (%)',
      'Status',
      'Itens Não Conformes',
    ];

    const rows = filteredLogs.map(entry => [
      entry.audit.id,
      formatDateTime(entry.audit.date),
      entry.sectorName,
      entry.bedNumber,
      entry.audit.evaluator || 'Não informado',
      entry.primaryOccurrenceLabel,
      Math.max(entry.failedItems.length, entry.negativeAnswers),
      entry.pendingCount,
      entry.activeBundles.map(b => b.shortLabel).join(' / ') || 'Geral IRAS',
      `${entry.conformityScore}%`,
      entry.audit.status || 'ATIVO',
      entry.failedItems.map(f => `${f.label} (${f.answer})`).join('; ') || '-',
    ]);

    const csvContent = '\uFEFF' + [
      headers.map(escapeCsv).join(';'),
      ...rows.map(row => row.map(escapeCsv).join(';')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `logs-auditoria-iras-${getLocalYmdString(new Date())}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Agrupamento de perguntas no modal de detalhe
  const selectedAuditSections = useMemo(() => {
    if (!selectedLog) return [];
    const grouped = new Map<string, Array<{ id: string; label: string; answer: string }>>();

    irasQuestions.forEach(q => {
      const answer = getAnswerForQuestion(selectedLog.audit.answers, q, irasQuestions);
      const list = grouped.get(q.section) || [];
      list.push({
        id: q.id,
        label: q.label,
        answer: answer || 'Pendente',
      });
      grouped.set(q.section, list);
    });

    return Array.from(grouped.entries()).map(([section, items]) => ({ section, items }));
  }, [irasQuestions, selectedLog]);

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-8">
      {/* Cabeçalho Principal */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-900 tracking-tight" style={{ textWrap: 'balance' }}>
            Central de Logs de Auditoria IRAS
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Visualização centralizada das ocorrências de prevenção de infecções, filtradas por data, setor e tipo de ocorrência.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => void handleSync()}
            disabled={isSyncing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-60"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isSyncing && 'animate-spin')} />
            <span>{isSyncing ? 'Sincronizando...' : 'Atualizar Logs'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredLogs.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-700 hover:bg-sky-800 disabled:opacity-50 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>

      {/* Aviso de carregamento progressivo ou conexão offline */}
      {(!dbConnected || isLoadingMoreAudits) && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            {isLoadingMoreAudits ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-600 shrink-0" />
                <span>Carregando histórico completo de auditorias IRAS em segundo plano...</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>Exibindo registros em cache local enquanto o banco central está offline.</span>
              </>
            )}
          </div>
          <span className="font-mono tabular-nums text-slate-500">
            {analyzedIrasLogs.length} registros IRAS em memória
          </span>
        </div>
      )}

      {/* Faixa de KPIs (4 colunas, tipografia tabular, elevação única) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">Total de Logs IRAS</p>
          <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
            {summaryMetrics.total}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            De {analyzedIrasLogs.length} registros IRAS totais
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">Logs com Não Conformidade</p>
          <p className={cn(
            'text-2xl font-bold font-mono tabular-nums mt-1',
            summaryMetrics.withNonConformity > 0 ? 'text-rose-700' : 'text-emerald-700'
          )}>
            {summaryMetrics.withNonConformity}
          </p>
          <p className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
            {summaryMetrics.totalFailures} falha(s) · {summaryMetrics.nonConformityRate}% dos logs
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">Conformidade Média IRAS</p>
          <p className={cn(
            'text-2xl font-bold font-mono tabular-nums mt-1',
            summaryMetrics.avgConformity >= 80
              ? 'text-emerald-700'
              : summaryMetrics.avgConformity >= 50
              ? 'text-amber-700'
              : 'text-rose-700'
          )}>
            {summaryMetrics.avgConformity}%
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {summaryMetrics.avgConformity >= 80
              ? 'Meta institucional atingida'
              : summaryMetrics.avgConformity >= 50
              ? 'Atenção moderada aos bundles'
              : 'Alerta crítico de adesão'}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">Setores Monitorados</p>
          <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
            {summaryMetrics.monitoredSectors}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {sectors.length} alas hospitalares cadastradas
          </p>
        </div>
      </div>

      {/* Painel de Filtros: Data, Setor e Tipo de Ocorrência */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Filter className="w-4 h-4 text-sky-700 shrink-0" />
            <span>Filtros de Auditoria IRAS</span>
          </div>

          {/* Seletor rápido de período */}
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {([
              { id: 'ALL', label: 'Todo Período' },
              { id: 'TODAY', label: 'Hoje' },
              { id: '7D', label: '7 dias' },
              { id: '30D', label: '30 dias' },
            ] as const).map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handlePresetSelect(opt.id)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0',
                  datePreset === opt.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
          {/* Data Inicial */}
          <div className="lg:col-span-2">
            <label htmlFor="iras-start-date" className="block text-xs font-medium text-slate-600 mb-1">
              Data Inicial
            </label>
            <div className="relative">
              <input
                id="iras-start-date"
                type="date"
                value={startDate}
                onChange={e => {
                  setStartDate(e.target.value);
                  setDatePreset('CUSTOM');
                }}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-600"
              />
            </div>
          </div>

          {/* Data Final */}
          <div className="lg:col-span-2">
            <label htmlFor="iras-end-date" className="block text-xs font-medium text-slate-600 mb-1">
              Data Final
            </label>
            <input
              id="iras-end-date"
              type="date"
              value={endDate}
              onChange={e => {
                setEndDate(e.target.value);
                setDatePreset('CUSTOM');
              }}
              className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-600"
            />
          </div>

          {/* Setor */}
          <div className="lg:col-span-3">
            <label htmlFor="iras-sector-filter" className="block text-xs font-medium text-slate-600 mb-1">
              Setor Hospitalar
            </label>
            <select
              id="iras-sector-filter"
              value={selectedSector}
              onChange={e => setSelectedSector(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-600"
            >
              <option value="ALL">Todos os Setores</option>
              {sortedSectors.map(sec => (
                <option key={sec.id} value={sec.id}>
                  {sec.name}
                </option>
              ))}
            </select>
          </div>

          {/* Tipo de Ocorrência */}
          <div className="lg:col-span-3">
            <label htmlFor="iras-occurrence-filter" className="block text-xs font-medium text-slate-600 mb-1">
              Tipo de Ocorrência IRAS
            </label>
            <select
              id="iras-occurrence-filter"
              value={selectedOccurrence}
              onChange={e => setSelectedOccurrence(e.target.value as OccurrenceFilter)}
              className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-600"
            >
              <option value="ALL">Todas as Ocorrências</option>
              <option value="NAO_CONFORMIDADE">Não Conformidade (Falha em Bundle)</option>
              <option value="CONFORME">Em Conformidade (Sem Falhas)</option>
              <option value="PENDENTE">Checklist Incompleto / Pendente</option>
              <option value="BUNDLE_CS">Protocolo Corrente Sanguínea (ICS)</option>
              <option value="BUNDLE_PAV">Protocolo Pneumonia Assoc. à VM (PAV)</option>
              <option value="BUNDLE_SVD">Protocolo Trato Urinário (ITU-SVD)</option>
              <option value="INATIVO">Registro Inativo</option>
            </select>
          </div>

          {/* Ordenação */}
          <div className="lg:col-span-2">
            <label htmlFor="iras-sort-order" className="block text-xs font-medium text-slate-600 mb-1">
              Ordenar por
            </label>
            <select
              id="iras-sort-order"
              value={sortOrder}
              onChange={e => setSortOrder(e.target.value as SortOrder)}
              className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-600"
            >
              <option value="recent">Mais Recentes</option>
              <option value="oldest">Mais Antigos</option>
              <option value="score_asc">Menor Conformidade</option>
              <option value="score_desc">Maior Conformidade</option>
              <option value="sector_bed">Setor e Leito</option>
            </select>
          </div>
        </div>

        {/* Barra de busca + rodapé de status dos filtros */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar por avaliador, leito, setor ou item não conforme..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-600"
            />
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-4 text-xs text-slate-600">
            <span className="font-mono tabular-nums">
              Exibindo {filteredLogs.length} de {analyzedIrasLogs.length} logs IRAS
            </span>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 hover:text-sky-900 cursor-pointer whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Limpar Filtros</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Painéis Visuais Centrais: Distribuição por Setor & Adesão por Bundle IRAS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Ocorrências IRAS por Setor</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Comparativo entre auditorias conformes e com não conformidade nos setores filtrados.
              </p>
            </div>
          </div>

          {sectorChartData.length === 0 ? (
            <div className="flex-1 min-h-[220px] flex items-center justify-center text-xs text-slate-400">
              Sem registros para exibir no gráfico com os filtros atuais.
            </div>
          ) : (
            <div className="h-[230px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sectorChartData} margin={{ top: 8, right: 12, left: -16, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis
                    dataKey="sector"
                    tick={{ fontSize: 11, fill: '#475569' }}
                    axisLine={{ stroke: '#CBD5E1' }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      borderColor: '#E2E8F0',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="conformes" name="Conformes" stackId="a" fill="#0F766E" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="naoConformes" name="Não Conformidades" stackId="a" fill="#DC2626" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Desempenho por Protocolo IRAS</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Taxa de checklists sem falhas em cada pacote preventivo avaliado.
            </p>
          </div>

          <div className="space-y-4 my-4">
            {bundleStats.map(bundle => (
              <div key={bundle.id} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800">{bundle.label}</span>
                  <span className="font-mono tabular-nums font-bold text-slate-900">
                    {bundle.adherence !== null ? `${bundle.adherence}%` : 'S/ dados'}
                  </span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      bundle.adherence === null
                        ? 'bg-slate-300'
                        : bundle.adherence >= 80
                        ? 'bg-emerald-600'
                        : bundle.adherence >= 50
                        ? 'bg-amber-600'
                        : 'bg-rose-600'
                    )}
                    style={{ width: `${bundle.adherence ?? 0}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono tabular-nums">
                  <span>{bundle.assessedAudits} auditoria(s) aplicáveis</span>
                  <span className={bundle.totalFailures > 0 ? 'text-rose-700 font-semibold' : ''}>
                    {bundle.totalFailures} falha(s) registrada(s)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabela Central de Logs IRAS */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50/70">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-sky-700 shrink-0" />
            <h2 className="text-sm font-bold text-slate-900">Trilha de Logs de Auditoria IRAS</h2>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-600">
            <label htmlFor="iras-page-size">Itens por página:</label>
            <select
              id="iras-page-size"
              value={pageSize}
              onChange={e => setPageSize(Number(e.target.value))}
              className="px-2 py-1 border border-slate-200 rounded-md bg-white text-xs text-slate-800"
            >
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>

        {isLoadingAudits && analyzedIrasLogs.length === 0 ? (
          <div className="p-10 text-center space-y-2 text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin text-sky-600 mx-auto" />
            <p className="text-xs font-medium">Carregando logs de auditoria IRAS...</p>
          </div>
        ) : paginatedLogs.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Calendar className="w-8 h-8 text-slate-300 mx-auto" />
            <div>
              <p className="text-sm font-semibold text-slate-800">
                Nenhum log IRAS encontrado para os filtros selecionados
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Ajuste a data, setor ou tipo de ocorrência para visualizar outros registros clínicos.
              </p>
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restaurar Filtros</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50 text-[11px] font-semibold text-slate-500">
                  <th className="py-3 px-4">Data / Hora</th>
                  <th className="py-3 px-4">Setor · Leito</th>
                  <th className="py-3 px-4">Protocolos</th>
                  <th className="py-3 px-4">Ocorrência</th>
                  <th className="py-3 px-4">Avaliador</th>
                  <th className="py-3 px-4 text-right">Conformidade</th>
                  <th className="py-3 px-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {paginatedLogs.map(entry => {
                  const bundleSummaryText = entry.activeBundles.length > 0
                    ? entry.activeBundles.map(b => b.shortLabel).join(' · ')
                    : 'Protocolo Geral';

                  return (
                    <tr
                      key={entry.audit.id}
                      onClick={() => setSelectedLog(entry)}
                      className="hover:bg-sky-50/40 transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-4 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{formatDateTime(entry.audit.date)}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-slate-800">
                        <div className="font-semibold text-slate-900">{entry.sectorName}</div>
                        <div className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
                          Leito {entry.bedNumber} · ID {entry.audit.id}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-slate-600 font-medium whitespace-nowrap">
                        {bundleSummaryText}
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 font-semibold whitespace-nowrap">
                          {entry.primaryOccurrenceType === 'NAO_CONFORMIDADE' && (
                            <>
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                              <span className="text-rose-700">{entry.primaryOccurrenceLabel}</span>
                            </>
                          )}
                          {entry.primaryOccurrenceType === 'PENDENTE' && (
                            <>
                              <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              <span className="text-amber-700">{entry.primaryOccurrenceLabel}</span>
                            </>
                          )}
                          {entry.primaryOccurrenceType === 'CONFORME' && (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span className="text-emerald-700">{entry.primaryOccurrenceLabel}</span>
                            </>
                          )}
                          {entry.primaryOccurrenceType === 'INATIVO' && (
                            <>
                              <ShieldAlert className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                              <span className="text-slate-600">{entry.primaryOccurrenceLabel}</span>
                            </>
                          )}
                        </div>
                        {entry.failedItems.length > 0 && (
                          <p
                            className="text-[11px] text-slate-500 truncate max-w-[240px] mt-0.5"
                            title={entry.failedItems.map(i => i.label).join(' | ')}
                          >
                            {entry.failedItems[0].label}
                            {entry.failedItems.length > 1 ? ` (+${entry.failedItems.length - 1})` : ''}
                          </p>
                        )}
                      </td>

                      <td className="py-3 px-4 text-slate-700">
                        <div className="flex items-center gap-1.5 max-w-[160px]">
                          <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{entry.audit.evaluator || 'Não informado'}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right font-mono tabular-nums font-bold">
                        <span
                          className={cn(
                            entry.conformityScore >= 80
                              ? 'text-emerald-700'
                              : entry.conformityScore >= 50
                              ? 'text-amber-700'
                              : 'text-rose-700'
                          )}
                        >
                          {entry.conformityScore}%
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            setSelectedLog(entry);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Detalhar</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginação */}
        {filteredLogs.length > 0 && (
          <div className="px-5 py-3 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600 bg-slate-50/40">
            <span className="font-mono tabular-nums">
              Página {safePage} de {totalPages} · {filteredLogs.length} registro(s) IRAS
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-45 text-slate-700 font-medium cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Anterior</span>
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-45 text-slate-700 font-medium cursor-pointer"
              >
                <span>Próxima</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Modal de Inspeção Detalhada do Log IRAS */}
      {selectedLog && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setSelectedLog(null)}
        >
          <div
            className="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Detalhamento da Auditoria IRAS
                </h3>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 mt-1">
                  <span className="font-semibold text-slate-700">{selectedLog.sectorName}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">Leito {selectedLog.bedNumber}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">{formatDateTime(selectedLog.audit.date)}</span>
                  <span aria-hidden="true">·</span>
                  <span>Avaliador: {selectedLog.audit.evaluator || 'Não informado'}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="Fechar detalhamento"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Resumo da Ocorrência */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="border border-slate-200 rounded-lg p-3">
                  <p className="text-xs text-slate-500">Classificação</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">{selectedLog.primaryOccurrenceLabel}</p>
                </div>
                <div className="border border-slate-200 rounded-lg p-3">
                  <p className="text-xs text-slate-500">Conformidade Geral</p>
                  <p className="text-sm font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                    {selectedLog.conformityScore}% ({selectedLog.positiveAnswers} conformes)
                  </p>
                </div>
                <div className="border border-slate-200 rounded-lg p-3">
                  <p className="text-xs text-slate-500">Protocolos Aplicáveis</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">
                    {selectedLog.activeBundles.map(b => b.shortLabel).join(' · ') || 'Padrão IRAS'}
                  </p>
                </div>
              </div>

              {/* Lista destacada de não conformidades */}
              {selectedLog.failedItems.length > 0 && (
                <div className="border border-rose-200 bg-rose-50/50 rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-rose-800">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Ocorrências Não Conformes Identificadas ({selectedLog.failedItems.length})</span>
                  </div>
                  <ul className="space-y-1.5 text-xs text-slate-700">
                    {selectedLog.failedItems.map(item => (
                      <li key={item.id} className="flex items-start justify-between gap-3 py-1 border-b border-rose-100 last:border-b-0">
                        <span>
                          <span className="font-medium text-slate-900">{item.label}</span>
                          <span className="text-slate-500"> · {item.section}</span>
                        </span>
                        <span className="font-mono font-bold text-rose-700 shrink-0">{item.answer}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Respostas agrupadas por seção IRAS */}
              <div className="space-y-4">
                {selectedAuditSections.map(group => (
                  <div key={group.section} className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-800 flex items-center gap-2">
                      <Building2 className="w-3.5 h-3.5 text-sky-700 shrink-0" />
                      <span>{group.section}</span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {group.items.map(item => {
                        const isFail = isNegativeAnswer(item.answer);
                        const isPending = item.answer === 'Pendente';
                        return (
                          <div key={item.id} className="px-4 py-2.5 flex items-center justify-between gap-4 text-xs">
                            <span className="text-slate-700">{item.label}</span>
                            <span
                              className={cn(
                                'font-mono font-bold shrink-0',
                                isFail
                                  ? 'text-rose-700'
                                  : isPending
                                  ? 'text-amber-700'
                                  : item.answer === 'NA'
                                  ? 'text-slate-400'
                                  : 'text-emerald-700'
                              )}
                            >
                              {item.answer}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
