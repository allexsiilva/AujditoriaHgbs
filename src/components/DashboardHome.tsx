import React, { useMemo, useContext, useEffect, useState } from 'react';
import { useAuditData } from '../context/AuditContext';
import { AuthContext } from '../context/AuthContext';
import { DbMiddleware } from '../services/dbMiddleware';
import { getLastApiError, getDbStatus } from '../lib/apiClient';
import hospitalBg from '../assets/images/hospital_architectural_bg_1795105644199.jpg';

const localStorage = window.localStorage;
import { 
  Building2, 
  Bed as BedIcon, 
  FileText, 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  User, 
  Calendar, 
  AlertTriangle, 
  ArrowRight, 
  ClipboardCheck, 
  Clock, 
  ShieldAlert, 
  Package, 
  CheckCircle2, 
  Lock, 
  ArrowUpRight 
} from 'lucide-react';
import { cn, formatDateTime, parseDateToTimestamp, getAnswerForQuestion, calculateAuditConformity } from '../lib/utils';
import { MonthlyStatsChart } from './MonthlyStatsChart';
import { AuditsEvolutionChart } from './AuditsEvolutionChart';

export function DashboardHome({ 
  searchTerm = '', 
  onNavigate 
}: { 
  searchTerm?: string;
  onNavigate?: (view: any) => void;
}) {
  const { sectors, beds, audits, totalAuditsCount, questions, getAuditsBySector, getAuditsByBed, getSectorById, getBedById, dbConnected } = useAuditData();
  const { user, cargos } = useContext(AuthContext);

  const [dbStatus, setDbStatus] = useState<{
    isUsingPostgres: boolean;
    isPostgresConfigured: boolean;
    pingSuccess: boolean;
    pingMessage: string;
    loading: boolean;
  }>({
    isUsingPostgres: false,
    isPostgresConfigured: false,
    pingSuccess: false,
    pingMessage: '',
    loading: true
  });

  useEffect(() => {
    async function fetchStatus() {
      try {
        const status = await getDbStatus();
        if (status && status.success) {
          setDbStatus({
            isUsingPostgres: status.isUsingPostgres,
            isPostgresConfigured: status.isPostgresConfigured,
            pingSuccess: status.ping.success,
            pingMessage: status.ping.message,
            loading: false
          });
        } else {
          setDbStatus(prev => ({ ...prev, loading: false }));
        }
      } catch (err) {
        console.error('Failed to load DB status', err);
        setDbStatus(prev => ({ ...prev, loading: false }));
      }
    }
    fetchStatus();
  }, []);

  const isDbFailed = !dbConnected || DbMiddleware.getLastFetchStatus() === 'failed';

  const isAdmin = user?.role === 'MASTER' || user?.role === 'ADMIN';
  const isAuditor = user?.role === 'AUDITOR' || (user?.cargo || '').toUpperCase().includes('AUDIT');

  const [visibleKPIs, setVisibleKPIs] = useState<string[]>(() => {
    const saved = localStorage.getItem('hospaudit_admin_visible_kpis');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // Fallback
      }
    }
    return ['AUDITORIA', 'CLINICO', 'ATENDIMENTO', 'ESTOQUE'];
  });

  const [showKPIConfig, setShowKPIConfig] = useState(false);

  useEffect(() => {
    const handleUpdate = () => {
      const saved = localStorage.getItem('hospaudit_admin_visible_kpis');
      if (saved) {
        try {
          setVisibleKPIs(JSON.parse(saved));
        } catch (e) {
          console.warn("Failed to update visible KPIs from event", e);
        }
      }
    };
    window.addEventListener('hospaudit_kpis_updated', handleUpdate);
    return () => window.removeEventListener('hospaudit_kpis_updated', handleUpdate);
  }, []);

  const toggleKPI = (id: string) => {
    setVisibleKPIs(prev => {
      const next = prev.includes(id) ? prev.filter(k => k !== id) : [...prev, id];
      localStorage.setItem('hospaudit_admin_visible_kpis', JSON.stringify(next));
      return next;
    });
  };

  const auditorStats = useMemo(() => {
    if (!isAuditor || !user) return null;
    const myAudits = audits.filter(a => (a.evaluator || '').trim().toLowerCase() === (user.name || '').trim().toLowerCase());
    
    let totalAnswers = 0;
    let conformes = 0;
    myAudits.forEach(audit => {
      Object.keys(audit.answers || {}).forEach(qId => {
        const resp = String(audit.answers[qId] || '').toLowerCase().trim();
        totalAnswers++;
        if (['sim', 's', 'estéril', 'e', 'c', 'avc'].includes(resp)) {
          conformes++;
        }
      });
    });
    const compliance = totalAnswers > 0 ? Math.round((conformes / totalAnswers) * 100) : 100;
    
    return {
      total: myAudits.length,
      compliance,
      recent: myAudits.slice(-3).reverse()
    };
  }, [audits, isAuditor, user]);

  // Permission helper to restrict KPI cards access
  const hasModulePermission = (modId: string): boolean => {
    if (!user) return true; // Default fallback
    if (user.role === 'MASTER' || user.role === 'ADMIN' || user.permissions.includes('ALL')) return true;
    return user.permissions.includes(modId);
  };

  const userCargoName = useMemo(() => {
    if (!user) return 'Convidado';
    return user.cargo || (user.role === 'MASTER' ? 'Administrador Master' : 'Usuário');
  }, [user]);

  // Real-time calculations from MySQL emulator/context
  const stats = useMemo(() => {
    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeekTime = todayMidnight.getTime() - todayMidnight.getDay() * 24 * 60 * 60 * 1000;

    const thisWeekAudits = audits.filter(a => {
      const ts = parseDateToTimestamp(a.date);
      return ts >= startOfWeekTime;
    }).length;

    let totalAnswers = 0;
    let conformes = 0;
    let naoConformes = 0;

    audits.forEach(audit => {
      Object.keys(audit.answers || {}).forEach(qId => {
        const resp = String(audit.answers[qId] || '').toLowerCase().trim();
        totalAnswers++;
        if (['sim', 's', 'estéril', 'e', 'c', 'avc'].includes(resp)) {
          conformes++;
        } else if (['não', 'n', 'não estéril', 'ne', 'p', 'avp', 'não conforme'].includes(resp)) {
          naoConformes++;
        }
      });
    });

    const percConforme = totalAnswers > 0 ? ((conformes / totalAnswers) * 100).toFixed(1) : '0';
    const percNaoConforme = totalAnswers > 0 ? ((naoConformes / totalAnswers) * 100).toFixed(1) : '0';

    return { thisWeekAudits, percConforme, percNaoConforme, naoConformes };
  }, [audits]);

  // Real-time compliance by sector
  const sectorCompliance = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    const previousMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const previousYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    return sectors.map(sector => {
      const sectorAudits = getAuditsBySector(sector.id);
      
      const getComplianceForPeriod = (month: number, year: number) => {
        const periodAudits = sectorAudits.filter(a => {
          const d = new Date(`${a.date.trim().substring(0, 10)}T12:00:00Z`);
          return d.getMonth() === month && d.getFullYear() === year;
        });

        let total = 0;
        let conformes = 0;

        periodAudits.forEach(audit => {
          Object.values(audit.answers || {}).forEach(resp => {
            const r = String(resp).toLowerCase().trim();
            total++;
            if (['sim', 's', 'estéril', 'e', 'c', 'avc'].includes(r)) conformes++;
          });
        });

        return total > 0 ? (conformes / total) * 100 : null;
      };

      const currentCompliance = getComplianceForPeriod(currentMonth, currentYear);
      const prevCompliance = getComplianceForPeriod(previousMonth, previousYear);

      let trend = 0;
      if (currentCompliance !== null && prevCompliance !== null) {
        trend = currentCompliance - prevCompliance;
      }

      return {
        sectorName: sector.name,
        currentCompliance: currentCompliance !== null ? currentCompliance.toFixed(1) : '-',
        prevCompliance: prevCompliance !== null ? prevCompliance.toFixed(1) : '-',
        trend: currentCompliance !== null && prevCompliance !== null ? trend.toFixed(1) : null
      };
    }).sort((a, b) => {
      if (a.currentCompliance === '-') return 1;
      if (b.currentCompliance === '-') return -1;
      return parseFloat(b.currentCompliance) - parseFloat(a.currentCompliance);
    });
  }, [audits, sectors, getAuditsBySector]);

  // Filter audits for recent list using O(1) index lookups
  const filteredAudits = useMemo(() => {
    if (!searchTerm) return audits;
    const search = searchTerm.toLowerCase();
    return audits.filter(a => {
      const s = getSectorById(a.sectorId);
      const b = getBedById(a.bedId);
      return s?.name.toLowerCase().includes(search) || 
             b?.number.toLowerCase().includes(search) || 
             (a.evaluator || '').toLowerCase().includes(search) ||
             a.type.toLowerCase().includes(search) ||
             formatDateTime(a.date).toLowerCase().includes(search);
    });
  }, [audits, searchTerm, getSectorById, getBedById]);

  // Calculate beds with pending audits using O(1) getAuditsByBed index lookup
  const bedsWithPendingAudits = useMemo(() => {
    const map: Record<string, { bedNumber: string; sectorName: string; count: number; lastDate: string; reason: string }> = {};
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    // 1. Identify beds that have had no audits in the last 7 days
    beds.forEach(bed => {
      const bedAudits = getAuditsByBed(bed.id);
      let latestAudit = bedAudits.length > 0 ? bedAudits[0] : null;
      let latestTs = latestAudit ? new Date(latestAudit.date).getTime() : 0;
      for (let i = 1; i < bedAudits.length; i++) {
        const ts = new Date(bedAudits[i].date).getTime();
        if (ts > latestTs) {
          latestTs = ts;
          latestAudit = bedAudits[i];
        }
      }

      const sectorName = getSectorById(bed.sectorId)?.name || 'N/A';

      if (!latestAudit) {
        map[bed.id] = {
          bedNumber: bed.number,
          sectorName,
          count: 0,
          lastDate: '',
          reason: 'Nenhuma auditoria realizada neste leito.'
        };
      } else if (now - latestTs > SEVEN_DAYS_MS) {
        map[bed.id] = {
          bedNumber: bed.number,
          sectorName,
          count: 0,
          lastDate: latestAudit.date,
          reason: `Última auditoria há mais de 7 dias (${Math.floor((now - latestTs) / (1000*60*60*24))} dias).`
        };
      }
    });

    // 2. Identify recent active audits that are incomplete (check most recent slice up to 300 for O(1) responsiveness)
    const irasQuestions = questions.filter(q => q.formType === 'IRAS');
    const safetyQuestions = questions.filter(q => q.formType === 'SAFETY');
    const recentAuditsToScan = audits.slice(0, 300);

    for (let i = 0; i < recentAuditsToScan.length; i++) {
      const audit = recentAuditsToScan[i];
      const applicableQs = audit.type === 'IRAS' ? irasQuestions : safetyQuestions;
      const hasPendingField = applicableQs.some(q => {
        const answer = getAnswerForQuestion(audit.answers || {}, q, questions);
        return !answer || answer.trim() === '';
      });

      if (hasPendingField) {
        const bedNum = getBedById(audit.bedId)?.number || audit.bedId || 'N/A';
        const sectorName = getSectorById(audit.sectorId)?.name || 'N/A';
        map[audit.bedId] = {
          bedNumber: bedNum,
          sectorName,
          count: 1,
          lastDate: audit.date,
          reason: 'Checklist possui perguntas pendentes de resposta.'
        };
      }
    }

    return Object.values(map).slice(0, 5);
  }, [audits, beds, questions, getAuditsByBed, getSectorById, getBedById]);

  const [heroBgFailed, setHeroBgFailed] = useState(false);

  return (
    <div className="p-4 md:p-6 space-y-6" id="dashboard-main-container">
      {/* Hospital Architectural Hero Header */}
      <div className="relative overflow-hidden bg-[#071A26] text-white rounded-2xl p-6 sm:p-8 shadow-md border border-[#113144] flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        {!heroBgFailed && (
          <img
            src={hospitalBg}
            alt="Ambiente hospitalar clínico"
            referrerPolicy="no-referrer"
            onError={() => setHeroBgFailed(true)}
            className="absolute inset-0 w-full h-full object-cover object-center opacity-50 pointer-events-none"
          />
        )}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(105deg, rgba(7, 26, 38, 0.94) 0%, rgba(10, 44, 64, 0.84) 55%, rgba(15, 118, 110, 0.48) 100%)'
          }}
        />

        <div className="space-y-2 relative z-10">
          <div className="flex items-center gap-2 text-xs text-sky-300 font-medium">
            <span>{userCargoName}</span>
            <span aria-hidden="true" className="text-sky-400/60">·</span>
            <span>Unidade de Auditoria Clínica</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white">
            Olá, {user?.name || 'Avaliador'}
          </h1>
          <p className="text-slate-200/90 text-xs sm:text-sm max-w-xl leading-relaxed">
            Monitoramento de conformidade assistencial, prevenção de infecções hospitalares (IRAS) e auditorias beira-leito.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 relative z-10 shrink-0">
          <div className="flex items-center gap-2.5 text-slate-100 font-mono tabular-nums text-xs bg-[#071A26]/75 backdrop-blur-md px-4 py-2.5 rounded-xl border border-white/15">
            <Calendar size={14} className="text-sky-300 shrink-0" />
            <span>{new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
          </div>
        </div>
      </div>

      {/* PAINEL EXCLUSIVO DO AUDITOR (Visible only for auditors) */}
      {isAuditor && auditorStats && (
        <div className="dash-card bg-gradient-to-r from-sky-50/80 to-teal-50/50 border border-sky-200/70 p-5 shadow-xs space-y-4 text-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-sky-200/50 pb-3">
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-sky-700">
                Auditoria Individual · Desempenho do Avaliador
              </p>
              <h3 className="text-base font-extrabold text-slate-900">Métricas Pessoais de Atividade</h3>
            </div>
            <div className="flex items-center gap-5">
              <div className="text-center sm:text-right">
                <span className="text-xs text-slate-500 font-medium block">Minhas Auditorias</span>
                <span className="text-xl font-black text-sky-700 font-mono tabular-nums">{auditorStats.total}</span>
              </div>
              <div className="text-center sm:text-right border-l border-sky-200/70 pl-5">
                <span className="text-xs text-slate-500 font-medium block">Conformidade Média</span>
                <span className={`text-xl font-black font-mono tabular-nums ${auditorStats.compliance >= 80 ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {auditorStats.compliance}%
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white/95 border border-sky-100 rounded-xl p-4 space-y-1.5 shadow-3xs">
              <h4 className="text-xs font-bold text-slate-700">Diretriz da Semana</h4>
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                Auditoria prioritária beira-leito dos protocolos de Higiene de Mãos e Infecção de Sítio Cirúrgico nos leitos de UTI.
              </p>
            </div>
            
            <div className="bg-white/95 border border-blue-100 rounded-xl p-4 space-y-2 col-span-2 shadow-3xs">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Últimos Lançamentos Efetuados</h4>
              {auditorStats.recent.length === 0 ? (
                <p className="text-xs text-slate-400 italic">Nenhum checklist registrado por você recentemente.</p>
              ) : (
                <div className="space-y-2">
                  {auditorStats.recent.map((a, i) => (
                    <div key={i} className="flex items-center justify-between text-xs font-medium border-b border-slate-50 pb-1.5 last:border-0 last:pb-0">
                      <span className="text-slate-700 font-semibold">Leito {beds.find(b => b.id === a.bedId)?.number || a.bedId} ({a.type})</span>
                      <span className="text-slate-400 font-mono text-[11px]">{formatDateTime(a.date)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Grid-based cards grouping Key Performance Indicators (Bento Grid Modern Style) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* KPI Box 1: Total de Auditorias */}
        {isDbFailed ? (
          <ConnectionErrorCard title="Total de Auditorias" icon={<ClipboardCheck size={18} />} />
        ) : (
          <div className="dash-kpi flex flex-col justify-between min-h-[135px]">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Acompanhamento</span>
                <h3 className="text-sm font-extrabold text-slate-800 leading-tight">Total de Auditorias</h3>
              </div>
              <span className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100/80 shadow-3xs">
                <ClipboardCheck size={19} />
              </span>
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div>
                <span className="text-3xl font-black text-slate-900 leading-none font-mono tracking-tight">{totalAuditsCount || audits.length}</span>
                <span className="text-[11px] text-slate-400 block font-semibold mt-1">Checklists concluídos</span>
              </div>
              <div className="text-right">
                <span className="inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-100/80">
                  +{stats.thisWeekAudits} esta sem.
                </span>
              </div>
            </div>
          </div>
        )}

        {/* KPI Box 2: Índice de Conformidade */}
        {isDbFailed ? (
          <ConnectionErrorCard title="Índice de Conformidade" icon={<TrendingUp size={18} />} />
        ) : (
          <div className="dash-kpi flex flex-col justify-between min-h-[135px]">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Desempenho Geral</span>
                <h3 className="text-sm font-extrabold text-slate-800 leading-tight">Índice Conformidade</h3>
              </div>
              <span className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100/80 shadow-3xs">
                <TrendingUp size={19} />
              </span>
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div>
                <span className="text-3xl font-black text-slate-900 leading-none font-mono tracking-tight">{stats.percConforme}%</span>
                <span className="text-[11px] text-slate-400 block font-semibold mt-1">Adesão aos protocolos</span>
              </div>
              <div className="text-right space-y-1.5">
                <span className="inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100/80">
                  Meta ≥ 80%
                </span>
                <div className="w-20 bg-slate-100 rounded-full h-1.5 overflow-hidden border border-slate-200 ml-auto">
                  <div className="bg-emerald-600 h-full rounded-full transition-all duration-500" style={{ width: `${stats.percConforme}%` }} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* KPI Box 3: Não Conformidades */}
        {isDbFailed ? (
          <ConnectionErrorCard title="Não Conformidades" icon={<AlertTriangle size={18} />} />
        ) : (
          <div className="dash-kpi flex flex-col justify-between min-h-[135px]">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Pontos de Atenção</span>
                <h3 className="text-sm font-extrabold text-slate-800 leading-tight">Não Conformidades</h3>
              </div>
              <span className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-100/80 shadow-3xs">
                <AlertTriangle size={19} />
              </span>
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div>
                <span className="text-3xl font-black text-rose-600 leading-none font-mono tracking-tight">{stats.naoConformes}</span>
                <span className="text-[11px] text-slate-400 block font-semibold mt-1">Itens com falha</span>
              </div>
              <div className="text-right">
                <span className="inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-100/80">
                  {stats.percNaoConforme}% do total
                </span>
              </div>
            </div>
          </div>
        )}

        {/* KPI Box 4: Pendências de Checklist */}
        {isDbFailed ? (
          <ConnectionErrorCard title="Pendências de Checklist" icon={<Clock size={18} />} />
        ) : (
          <div className="dash-kpi flex flex-col justify-between min-h-[135px]">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Controle Ativo</span>
                <h3 className="text-sm font-extrabold text-slate-800 leading-tight">Leitos Pendentes</h3>
              </div>
              <span className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-100/80 shadow-3xs">
                <Clock size={19} />
              </span>
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div>
                <span className="text-3xl font-black text-slate-900 leading-none font-mono tracking-tight">{bedsWithPendingAudits.length}</span>
                <span className="text-[11px] text-slate-400 block font-semibold mt-1">Leitos s/ avaliação</span>
              </div>
              <div className="text-right">
                {bedsWithPendingAudits.length > 0 ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
                    Ação Necessária
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100">
                    Rotina em Dia
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Main split-screen grid layout (Columns: 8 + 4) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Side Section (8 columns) - Evolution Charts and Recent Activity */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Compliance Chart Component */}
          <div className="dash-card p-5">
            <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Building2 size={18} className="text-blue-500" />
                <h2 className="font-extrabold text-slate-800 text-sm">Histórico Mensal de Conformidade por Metas</h2>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">Dados Reais do Banco</span>
            </div>
            {isDbFailed ? (
              <div className="p-8 text-center text-slate-400 text-sm flex flex-col items-center justify-center min-h-[250px]">
                <ShieldAlert size={32} className="mb-2 text-rose-500" />
                <p className="font-bold text-slate-700">Histórico Indisponível</p>
                <p className="text-xs text-slate-400 mt-1">Houve uma falha na leitura do banco de dados central.</p>
              </div>
            ) : (
              <MonthlyStatsChart />
            )}
          </div>

          {/* 30-Day Completed Audits Evolution Line Chart */}
          {isDbFailed ? (
            <div className="dash-card p-5 flex flex-col items-center justify-center min-h-[250px] text-slate-400 text-sm">
              <ShieldAlert size={32} className="mb-2 text-rose-500" />
              <p className="font-bold text-slate-700">Histórico de 30 dias Indisponível</p>
              <p className="text-xs text-slate-400 mt-1">Houve uma falha de conexão e os dados da evolução não foram carregados.</p>
            </div>
          ) : (
            <AuditsEvolutionChart />
          )}

          {/* Recent Audits List Card */}
          <div className="dash-card overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/70">
              <div className="flex items-center gap-2">
                <ClipboardCheck size={18} className="text-sky-600" />
                <h3 className="font-extrabold text-slate-800 text-sm">
                  Histórico e Auditorias Recentes
                  {searchTerm && <span className="text-sky-600 font-normal ml-2"> (Filtrado)</span>}
                </h3>
              </div>
              {onNavigate && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => onNavigate('IRAS_LOGS')}
                    className="text-xs font-bold text-slate-600 hover:text-sky-700 flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    Logs IRAS <ArrowUpRight size={13} />
                  </button>
                  <button 
                    onClick={() => onNavigate('COMPLETED_AUDITS')}
                    className="text-xs font-bold text-sky-700 hover:text-sky-800 flex items-center gap-1 group cursor-pointer"
                  >
                    Ver Tudo <ArrowUpRight size={13} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  </button>
                </div>
              )}
            </div>

            {isDbFailed ? (
              <div className="p-8 text-center text-slate-400 text-sm flex flex-col items-center justify-center min-h-[200px]">
                <ShieldAlert size={32} className="mb-2 text-rose-500" />
                <p className="font-bold text-slate-700">Auditorias Indisponíveis</p>
                <p className="text-xs text-slate-400 mt-1">Houve uma falha de conexão e os dados recentes não foram carregados.</p>
              </div>
            ) : filteredAudits.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">
                <Activity size={32} className="mx-auto mb-2 text-slate-300" />
                Nenhuma auditoria registrada ou encontrada na busca.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Avaliador / Data</th>
                      <th>Metodologia</th>
                      <th>Localização</th>
                      <th className="text-right">Resultado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAudits.slice(0, 5).map(audit => {
                      const sector = getSectorById(audit.sectorId);
                      const bed = getBedById(audit.bedId);
                      const isIRAS = audit.type === 'IRAS';
                      const { conformityScore: score } = calculateAuditConformity(audit.answers);

                      return (
                        <tr key={audit.id} className="hover:bg-slate-50/50 transition-colors text-sm">
                          <td className="px-6 py-3.5">
                            <div className="font-bold text-slate-800">{audit.evaluator || 'Não informado'}</div>
                            <div className="text-slate-400 text-[10px] font-mono mt-0.5 flex items-center gap-1">
                              <Clock size={10} /> {formatDateTime(audit.date)}
                            </div>
                          </td>
                          <td className="px-6 py-3.5">
                            <span className={cn(
                              "px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider border",
                              isIRAS 
                                ? 'bg-purple-50 text-purple-700 border-purple-200' 
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            )}>
                              {isIRAS ? 'IRAS' : 'Segurança'}
                            </span>
                          </td>
                          <td className="px-6 py-3.5">
                            <div className="font-semibold text-slate-700 text-xs uppercase">{sector?.name || 'Setor'}</div>
                            <span className="font-mono text-[10px] text-blue-600 bg-blue-50 border border-blue-100 px-1 py-0.5 rounded font-extrabold mt-1 inline-block">
                              L-{bed?.number || 'Leito'}
                            </span>
                          </td>
                          <td className="px-6 py-3.5 text-right">
                            <span className={cn(
                              "font-mono text-xs font-extrabold px-2.5 py-0.5 rounded-full border shadow-2xs",
                              score >= 80 ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                              score >= 50 ? "bg-amber-50 text-amber-700 border-amber-200" :
                              "bg-rose-50 text-rose-700 border-rose-200"
                            )}>
                              {score}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Side Section (4 columns) - Pending tasks, alerts & safety notifications */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Pending Tasks & Clinical Warnings Box */}
          <div className="dash-card p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
                <ShieldAlert size={18} className="text-amber-500" />
                <h3 className="font-extrabold text-slate-800 text-sm">Alertas e Tarefas Pendentes</h3>
              </div>

              <div className="space-y-3">
                {isDbFailed ? (
                  <div className="text-center py-6 text-slate-400">
                    <ShieldAlert size={32} className="mx-auto text-rose-500 mb-2" />
                    <p className="text-sm font-semibold text-slate-700">Falha ao Carregar Alertas</p>
                    <p className="text-[11px] text-slate-400 mt-1">Banco de dados central indisponível.</p>
                  </div>
                ) : bedsWithPendingAudits.length === 0 ? (
                  <div className="text-center py-6">
                    <CheckCircle2 size={32} className="mx-auto text-emerald-500 mb-2" />
                    <p className="text-sm font-semibold text-slate-600">Nenhuma tarefa pendente!</p>
                    <p className="text-[11px] text-slate-400 mt-1">Todas as auditorias estão concluídas e em conformidade.</p>
                  </div>
                ) : (
                  bedsWithPendingAudits.map((item, idx) => (
                    <div key={idx} className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-3.5 space-y-2 hover:border-amber-300 transition-colors">
                      <div className="flex justify-between items-start gap-2">
                        <span className="font-mono text-xs font-bold text-sky-700">
                          Leito {item.bedNumber}
                        </span>
                        <span className="text-xs font-medium text-slate-500">{item.sectorName}</span>
                      </div>
                      <p className="text-xs text-slate-600 leading-normal font-medium flex items-start gap-1.5">
                        <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />
                        <span>{item.reason}</span>
                      </p>
                      {onNavigate && (
                        <button
                          onClick={() => onNavigate('NEW_AUDIT')}
                          className="text-xs font-bold text-sky-700 hover:text-sky-800 flex items-center gap-1 pt-1 cursor-pointer"
                        >
                          Realizar Auditoria Agora <ArrowRight size={12} />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Quick action launcher card */}
            <div className="bg-gradient-to-br from-[#072B42] via-[#0369A1] to-[#0F766E] rounded-2xl p-5 text-white shadow-lg shadow-sky-900/15 border border-sky-400/20 mt-5">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center">
                  <ClipboardCheck size={15} className="text-white" />
                </div>
                <h4 className="font-extrabold text-sm">Nova Auditoria Beira-Leito</h4>
              </div>
              <p className="text-xs text-sky-100 mt-1 leading-relaxed">
                Audite e gerencie infecções e metas de segurança de pacientes diretamente na beira do leito em tablets ou smartphones.
              </p>
              {onNavigate && (
                <button
                  onClick={() => onNavigate('NEW_AUDIT')}
                  className="mt-4 bg-white text-sky-900 text-xs font-extrabold px-4 py-2.5 rounded-xl shadow-md hover:bg-sky-50 transition-all w-full text-center flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.99]"
                >
                  <span>Iniciar Avaliação</span>
                  <ArrowRight size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Quick Stats: Compliance por Setor list */}
          <div className="dash-card p-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Building2 size={16} className="text-slate-500" />
                <h3 className="font-bold text-slate-800 text-sm">Setores Ordenados</h3>
              </div>
              <span className="text-[10px] text-slate-400">Conformidade %</span>
            </div>

            <div className="space-y-2.5">
              {sectorCompliance.slice(0, 4).map((item, idx) => (
                <div key={idx} className="flex items-center justify-between py-1 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0" />
                    <span className="font-bold text-slate-700 uppercase truncate" title={item.sectorName}>
                      {item.sectorName}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "font-bold font-mono px-2 py-0.5 rounded text-[11px]",
                      item.currentCompliance === '-' ? "text-slate-400 bg-slate-50" :
                      parseFloat(item.currentCompliance) >= 80 ? "text-emerald-700 bg-emerald-50" :
                      parseFloat(item.currentCompliance) >= 50 ? "text-amber-700 bg-amber-50" : "text-rose-700 bg-rose-50"
                    )}>
                      {item.currentCompliance}{item.currentCompliance !== '-' && '%'}
                    </span>
                    {item.trend !== null && (
                      <span className={cn(
                        "font-extrabold flex items-center gap-0.5",
                        parseFloat(item.trend) > 0 ? "text-emerald-600" : parseFloat(item.trend) < 0 ? "text-red-500" : "text-slate-400"
                      )}>
                        {parseFloat(item.trend) > 0 ? '▲' : parseFloat(item.trend) < 0 ? '▼' : '●'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

// Compact and elegant Lock placeholder for role-based security
function LockedKPICard({ title, module }: { title: string; module: string }) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 shadow-2xs flex flex-col justify-between min-h-[140px] select-none relative overflow-hidden">
      {/* Background Lock blur accent */}
      <div className="absolute right-2 bottom-2 text-slate-100 font-black pointer-events-none opacity-40">
        <Lock size={90} />
      </div>
      <div className="flex items-start justify-between z-10">
        <div className="space-y-1">
          <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">Acesso Protegido</span>
          <h3 className="text-lg font-bold text-slate-400 leading-tight">{title}</h3>
        </div>
        <span className="p-2 bg-slate-100 text-slate-400 rounded-lg shrink-0">
          <Lock size={18} />
        </span>
      </div>
      <div className="mt-4 z-10 space-y-1">
        <div className="text-xs text-slate-400 font-bold flex items-center gap-1">
          <ShieldAlert size={12} className="text-slate-400" /> Módulo {module}
        </div>
        <p className="text-[10px] text-slate-400 font-medium">Este indicador requer permissão de acesso ao cargo.</p>
      </div>
    </div>
  );
}

// Reusable Connection Error card when dbMiddleware connection has failed
function ConnectionErrorCard({ title, icon }: { title: string; icon: React.ReactNode }) {
  const [retrying, setRetrying] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    setLastError(getLastApiError());
  }, []);

  const handleRetry = async () => {
    setRetrying(true);
    await DbMiddleware.verifyDataFetchStatus();
    setRetrying(false);
    window.location.reload();
  };

  return (
    <div className="bg-rose-50/50 border border-rose-100 rounded-xl p-5 shadow-2xs flex flex-col justify-between min-h-[140px] relative overflow-hidden">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <span className="text-xs font-bold text-rose-600 flex items-center gap-1.5">
            <AlertTriangle size={12} /> Erro de Conexão com Banco
          </span>
          <h3 className="text-sm font-bold text-slate-700 leading-tight">{title}</h3>
        </div>
        <span className="p-2 bg-rose-100/60 text-rose-600 rounded-lg shrink-0">
          {icon}
        </span>
      </div>
      <div className="mt-3 space-y-1">
        <p className="text-[10px] text-slate-600 font-medium leading-relaxed">
          {lastError ? (
            <span className="font-mono text-[9px] text-rose-700 bg-rose-100/30 px-1 py-0.5 rounded block max-h-[48px] overflow-y-auto">
              {lastError}
            </span>
          ) : (
            "Não foi possível conectar ao MySQL central. Verifique as configurações no Painel de Gestão ou utilize o Banco Nativo do Node.js."
          )}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <button 
            onClick={handleRetry}
            disabled={retrying}
            className="text-[10px] font-bold text-rose-600 hover:text-rose-800 transition flex items-center gap-1 cursor-pointer bg-transparent border-none p-0 text-left disabled:opacity-50"
          >
            {retrying ? 'Testando...' : 'Forçar Verificação ↺'}
          </button>
        </div>
      </div>
    </div>
  );
}
