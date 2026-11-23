import React, { useState } from 'react';
import { useAuditData } from '../context/AuditContext';
import { Bed as BedIcon, Plus, Trash2, Filter, Edit2, X, Save, Calendar, AlertTriangle, Pencil, Check, Info } from 'lucide-react';
import { Bed } from '../types';
import { getAnswerForQuestion } from '../lib/utils';

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

interface BedManagerProps {
  onAuditClick?: (sectorId: string, bedId: string) => void;
}

export function BedManager({ onAuditClick }: BedManagerProps) {
  const { beds, addBed, updateBed, deleteBed, sectors, audits, questions, updateAudit } = useAuditData();
  const [number, setNumber] = useState('');
  const [sectorId, setSectorId] = useState('');
  const [filterSectorId, setFilterSectorId] = useState('');
  
  const [editingBed, setEditingBed] = useState<Bed | null>(null);
  const [editNumber, setEditNumber] = useState('');
  const [editSectorId, setEditSectorId] = useState('');

  const [correctionBed, setCorrectionBed] = useState<Bed | null>(null);
  const [correctingAudit, setCorrectingAudit] = useState<any | null>(null);
  const [correctingAnswers, setCorrectingAnswers] = useState<Record<string, string>>({});
  const [isSavingCorrection, setIsSavingCorrection] = useState(false);

  // Find which beds have pending/incomplete audits
  const bedPendencies = React.useMemo(() => {
    const pendencies: Record<string, { hasPendency: boolean; incompleteAudits: any[] }> = {};

    beds.forEach(bed => {
      const bedAudits = audits.filter(a => a.bedId === bed.id);
      const incompleteAudits: any[] = [];
      let hasPendency = false;

      bedAudits.forEach(audit => {
        // Find applicable questions for this audit type
        const appQuestions = questions.filter(q => q.formType === audit.type);
        
        // Check if any of these questions is unanswered (missing or empty)
        const isAuditIncomplete = appQuestions.some(q => {
          const ans = getAnswerForQuestion(audit.answers, q, questions);
          return !ans || ans.trim() === '';
        });

        if (isAuditIncomplete) {
          hasPendency = true;
          incompleteAudits.push(audit);
        }
      });

      pendencies[bed.id] = { hasPendency, incompleteAudits };
    });

    return pendencies;
  }, [beds, audits, questions]);

  const handleStartCorrection = (audit: any) => {
    setCorrectingAudit(audit);
    const initialAnswers: Record<string, string> = {};
    const appQuestions = questions.filter(q => q.formType === audit.type);
    appQuestions.forEach(q => {
      initialAnswers[q.id] = getAnswerForQuestion(audit.answers, q, questions) || '';
    });
    setCorrectingAnswers(initialAnswers);
  };

  const handleSaveCorrection = async () => {
    if (!correctingAudit) return;
    setIsSavingCorrection(true);
    try {
      const updatedAnswers = { ...correctingAudit.answers };
      const appQuestions = questions.filter(q => q.formType === correctingAudit.type);
      appQuestions.forEach(q => {
        updatedAnswers[q.id] = correctingAnswers[q.id] || '';
      });
      await updateAudit(correctingAudit.id, {
        ...correctingAudit,
        answers: updatedAnswers
      });
      setCorrectingAudit(null);
      setCorrectionBed(null);
    } catch (err) {
      console.error('Erro ao salvar correção:', err);
    } finally {
      setIsSavingCorrection(false);
    }
  };

  const sectorMap = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (let i = 0; i < sectors.length; i++) {
      map[sectors[i].id] = sectors[i].name;
    }
    return map;
  }, [sectors]);

  const bedMap = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (let i = 0; i < beds.length; i++) {
      map[beds[i].id] = beds[i].number;
    }
    return map;
  }, [beds]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!number.trim() || !sectorId) return;
    addBed({ number, sectorId });
    setNumber('');
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBed || !editNumber.trim() || !editSectorId) return;
    updateBed(editingBed.id, { number: editNumber, sectorId: editSectorId });
    setEditingBed(null);
  };

  const filteredBeds = filterSectorId 
    ? beds.filter(b => b.sectorId === filterSectorId)
    : beds;

  // Consistent alfanumeric sorting for sectors
  const sortedSectors = React.useMemo(() => {
    return [...sectors].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [sectors]);

  // Group and sort beds by sector names and then by bed numbers/IDs alfanumerically
  const sortedSectorsWithBeds = React.useMemo(() => {
    const activeSectorIds = Array.from(new Set(filteredBeds.map(b => b.sectorId)));
    const sectorsWithActiveBeds = activeSectorIds.map(sid => {
      const sector = sectors.find(s => s.id === sid);
      return {
        id: sid,
        name: sector ? sector.name : 'Setor Desconhecido'
      };
    });
    // Sort sectors alfanumerically by name
    return sectorsWithActiveBeds.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [filteredBeds, sectors]);

  const bedsBySector = React.useMemo(() => {
    const groups: Record<string, typeof beds> = {};
    filteredBeds.forEach(bed => {
      if (!groups[bed.sectorId]) {
        groups[bed.sectorId] = [];
      }
      groups[bed.sectorId].push(bed);
    });

    // Sort beds inside each sector group alfanumerically by bed number, then ID
    Object.keys(groups).forEach(sectorId => {
      groups[sectorId].sort((a, b) => {
        const numCompare = String(a.number).localeCompare(String(b.number), undefined, { numeric: true });
        if (numCompare !== 0) return numCompare;
        return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
      });
    });

    return groups;
  }, [filteredBeds]);

  return (
    <div className="p-6 space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-6 border-b border-slate-100 pb-2">Adicionar Novo Leito</h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Número / Identificação</label>
              <input 
                type="text" 
                value={number}
                onChange={e => setNumber(e.target.value)}
                className="w-full px-4 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm shadow-sm"
                placeholder="Ex: Leito 101"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Setor</label>
              <select 
                value={sectorId}
                onChange={e => setSectorId(e.target.value)}
                className="w-full px-4 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm shadow-sm bg-white"
                required
              >
                <option value="" disabled>Selecione um setor...</option>
                {sortedSectors.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
          <button 
            type="submit"
            className="flex items-center bg-blue-600 text-white px-5 py-2.5 rounded-md text-sm font-semibold hover:bg-blue-700 transition"
          >
            <Plus className="w-4 h-4 mr-2" />
            Salvar Leito
          </button>
        </form>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col">
            <h2 className="font-bold text-slate-800">Leitos Cadastrados</h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <select 
                value={filterSectorId}
                onChange={e => setFilterSectorId(e.target.value)}
                className="px-3 py-1.5 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-slate-700 bg-white"
              >
                <option value="">Todos os Setores</option>
                {sortedSectors.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="p-6 flex flex-col gap-8">
          {sortedSectorsWithBeds.map(({ id: sectorId, name: sectorName }) => {
            const sector = sectors.find(s => s.id === sectorId);
            const bedsList = (bedsBySector[sectorId] || []) as Bed[];
            return (
              <div key={sectorId} className="space-y-4 border-b border-slate-100 pb-8 last:border-0 last:pb-0">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-6 bg-blue-500 rounded-full"></div>
                  <h3 className="text-lg font-bold text-slate-800">{sector?.name || 'Setor Desconhecido'}</h3>
                  <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full ml-2">
                    {bedsList.length} {bedsList.length === 1 ? 'leito' : 'leitos'}
                  </span>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                  {bedsList.map(bed => {
                    const pendencyInfo = bedPendencies[bed.id] || { hasPendency: false, incompleteAudits: [] };
                    const hasPendency = pendencyInfo.hasPendency;
                    const incompleteAudits = pendencyInfo.incompleteAudits;

                    const bedAudits = audits.filter(a => a.bedId === bed.id);
                    const totalAuditsCount = bedAudits.length;
                    const hasAudits = totalAuditsCount > 0;

                    let colorClass = 'bg-yellow-50/60 border-yellow-200 hover:bg-yellow-100/80 hover:border-yellow-300 text-yellow-900';
                    let iconColor = 'text-yellow-500';

                    if (hasPendency) {
                      colorClass = 'bg-rose-50 border-rose-300 hover:bg-rose-100 hover:border-rose-400 text-rose-900 ring-1 ring-rose-100';
                      iconColor = 'text-rose-500';
                    } else if (hasAudits) {
                      colorClass = 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 text-emerald-900 ring-1 ring-emerald-100';
                      iconColor = 'text-emerald-500';
                    }

                    return (
                      <div 
                        key={bed.id} 
                        onClick={() => {
                          if (hasPendency) {
                            setCorrectionBed(bed);
                            if (incompleteAudits.length === 1) {
                              handleStartCorrection(incompleteAudits[0]);
                            }
                          } else {
                            onAuditClick && onAuditClick(bed.sectorId, bed.id);
                          }
                        }}
                        className={`group rounded-xl border flex flex-col items-center justify-between p-3 relative transition-all overflow-hidden text-center min-h-[110px] ${colorClass} ${onAuditClick ? 'cursor-pointer' : ''}`}
                      >
                        {/* Direct correction alert badge/icon */}
                        {hasPendency && (
                          <div 
                            onClick={(e) => {
                              e.stopPropagation();
                              setCorrectionBed(bed);
                              if (incompleteAudits.length === 1) {
                                handleStartCorrection(incompleteAudits[0]);
                              }
                            }}
                            className="absolute top-1.5 left-1.5 bg-red-600 border border-red-500 text-white px-1.5 py-0.5 rounded-full hover:scale-110 transition shadow-xs cursor-pointer z-10 animate-bounce flex items-center gap-0.5 text-[9px] font-bold"
                            title={`Possui ${incompleteAudits.length} auditoria(s) com respostas em branco. Clique para corrigir agora!`}
                          >
                            <AlertTriangle className="w-2.5 h-2.5 text-white" />
                            <span>{incompleteAudits.length}</span>
                          </div>
                        )}

                        {/* Completed audit check badge */}
                        {!hasPendency && hasAudits && (
                          <div 
                            className="absolute top-1.5 left-1.5 bg-emerald-600 border border-emerald-500 text-white p-0.5 rounded-full shadow-xs flex items-center justify-center z-10"
                            title="Auditoria concluída com sucesso!"
                          >
                            <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                          </div>
                        )}

                        <div className="flex flex-col items-center justify-center flex-1 mt-1">
                          <BedIcon className={`w-7 h-7 mb-1.5 transition-colors ${iconColor}`} />
                          <p className="text-sm font-extrabold text-slate-800">{bed.number}</p>
                        </div>
                        
                        {/* Action buttons or indicators inside the card */}
                        {hasPendency ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setCorrectionBed(bed);
                              if (incompleteAudits.length === 1) {
                                handleStartCorrection(incompleteAudits[0]);
                              }
                            }}
                            className="mt-2 w-full py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[10px] font-bold transition flex items-center justify-center gap-1 shadow-xs z-10"
                          >
                            <Pencil className="w-2.5 h-2.5" />
                            <span>Corrigir ({incompleteAudits.length})</span>
                          </button>
                        ) : hasAudits ? (
                          <span className="mt-2 text-[10px] font-bold text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-full">
                            Concluído ({totalAuditsCount})
                          </span>
                        ) : (
                          <span className="mt-2 text-[10px] font-bold text-yellow-600 bg-yellow-100 px-1.5 py-0.5 rounded-full">
                            Sem Auditoria
                          </span>
                        )}

                        <div className="absolute top-1.5 right-1.5 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition z-10">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingBed(bed);
                              setEditNumber(bed.number);
                              setEditSectorId(bed.sectorId);
                            }}
                            className="p-1 text-blue-500 hover:bg-blue-100 dark:hover:bg-slate-800 rounded focus:opacity-100 bg-white/80 dark:bg-slate-900/60 backdrop-blur-sm border border-slate-200"
                            title="Editar"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm(`Tem certeza de que deseja excluir o leito "${bed.number}"?`)) {
                                deleteBed(bed.id);
                              }
                            }}
                            className="p-1 text-red-500 hover:bg-red-100 dark:hover:bg-slate-800 rounded focus:opacity-100 bg-white/80 dark:bg-slate-900/60 backdrop-blur-sm border border-slate-200"
                            title="Excluir"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {filteredBeds.length === 0 && (
            <div className="py-8 text-center text-sm text-slate-500">
              {filterSectorId ? 'Nenhum leito cadastrado neste setor.' : 'Nenhum leito cadastrado.'}
            </div>
          )}
        </div>
      </div>

      {/* EDIT MODAL */}
      {editingBed && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in duration-200">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center">
                <Edit2 className="w-5 h-5 mr-2 text-blue-500" />
                Editar Leito
              </h3>
              <button onClick={() => setEditingBed(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleEditSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Número / Identificação</label>
                <input
                  type="text"
                  required
                  value={editNumber}
                  onChange={e => setEditNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Setor</label>
                <select
                  required
                  value={editSectorId}
                  onChange={e => setEditSectorId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                >
                  <option value="" disabled>Selecione um setor...</option>
                  {sortedSectors.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div className="pt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingBed(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-2 transition"
                >
                  <Save className="w-4 h-4" />
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SELECTION MODAL FOR PENDING AUDITS */}
      {correctionBed && !correctingAudit && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex justify-center items-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-150 flex flex-col max-h-[85vh]">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm sm:text-base">
                  <AlertTriangle className="w-5 h-5 text-red-600 animate-pulse shrink-0" />
                  Auditorias Pendentes - {correctionBed.number}
                </h3>
                <p className="text-xs text-slate-500 mt-1">Selecione uma auditoria incompleta para corrigir imediatamente.</p>
              </div>
              <button 
                onClick={() => setCorrectionBed(null)} 
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-5 overflow-y-auto space-y-3">
              {(() => {
                const bedPendency = bedPendencies[correctionBed.id];
                const incompleteAudits = bedPendency ? bedPendency.incompleteAudits : [];
                
                if (incompleteAudits.length === 0) {
                  return (
                    <div className="py-6 text-center text-slate-500 text-sm">
                      Nenhuma auditoria pendente para este leito.
                    </div>
                  );
                }

                return incompleteAudits.map((audit) => {
                  const dateStr = new Date(audit.date).toLocaleString('pt-BR');
                  return (
                    <div key={audit.id} className="p-4 border border-red-100 bg-red-50/20 hover:bg-red-50/40 rounded-xl flex items-center justify-between gap-4 transition-colors">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            audit.type === 'IRAS' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                          }`}>
                            {audit.type}
                          </span>
                          <span className="text-xs text-slate-500 font-medium">{dateStr}</span>
                        </div>
                        <p className="text-xs text-slate-600">Avaliador: <strong className="text-slate-800">{audit.evaluator}</strong></p>
                      </div>
                      <button
                        onClick={() => handleStartCorrection(audit)}
                        className="px-3.5 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition flex items-center gap-1 shadow-xs shrink-0"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Corrigir</span>
                      </button>
                    </div>
                  );
                });
              })()}
            </div>

            <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
              <button
                onClick={() => setCorrectionBed(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CORRECTION QUESTIONNAIRE FORM MODAL */}
      {correctingAudit && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
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
                  {(() => {
                    const appQuestions = questions.filter(q => q.formType === correctingAudit.type);
                    return appQuestions.map((q, idx) => {
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
                    });
                  })()}
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
