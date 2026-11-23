import React, { useMemo } from 'react';
import { useAuditData } from '../context/AuditContext';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';
import { TrendingUp, Activity } from 'lucide-react';

interface DayData {
  dateKey: string;
  label: string;
  IRAS: number;
  SAFETY: number;
  total: number;
}

export function AuditsEvolutionChart() {
  const { audits } = useAuditData();

  const data = useMemo(() => {
    const last30Days: DayData[] = [];
    const now = new Date();

    // Generate last 30 days chronologically
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      
      const dateString = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const keyStr = `${year}-${month}-${day}`; // YYYY-MM-DD

      last30Days.push({
        dateKey: keyStr,
        label: dateString,
        IRAS: 0,
        SAFETY: 0,
        total: 0
      });
    }

    // Populate data with real audits
    audits.forEach(audit => {
      if (!audit.date) return;
      // Extract the YYYY-MM-DD part from ISO string (e.g., "2026-06-22T08:30:00.000Z")
      const datePart = audit.date.split('T')[0];
      const matchDay = last30Days.find(day => day.dateKey === datePart);
      if (matchDay) {
        if (audit.type === 'IRAS') {
          matchDay.IRAS += 1;
        } else if (audit.type === 'SAFETY') {
          matchDay.SAFETY += 1;
        }
        matchDay.total += 1;
      }
    });

    return last30Days;
  }, [audits]);

  // Calculate some simple stats for the header badge
  const totalInPeriod = useMemo(() => {
    return data.reduce((acc, curr) => acc + curr.total, 0);
  }, [data]);

  return (
    <div className="dash-card p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <Activity size={18} className="text-blue-500" />
          <h3 className="font-bold text-slate-800 text-sm">Evolução Diária de Auditorias Concluídas</h3>
        </div>
        <div className="flex items-center gap-1.5 self-start">
          <span className="text-[10px] text-slate-400 font-mono">Últimos 30 Dias</span>
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-extrabold text-[10px] border border-blue-100">
            <TrendingUp size={10} />
            {totalInPeriod} Concluídas
          </span>
        </div>
      </div>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 10, bottom: 5, left: -25 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis 
              dataKey="label" 
              tick={{ fontSize: 10, fill: '#64748b', fontWeight: 500 }} 
              axisLine={false} 
              tickLine={false}
              interval={2} // Show every 3rd day to avoid label overlap
            />
            <YAxis 
              tick={{ fontSize: 10, fill: '#64748b', fontWeight: 500 }} 
              axisLine={false} 
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip 
              contentStyle={{ 
                borderRadius: '12px', 
                border: '1px solid #e2e8f0', 
                boxShadow: '0 4px 12px -2px rgb(0 0 0 / 0.08)',
                fontSize: '11px',
                fontWeight: 600,
                color: '#1e293b'
              }}
              labelClassName="font-bold text-slate-500"
            />
            <Legend 
              wrapperStyle={{ fontSize: '11px', fontWeight: 600, paddingTop: '15px' }}
              iconType="circle"
              iconSize={8}
            />
            <Line 
              type="monotone" 
              dataKey="IRAS" 
              name="Auditorias IRAS" 
              stroke="#f59e0b" 
              strokeWidth={2.5}
              dot={{ r: 2 }}
              activeDot={{ r: 5, strokeWidth: 0 }}
            />
            <Line 
              type="monotone" 
              dataKey="SAFETY" 
              name="Segurança do Paciente (SAFETY)" 
              stroke="#10b981" 
              strokeWidth={2.5}
              dot={{ r: 2 }}
              activeDot={{ r: 5, strokeWidth: 0 }}
            />
            <Line 
              type="monotone" 
              dataKey="total" 
              name="Total Geral" 
              stroke="#3b82f6" 
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
