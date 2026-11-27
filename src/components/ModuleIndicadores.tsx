import React, { useState, useMemo } from 'react';
import { useAuditData } from '../context/AuditContext';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { 
  ClipboardCheck, TrendingUp, AlertTriangle, Clock, ShieldCheck, Activity, Info, BarChart2
} from 'lucide-react';
import { cn } from '../lib/utils';

export function ModuleIndicadores() {
  const { sectors, beds, audits } = useAuditData();
  const [selectedSector, setSelectedSector] = useState<string>('ALL');

  // 1. Calcular estatísticas gerais de auditorias
  const stats = useMemo(() => {
    const totalAudits = audits.length;

    // Calcular Conformidade Geral (taxa de respostas em conformidade)
    let conformes = 0;
    let totalAnswers = 0;
    
    // Filtrar auditorias do setor selecionado se houver filtro
    const filteredAudits = selectedSector === 'ALL' 
      ? audits 
      : audits.filter(a => a.sectorId === selectedSector);

    filteredAudits.forEach(audit => {
      Object.values(audit.answers || {}).forEach(resp => {
        const r = String(resp).toUpperCase().trim();
        if (r === 'CONFORME' || r === 'C' || r === 'SIM' || r === 'S') {
          conformes++;
          totalAnswers++;
        } else if (r === 'NAO_CONFORME' || r === 'NC' || r === 'NAO' || r === 'N') {
          totalAnswers++;
        }
      });
    });

    const complianceRate = totalAnswers > 0 ? Math.round((conformes / totalAnswers) * 100) : 0;

    // Calcular tipo de Auditoria (IRAS vs SAFETY)
    const irasCount = filteredAudits.filter(a => a.type === 'IRAS').length;
    const safetyCount = filteredAudits.filter(a => a.type === 'SAFETY').length;

    // 2. Calcular Status de Auditorias (Concluídas vs Pendentes nos Leitos)
    // "Concluída" = Leito auditado nos últimos 7 dias.
    // "Pendente" = Leito sem auditoria nos últimos 7 dias (ou nunca auditado).
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let concluidasCount = 0;
    let pendentesCount = 0;

    const filteredBeds = selectedSector === 'ALL'
      ? beds
      : beds.filter(b => b.sectorId === selectedSector);

    filteredBeds.forEach(bed => {
      const bedAudits = audits.filter(a => a.bedId === bed.id);
      if (bedAudits.length === 0) {
        pendentesCount++;
      } else {
        const latestAudit = bedAudits.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
        const auditTime = new Date(latestAudit.date).getTime();
        if (now - auditTime > SEVEN_DAYS_MS) {
          pendentesCount++;
        } else {
          concluidasCount++;
        }
      }
    });

    return {
      totalAudits: filteredAudits.length,
      complianceRate,
      irasCount,
      safetyCount,
      concluidasCount,
      pendentesCount,
      totalBeds: filteredBeds.length
    };
  }, [audits, beds, selectedSector]);

  // Data para o gráfico de Auditorias por Setor
  const auditsPerSectorData = useMemo(() => {
    return sectors.map(sector => {
      const count = audits.filter(a => a.sectorId === sector.id).length;
      
      // Calcular taxa de conformidade deste setor
      let conformes = 0;
      let totalAnswers = 0;
      const sectorAudits = audits.filter(a => a.sectorId === sector.id);
      sectorAudits.forEach(audit => {
        Object.values(audit.answers || {}).forEach(resp => {
          const r = String(resp).toUpperCase().trim();
          if (r === 'CONFORME' || r === 'C' || r === 'SIM' || r === 'S') {
            conformes++;
            totalAnswers++;
          } else if (r === 'NAO_CONFORME' || r === 'NC' || r === 'NAO' || r === 'N') {
            totalAnswers++;
          }
        });
      });
      const compliance = totalAnswers > 0 ? Math.round((conformes / totalAnswers) * 100) : 0;

      return {
        name: sector.name,
        'Auditorias': count,
        'Conformidade %': compliance
      };
    }).sort((a, b) => b['Auditorias'] - a['Auditorias']);
  }, [sectors, audits]);

  // Data para o gráfico de Pizza: Status de Auditoria (Concluídas vs Pendentes nos Leitos)
  const statusPieData = useMemo(() => {
    return [
      { name: 'Em Dia (Concluídas)', value: stats.concluidasCount, color: '#10b981' }, // Emerald-500
      { name: 'Atrasadas (Pendentes)', value: stats.pendentesCount, color: '#f59e0b' } // Amber-500
    ];
  }, [stats]);

  // Dados para tabela/grade de conformidade detalhada por setor
  const sectorComplianceDetails = useMemo(() => {
    return sectors.map(sector => {
      const sectorBeds = beds.filter(b => b.sectorId === sector.id);
      const sectorAudits = audits.filter(a => a.sectorId === sector.id);
      
      // Calcular conformidade
      let conformes = 0;
      let totalAnswers = 0;
      sectorAudits.forEach(audit => {
        Object.values(audit.answers || {}).forEach(resp => {
          const r = String(resp).toUpperCase().trim();
          if (r === 'CONFORME' || r === 'C' || r === 'SIM' || r === 'S') {
            conformes++;
            totalAnswers++;
          } else if (r === 'NAO_CONFORME' || r === 'NC' || r === 'NAO' || r === 'N') {
            totalAnswers++;
          }
        });
      });
      const compRate = totalAnswers > 0 ? Math.round((conformes / totalAnswers) * 100) : 0;

      // Calcular leitos em dia
      const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      let emDia = 0;
      let atrasados = 0;

      sectorBeds.forEach(bed => {
        const bedAudits = audits.filter(a => a.bedId === bed.id);
        if (bedAudits.length === 0) {
          atrasados++;
        } else {
          const latestAudit = bedAudits.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
          const auditTime = new Date(latestAudit.date).getTime();
          if (now - auditTime > SEVEN_DAYS_MS) {
            atrasados++;
          } else {
            emDia++;
          }
        }
      });

      return {
        id: sector.id,
        name: sector.name,
        totalBeds: sectorBeds.length,
        totalAudits: sectorAudits.length,
        compRate,
        emDia,
        atrasados
      };
    }).sort((a, b) => b.compRate - a.compRate);
  }, [sectors, beds, audits]);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Header Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-blue-600" />
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Indicadores & Estatísticas</h1>
          </div>
          <p className="text-sm text-slate-500 font-medium">
            Monitoramento de conformidade de metas, cobertura de auditorias à beira do leito e status operacional.
          </p>
        </div>

        {/* Filtro por Setor */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Filtrar Setor:</span>
          <select
            value={selectedSector}
            onChange={(e) => setSelectedSector(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl px-3 py-2 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
          >
            <option value="ALL">Todos os Setores</option>
            {sectors.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid of Bento-style KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total de Auditorias */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs hover:shadow-sm transition flex flex-col justify-between min-h-[115px]">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Histórico</span>
              <h3 className="text-sm font-bold text-slate-800 leading-none">Total de Auditorias</h3>
            </div>
            <span className="p-1.5 bg-blue-50 text-blue-600 rounded-lg shrink-0">
              <ClipboardCheck size={16} />
            </span>
          </div>
          <div className="mt-3 flex items-end justify-between">
            <div className="space-y-0.5">
              <span className="text-2xl font-black text-slate-900 leading-none">{stats.totalAudits}</span>
              <span className="text-[10px] text-slate-400 block font-semibold leading-none">Checklists realizados</span>
            </div>
            <div className="text-right text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg">
              {stats.irasCount} IRAS / {stats.safetyCount} SAFETY
            </div>
          </div>
        </div>

        {/* Card 2: Taxa de Conformidade */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs hover:shadow-sm transition flex flex-col justify-between min-h-[115px]">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Qualidade</span>
              <h3 className="text-sm font-bold text-slate-800 leading-none">Taxa de Conformidade</h3>
            </div>
            <span className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg shrink-0">
              <TrendingUp size={16} />
            </span>
          </div>
          <div className="mt-3 flex items-end justify-between">
            <div className="space-y-0.5">
              <span className={cn(
                "text-2xl font-black leading-none",
                stats.complianceRate >= 80 ? "text-emerald-600" : stats.complianceRate >= 60 ? "text-amber-500" : "text-rose-600"
              )}>
                {stats.complianceRate}%
              </span>
              <span className="text-[10px] text-slate-400 block font-semibold leading-none">Adesão aos critérios</span>
            </div>
            <div className="text-right space-y-1">
              <span className="text-[10px] font-bold text-slate-400 block">Meta: &ge; 80%</span>
              <div className="w-16 bg-slate-100 rounded-full h-1 overflow-hidden border border-slate-200 ml-auto">
                <div 
                  className={cn(
                    "h-full rounded-full",
                    stats.complianceRate >= 80 ? "bg-emerald-500" : stats.complianceRate >= 60 ? "bg-amber-500" : "bg-rose-500"
                  )} 
                  style={{ width: `${stats.complianceRate}%` }} 
                />
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Leitos Em Dia (Concluídas) */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs hover:shadow-sm transition flex flex-col justify-between min-h-[115px]">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Frequência</span>
              <h3 className="text-sm font-bold text-slate-800 leading-none">Leitos em Dia</h3>
            </div>
            <span className="p-1.5 bg-emerald-50 text-emerald-500 rounded-lg shrink-0">
              <ShieldCheck size={16} />
            </span>
          </div>
          <div className="mt-3 flex items-end justify-between">
            <div className="space-y-0.5">
              <span className="text-2xl font-black text-slate-900 leading-none">{stats.concluidasCount} leitos</span>
              <span className="text-[10px] text-slate-400 block font-semibold leading-none">Avaliados nos últimos 7d</span>
            </div>
            <div className="text-right text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
              {stats.totalBeds > 0 ? Math.round((stats.concluidasCount / stats.totalBeds) * 100) : 0}% Cobertura
            </div>
          </div>
        </div>

        {/* Card 4: Leitos Pendentes */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs hover:shadow-sm transition flex flex-col justify-between min-h-[115px]">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Atenção</span>
              <h3 className="text-sm font-bold text-slate-800 leading-none">Leitos Pendentes</h3>
            </div>
            <span className={cn(
              "p-1.5 rounded-lg shrink-0",
              stats.pendentesCount > 0 ? "bg-amber-50 text-amber-600" : "bg-slate-50 text-slate-400"
            )}>
              <Clock size={16} />
            </span>
          </div>
          <div className="mt-3 flex items-end justify-between">
            <div className="space-y-0.5">
              <span className={cn(
                "text-2xl font-black leading-none",
                stats.pendentesCount > 0 ? "text-amber-600" : "text-slate-900"
              )}>
                {stats.pendentesCount} leitos
              </span>
              <span className="text-[10px] text-slate-400 block font-semibold leading-none">Sem avaliação recente</span>
            </div>
            {stats.pendentesCount > 0 && (
              <div className="text-right text-[10px] font-black text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">
                Requer Ação
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left Column (3/5) - Bar Chart: Auditorias por Setor */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs lg:col-span-3">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Auditorias por Setor</h3>
              <p className="text-[10px] text-slate-400 font-medium">Volumetria de checklists preenchidos e respectiva conformidade.</p>
            </div>
            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100 uppercase">
              Total consolidado
            </span>
          </div>

          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={auditsPerSectorData}
                margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  tick={{ fill: '#64748b', fontSize: 10, fontWeight: 500 }} 
                  axisLine={{ stroke: '#cbd5e1' }}
                />
                <YAxis 
                  tick={{ fill: '#64748b', fontSize: 10, fontWeight: 500 }} 
                  axisLine={{ stroke: '#cbd5e1' }}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '11px' }}
                  labelStyle={{ fontWeight: 'bold', color: '#1e293b' }}
                />
                <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                <Bar dataKey="Auditorias" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={35} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right Column (2/5) - Pie Chart: Status de Auditorias (Concluídas vs. Pendentes) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs lg:col-span-2 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-800 font-sans">Status de Auditorias nos Leitos</h3>
                <p className="text-[10px] text-slate-400 font-medium">Situação da frequência semanal da rotina de auditoria.</p>
              </div>
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100 uppercase">
                Janela 7 Dias
              </span>
            </div>

            <div className="h-[190px] w-full flex items-center justify-center relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {statusPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '11px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute flex flex-col items-center justify-center">
                <span className="text-xl font-black text-slate-800">{stats.totalBeds}</span>
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Leitos Totais</span>
              </div>
            </div>
          </div>

          <div className="space-y-2 mt-2">
            <div className="flex justify-between items-center text-xs border-b border-slate-50 pb-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="text-slate-600 font-medium">Em Dia (Concluídas)</span>
              </div>
              <strong className="text-slate-800 font-bold">{stats.concluidasCount} leitos ({stats.totalBeds > 0 ? Math.round((stats.concluidasCount / stats.totalBeds) * 100) : 0}%)</strong>
            </div>
            <div className="flex justify-between items-center text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span className="text-slate-600 font-medium">Atrasadas (Pendentes)</span>
              </div>
              <strong className="text-slate-800 font-bold">{stats.pendentesCount} leitos ({stats.totalBeds > 0 ? Math.round((stats.pendentesCount / stats.totalBeds) * 100) : 0}%)</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Compliance heatmap details by Sector */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Desempenho Detalhado por Setor</h3>
            <p className="text-[10px] text-slate-400 font-medium">Análise de cobertura, pendências e conformidade acumulada de cada ala clínica.</p>
          </div>
          <span className="text-xs text-slate-400 font-bold">
            Total: {sectors.length} setores
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">
                <th className="py-3 px-4">Setor Hospitalar</th>
                <th className="py-3 px-4 text-center">Total Leitos</th>
                <th className="py-3 px-4 text-center">Auditorias Realizadas</th>
                <th className="py-3 px-4 text-center">Leitos Em Dia</th>
                <th className="py-3 px-4 text-center">Leitos Pendentes</th>
                <th className="py-3 px-4 text-right">Taxa de Adesão</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {sectorComplianceDetails.map((sec) => {
                const statusColor = sec.compRate >= 80 
                  ? 'text-emerald-700 bg-emerald-50 border-emerald-100' 
                  : sec.compRate >= 60 
                    ? 'text-amber-700 bg-amber-50 border-amber-100' 
                    : 'text-rose-700 bg-rose-50 border-rose-100';

                return (
                  <tr key={sec.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-700">{sec.name}</td>
                    <td className="py-3 px-4 text-center text-slate-500 font-medium">{sec.totalBeds}</td>
                    <td className="py-3 px-4 text-center font-semibold text-slate-600">{sec.totalAudits}</td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[10px]">
                        {sec.emDia} leitos
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full font-bold text-[10px]",
                        sec.atrasados > 0 ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-400"
                      )}>
                        {sec.atrasados} leitos
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className={cn("inline-flex items-center gap-1 font-extrabold px-2.5 py-1 rounded-full border text-[11px]", statusColor)}>
                        {sec.compRate}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
