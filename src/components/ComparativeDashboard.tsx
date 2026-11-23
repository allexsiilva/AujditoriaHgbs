import React, { useState, useMemo } from 'react';
import { useAuditData } from '../context/AuditContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, Users, CalendarDays, BarChart3 } from 'lucide-react';
import { getYearMonthDay } from '../lib/utils';

interface MemoizedCompareBarChartProps {
  data: Array<{
    name: string;
    totalAudits: number;
    Conforme: number;
    'Não Conforme': number;
  }>;
}

const MemoizedCompareBarChart = React.memo(({ data }: MemoizedCompareBarChartProps) => {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748B', fontSize: 12}} />
          <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748B', fontSize: 12}} unit="%" />
          <RechartsTooltip cursor={{fill: 'rgba(148, 163, 184, 0.12)'}} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
          <Bar dataKey="Conforme" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={60} />
          <Bar dataKey="Não Conforme" fill="#EF4444" radius={[4, 4, 0, 0]} maxBarSize={60} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}, (prev, next) => {
  if (prev.data.length !== next.data.length) return false;
  return prev.data.every((item, idx) => {
    const nextItem = next.data[idx];
    return (
      item.name === nextItem.name &&
      item.totalAudits === nextItem.totalAudits &&
      item.Conforme === nextItem.Conforme &&
      item['Não Conforme'] === nextItem['Não Conforme']
    );
  });
});

