import React, { useState, useMemo, useRef, useContext, useEffect } from 'react';
import { useAuditData } from '../context/AuditContext';
import { ToastContext } from '../context/ToastContext';
import { FileText, Download, Filter, PieChart as PieChartIcon, Printer, X, MessageCircle, Eye, AlertTriangle, CheckCircle2, Info, ChevronDown, ChevronUp, HelpCircle, Pencil, Check, Wrench, User, TrendingUp, ClipboardList, CheckSquare, Layers, Search, Plus } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toPng } from 'html-to-image';
import { formatDateTime, getAnswerForQuestion, getYearMonthDay } from '../lib/utils';

const isYesLike = (val: string) => {
  const v = val.toLowerCase().trim();
  return ['sim', 's', 'estéril', 'esteril', 'e', 'c', 'avc', 'conforme'].includes(v);
};

const isNoLike = (val: string) => {
  const v = val.toLowerCase().trim();
  return ['não', 'nao', 'n', 'não estéril', 'nao esteril', 'ne', 'p', 'avp', 'não conforme', 'nao conforme'].includes(v);
};

const isNaLike = (val: string) => {
  const v = val.toLowerCase().trim();
  return ['na', 'n/a', 'não se aplica', 'nao se aplica', 'não se aplica', 'não se aplica'].includes(v);
};

const getOptionColor = (opt: string) => {
  const lowerOpt = opt.toLowerCase().trim();
  if (['pendente', 'sem preenchimento', 'não preenchido'].includes(lowerOpt)) return '#e11d48'; // Bright distinct crimson red for pendency
  if (['sim', 's', 'estéril', 'e', 'c', 'avc'].includes(lowerOpt)) return '#84cc16'; // Green
  if (['não', 'n', 'não estéril', 'ne', 'p', 'avp', 'não conforme'].includes(lowerOpt)) return '#ef4444'; // Red
  if (['na', 'não se aplica', 'não ser aplica'].includes(lowerOpt)) return '#eab308'; // Yellow
  
  // Fallbacks
  const fallback = ['#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#14b8a6'];
  let hash = 0;
  for (let i = 0; i < opt.length; i++) hash = opt.charCodeAt(i) + ((hash << 5) - hash);
  return fallback[Math.abs(hash) % fallback.length];
};

const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  if (percent === 0) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="bold">
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

interface MemoizedQuestionPieChartProps {
  chart: {
    questionId: string;
    label: string;
    total: number;
    data: Array<{ name: string; value: number }>;
    pendingAudits?: any[];
  };
  onStartCorrection: (audit: any) => void;
}

