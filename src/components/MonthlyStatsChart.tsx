import React, { useMemo } from 'react';
import { useAuditData } from '../context/AuditContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface MonthlyStatsChartPresentationalProps {
  data: Array<{ name: string; IRAS: number; SAFETY: number }>;
}

const MonthlyStatsChartPresentational = React.memo(({ data }: MonthlyStatsChartPresentationalProps) => {
  return (
    <div className="dash-card p-5 mt-4">
      <h3 className="text-xs font-bold text-slate-700 mb-4 uppercase tracking-wider">Estatísticas do Mês Atual por Setor</h3>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <Tooltip 
              contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }}
            />
            <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
            <Bar dataKey="IRAS" name="Auditorias IRAS" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            <Bar dataKey="SAFETY" name="Segurança do Paciente" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}, (prev, next) => {
  if (prev.data.length !== next.data.length) return false;
  return prev.data.every((item, idx) => {
    const nextItem = next.data[idx];
    return item.name === nextItem.name && item.IRAS === nextItem.IRAS && item.SAFETY === nextItem.SAFETY;
  });
});

export function MonthlyStatsChart() {
  const { audits, sectors } = useAuditData();

  const data = useMemo(() => {
    // Group by sector
    const sectorStats: Record<string, { name: string; IRAS: number; SAFETY: number }> = {};
    
    sectors.forEach(s => {
      sectorStats[s.id] = { name: s.name, IRAS: 0, SAFETY: 0 };
    });

    audits.forEach(audit => {
      const auditDate = new Date(audit.date);
      const now = new Date();
      if (auditDate.getMonth() === now.getMonth() && auditDate.getFullYear() === now.getFullYear()) {
        if (sectorStats[audit.sectorId]) {
          if (audit.type === 'IRAS') {
            sectorStats[audit.sectorId].IRAS += 1;
          } else if (audit.type === 'SAFETY') {
            sectorStats[audit.sectorId].SAFETY += 1;
          }
        }
      }
    });

    return Object.values(sectorStats);
  }, [audits, sectors]);

  return <MonthlyStatsChartPresentational data={data} />;
}