export function ComparativeDashboard() {
  const { audits, sectors } = useAuditData();
  const [compareMode, setCompareMode] = useState<'SECTORS' | 'PERIODS'>('SECTORS');

  // Sectors Mode States
  const [sector1, setSector1] = useState<string>('');
  const [sector2, setSector2] = useState<string>('');

  // Periods Mode States
  const [period1Start, setPeriod1Start] = useState<string>('');
  const [period1End, setPeriod1End] = useState<string>('');
  const [period2Start, setPeriod2Start] = useState<string>('');
  const [period2End, setPeriod2End] = useState<string>('');

  const [formType, setFormType] = useState<'IRAS' | 'SAFETY' | 'ALL'>('ALL');

  const sectorMap = useMemo(() => {
    return sectors.reduce((acc, s) => {
      acc[s.id] = s.name;
      return acc;
    }, {} as Record<string, string>);
  }, [sectors]);

  const calcStats = (filteredAudits: any[]) => {
    let conformes = 0;
    let naoConformes = 0;

    filteredAudits.forEach(audit => {
      Object.values(audit.answers).forEach(resp => {
        const val = String(resp).toLowerCase().trim();
        if (['sim', 's', 'estéril', 'e', 'c', 'avc'].includes(val)) conformes++;
        if (['não', 'n', 'não estéril', 'ne', 'p', 'avp', 'não conforme'].includes(val)) naoConformes++;
      });
    });

    const total = conformes + naoConformes;
    const percConforme = total > 0 ? (conformes / total) * 100 : 0;
    const percNaoConforme = total > 0 ? (naoConformes / total) * 100 : 0;

    return { total, conformes, naoConformes, percConforme, percNaoConforme };
  };

  const currentAudits = useMemo(() => {
    return audits.filter(a => formType === 'ALL' || a.type === formType);
  }, [audits, formType]);

  const compareData = useMemo(() => {
    if (compareMode === 'SECTORS') {
      const audits1 = currentAudits.filter(a => a.sectorId === sector1);
      const audits2 = currentAudits.filter(a => a.sectorId === sector2);

      const stats1 = calcStats(audits1);
      const stats2 = calcStats(audits2);

      return [
        {
          name: sectorMap[sector1] || 'Setor 1 (Vazio)',
          Conforme: Number(stats1.percConforme.toFixed(1)),
          'Não Conforme': Number(stats1.percNaoConforme.toFixed(1)),
          totalAudits: audits1.length
        },
        {
          name: sectorMap[sector2] || 'Setor 2 (Vazio)',
          Conforme: Number(stats2.percConforme.toFixed(1)),
          'Não Conforme': Number(stats2.percNaoConforme.toFixed(1)),
          totalAudits: audits2.length
        }
      ];
    } else {
      let p1StartVal = 0;
      if (period1Start) {
        const parts = period1Start.split('-');
        if (parts.length === 3) {
          p1StartVal = parseInt(parts[0], 10) * 10000 + parseInt(parts[1], 10) * 100 + parseInt(parts[2], 10);
        }
      }

      let p1EndVal = Infinity;
      if (period1End) {
        const parts = period1End.split('-');
        if (parts.length === 3) {
          p1EndVal = parseInt(parts[0], 10) * 10000 + parseInt(parts[1], 10) * 100 + parseInt(parts[2], 10);
        }
      }

      const audits1 = currentAudits.filter(a => {
        if (p1StartVal > 0 || p1EndVal !== Infinity) {
          const ymd = getYearMonthDay(a.date);
          if (!ymd) return false;
          const val = ymd.year * 10000 + ymd.month * 100 + ymd.day;
          if (p1StartVal > 0 && val < p1StartVal) return false;
          if (val > p1EndVal) return false;
        }
        return true;
      });

      let p2StartVal = 0;
      if (period2Start) {
        const parts = period2Start.split('-');
        if (parts.length === 3) {
          p2StartVal = parseInt(parts[0], 10) * 10000 + parseInt(parts[1], 10) * 100 + parseInt(parts[2], 10);
        }
      }

      let p2EndVal = Infinity;
      if (period2End) {
        const parts = period2End.split('-');
        if (parts.length === 3) {
          p2EndVal = parseInt(parts[0], 10) * 10000 + parseInt(parts[1], 10) * 100 + parseInt(parts[2], 10);
        }
      }

      const audits2 = currentAudits.filter(a => {
        if (p2StartVal > 0 || p2EndVal !== Infinity) {
          const ymd = getYearMonthDay(a.date);
          if (!ymd) return false;
          const val = ymd.year * 10000 + ymd.month * 100 + ymd.day;
          if (p2StartVal > 0 && val < p2StartVal) return false;
          if (val > p2EndVal) return false;
        }
        return true;
      });

      const stats1 = calcStats(audits1);
      const stats2 = calcStats(audits2);

      return [
        {
          name: 'Período 1',
          Conforme: Number(stats1.percConforme.toFixed(1)),
          'Não Conforme': Number(stats1.percNaoConforme.toFixed(1)),
          totalAudits: audits1.length
        },
        {
          name: 'Período 2',
          Conforme: Number(stats2.percConforme.toFixed(1)),
          'Não Conforme': Number(stats2.percNaoConforme.toFixed(1)),
          totalAudits: audits2.length
        }
      ];
    }
  }, [compareMode, sector1, sector2, period1Start, period1End, period2Start, period2End, currentAudits, sectorMap]);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center">
            <div className="bg-indigo-100 p-2 rounded-lg mr-3">
              <BarChart3 className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Painel Comparativo</h2>
              <p className="text-sm text-slate-500">Contraste dados de diferentes setores ou períodos de tempo</p>
            </div>
          </div>
          
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setCompareMode('SECTORS')}
              className={`px-4 py-1.5 text-sm font-semibold rounded-md transition ${compareMode === 'SECTORS' ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-600'}`}
            >
              Setores
            </button>
            <button
              onClick={() => setCompareMode('PERIODS')}
              className={`px-4 py-1.5 text-sm font-semibold rounded-md transition ${compareMode === 'PERIODS' ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-600'}`}
            >
              Períodos
            </button>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-8">
            <div className="space-y-4">
              <h3 className="font-semibold text-slate-700">Filtro Geral</h3>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Tipo de Formulário</label>
                <select 
                  className="w-full text-sm border-slate-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  value={formType}
                  onChange={e => setFormType(e.target.value as any)}
                >
                  <option value="ALL">Todos os Tipos</option>
                  <option value="IRAS">Apenas IRAS</option>
                  <option value="SAFETY">Apenas Segurança do Paciente</option>
                </select>
              </div>
            </div>

            {compareMode === 'SECTORS' ? (
              <>
                <div className="space-y-4">
                  <h3 className="font-semibold flex items-center text-indigo-700">
                    <Users className="w-4 h-4 mr-2" /> Setor 1
                  </h3>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Selecione o Setor</label>
                    <select 
                      className="w-full text-sm border-slate-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                      value={sector1}
                      onChange={e => setSector1(e.target.value)}
                    >
                      <option value="">Selecione...</option>
                      {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-4">
                  <h3 className="font-semibold flex items-center text-teal-700">
                    <Users className="w-4 h-4 mr-2" /> Setor 2
                  </h3>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Selecione o Setor</label>
                    <select 
                      className="w-full text-sm border-slate-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                      value={sector2}
                      onChange={e => setSector2(e.target.value)}
                    >
                      <option value="">Selecione...</option>
                      {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-4">
                  <h3 className="font-semibold flex items-center text-indigo-700">
                    <CalendarDays className="w-4 h-4 mr-2" /> Período 1
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-medium text-slate-500 mb-1">Data Início</label>
                      <input type="date" className="w-full text-xs border-slate-300 rounded-md" value={period1Start} onChange={e => setPeriod1Start(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-slate-500 mb-1">Data Fim</label>
                      <input type="date" className="w-full text-xs border-slate-300 rounded-md" value={period1End} onChange={e => setPeriod1End(e.target.value)} />
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <h3 className="font-semibold flex items-center text-teal-700">
                    <CalendarDays className="w-4 h-4 mr-2" /> Período 2
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-medium text-slate-500 mb-1">Data Início</label>
                      <input type="date" className="w-full text-xs border-slate-300 rounded-md" value={period2Start} onChange={e => setPeriod2Start(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-slate-500 mb-1">Data Fim</label>
                      <input type="date" className="w-full text-xs border-slate-300 rounded-md" value={period2End} onChange={e => setPeriod2End(e.target.value)} />
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-slate-50 rounded-xl p-4 border border-slate-100 flex flex-col justify-center">
              <h4 className="text-sm font-bold text-center text-slate-600 mb-4">Taxas de Conformidade (%)</h4>
              <MemoizedCompareBarChart data={compareData} />
            </div>

            <div className="space-y-4">
              <div className="bg-indigo-50 rounded-xl p-5 border border-indigo-100">
                <h4 className="text-sm font-bold text-indigo-900 mb-3">{compareData[0].name}</h4>
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-indigo-700/70">Total de Auditorias</span>
                    <span className="font-bold text-indigo-900">{compareData[0].totalAudits}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-emerald-600/80">Conforme</span>
                    <span className="font-bold text-emerald-700">{compareData[0].Conforme}%</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-red-500/80">Não Conforme</span>
                    <span className="font-bold text-red-600">{compareData[0]['Não Conforme']}%</span>
                  </div>
                </div>
              </div>
              
              <div className="bg-teal-50 rounded-xl p-5 border border-teal-100">
                <h4 className="text-sm font-bold text-teal-900 mb-3">{compareData[1].name}</h4>
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-teal-700/70">Total de Auditorias</span>
                    <span className="font-bold text-teal-900">{compareData[1].totalAudits}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-emerald-600/80">Conforme</span>
                    <span className="font-bold text-emerald-700">{compareData[1].Conforme}%</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-red-500/80">Não Conforme</span>
                    <span className="font-bold text-red-600">{compareData[1]['Não Conforme']}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
