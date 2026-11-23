import React, { useState, useMemo } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { 
  Calendar, 
  TrendingUp, 
  ShieldCheck, 
  Building2, 
  Activity, 
  FileText,
  Filter,
  BarChart3,
  CalendarDays,
  Info
} from 'lucide-react';
import { useAuditData } from '../context/AuditContext';

// Color palette for dynamic sectors
const SECTOR_COLORS = [
  '#4f46e5', // indigo
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ec4899', // pink
  '#8b5cf6', // violet
  '#ef4444', // red
  '#3b82f6', // blue
  '#14b8a6', // teal
  '#f97316'  // orange
];

// Helper to format "YYYY-MM" to "MMM/YYYY" in Portuguese
const formatYearMonth = (ymStr: string) => {
  const [year, month] = ymStr.split('-');
  const monthsPt = [
    'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
    'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
  ];
  const mIndex = parseInt(month, 10) - 1;
  return `${monthsPt[mIndex] || month}/${year}`;
};

export function EfficiencyStatsModule() {
  const { audits, sectors } = useAuditData();

  // Date range state - default last 6 months
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 5); // 6 months ago
    return d.toISOString().substring(0, 7); // "YYYY-MM"
  });

  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().substring(0, 7); // Current month "YYYY-MM"
  });

  const [selectedSectorFilter, setSelectedSectorFilter] = useState('ALL');

  // Filtered Audits list based on Date range & Sector filter
  const filteredAudits = useMemo(() => {
    return audits.filter(audit => {
      if (!audit.date) return false;
      const auditMonthStr = audit.date.substring(0, 7); // "YYYY-MM"
      
      // Date range validation
      const afterStart = !startDate || auditMonthStr >= startDate;
      const beforeEnd = !endDate || auditMonthStr <= endDate;
      
      // Sector filter validation
      const matchesSector = selectedSectorFilter === 'ALL' || audit.sectorId === selectedSectorFilter;
      
      return afterStart && beforeEnd && matchesSector;
    });
  }, [audits, startDate, endDate, selectedSectorFilter]);

  // Sector name map for fast lookup
  const sectorNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    sectors.forEach(s => {
      map[s.id] = s.name;
    });
    return map;
  }, [sectors]);

  // Aggregate data: Completed Audits per Sector per Month
  const chartData = useMemo(() => {
    // 1. Group audits by month and sector
    const aggregates: Record<string, Record<string, number>> = {};
    
    filteredAudits.forEach(audit => {
      const monthStr = audit.date.substring(0, 7); // "YYYY-MM"
      const sectorName = sectorNameMap[audit.sectorId] || 'Outros Setores';
      
      if (!aggregates[monthStr]) {
        aggregates[monthStr] = {};
      }
      aggregates[monthStr][sectorName] = (aggregates[monthStr][sectorName] || 0) + 1;
    });

    // 2. Convert to Recharts friendly format
    // Sort months chronologically
    const sortedMonths = Object.keys(aggregates).sort();
    
    return sortedMonths.map(month => {
      const monthData: Record<string, any> = {
        monthRaw: month,
        name: formatYearMonth(month)
      };
      
      // Add counts for each sector active in this month
      Object.entries(aggregates[month]).forEach(([sectorName, count]) => {
        monthData[sectorName] = count;
      });
      
      return monthData;
    });
  }, [filteredAudits, sectorNameMap]);

  // List of all unique active sector names present in the current aggregated chart data
  const activeSectorNames = useMemo(() => {
    const names = new Set<string>();
    chartData.forEach(item => {
      Object.keys(item).forEach(key => {
        if (key !== 'name' && key !== 'monthRaw') {
          names.add(key);
        }
      });
    });
    return Array.from(names);
  }, [chartData]);

  // Audit types breakdown stats (IRAS vs SAFETY)
  const auditTypeData = useMemo(() => {
    let iras = 0;
    let safety = 0;
    filteredAudits.forEach(a => {
      if (a.type === 'IRAS') iras++;
      else if (a.type === 'SAFETY') safety++;
    });
    return [
      { name: 'Checklist IRAS', value: iras, color: '#3b82f6' },
      { name: 'Checklist SAFETY', value: safety, color: '#f59e0b' }
    ];
  }, [filteredAudits]);

  // Top Statistics
  const statistics = useMemo(() => {
    const total = filteredAudits.length;
    
    // Most active sector
    const sectorCounts: Record<string, number> = {};
    filteredAudits.forEach(a => {
      const name = sectorNameMap[a.sectorId] || 'Não identificado';
      sectorCounts[name] = (sectorCounts[name] || 0) + 1;
    });
    
    let maxSector = 'Nenhum';
    let maxCount = 0;
    Object.entries(sectorCounts).forEach(([name, count]) => {
      if (count > maxCount) {
        maxCount = count;
        maxSector = name;
      }
    });

    // Average audits per month in selection
    const monthsCount = chartData.length || 1;
    const avgPerMonth = (total / monthsCount).toFixed(1);

    return {
      total,
      maxSector,
      maxCount,
      avgPerMonth
    };
  }, [filteredAudits, sectorNameMap, chartData]);

  return (
    <div className="space-y-6">
      {/* Module Title */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-600" /> Indicadores & Eficiência Hospitalar
          </h2>
          <p className="text-sm text-slate-500 mt-1 font-medium">
            Mapeamento analítico de auditorias de conformidade por setor, monitorando produtividade em tempo real.
          </p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 grid grid-cols-1 md:grid-cols-3 gap-4 items-end shadow-3xs">
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider flex items-center gap-1">
            <CalendarDays className="w-3.5 h-3.5 text-slate-400" /> Mês de Início
          </label>
          <input
            type="month"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="w-full px-3 py-2 border border-slate-250 rounded-xl text-xs bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider flex items-center gap-1">
            <CalendarDays className="w-3.5 h-3.5 text-slate-400" /> Mês de Fim
          </label>
          <input
            type="month"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="w-full px-3 py-2 border border-slate-250 rounded-xl text-xs bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider flex items-center gap-1">
            <Building2 className="w-3.5 h-3.5 text-slate-400" /> Filtrar por Setor
          </label>
          <select
            value={selectedSectorFilter}
            onChange={e => setSelectedSectorFilter(e.target.value)}
            className="w-full px-3 py-2 border border-slate-250 rounded-xl text-xs bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold cursor-pointer"
          >
            <option value="ALL">Todos os Setores</option>
            {sectors.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-3xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Auditorias Realizadas</span>
            <h3 className="text-2xl font-black text-indigo-600 leading-none">{statistics.total}</h3>
            <p className="text-[10px] text-slate-400 font-medium">No intervalo selecionado</p>
          </div>
          <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-3xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Setor Mais Ativo</span>
            <h3 className="text-lg font-bold text-slate-800 leading-tight max-w-[170px] truncate" title={statistics.maxSector}>
              {statistics.maxSector}
            </h3>
            <p className="text-[10px] text-emerald-600 font-semibold">{statistics.maxCount} auditorias concluídas</p>
          </div>
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
            <Building2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-3xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Média Mensal</span>
            <h3 className="text-2xl font-black text-amber-500 leading-none">{statistics.avgPerMonth}</h3>
            <p className="text-[10px] text-slate-400 font-medium">Auditorias por mês ativo</p>
          </div>
          <div className="p-3 bg-amber-50 rounded-xl text-amber-500">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-3xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status do Servidor</span>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-xs font-black text-slate-700 uppercase tracking-wider">REAL-TIME</span>
            </div>
            <p className="text-[10px] text-slate-400 font-medium">Sincronização MySQL Ativa</p>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-slate-400 text-xs font-mono font-bold uppercase">
            Live
          </div>
        </div>
      </div>

      {/* Main Charts Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Audit Count per Sector per Month (Recharts Stacked Bar Chart) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-3xs lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider">Distribuição de Auditorias por Setor</h4>
              <p className="text-[10px] text-slate-400 mt-0.5">Visão consolidada mensal por unidade hospitalar.</p>
            </div>
            <div className="p-1.5 bg-slate-100 text-slate-500 rounded-lg" title="Gráfico empilhado interativo">
              <BarChart3 className="w-4 h-4" />
            </div>
          </div>

          {chartData.length === 0 ? (
            <div className="h-[320px] flex flex-col items-center justify-center text-slate-400 border border-dashed border-slate-200 rounded-xl">
              <Info className="w-10 h-10 text-slate-300 mb-2" />
              <p className="text-xs font-semibold">Sem dados suficientes para este período</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Tente ampliar o intervalo de meses selecionado.</p>
            </div>
          ) : (
            <div className="h-[320px] w-full text-xs font-medium">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="name" 
                    stroke="#94a3b8" 
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    stroke="#94a3b8" 
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#ffffff', 
                      borderColor: '#e2e8f0', 
                      borderRadius: '12px',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)'
                    }} 
                  />
                  <Legend 
                    verticalAlign="bottom" 
                    height={36} 
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ paddingTop: '10px' }}
                  />
                  {activeSectorNames.map((sectorName, idx) => (
                    <Bar 
                      key={sectorName}
                      dataKey={sectorName} 
                      stackId="sectorStack" 
                      fill={SECTOR_COLORS[idx % SECTOR_COLORS.length]} 
                      radius={idx === activeSectorNames.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Breakdown Panel: Checklist Safety vs IRAS */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-3xs flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider">Tipologia das Auditorias</h4>
                <p className="text-[10px] text-slate-400 mt-0.5">Proporção IRAS vs segurança do paciente.</p>
              </div>
              <div className="p-1.5 bg-slate-100 text-slate-500 rounded-lg">
                <Activity className="w-4 h-4" />
              </div>
            </div>

            {filteredAudits.length === 0 ? (
              <div className="h-[200px] flex items-center justify-center text-slate-400">
                <p className="text-[10px] italic">Sem auditorias registradas</p>
              </div>
            ) : (
              <div className="h-[200px] w-full flex items-center justify-center relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={auditTypeData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {auditTypeData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#ffffff', 
                        borderColor: '#e2e8f0', 
                        borderRadius: '12px' 
                      }} 
                    />
                  </PieChart>
                </ResponsiveContainer>
                
                {/* Center Text inside Donut */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xl font-black text-slate-800 leading-none">{statistics.total}</span>
                  <span className="text-[8px] font-bold text-slate-400 uppercase mt-0.5">Total</span>
                </div>
              </div>
            )}
          </div>

          {/* Legend Table */}
          <div className="space-y-2 pt-4 border-t border-slate-100">
            {auditTypeData.map(entry => {
              const pct = statistics.total > 0 ? ((entry.value / statistics.total) * 100).toFixed(1) : '0.0';
              return (
                <div key={entry.name} className="flex items-center justify-between text-xs font-semibold text-slate-600">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span className="text-[11px] font-bold text-slate-700">{entry.name}</span>
                  </div>
                  <span className="font-mono text-[11px] text-slate-500">{entry.value} ({pct}%)</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