const MemoizedQuestionPieChart = React.memo(({ chart, onStartCorrection }: MemoizedQuestionPieChartProps) => {
  return (
    <div className="bg-slate-50 rounded-lg p-4 border border-slate-100 shadow-sm flex flex-col print:break-inside-avoid chart-card">
      <h3 className="text-sm font-bold text-slate-700 mb-4 text-center min-h-[40px] flex items-center justify-center">
        {chart.label}
      </h3>
      {chart.total === 0 ? (
        <div className="flex-1 flex items-center justify-center text-xs text-slate-400">Sem dados</div>
      ) : (
        <>
          <div className="flex items-center justify-center pt-2">
            <PieChart width={250} height={200}>
              <Pie
                isAnimationActive={false}
                data={chart.data}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderCustomizedLabel}
                outerRadius={65}
                fill="#8884d8"
                dataKey="value"
              >
                {chart.data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getOptionColor(entry.name)} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value: number) => [value, 'Quantidade']}
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Legend 
                verticalAlign="bottom" 
                height={36} 
                iconType="square"
                formatter={(value: string) => <span className="text-[11px] text-slate-600 font-medium">{value}</span>}
              />
            </PieChart>
          </div>

          {chart.pendingAudits && chart.pendingAudits.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-200/60 text-left print:hidden">
              <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-rose-600 mb-2 font-mono uppercase tracking-wider">
                <AlertTriangle className="w-3.5 h-3.5 animate-pulse" />
                <span>Leitos Pendentes ({chart.pendingAudits.length})</span>
              </div>
              <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                {chart.pendingAudits.map((audit: any) => (
                  <div key={audit.id} className="flex items-center justify-between text-[11px] bg-red-50 border border-red-100 rounded-lg p-2 shadow-3xs">
                    <span className="font-semibold text-slate-700 truncate mr-2">
                      Leito: <strong className="text-red-700">{audit.bedNumber}</strong>
                    </span>
                    <button
                      onClick={() => onStartCorrection(audit)}
                      className="px-2 py-1 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded font-bold text-[9px] flex items-center gap-1 shrink-0 shadow-3xs border border-red-700 transition"
                      title={`Corrigir leito ${audit.bedNumber} diretamente`}
                    >
                      <Pencil className="w-2.5 h-2.5 text-white" />
                      <span>Corrigir Leito {audit.bedNumber}</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  const p = prevProps.chart;
  const n = nextProps.chart;
  if (p.questionId !== n.questionId || p.label !== n.label || p.total !== n.total) return false;
  if (p.data.length !== n.data.length) return false;
  
  const dataEqual = p.data.every((item, idx) => {
    const nextItem = n.data[idx];
    return item.name === nextItem.name && item.value === nextItem.value;
  });
  if (!dataEqual) return false;

  const pPending = p.pendingAudits || [];
  const nPending = n.pendingAudits || [];
  if (pPending.length !== nPending.length) return false;
  return pPending.every((item, idx) => item.id === nPending[idx].id && item.bedNumber === nPending[idx].bedNumber);
});

export function ReportGenerator() {
  const { audits, sectors, beds, questions, updateAudit, hasMoreAudits, ensureAllAuditsLoaded } = useAuditData();
  const { showToast } = useContext(ToastContext);

  // Existing Audit Report states
  const [formType, setFormType] = useState<'IRAS' | 'SAFETY'>('IRAS');
  const [sectorId, setSectorId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isPendencyPanelOpen, setIsPendencyPanelOpen] = useState(true);
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);
  const [missingBedsLimit, setMissingBedsLimit] = useState<number>(18);
  const [previewPage, setPreviewPage] = useState<number>(1);
  const [previewPageSize, setPreviewPageSize] = useState<number>(25);

  useEffect(() => {
    if (hasMoreAudits) {
      ensureAllAuditsLoaded();
    }
  }, [hasMoreAudits, ensureAllAuditsLoaded]);

  useEffect(() => {
    setPreviewPage(1);
  }, [formType, sectorId, startDate, endDate, isPreviewOpen]);

  useEffect(() => {
    setMissingBedsLimit(18);
  }, [expandedQuestionId]);


  // Shared state for the general A4 Print layout preview/trigger
  const [activePrintPayload, setActivePrintPayload] = useState<{
    title: string;
    subtitle: string;
    headers: string[];
    rows: string[][];
    metrics: { label: string; value: string | number }[];
  } | null>(null);

  // States for manual correction of missing data
  const [correctingAudit, setCorrectingAudit] = useState<any | null>(null);
  const [correctingAnswers, setCorrectingAnswers] = useState<Record<string, string>>({});
  const [isSavingCorrection, setIsSavingCorrection] = useState(false);

  const sectorMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (let i = 0; i < sectors.length; i++) {
      map[sectors[i].id] = sectors[i].name;
    }
    return map;
  }, [sectors]);

  const bedMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (let i = 0; i < beds.length; i++) {
      map[beds[i].id] = beds[i].number;
    }
    return map;
  }, [beds]);

  const filteredAudits = useMemo(() => {
    let startVal = 0;
    if (startDate) {
      const parts = startDate.split('-');
      if (parts.length === 3) {
        startVal = parseInt(parts[0], 10) * 10000 + parseInt(parts[1], 10) * 100 + parseInt(parts[2], 10);
      }
    }

    let endVal = Infinity;
    if (endDate) {
      const parts = endDate.split('-');
      if (parts.length === 3) {
        endVal = parseInt(parts[0], 10) * 10000 + parseInt(parts[1], 10) * 100 + parseInt(parts[2], 10);
      }
    }

    return audits.filter(a => {
      if (a.type !== formType) return false;
      if (sectorId && a.sectorId !== sectorId) return false;
      
      if (startVal > 0 || endVal !== Infinity) {
        const ymd = getYearMonthDay(a.date);
        if (!ymd) return false;
        const val = ymd.year * 10000 + ymd.month * 100 + ymd.day;
        if (startVal > 0 && val < startVal) return false;
        if (val > endVal) return false;
      }
      return true;
    });
  }, [audits, formType, sectorId, startDate, endDate]);

  const applicableQuestions = useMemo(() => {
    return questions.filter(q => q.formType === formType);
  }, [questions, formType]);

  const handleStartCorrection = (auditSummary: any) => {
    const fullAudit = audits.find(a => a.id === auditSummary.id);
    if (!fullAudit) return;
    setCorrectingAudit(fullAudit);
    const initialAnswers: Record<string, string> = {};
    applicableQuestions.forEach(q => {
      initialAnswers[q.id] = getAnswerForQuestion(fullAudit.answers, q, questions) || '';
    });
    setCorrectingAnswers(initialAnswers);
  };

  const handleSaveCorrection = async () => {
    if (!correctingAudit) return;
    setIsSavingCorrection(true);
    try {
      const updatedAnswers = { ...correctingAudit.answers };
      applicableQuestions.forEach(q => {
        updatedAnswers[q.id] = correctingAnswers[q.id] || '';
      });
      await updateAudit(correctingAudit.id, {
        ...correctingAudit,
        answers: updatedAnswers
      });
      showToast('success', 'Correção Salva', 'A correção dos dados foi salva no MySQL com sucesso.');
      setCorrectingAudit(null);
    } catch (err: any) {
      console.error('Erro ao salvar correção:', err);
      showToast('error', 'Erro ao Salvar no MySQL', err.message || 'Não foi possível salvar as alterações da correção no MySQL.');
    } finally {
      setIsSavingCorrection(false);
    }
  };

  const chartData = useMemo(() => {
    return applicableQuestions.map(q => {
      const counts: Record<string, number> = {};
      const pendingAudits: any[] = [];
      
      q.options.forEach(opt => counts[opt] = 0);
      counts['Pendente'] = 0;
      
      for (let i = 0; i < filteredAudits.length; i++) {
        const audit = filteredAudits[i];
        const rawAnswer = getAnswerForQuestion(audit.answers, q, questions);
        if (rawAnswer && rawAnswer.trim() !== '') {
          let normalizedAnswer = rawAnswer;
          const lowerAns = rawAnswer.toLowerCase().trim();
          
          const optMatch = q.options.find(opt => {
            const lowerOpt = opt.toLowerCase().trim();
            if (lowerOpt === lowerAns) return true;
            if (isYesLike(lowerAns) && isYesLike(lowerOpt)) return true;
            if (isNoLike(lowerAns) && isNoLike(lowerOpt)) return true;
            if (isNaLike(lowerAns) && isNaLike(lowerOpt)) return true;
            return false;
          });
          
          if (optMatch) {
            normalizedAnswer = optMatch;
          }
          
          counts[normalizedAnswer] = (counts[normalizedAnswer] || 0) + 1;
        } else {
          counts['Pendente'] = (counts['Pendente'] || 0) + 1;
          const bedNum = bedMap[audit.bedId] || audit.bedId || 'Leito não identificado';
          const secName = sectorMap[audit.sectorId] || audit.sectorId || 'Setor não identificado';
          pendingAudits.push({
            id: audit.id,
            bedId: audit.bedId,
            sectorId: audit.sectorId,
            bedNumber: bedNum,
            sectorName: secName,
            evaluator: audit.evaluator || 'Não informado',
            date: audit.date
          });
        }
      }

      const pieData = Object.keys(counts)
        .map(name => ({ name, value: counts[name] }))
        .filter(item => item.value > 0);
      
      let total = 0;
      for (let i = 0; i < pieData.length; i++) {
        total += pieData[i].value;
      }

      return {
        questionId: q.id,
        label: q.label,
        data: pieData,
        total,
        pendingAudits
      };
    });
  }, [applicableQuestions, filteredAudits, questions, bedMap, sectorMap]);

  const pendencySummary = useMemo(() => {
    if (filteredAudits.length === 0) {
      return {
        totalExpected: 0,
        totalAnswered: 0,
        totalMissing: 0,
        completenessRate: 0,
        criticalQuestions: [],
        highQuestions: [],
        lowQuestions: [],
        divergences: []
      };
    }

    const criticalQuestions: any[] = [];
    const highQuestions: any[] = [];
    const lowQuestions: any[] = [];
    const divergences: any[] = [];

    let totalExpected = filteredAudits.length * applicableQuestions.length;
    let totalAnswered = 0;
    let totalMissing = 0;

    applicableQuestions.forEach(q => {
      let missingCount = 0;
      const missingAudits: any[] = [];
      const invalidAnswers: any[] = [];

      filteredAudits.forEach(audit => {
        const rawAnswer = getAnswerForQuestion(audit.answers, q, questions);
        if (!rawAnswer || rawAnswer.trim() === '') {
          missingCount++;
          const bedNum = bedMap[audit.bedId] || audit.bedId || 'Leito não identificado';
          const secName = sectorMap[audit.sectorId] || audit.sectorId || 'Setor não identificado';
          missingAudits.push({
            id: audit.id,
            bedNumber: bedNum,
            sectorName: secName,
            evaluator: audit.evaluator || 'Não informado',
            date: audit.date
          });
        } else {
          totalAnswered++;
          
          const lowerAns = rawAnswer.toLowerCase().trim();
          const matchesOption = q.options.some(opt => {
            const lowerOpt = opt.toLowerCase().trim();
            if (lowerOpt === lowerAns) return true;
            if (isYesLike(lowerAns) && isYesLike(lowerOpt)) return true;
            if (isNoLike(lowerAns) && isNoLike(lowerOpt)) return true;
            if (isNaLike(lowerAns) && isNaLike(lowerOpt)) return true;
            return false;
          });

          if (!matchesOption) {
            const bedNum = bedMap[audit.bedId] || audit.bedId || 'Leito não identificado';
            invalidAnswers.push({
              auditId: audit.id,
              bedNumber: bedNum,
              evaluator: audit.evaluator || 'Não informado',
              answer: rawAnswer
            });
          }
        }
      });

      totalMissing += missingCount;

      if (missingCount > 0) {
        const percentageMissing = Math.round((missingCount / filteredAudits.length) * 100);
        const qInfo = {
          id: q.id,
          label: q.label,
          section: q.section,
          missingCount,
          percentageMissing,
          missingAudits
        };

        if (percentageMissing === 100) {
          criticalQuestions.push(qInfo);
        } else if (percentageMissing >= 50) {
          highQuestions.push(qInfo);
        } else {
          lowQuestions.push(qInfo);
        }
      }

      if (invalidAnswers.length > 0) {
        divergences.push({
          id: q.id,
          label: q.label,
          options: q.options,
          invalidAnswers
        });
      }
    });

    const completenessRate = Math.round((totalAnswered / totalExpected) * 100);

    return {
      totalExpected,
      totalAnswered,
      totalMissing,
      completenessRate,
      criticalQuestions,
      highQuestions,
      lowQuestions,
      divergences
    };
  }, [filteredAudits, applicableQuestions, questions, bedMap, sectorMap]);





  const handleExportExcel = () => {
    const dataToExport = filteredAudits.map(audit => {
      const row: any = {
        'Data / Hora': new Date(audit.date).toLocaleString('pt-BR'),
        'Setor': sectorMap[audit.sectorId] || 'N/A',
        'Leito': bedMap[audit.bedId] || 'N/A',
        'Avaliador': audit.evaluator,
      };

      applicableQuestions.forEach(q => {
        row[q.label] = getAnswerForQuestion(audit.answers, q, questions) || 'Não respondido';
      });

      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Relatório');
    XLSX.writeFile(workbook, `Relatorio_${formType}_${new Date().getTime()}.xlsx`);
  };

  const handleExportCSV = () => {
    const dataToExport = filteredAudits.map(audit => {
      const row: any = {
        'Data / Hora': new Date(audit.date).toLocaleString('pt-BR'),
        'Setor': sectorMap[audit.sectorId] || 'N/A',
        'Leito': bedMap[audit.bedId] || 'N/A',
        'Avaliador': audit.evaluator,
      };

      applicableQuestions.forEach(q => {
        row[q.label] = getAnswerForQuestion(audit.answers, q, questions) || 'Não respondido';
      });

      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Relatório');
    XLSX.writeFile(workbook, `Relatorio_${formType}_${new Date().getTime()}.csv`);
  };

  const addPdfHeaderAndFooter = (doc: jsPDF) => {
    const pageCount = (doc as any).internal.getNumberOfPages();
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();
    
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      
      // Draw white rectangles to ensure text is readable over charts
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, width, 18, 'F'); // Header bg
      doc.rect(0, height - 16, width, 16, 'F'); // Footer bg

      // Header
      doc.setFontSize(9);
      doc.setTextColor(30, 41, 59);
      doc.setFont('helvetica', 'bold');
      doc.text('HOSPITAL GERAL | IMTAVI', width / 2, 6, { align: 'center' });
      doc.setFontSize(8);
      doc.text('INSTITUTO MADRE TERESA DE APOIO À VIDA - IMTAVI', width / 2, 10, { align: 'center' });
      
      // Line separator
      doc.setLineWidth(0.3);
      doc.setDrawColor(226, 232, 240);
      doc.line(10, 13, width - 10, 13);

      // Footer
      doc.line(10, height - 14, width - 10, height - 14);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text('Av. Prefeito João Inácio de Lucena, 1255 - Centro - Brejo Santo/CE', width / 2, height - 10, { align: 'center' });
      doc.text('CNPJ: 06.272.659/0001-83 - (88) 3531-1082   -   www.hgbswl.com.br - contato@hgbswl.com.br', width / 2, height - 6, { align: 'center' });
    }
  };

  const handleExportPDF = () => {
    const doc = new jsPDF('landscape');
    
    doc.setFontSize(14);
    doc.text(`Relatório de Auditoria: ${formType === 'IRAS' ? 'IRAS' : 'Segurança do Paciente'}`, 14, 26);
    
    if (sectorId) {
      doc.setFontSize(11);
      doc.text(`Setor: ${sectorMap[sectorId] || ''}`, 14, 32);
    }

    const questionMap = applicableQuestions.map((q, index) => ({
      code: `Q${index + 1}`,
      label: q.label
    }));

    const tableCols = [
      'Data', 
      'Setor', 
      'Leito', 
      'Avaliador',
      ...questionMap.map(q => q.code)
    ];

    const tableRows = filteredAudits.map(audit => {
      return [
        formatDateTime(audit.date),
        sectorMap[audit.sectorId] || 'N/A',
        bedMap[audit.bedId] || 'N/A',
        audit.evaluator,
        ...applicableQuestions.map(q => getAnswerForQuestion(audit.answers, q, questions) || '-')
      ];
    });

    autoTable(doc, {
      startY: sectorId ? 32 : 26,
      head: [tableCols],
      body: tableRows,
      styles: { fontSize: 6.5, cellPadding: 1, halign: 'center' },
      headStyles: { fillColor: [37, 99, 235], fontSize: 6.5, halign: 'center', textColor: 255 }, // bg-blue-600
      columnStyles: {
        0: { cellWidth: 26, halign: 'left' }, // Data + Hora
        1: { cellWidth: 16, halign: 'left' }, // Setor
        2: { cellWidth: 12, halign: 'left' }, // Leito
        3: { cellWidth: 20, halign: 'left' }, // Avaliador
      },
      margin: { top: 25, left: 10, right: 10, bottom: 20 },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index >= 4) {
          const val = String(data.cell.raw || '').toLowerCase().trim();
          if (['sim', 's', 'estéril', 'e', 'c', 'avc'].includes(val)) {
            data.cell.styles.fillColor = [236, 253, 245]; // bg-emerald-50
            data.cell.styles.textColor = [4, 120, 87]; // text-emerald-700
          } else if (['não', 'n', 'não estéril', 'ne', 'p', 'avp', 'não conforme'].includes(val)) {
            data.cell.styles.fillColor = [254, 242, 242]; // bg-red-50
            data.cell.styles.textColor = [185, 28, 28]; // text-red-700
          } else if (['na', 'não se aplica', 'não ser aplica'].includes(val)) {
            data.cell.styles.fillColor = [254, 252, 232]; // bg-yellow-50
            data.cell.styles.textColor = [161, 98, 7]; // text-yellow-700
          }
        }
      }
    });

    // Legend
    let finalY = (doc as any).lastAutoTable.finalY + 6;
    // Estimate legend height (approx 8 rows * 3.5mm = 28mm + padding/headers = ~38mm)
    const estimatedLegendHeight = Math.ceil(questionMap.length / 3) * 3.5 + 10;
    
    if (finalY + estimatedLegendHeight > 183) {
      doc.addPage();
      finalY = 25;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59); // text-slate-800
    doc.text('LEGENDA DAS PERGUNTAS:', 14, finalY + 4);

    const legendRows = [];
    for (let i = 0; i < questionMap.length; i += 3) {
      const q1 = questionMap[i];
      const q2 = questionMap[i + 1];
      const q3 = questionMap[i + 2];
      
      legendRows.push([
        q1 ? `${q1.code}:` : '',
        q1 ? q1.label : '',
        q2 ? `${q2.code}:` : '',
        q2 ? q2.label : '',
        q3 ? `${q3.code}:` : '',
        q3 ? q3.label : ''
      ]);
    }

    const tableStartY = finalY + 7;
    autoTable(doc, {
      startY: tableStartY,
      body: legendRows,
      theme: 'plain',
      styles: { 
        fontSize: 6.5, 
        cellPadding: 1, 
        textColor: [71, 85, 105], // text-slate-600
        fillColor: [248, 250, 252], // bg-slate-50
        valign: 'middle'
      },
      columnStyles: {
        0: { fontStyle: 'bold', textColor: [37, 99, 235], cellWidth: 8, halign: 'left' }, // Blue bold Q1
        1: { cellWidth: 84, halign: 'left' },
        2: { fontStyle: 'bold', textColor: [37, 99, 235], cellWidth: 8, halign: 'left' }, // Blue bold Q2
        3: { cellWidth: 84, halign: 'left' },
        4: { fontStyle: 'bold', textColor: [37, 99, 235], cellWidth: 8, halign: 'left' }, // Blue bold Q3
        5: { cellWidth: 85, halign: 'left' }
      },
      margin: { left: 10, right: 10 },
    });

    // Draw elegant thin border around the entire legend table
    const tableEndY = (doc as any).lastAutoTable.finalY;
    const tableHeight = tableEndY - tableStartY;
    doc.setDrawColor(226, 232, 240); // border-slate-200
    doc.setLineWidth(0.2);
    doc.roundedRect(10, tableStartY, 277, tableHeight, 2, 2, 'D');

    addPdfHeaderAndFooter(doc);
    doc.save(`Relatorio_${formType}_${new Date().getTime()}.pdf`);
  };

  const handlePrint = () => {
    try {
      const isIframe = window.self !== window.top;
      if (isIframe) {
        showToast('info', 'Dica de Impressão', 'Caso a janela de impressão não abra, clique no ícone "Abrir em uma nova aba" no canto superior direito para imprimir fora do iFrame.');
      }
    } catch (e) {}

    if (!isPreviewOpen) {
      setIsPreviewOpen(true);
      setTimeout(() => {
        try {
          window.focus();
          window.print();
        } catch (error) {
          console.error("Erro ao abrir janela de impressão:", error);
          showToast('error', 'Impressão Bloqueada', 'Por favor, abra o aplicativo em uma nova aba para imprimir.');
        }
      }, 350);
    } else {
      try {
        window.focus();
        window.print();
      } catch (error) {
        console.error("Erro ao abrir janela de impressão:", error);
        showToast('error', 'Impressão Bloqueada', 'Por favor, abra o aplicativo em uma nova aba para imprimir.');
      }
    }
  };

  const chartsContainerRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const handlePrintChart = async () => {
    if (!chartsContainerRef.current) return;
    setIsExporting(true);
    try {
      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
      });

      const charts = chartsContainerRef.current.querySelectorAll('.chart-card');
      if (charts.length === 0) {
        setIsExporting(false);
        return;
      }

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      
      const topMargin = 32;
      const bottomMargin = 28;
      const leftMargin = 15;
      
      addPdfHeaderAndFooter(pdf);
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(30);
      pdf.text('Gráfico Consolidado por Item', leftMargin, 28);
      
      let colIdx = 0;
      let rowIdx = 0;

      for (let i = 0; i < charts.length; i++) {
        if (i > 0 && i % 6 === 0) {
           pdf.addPage();
           addPdfHeaderAndFooter(pdf);
           pdf.setFontSize(14);
           pdf.setFont('helvetica', 'bold');
           pdf.setTextColor(30);
           pdf.text('Gráfico Consolidado por Item (Cont.)', leftMargin, 28);
           rowIdx = 0;
           colIdx = 0;
        }

        const chartEl = charts[i] as HTMLElement;
        const dataUrl = await toPng(chartEl, { 
          cacheBust: true, 
          backgroundColor: '#f8fafc' 
        });
        
        const imgProps = pdf.getImageProperties(dataUrl);
        
        const cols = 2; // 2 columns
        const rows = 3; // 3 rows
        const startY = 36;
        const gapX = 10;
        const gapY = 10;

        const availableWidth = (pageWidth - leftMargin * 2 - (cols - 1) * gapX) / cols;
        const availableHeight = (pageHeight - startY - bottomMargin - (rows - 1) * gapY) / rows;

        const scaleX = availableWidth / imgProps.width;
        const scaleY = availableHeight / imgProps.height;
        const scale = Math.min(scaleX, scaleY);
        
        const drawWidth = imgProps.width * scale;
        const drawHeight = imgProps.height * scale;
        
        const xPos = leftMargin + (colIdx * (availableWidth + gapX)) + (availableWidth - drawWidth) / 2;
        const yPos = startY + (rowIdx * (availableHeight + gapY)) + (availableHeight - drawHeight) / 2;

        pdf.addImage(dataUrl, 'PNG', xPos, yPos, drawWidth, drawHeight);
        
        colIdx++;
        if (colIdx >= cols) {
          colIdx = 0;
          rowIdx++;
        }
      }

      pdf.save(`Graficos_${formType}_${new Date().getTime()}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Erro ao exportar gráficos para PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleWhatsAppShare = () => {
    // Baixar o PDF completo automaticamente
    handleExportPDF();

    let text = `*Relatório HospAudit: ${formType === 'IRAS' ? 'IRAS' : 'Segurança do Paciente'}*\n\n`;
    if (sectorId) text += `*Setor:* ${sectorMap[sectorId] || 'Todos'}\n`;
    if (startDate) text += `*Data Inicial:* ${startDate.split('-').reverse().join('/')}\n`;
    if (endDate) text += `*Data Final:* ${endDate.split('-').reverse().join('/')}\n`;
    
    text += `*Total de Auditorias:* ${filteredAudits.length}\n\n`;

    // Calculate a brief compliance summary based on the answers
    let conformes = 0;
    let naoConformes = 0;
    let totalResp = 0;

    filteredAudits.forEach(audit => {
      Object.values(audit.answers).forEach(resp => {
        const lowerRes = String(resp).toLowerCase().trim();
        if (['sim', 's', 'estéril', 'e', 'c', 'avc'].includes(lowerRes)) conformes++;
        if (['não', 'n', 'não estéril', 'ne', 'p', 'avp', 'não conforme'].includes(lowerRes)) naoConformes++;
        if (lowerRes) totalResp++;
      });
    });

    if (totalResp > 0) {
      const pC = ((conformes / totalResp) * 100).toFixed(1);
      const pNC = ((naoConformes / totalResp) * 100).toFixed(1);
      text += `🎯 *Resumo de Conformidade Geral*\n`;
      text += `✅ Conforme: ${pC}%\n`;
      text += `❌ Não Conforme: ${pNC}%\n\n`;
    }

    text += `📎 *O PDF com o relatório completo foi baixado automaticamente no seu dispositivo.* Por favor, anexe o arquivo PDF baixado aqui na conversa para enviá-lo por completo.`;
    
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handlePrintReport = (title: string, headers: string[], rows: string[][], metricsList?: { label: string; value: string | number }[]) => {
    try {
      const isIframe = window.self !== window.top;
      if (isIframe) {
        showToast('info', 'Dica de Impressão', 'Caso a janela de impressão não abra, clique no ícone "Abrir em uma nova aba" no canto superior direito para imprimir fora do iFrame.');
      }
    } catch (e) {}

    setActivePrintPayload({
      title,
      subtitle: 'HOSPITAL GERAL | IMTAVI',
      headers,
      rows,
      metrics: metricsList || []
    });
    
    setTimeout(() => {
      try {
        window.focus();
        window.print();
      } catch (error) {
        console.error("Erro ao abrir janela de impressão:", error);
        showToast('error', 'Impressão Bloqueada', 'Por favor, abra o aplicativo em uma nova aba para imprimir.');
      }
    }, 250);
  };

  return (
    <div className="p-4 md:p-6 space-y-6">

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 print:hidden">
            <h2 className="text-lg font-bold text-slate-800 mb-6 border-b border-slate-100 pb-2 flex items-center">
              <FileText className="w-5 h-5 mr-2 text-blue-600" />
              Gerar Relatório de Auditorias
            </h2>
        
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Formulário</label>
            <select 
              value={formType}
              onChange={e => setFormType(e.target.value as 'IRAS' | 'SAFETY')}
              className="w-full px-4 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm shadow-sm bg-white"
            >
              <option value="IRAS">Auditoria IRAS</option>
              <option value="SAFETY">Checklist Segurança do Paciente</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Filtrar por Setor</label>
            <div className="relative">
              <Filter className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <select 
                value={sectorId}
                onChange={e => setSectorId(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm shadow-sm bg-white"
              >
                <option value="">Todos os Setores</option>
                {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex-1">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Data Inicial</label>
            <input 
              type="date" 
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full px-4 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm shadow-sm bg-white"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Data Final</label>
            <input 
              type="date" 
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full px-4 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm shadow-sm bg-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap gap-3">
          <button 
            onClick={() => setIsPreviewOpen(true)}
            className="flex items-center justify-center px-4 py-2.5 bg-blue-600 text-white rounded-md text-sm font-semibold hover:bg-blue-700 transition w-full lg:w-auto"
          >
            <Eye className="w-4 h-4 mr-2" />
            Visualizar Relatório
          </button>
          <button 
            onClick={handleExportExcel}
            className="flex items-center justify-center px-4 py-2.5 bg-emerald-600 text-white rounded-md text-sm font-semibold hover:bg-emerald-700 transition w-full lg:w-auto"
          >
            <Download className="w-4 h-4 mr-2" />
            Exportar Excel
          </button>
          <button 
            onClick={handleExportPDF}
            className="flex items-center justify-center px-4 py-2.5 bg-rose-600 text-white rounded-md text-sm font-semibold hover:bg-rose-700 transition w-full lg:w-auto"
          >
            <Download className="w-4 h-4 mr-2" />
            Exportar PDF
          </button>
          <button 
            onClick={handleWhatsAppShare}
            className="flex items-center justify-center px-4 py-2.5 bg-green-600 text-white rounded-md text-sm font-semibold hover:bg-green-700 transition w-full sm:col-span-2 lg:col-span-auto lg:w-auto shadow-sm"
          >
            <MessageCircle className="w-4 h-4 mr-2" />
            Enviar
          </button>
        </div>
      </div>

      {filteredAudits.length > 0 && (
        <div id="pendencies-panel" className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden print:hidden">
          {/* Header */}
          <div 
            onClick={() => setIsPendencyPanelOpen(!isPendencyPanelOpen)}
            className="flex items-center justify-between p-5 bg-slate-50/50 hover:bg-slate-50 border-b border-slate-100 cursor-pointer select-none transition"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                  Painel de Auditoria de Dados & Pendências
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                    pendencySummary.completenessRate >= 90 ? 'bg-green-100 text-green-700' :
                    pendencySummary.completenessRate >= 70 ? 'bg-amber-100 text-amber-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    Preenchimento: {pendencySummary.completenessRate}%
                  </span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Análise de qualidade de dados, perguntas não respondidas e possíveis divergências nas auditorias filtradas
                </p>
              </div>
            </div>
            <div className="text-slate-400 hover:text-slate-600 transition">
              {isPendencyPanelOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </div>
          </div>

          {/* Content */}
          {isPendencyPanelOpen && (
            <div className="p-5 space-y-6">
              {/* Stats Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Qualidade Geral</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-black text-slate-800">{pendencySummary.completenessRate}%</span>
                    <span className="text-xs text-slate-500 font-medium">dos campos</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2">
                    <div 
                      className={`h-1.5 rounded-full ${
                        pendencySummary.completenessRate >= 90 ? 'bg-green-500' :
                        pendencySummary.completenessRate >= 70 ? 'bg-amber-500' :
                        'bg-red-500'
                      }`} 
                      style={{ width: `${pendencySummary.completenessRate}%` }}
                    />
                  </div>
                </div>

                <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Total de Campos</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-black text-slate-800">{pendencySummary.totalAnswered}</span>
                    <span className="text-xs text-slate-500">/ {pendencySummary.totalExpected} respondidos</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1.5 font-medium">Total esperado de respostas</p>
                </div>

                <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Perguntas Sem Dados</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className={`text-2xl font-black ${pendencySummary.criticalQuestions.length > 0 ? 'text-red-600' : 'text-slate-800'}`}>
                      {pendencySummary.criticalQuestions.length}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">itens vazios</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1.5 font-medium">100% de pendência no período</p>
                </div>

                <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Campos Não Preenchidos</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className={`text-2xl font-black ${pendencySummary.totalMissing > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
                      {pendencySummary.totalMissing}
                    </span>
                    <span className="text-xs text-slate-500 font-medium font-mono">pendências</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1.5 font-medium">Campos em branco no total</p>
                </div>
              </div>

              {/* Criticos - 100% missing */}
              {pendencySummary.criticalQuestions.length > 0 && (
                <div className="bg-red-50/50 rounded-lg p-4 border border-red-100 space-y-3">
                  <div className="flex items-center gap-2 text-red-700">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    <h4 className="font-bold text-sm">
                      🔴 Perguntas sem NENHUM dado ({pendencySummary.criticalQuestions.length} item/itens)
                    </h4>
                  </div>
                  <p className="text-xs text-red-600 leading-relaxed max-w-4xl">
                    Estes itens estão vazios em 100% das auditorias filtradas. Por essa razão, os gráficos correspondentes abaixo exibem <strong>"Sem dados"</strong>. Para que o gráfico de pizza apareça, certifique-se de preencher estas perguntas ao realizar ou atualizar as auditorias.
                  </p>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    {pendencySummary.criticalQuestions.map((q: any) => {
                      const isExpanded = expandedQuestionId === q.id;
                      return (
                        <div key={q.id} className="bg-white border border-red-200 rounded-md p-3 flex flex-col justify-between shadow-xs transition duration-150">
                          <div>
                            <div className="flex justify-between items-start gap-2">
                              <span className="text-[9px] font-bold uppercase tracking-wider text-red-500 px-1.5 py-0.5 bg-red-100/60 rounded-sm mb-1.5 inline-block">
                                {q.section}
                              </span>
                              <button
                                onClick={() => setExpandedQuestionId(isExpanded ? null : q.id)}
                                className="p-1 hover:bg-red-50 text-red-500 rounded transition"
                                title={isExpanded ? "Ocultar leitos" : "Ver leitos pendentes"}
                              >
                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                            </div>
                            <h5 className="font-bold text-slate-800 text-xs leading-snug">{q.label}</h5>
                          </div>
                          <div className="mt-3 pt-2 border-t border-red-50 flex items-center justify-between text-[11px] text-red-500">
                            <span className="font-semibold">Pendente em: {q.missingCount} de {q.missingCount} auditorias</span>
                            <button
                              onClick={() => setExpandedQuestionId(isExpanded ? null : q.id)}
                              className="text-[10px] font-bold underline hover:text-red-700"
                            >
                              {isExpanded ? 'Ocultar' : 'Corrigir'}
                            </button>
                          </div>
                          
                          {isExpanded && (
                            <div className="mt-3 pt-3 border-t border-red-100 bg-red-50/40 -mx-3 -mb-3 p-3 space-y-2 max-h-56 overflow-y-auto rounded-b-md">
                              <p className="text-[10px] font-bold text-red-800 uppercase tracking-wider mb-1">
                                Selecione um leito para corrigir:
                              </p>
                              <div className="space-y-1.5">
                                {q.missingAudits.map((audit: any) => (
                                  <div key={audit.id} className="bg-white border border-red-100 rounded p-2 flex items-center justify-between shadow-3xs text-[11px]">
                                    <div className="min-w-0 flex-1 pr-2">
                                      <div className="font-bold text-slate-800 truncate">{audit.bedNumber} ({audit.sectorName})</div>
                                      <div className="text-[9px] text-slate-500 truncate">Avaliador: {audit.evaluator}</div>
                                    </div>
                                    <button
                                      onClick={() => handleStartCorrection(audit)}
                                      className="py-1 px-2 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded transition flex items-center gap-1 font-bold text-[10px] shrink-0 shadow-xs border border-red-700"
                                      title={`Corrigir leito ${audit.bedNumber}`}
                                    >
                                      <Pencil className="w-3 h-3 text-white" />
                                      <span>Corrigir Leito {audit.bedNumber}</span>
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Parcialmente Preenchidos */}
              {(pendencySummary.highQuestions.length > 0 || pendencySummary.lowQuestions.length > 0) && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-slate-800 font-bold text-sm border-b border-slate-100 pb-2">
                    <Info className="w-4 h-4 text-blue-500" />
                    <h4>Itens com Preenchimento Parcial (Campos em Branco detectados)</h4>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    As perguntas abaixo foram respondidas em algumas auditorias, mas ficaram em branco em outras. Clique em <strong>"Ver Leitos"</strong> para identificar exatamente onde faltam essas respostas e orientar a equipe.
                  </p>

                  <div className="space-y-2.5">
                    {[...pendencySummary.highQuestions, ...pendencySummary.lowQuestions].map((q: any) => {
                      const isExpanded = expandedQuestionId === q.id;
                      const isHigh = q.percentageMissing >= 50;

                      return (
                        <div key={q.id} className="border border-slate-200 rounded-lg overflow-hidden bg-white hover:border-slate-300 transition shadow-xs">
                          <div className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="space-y-1 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm ${
                                  isHigh ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                                }`}>
                                  {isHigh ? `Alta Pendência (${q.percentageMissing}%)` : `Baixa Pendência (${q.percentageMissing}%)`}
                                </span>
                                <span className="text-[10px] text-slate-400 font-medium">{q.section}</span>
                              </div>
                              <h5 className="font-bold text-slate-800 text-xs sm:text-sm">{q.label}</h5>
                            </div>

                            <div className="flex items-center gap-4 shrink-0">
                              <div className="text-right hidden sm:block">
                                <p className="text-xs font-bold text-slate-700">
                                  {q.missingCount} vazias / {q.missingAudits.length - q.missingCount} respondidas
                                </p>
                                <p className="text-[10px] text-slate-400">Total: {q.missingAudits.length} auditorias</p>
                              </div>

                              <button
                                onClick={() => setExpandedQuestionId(isExpanded ? null : q.id)}
                                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded transition flex items-center gap-1 shrink-0"
                              >
                                {isExpanded ? 'Ocultar Leitos' : 'Ver Leitos'}
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="bg-slate-50 border-t border-slate-150 p-4 space-y-3">
                              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                                Leitos que necessitam preenchimento para esta pergunta ({q.missingAudits.length}):
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                                {q.missingAudits.slice(0, missingBedsLimit).map((audit: any) => (
                                  <div key={audit.id} className="bg-white border border-slate-200 rounded p-2.5 shadow-2xs text-[11px] flex flex-col justify-between">
                                    <div>
                                      <div className="flex items-center justify-between font-bold text-slate-700">
                                        <span>{audit.bedNumber}</span>
                                        <span className="text-[10px] text-slate-400 font-normal">({audit.sectorName})</span>
                                      </div>
                                      <div className="text-slate-500 mt-1 flex flex-col gap-0.5">
                                        <span className="truncate">Avaliador: <strong className="text-slate-600">{audit.evaluator}</strong></span>
                                        <span>Data: {new Date(audit.date).toLocaleDateString('pt-BR')} {audit.date.substring(11, 16)}</span>
                                      </div>
                                    </div>
                                    <div className="mt-2.5 pt-2 border-t border-slate-100 flex justify-end">
                                      <button
                                        onClick={() => handleStartCorrection(audit)}
                                        className="w-full py-1.5 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded transition flex items-center justify-center gap-1 font-bold text-[10px] shadow-xs border border-red-700"
                                        title={`Corrigir leito ${audit.bedNumber}`}
                                      >
                                        <Pencil className="w-3.5 h-3.5 text-white" />
                                        <span>Corrigir Leito {audit.bedNumber}</span>
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                              {q.missingAudits.length > missingBedsLimit && (
                                <div className="flex justify-center pt-1">
                                  <button
                                    type="button"
                                    onClick={() => setMissingBedsLimit(prev => prev + 24)}
                                    className="px-4 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 transition cursor-pointer"
                                  >
                                    Mostrar mais leitos ({q.missingAudits.length - missingBedsLimit} restantes)
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Divergencias */}
              {pendencySummary.divergences.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2.5">
                  <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                    <HelpCircle className="w-4.5 h-4.5 text-amber-500 shrink-0" />
                    <h4>Divergência de Formato de Resposta (Incompatibilidade)</h4>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Foi detectado que alguns registros salvos possuem respostas que não coincidem estritamente com as opções cadastradas na pergunta (ex: respostas de versões anteriores). O HospAudit normalizou estes dados para exibir os gráficos abaixo corretamente, mas é aconselhável revisar:
                  </p>
                  <div className="space-y-2">
                    {pendencySummary.divergences.map((div: any) => (
                      <div key={div.id} className="bg-white border border-slate-150 rounded p-3 text-xs">
                        <div className="font-bold text-slate-700 mb-1.5">{div.label}</div>
                        <div className="text-[11px] text-slate-400 mb-2">Opções válidas atualmente: {div.options.join(', ')}</div>
                        <div className="flex flex-wrap gap-2">
                          {div.invalidAnswers.map((ans: any, idx: number) => (
                            <span key={idx} className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full text-[10px] font-medium border border-slate-200 inline-block">
                              <strong>{ans.bedNumber}</strong>: "{ans.answer}" (Avaliador: {ans.evaluator})
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {pendencySummary.totalMissing === 0 && (
                <div className="bg-green-50 rounded-lg p-5 border border-green-100 flex items-start gap-3.5">
                  <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-green-800 text-sm">Excelente! Qualidade de Dados em 100%</h4>
                    <p className="text-xs text-green-700 mt-1 leading-relaxed">
                      Nenhuma pendência ou campo vazio foi encontrado nas auditorias correspondentes aos filtros ativos. Todas as perguntas para {formType === 'IRAS' ? 'Auditoria IRAS' : 'Segurança do Paciente'} estão completamente preenchidas de forma consistente e em harmonia absoluta com as opções oficiais. Todos os gráficos de pizza abaixo estão operando com dados perfeitos!
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div id="charts-container" ref={chartsContainerRef} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 print-container print:hidden">
         <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-slate-100 pb-4">
           <h2 className="text-base sm:text-lg font-bold text-slate-800 flex items-center">
             <PieChartIcon className="w-5 h-5 mr-2 text-blue-600 print:hidden shrink-0" />
             <span className="truncate">Gráfico Consolidado por Item</span>
           </h2>
           <button 
             id="print-chart-btn"
             onClick={handlePrintChart}
             disabled={isExporting}
             className="flex items-center justify-center px-4 py-2.5 sm:py-2 bg-rose-600 text-white rounded-md text-sm font-semibold hover:bg-rose-700 transition print:hidden disabled:opacity-75 disabled:cursor-wait w-full sm:w-auto shrink-0 shadow-sm"
           >
             <Download className={`w-4 h-4 mr-2 shrink-0 ${isExporting ? 'animate-bounce' : ''}`} />
             <span>{isExporting ? 'Exportando...' : 'Exportar PDF'}</span>
           </button>
         </div>
        {filteredAudits.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            Nenhuma auditoria encontrada com os filtros selecionados.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 print:grid-cols-3 gap-6 print:gap-4 print:break-inside-avoid">
            {chartData.map((chart) => (
              <MemoizedQuestionPieChart 
                key={chart.questionId} 
                chart={chart} 
                onStartCorrection={handleStartCorrection} 
              />
            ))}
          </div>
        )}
      </div>


    {/* Elegant A4 Print Area Layout (Hidden on screen, styled strictly to fit A4 Portrait) */}
    {activePrintPayload && (
      <div id="print-label-area" className="printable-area hidden print:block bg-white text-black p-8 font-sans" style={{ width: '210mm', minHeight: '297mm', margin: '0 auto' }}>
        {/* Hospital Header */}
        <div className="border-b-2 border-slate-900 pb-4 mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-base font-bold tracking-tight text-slate-900 uppercase">HOSPITAL GERAL | IMTAVI</h1>
            <h2 className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide">INSTITUTO MADRE TERESA DE APOIO À VIDA - IMTAVI</h2>
            <p className="text-[9px] text-slate-500 mt-1">Av. Prefeito João Inácio de Lucena, 1255 - Centro - Brejo Santo/CE</p>
          </div>
          <div className="text-right">
            <span className="inline-block bg-slate-900 text-white text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider mb-1.5">Relatório Oficial</span>
            <p className="text-[9px] font-bold text-slate-700">Emissão: {new Date().toLocaleDateString('pt-BR')}</p>
          </div>
        </div>

        {/* Report Title */}
        <div className="mb-6">
          <h3 className="text-sm font-bold text-slate-800 border-l-4 border-slate-900 pl-3 uppercase">{activePrintPayload.title}</h3>
        </div>

        {/* Metrics section */}
        {activePrintPayload.metrics && activePrintPayload.metrics.length > 0 && (
          <div className="grid grid-cols-4 gap-4 mb-6 bg-slate-50 border border-slate-200 rounded-lg p-4">
            {activePrintPayload.metrics.map((m, idx) => (
              <div key={idx} className="text-center">
                <span className="block text-[8px] font-bold text-slate-500 uppercase tracking-wider">{m.label}</span>
                <span className="block text-xs font-bold text-slate-950 mt-1">{m.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Table */}
        <table className="w-full text-left text-[10px] border-collapse">
          <thead>
            <tr className="border-b-2 border-slate-900 bg-slate-100">
              {activePrintPayload.headers.map((h, i) => (
                <th key={i} className="py-2 px-2.5 font-bold text-slate-900 uppercase tracking-wider text-[9px]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activePrintPayload.rows.map((row, rIdx) => (
              <tr key={rIdx} className="border-b border-slate-200">
                {row.map((val, cIdx) => (
                  <td key={cIdx} className="py-2 px-2.5 text-slate-800 text-[9.5px] leading-tight">{val}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Footer / Signatures */}
        <div className="mt-16 pt-12 border-t border-slate-200 grid grid-cols-2 gap-8 text-center text-[10px]">
          <div className="flex flex-col items-center">
            <div className="w-48 border-b border-slate-400 mb-2"></div>
            <span className="text-[9px] font-bold text-slate-600 uppercase">Assinatura do Responsável</span>
          </div>
          <div className="flex flex-col items-center">
            <div className="w-48 border-b border-slate-400 mb-2"></div>
            <span className="text-[9px] font-bold text-slate-600 uppercase">Visto da Coordenação</span>
          </div>
        </div>
      </div>
    )}

      {/* Preview Modal */}
      {isPreviewOpen && (
        <div className="printable-area-parent fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 print:relative print:p-0 print:bg-transparent print:backdrop-filter-none print:z-0">
          <div className="printable-area-parent bg-white rounded-xl shadow-xl border border-slate-200 max-w-6xl w-full max-h-[90vh] flex flex-col overflow-hidden print:static print:max-h-none print:w-full print:shadow-none print:border-none print:rounded-none print:overflow-visible print:bg-transparent">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 print:hidden">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                <div>
                  <h3 className="font-bold text-slate-800 text-base">Visualização do Relatório</h3>
                  <p className="text-xs text-slate-500">
                    {formType === 'IRAS' ? 'Auditoria IRAS' : 'Checklist Segurança do Paciente'} • {filteredAudits.length} registro(s) encontrado(s)
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsPreviewOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Modal Body */}
            <div className="printable-area p-6 overflow-y-auto flex-1 space-y-6 print:p-0 print:space-y-4 print:overflow-visible">
              {/* Document Header (mocking the printed PDF layout) */}
              <div className="border border-slate-200 rounded-lg p-5 bg-white space-y-4 shadow-sm print:p-3 print:space-y-2 print:border-slate-300 print:shadow-none">
                <div className="text-center pb-4 border-b border-slate-100 print:pb-2 print:border-slate-300">
                  <h4 className="font-bold text-slate-800 text-sm tracking-wide uppercase print:text-xs">HOSPITAL GERAL | IMTAVI</h4>
                  <p className="text-xs text-slate-500 font-medium print:text-[10px]">INSTITUTO MADRE TERESA DE APOIO À VIDA - IMTAVI</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 print:grid-cols-2 gap-4 text-xs text-slate-600 print:text-[10px] print:gap-1">
                  <div>
                    <p className="mb-1"><strong>Tipo de Auditoria:</strong> {formType === 'IRAS' ? 'IRAS' : 'Segurança do Paciente'}</p>
                    <p><strong>Setor:</strong> {sectorId ? sectorMap[sectorId] : 'Todos os Setores'}</p>
                  </div>
                  <div>
                    <p className="mb-1"><strong>Período:</strong> {startDate ? startDate.split('-').reverse().join('/') : 'Início'} até {endDate ? endDate.split('-').reverse().join('/') : 'Fim'}</p>
                    <p><strong>Total de Registros:</strong> {filteredAudits.length}</p>
                  </div>
                </div>
              </div>

              {filteredAudits.length === 0 ? (
                <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                  Nenhuma auditoria encontrada com os filtros selecionados.
                </div>
              ) : (
                <>
                  {/* Scrollable & Paginated Preview Table */}
                  {(() => {
                    const previewTotalPages = Math.max(1, Math.ceil(filteredAudits.length / previewPageSize));
                    const safePreviewPage = Math.min(previewPage, previewTotalPages);
                    const previewStart = (safePreviewPage - 1) * previewPageSize;
                    const visiblePreviewAudits = filteredAudits.slice(previewStart, previewStart + previewPageSize);

                    return (
                      <div className="border border-slate-200 rounded-lg overflow-hidden shadow-sm print:shadow-none print:border-slate-300">
                        <div className="overflow-x-auto print:overflow-visible">
                          <table className="w-full text-left border-collapse text-xs print:text-[10px]">
                            <thead>
                              <tr className="bg-blue-600 text-white font-semibold print:bg-blue-600">
                                <th className="px-4 py-3 print:py-1 print:px-2 text-center whitespace-nowrap">Data</th>
                                <th className="px-4 py-3 print:py-1 print:px-2 whitespace-nowrap">Setor</th>
                                <th className="px-4 py-3 print:py-1 print:px-2 whitespace-nowrap">Leito</th>
                                <th className="px-4 py-3 print:py-1 print:px-2 whitespace-nowrap">Avaliador</th>
                                {applicableQuestions.map((_, index) => (
                                  <th key={index} className="px-3 py-3 print:py-1 print:px-1 text-center whitespace-nowrap" title={applicableQuestions[index].label}>
                                    Q{index + 1}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white print:divide-slate-300">
                              {visiblePreviewAudits.map((audit) => (
                                <tr key={audit.id} className="hover:bg-slate-50 transition-colors">
                                  <td className="px-4 py-3 print:py-1 print:px-2 text-center font-medium text-slate-600 whitespace-nowrap">
                                    {formatDateTime(audit.date)}
                                  </td>
                                  <td className="px-4 py-3 print:py-1 print:px-2 font-medium text-slate-700 whitespace-nowrap">
                                    {sectorMap[audit.sectorId] || 'N/A'}
                                  </td>
                                  <td className="px-4 py-3 print:py-1 print:px-2 text-slate-600 whitespace-nowrap">
                                    {bedMap[audit.bedId] || 'N/A'}
                                  </td>
                                  <td className="px-4 py-3 print:py-1 print:px-2 text-slate-600 whitespace-nowrap">
                                    {audit.evaluator}
                                  </td>
                                  {applicableQuestions.map((q) => {
                                    const answer = getAnswerForQuestion(audit.answers, q, questions) || '-';
                                    const lowerAns = answer.toLowerCase().trim();
                                    let badgeClass = "bg-slate-100 text-slate-600";
                                    if (['sim', 's', 'estéril', 'e', 'c', 'avc'].includes(lowerAns)) {
                                      badgeClass = "bg-emerald-50 text-emerald-700 border border-emerald-100 print:bg-emerald-50 print:text-emerald-700 print:border-emerald-200";
                                    } else if (['não', 'n', 'não estéril', 'ne', 'p', 'avp', 'não conforme'].includes(lowerAns)) {
                                      badgeClass = "bg-red-50 text-red-700 border border-red-100 print:bg-red-50 print:text-red-700 print:border-red-200";
                                    } else if (['na', 'não se aplica', 'não ser aplica'].includes(lowerAns)) {
                                      badgeClass = "bg-yellow-50 text-yellow-700 border border-yellow-100 print:bg-yellow-50 print:text-yellow-700 print:border-yellow-200";
                                    }
                                    return (
                                      <td key={q.id} className="px-2 py-3 print:py-1 print:px-1 text-center whitespace-nowrap">
                                        <span className={`px-2 py-0.5 print:py-0 print:px-1.5 rounded text-[10px] print:text-[9px] font-semibold ${badgeClass}`}>
                                          {answer}
                                        </span>
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {filteredAudits.length > 10 && (
                          <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 print:hidden">
                            <div>
                              Exibindo <strong>{previewStart + 1}</strong>–<strong>{Math.min(filteredAudits.length, previewStart + previewPageSize)}</strong> de <strong>{filteredAudits.length}</strong> registros
                            </div>
                            <div className="flex items-center gap-2">
                              <select
                                value={previewPageSize}
                                onChange={(e) => {
                                  setPreviewPageSize(Number(e.target.value));
                                  setPreviewPage(1);
                                }}
                                className="bg-white border border-slate-200 rounded px-2 py-1 text-xs font-semibold cursor-pointer"
                              >
                                <option value={25}>25 / pág.</option>
                                <option value={50}>50 / pág.</option>
                                <option value={100}>100 / pág.</option>
                                <option value={500}>500 / pág.</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => setPreviewPage(p => Math.max(1, p - 1))}
                                disabled={safePreviewPage === 1}
                                className="px-2.5 py-1 bg-white border border-slate-200 rounded font-semibold disabled:opacity-40 hover:bg-slate-100 cursor-pointer"
                              >
                                Anterior
                              </button>
                              <span className="font-semibold">Pág. {safePreviewPage} / {previewTotalPages}</span>
                              <button
                                type="button"
                                onClick={() => setPreviewPage(p => Math.min(previewTotalPages, p + 1))}
                                disabled={safePreviewPage === previewTotalPages}
                                className="px-2.5 py-1 bg-white border border-slate-200 rounded font-semibold disabled:opacity-40 hover:bg-slate-100 cursor-pointer"
                              >
                                Próxima
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Questions Legend */}
                  <div className="bg-slate-50 rounded-lg p-5 border border-slate-100 space-y-3 print:p-3 print:space-y-1.5 print:border-slate-300 print:bg-slate-50">
                    <h4 className="font-bold text-slate-700 text-xs uppercase tracking-wider print:text-[10px]">Legenda das Perguntas:</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 print:grid-cols-3 gap-x-6 gap-y-2 text-xs text-slate-600 print:text-[8.5px] print:gap-x-3 print:gap-y-1">
                      {applicableQuestions.map((q, index) => (
                        <div key={q.id} className="flex gap-2">
                          <span className="font-bold text-blue-600 shrink-0">Q{index + 1}:</span>
                          <span>{q.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            
            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex flex-wrap justify-end gap-3 shrink-0 print:hidden">
              <button
                onClick={() => setIsPreviewOpen(false)}
                className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-300 transition"
              >
                Fechar
              </button>
              <button
                onClick={() => {
                  setIsPreviewOpen(false);
                  handleExportExcel();
                }}
                disabled={filteredAudits.length === 0}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition disabled:opacity-50"
              >
                Exportar Excel
              </button>
              <button
                onClick={() => {
                  setIsPreviewOpen(false);
                  handleExportPDF();
                }}
                disabled={filteredAudits.length === 0}
                className="px-4 py-2 bg-rose-600 text-white rounded-lg text-sm font-semibold hover:bg-rose-700 transition disabled:opacity-50"
              >
                Exportar PDF
              </button>
              <button
                onClick={handlePrint}
                disabled={filteredAudits.length === 0}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-1.5"
              >
                <Printer size={15} />
                Imprimir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Correction Modal */}
      {correctingAudit && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-scale-up">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-150 bg-slate-50 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold text-slate-800 text-base flex items-center gap-1.5">
                  <Pencil className="w-4 h-4 text-blue-600" />
                  Corrigir Respostas da Auditoria
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Leito: <strong className="text-slate-700">{bedMap[correctingAudit.bedId] || 'Não identificado'}</strong> | Setor: <strong className="text-slate-700">{sectorMap[correctingAudit.sectorId] || 'Não identificado'}</strong>
                </p>
              </div>
              <button
                onClick={() => setCorrectingAudit(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto space-y-5">
              <div className="p-3.5 bg-blue-50/50 border border-blue-100 rounded-lg flex items-start gap-3">
                <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <div className="text-xs text-blue-700 leading-relaxed">
                  <span className="font-bold">Correção Ativa:</span> Modifique ou preencha as respostas em branco abaixo para otimizar os indicadores e remover as pendências dos relatórios. Os gráficos e painéis serão consolidados imediatamente após salvar.
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-xs text-slate-600 pb-3 border-b border-slate-100">
                  <div>
                    Avaliador: <strong className="text-slate-800">{correctingAudit.evaluator}</strong>
                  </div>
                  <div className="text-right">
                    Data: <strong className="text-slate-800">{new Date(correctingAudit.date).toLocaleString('pt-BR')}</strong>
                  </div>
                </div>

                <div className="space-y-4 pt-1">
                  {applicableQuestions.map((q, idx) => {
                    const currentVal = correctingAnswers[q.id] || '';
                    const isEmpty = !currentVal || currentVal.trim() === '';

                    return (
                      <div 
                        key={q.id} 
                        className={`p-4 rounded-lg border transition ${
                          isEmpty 
                            ? 'bg-amber-50/40 border-amber-200' 
                            : 'bg-slate-50/40 border-slate-100'
                        }`}
                      >
                        <div className="flex justify-between items-start gap-2 mb-2">
                          <div className="min-w-0 flex-1">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                              {q.section}
                            </span>
                            <h4 className="font-bold text-slate-800 text-xs sm:text-sm">
                              Q{idx + 1}: {q.label}
                            </h4>
                          </div>
                          {isEmpty && (
                            <span className="bg-amber-100 text-amber-700 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0">
                              Pendente
                            </span>
                          )}
                        </div>

                        {/* Interactive Options Pills */}
                        <div className="flex flex-wrap gap-2 mt-3">
                          {q.options.map(opt => {
                            const isSelected = correctingAnswers[q.id] === opt;
                            
                            // Color mapping for selected option
                            let activeClass = 'bg-blue-600 text-white border-blue-600';
                            const lowerOpt = opt.toLowerCase().trim();
                            if (isYesLike(lowerOpt)) {
                              activeClass = 'bg-emerald-600 text-white border-emerald-600 shadow-sm';
                            } else if (isNoLike(lowerOpt)) {
                              activeClass = 'bg-rose-600 text-white border-rose-600 shadow-sm';
                            } else if (isNaLike(lowerOpt)) {
                              activeClass = 'bg-amber-500 text-white border-amber-500 shadow-sm';
                            }

                            return (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => setCorrectingAnswers(prev => ({ ...prev, [q.id]: opt }))}
                                className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition ${
                                  isSelected 
                                    ? activeClass 
                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                }`}
                              >
                                {opt}
                              </button>
                            );
                          })}

                          {/* Clear choice option */}
                          {!isEmpty && (
                            <button
                              type="button"
                              onClick={() => setCorrectingAnswers(prev => ({ ...prev, [q.id]: '' }))}
                              className="px-3 py-1.5 text-slate-400 hover:text-slate-600 text-xs font-medium transition"
                              title="Limpar resposta"
                            >
                              Limpar
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-150 bg-slate-50 flex justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setCorrectingAudit(null)}
                disabled={isSavingCorrection}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-semibold hover:bg-slate-100 transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveCorrection}
                disabled={isSavingCorrection}
                className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition flex items-center gap-1.5 disabled:opacity-50 shadow-xs"
              >
                {isSavingCorrection ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Salvar Correções</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

