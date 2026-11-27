import React, { useState, useEffect, useContext } from 'react';
import { useAuditData } from '../context/AuditContext';
import { ToastContext } from '../context/ToastContext';
import { Save, Activity, Signature, CheckCircle, Loader2, ClipboardList } from 'lucide-react';
import { cn } from '../lib/utils';
import { AuditQuestion } from '../types';

interface NewAuditFormProps {
  key?: React.Key;
  initialParams?: { sectorId: string, bedId: string } | null;
  onClearParams?: () => void;
}

export function NewAuditForm({ initialParams, onClearParams }: NewAuditFormProps) {
  const { sectors, beds, addAudit, questions } = useAuditData();
  const { showToast } = useContext(ToastContext);
  const [sectorId, setSectorId] = useState(initialParams?.sectorId || '');
  const [bedId, setBedId] = useState(initialParams?.bedId || '');
  const [evaluator, setEvaluator] = useState('Luiz Romining');
  const [auditDate, setAuditDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [auditType, setAuditType] = useState<'IRAS' | 'SAFETY' | ''>('');
  
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isSuccess, setIsSuccess] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (initialParams) {
      setSectorId(initialParams.sectorId);
      setBedId(initialParams.bedId);
    }
  }, [initialParams]);

  const availableBeds = beds.filter(b => {
    if (!b || !b.sectorId || !sectorId) return false;
    return String(b.sectorId).trim().toLowerCase() === String(sectorId).trim().toLowerCase();
  });

  const sortedSectors = React.useMemo(() => {
    return [...sectors].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  }, [sectors]);

  const sortedAvailableBeds = React.useMemo(() => {
    return [...availableBeds].sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true, sensitivity: 'base' }));
  }, [availableBeds]);

  // Filter questions based on selected type
  const activeQuestions = questions.filter(q => q.formType === auditType);
  
  // Group active questions by section
  const sections = activeQuestions.reduce<Record<string, AuditQuestion[]>>((acc, q) => {
    if (!acc[q.section]) acc[q.section] = [];
    acc[q.section].push(q);
    return acc;
  }, {});

  const handleOptionSelect = (qId: string, opt: string) => {
    setAnswers(prev => ({ 
      ...prev, 
      [qId]: prev[qId] === opt ? '' : opt 
    }));
    setSaveStatus('saving');
    setTimeout(() => setSaveStatus('saved'), 600);
    setTimeout(() => setSaveStatus('idle'), 2600);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sectorId || !bedId || !evaluator || !auditDate || !auditType) {
      const msg = 'Por favor, preencha Data, Setor, Leito, Nome do Avaliador e escolha o Tipo de Perguntas antes de salvar.';
      setErrorMsg(msg);
      showToast('error', 'Erro ao salvar', msg);
      return;
    }
    
    try {
      setErrorMsg('');

      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      const fullDateTime = `${auditDate} ${timeStr}`;

      await addAudit({
        date: fullDateTime,
        sectorId,
        bedId,
        evaluator,
        type: auditType,
        answers
      });
      
      setIsSuccess(true);
      showToast('success', 'Auditoria Salva', 'A auditoria foi registrada com sucesso.');
      setTimeout(() => {
        setIsSuccess(false);
        setBedId('');
        setAnswers({});
        if (onClearParams) onClearParams();
      }, 2000);
    } catch (err: any) {
      console.error(err);
      showToast('error', 'Erro ao Salvar no MySQL', err.message || 'Não foi possível salvar a auditoria no banco de dados MySQL.');
    }
  };

  const renderQuestionSection = (title: string, sectionQuestions: AuditQuestion[]) => (
    <div key={title} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
        <h3 className="font-bold text-slate-800">{title}</h3>
      </div>
      <div className="divide-y divide-slate-100">
        {sectionQuestions.map((q) => (
          <div key={q.id} className="px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50 transition-colors">
            <div className="flex-1 text-sm font-medium text-slate-700">{q.label}</div>
            <div className="flex flex-wrap gap-2">
              {q.options.map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => handleOptionSelect(q.id, opt)}
                  className={cn(
                    "px-4 py-1.5 rounded text-xs font-bold transition-colors border min-w-[60px]",
                    answers[q.id] === opt 
                      ? "bg-blue-600 text-white border-blue-600 shadow-sm" 
                      : "bg-white text-slate-500 border-slate-200 hover:bg-slate-100 hover:text-slate-700"
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="p-6 pb-24 space-y-6 relative">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-2">
          <h2 className="text-lg font-bold text-slate-800">Informações da Avaliação</h2>
          {saveStatus !== 'idle' && (
            <div className="flex items-center text-xs font-bold text-slate-500">
              {saveStatus === 'saving' ? (
                <><Loader2 className="w-3 h-3 mr-1 animate-spin text-blue-500" /> Registrando resposta...</>
              ) : (
                <><CheckCircle className="w-3 h-3 mr-1 text-emerald-500" /> Resposta registrada no rascunho</>
              )}
            </div>
          )}
        </div>
        
        {errorMsg && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-md border border-red-200">
            {errorMsg}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 lg:gap-6">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Data da Avaliação</label>
            <input 
              type="date" 
              value={auditDate}
              onChange={e => setAuditDate(e.target.value)}
              className="w-full px-4 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm shadow-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Setor</label>
            <select 
              value={sectorId}
              onChange={e => { setSectorId(e.target.value); setBedId(''); }}
              className="w-full px-4 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm shadow-sm bg-white"
            >
              <option value="">Selecione...</option>
              {sortedSectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Leito</label>
            <select 
              value={bedId}
              onChange={e => setBedId(e.target.value)}
              className="w-full px-4 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm shadow-sm bg-white"
              disabled={!sectorId}
            >
              <option value="">Selecione...</option>
              {sortedAvailableBeds.map(b => <option key={b.id} value={b.id}>{b.number}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Avaliador (Nome)</label>
            <input 
              type="text" 
              value={evaluator}
              onChange={e => setEvaluator(e.target.value)}
              className="w-full px-4 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm shadow-sm"
              placeholder="Nome do profissional"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Tipo de Perguntas</label>
            <select 
              value={auditType}
              onChange={e => {
                setAuditType(e.target.value as 'IRAS' | 'SAFETY' | '');
                setAnswers({}); // Reset answers when type changes to prevent cross-over
              }}
              className="w-full px-4 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-semibold shadow-sm bg-blue-50 border-blue-200 text-blue-900"
            >
              <option value="">Selecione o tipo...</option>
              <option value="IRAS">Auditoria IRAS</option>
              <option value="SAFETY">Checklist Segurança do Paciente</option>
            </select>
          </div>
        </div>
      </div>

      {auditType && sectorId && bedId ? (
        <div className="space-y-6">
          {activeQuestions.length > 0 && (() => {
            const totalQuestions = activeQuestions.length;
            const answeredQuestions = Object.values(answers).filter(val => val !== '').length;
            const progressPercent = totalQuestions > 0 ? Math.round((answeredQuestions / totalQuestions) * 100) : 0;
            
            return (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sticky top-4 z-20">
                <div className="flex justify-between items-end mb-2">
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm">Progresso do Checklist</h3>
                    <p className="text-xs text-slate-500">{answeredQuestions} de {totalQuestions} perguntas respondidas</p>
                  </div>
                  <span className="font-black text-blue-600">{progressPercent}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2.5">
                  <div 
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
                    style={{ width: `${progressPercent}%` }}
                  ></div>
                </div>
              </div>
            );
          })()}

          {activeQuestions.length > 0 ? (
            Object.entries(sections).map(([title, sectionQuestions]) => 
              renderQuestionSection(title, sectionQuestions as AuditQuestion[])
            )
          ) : (
            <div className="bg-amber-50 text-amber-800 p-6 rounded-xl border border-amber-200 text-center">
              Nenhuma pergunta cadastrada para este tipo de auditoria ainda. Vá em "Cadastro de Perguntas" para cadastrá-las.
            </div>
          )}

          {activeQuestions.length > 0 && (
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] md:static md:bg-transparent md:border-t-0 md:shadow-none md:p-0 flex justify-end z-10">
              <button 
                type="submit"
                disabled={isSuccess}
                className={cn(
                  "flex items-center px-6 py-2.5 rounded-md text-white font-semibold text-sm transition w-full md:w-auto justify-center",
                  isSuccess ? "bg-emerald-600" : "bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                )}
              >
                {isSuccess ? (
                  <><CheckCircle className="w-4 h-4 mr-2" /> Salvo com Sucesso!</>
                ) : (
                  <><Save className="w-4 h-4 mr-2" /> Salvar Auditoria</>
                )}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-slate-100/80 p-8 rounded-xl border border-slate-200 text-center text-slate-500 max-w-2xl mx-auto mt-6">
          <ClipboardList className="w-12 h-12 text-slate-400 mx-auto mb-3" />
          <p className="font-semibold text-slate-700">Aguardando preenchimento</p>
          <p className="text-sm mt-1">Selecione o Setor, Leito e o Tipo de Perguntas para carregar o questionário da auditoria.</p>
        </div>
      )}
    </form>
  );
}
