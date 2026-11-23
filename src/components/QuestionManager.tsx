import React, { useState } from 'react';
import { useAuditData, defaultQuestions } from '../context/AuditContext';
import { Settings2, Plus, Trash2, Edit2, Check, X, BookTemplate, AlertTriangle } from 'lucide-react';
import { AuditQuestion } from '../types';

export function QuestionManager() {
  const { questions, addQuestion, updateQuestion, deleteQuestion } = useAuditData();
  const [isEditing, setIsEditing] = useState<string | null>(null);
  
  const [newQuestion, setNewQuestion] = useState<Omit<AuditQuestion, 'id'>>({
    formType: 'IRAS',
    section: '',
    label: '',
    options: ['Sim', 'Não', 'NA']
  });

  const [editState, setEditState] = useState<AuditQuestion | null>(null);
  const [duplicateQuestion, setDuplicateQuestion] = useState<{ existing: AuditQuestion, pendingNew: Omit<AuditQuestion, 'id'> } | null>(null);

  const startEdit = (q: AuditQuestion) => {
    setIsEditing(q.id);
    setEditState({ ...q });
  };

  const cancelEdit = () => {
    setIsEditing(null);
    setEditState(null);
  };

  const saveEdit = () => {
    if (editState) {
      updateQuestion(editState.id, editState);
    }
    setIsEditing(null);
    setEditState(null);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestion.section || !newQuestion.label || newQuestion.options.length === 0) return;
    
    const existing = questions.find(q => 
      q.formType === newQuestion.formType && 
      q.label.trim().toLowerCase() === newQuestion.label.trim().toLowerCase()
    );

    if (existing) {
      setDuplicateQuestion({
        existing,
        pendingNew: { ...newQuestion }
      });
      return;
    }

    addQuestion(newQuestion);
    setNewQuestion({
      formType: 'IRAS',
      section: '',
      label: '',
      options: ['Sim', 'Não', 'NA']
    });
  };

  const handleReplaceDuplicate = () => {
    if (duplicateQuestion) {
      updateQuestion(duplicateQuestion.existing.id, duplicateQuestion.pendingNew);
      setDuplicateQuestion(null);
      setNewQuestion({
        formType: 'IRAS',
        section: '',
        label: '',
        options: ['Sim', 'Não', 'NA']
      });
    }
  };

  const handleKeepBothDuplicate = () => {
    if (duplicateQuestion) {
      addQuestion(duplicateQuestion.pendingNew);
      setDuplicateQuestion(null);
      setNewQuestion({
        formType: 'IRAS',
        section: '',
        label: '',
        options: ['Sim', 'Não', 'NA']
      });
    }
  };

  const handleOptionsChange = (val: string, setter: (val: string[]) => void) => {
    const opts = val.split(',').map(s => s.trim()).filter(Boolean);
    setter(opts);
  };

  const handleLoadTemplate = (type: 'IRAS' | 'SAFETY') => {
    const templateQuestions = defaultQuestions.filter(q => q.formType === type);
    
    // Para simplificar, vamos deletar as existentes daquele tipo e recriar
    // ou apenas adicionar as que não existem. Melhor adicionar as que não existem baseado na label.
    const existingLabels = new Set(questions.filter(q => q.formType === type).map(q => q.label.toLowerCase()));
    
    templateQuestions.forEach(tq => {
      if (!existingLabels.has(tq.label.toLowerCase())) {
        const { id, ...rest } = tq;
        addQuestion(rest);
      }
    });
    
    alert(`Modelos padrão de ${type} carregados!`);
  };

  const filteredQuestions = questions
    .filter(q => q.formType === newQuestion.formType)
    .sort((a, b) => a.section.localeCompare(b.section));

  return (
    <div className="p-6 space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-6 border-b border-slate-100 pb-2 flex items-center">
          <Settings2 className="w-5 h-5 mr-2 text-blue-600" />
          Adicionar Nova Pergunta
        </h2>
        <form onSubmit={handleCreate} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Formulário</label>
              <select 
                value={newQuestion.formType}
                onChange={e => setNewQuestion({...newQuestion, formType: e.target.value as 'IRAS' | 'SAFETY'})}
                className="w-full px-4 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm shadow-sm bg-white"
              >
                <option value="IRAS">Auditoria IRAS</option>
                <option value="SAFETY">Checklist Segurança do Paciente</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Sessão / Categoria</label>
              <input 
                type="text" 
                value={newQuestion.section}
                onChange={e => setNewQuestion({...newQuestion, section: e.target.value})}
                className="w-full px-4 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm shadow-sm"
                placeholder="Ex: Prevenção de Infecção..."
                required
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Pergunta</label>
              <input 
                type="text" 
                value={newQuestion.label}
                onChange={e => setNewQuestion({...newQuestion, label: e.target.value})}
                className="w-full px-4 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm shadow-sm"
                placeholder="Digite a pergunta..."
                required
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Opções (separadas por vírgula)</label>
              <input 
                type="text" 
                value={newQuestion.options.join(', ')}
                onChange={e => handleOptionsChange(e.target.value, (opts) => setNewQuestion({...newQuestion, options: opts}))}
                className="w-full px-4 py-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm shadow-sm"
                placeholder="Ex: Sim, Não, NA"
                required
              />
            </div>
          </div>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <button 
              type="submit"
              className="flex items-center bg-blue-600 text-white px-5 py-2.5 rounded-md text-sm font-semibold hover:bg-blue-700 transition w-full md:w-auto justify-center"
            >
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Pergunta
            </button>
            <div className="flex flex-col md:flex-row gap-2">
              {newQuestion.formType === 'IRAS' && (
                <button 
                  type="button"
                  onClick={() => handleLoadTemplate('IRAS')}
                  className="flex items-center bg-slate-100 text-slate-700 px-4 py-2.5 rounded-md text-sm font-semibold hover:bg-slate-200 transition"
                >
                  <BookTemplate className="w-4 h-4 mr-2" />
                  Carregar Modelo UTI (IRAS)
                </button>
              )}
              {newQuestion.formType === 'SAFETY' && (
                <button 
                  type="button"
                  onClick={() => handleLoadTemplate('SAFETY')}
                  className="flex items-center bg-slate-100 text-slate-700 px-4 py-2.5 rounded-md text-sm font-semibold hover:bg-slate-200 transition"
                >
                  <BookTemplate className="w-4 h-4 mr-2" />
                  Carregar Modelo Segurança
                </button>
              )}
            </div>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <h2 className="font-bold text-slate-800">Perguntas Cadastradas</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {filteredQuestions.map(q => (
            <div key={q.id} className="p-6 hover:bg-slate-50 transition-colors">
              {isEditing === q.id && editState ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <select 
                      value={editState.formType}
                      onChange={e => setEditState({...editState, formType: e.target.value as 'IRAS' | 'SAFETY'})}
                      className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm bg-white"
                    >
                      <option value="IRAS">Auditoria IRAS</option>
                      <option value="SAFETY">Checklist Segurança do Paciente</option>
                    </select>
                    <input 
                      type="text" 
                      value={editState.section}
                      onChange={e => setEditState({...editState, section: e.target.value})}
                      className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm"
                      placeholder="Sessão"
                    />
                    <input 
                      type="text" 
                      value={editState.label}
                      onChange={e => setEditState({...editState, label: e.target.value})}
                      className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm md:col-span-2"
                      placeholder="Pergunta"
                    />
                    <input 
                      type="text" 
                      value={editState.options.join(', ')}
                      onChange={e => handleOptionsChange(e.target.value, (opts) => setEditState({...editState, options: opts}))}
                      className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm md:col-span-2"
                      placeholder="Opções"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={saveEdit} className="bg-emerald-600 text-white px-3 py-1.5 rounded text-xs font-bold flex items-center"><Check className="w-4 h-4 mr-1" /> Salvar</button>
                    <button onClick={cancelEdit} className="bg-slate-200 text-slate-700 px-3 py-1.5 rounded text-xs font-bold flex items-center"><X className="w-4 h-4 mr-1" /> Cancelar</button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Informações da Pergunta */}
                  <div className="flex-1 min-w-0 space-y-2.5">
                    {/* Linha das Tags */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-md tracking-wider ${
                        q.formType === 'IRAS' 
                          ? 'bg-purple-50 text-purple-700 border border-purple-100' 
                          : 'bg-orange-50 text-orange-700 border border-orange-100'
                      }`}>
                        {q.formType === 'IRAS' ? 'Auditoria IRAS' : 'Segurança do Paciente'}
                      </span>
                      <span className="text-[10px] font-semibold uppercase px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 border border-slate-200/50 max-w-[280px] sm:max-w-md truncate" title={q.section}>
                        {q.section}
                      </span>
                    </div>

                    {/* Texto da Pergunta */}
                    <p className="text-sm sm:text-base font-semibold text-slate-800 leading-snug tracking-tight">
                      {q.label}
                    </p>

                    {/* Alternativas de Resposta */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[11px] font-medium text-slate-400 mr-1 uppercase tracking-wider">Opções:</span>
                      {q.options.map(o => (
                        <span 
                          key={o} 
                          className="inline-flex items-center justify-center text-xs bg-slate-50 text-slate-600 px-2.5 py-1 rounded-md font-bold border border-slate-200 shadow-sm min-w-[36px] text-center"
                        >
                          {o}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-2 md:self-center self-end pt-2 md:pt-0 border-t border-slate-150 md:border-t-0 w-full md:w-auto justify-end">
                    <button 
                      onClick={() => startEdit(q)} 
                      className="inline-flex items-center justify-center p-2 sm:p-1.5 text-blue-600 hover:bg-blue-100 hover:text-blue-700 rounded-lg transition duration-150 border border-slate-200 md:border-transparent" 
                      title="Editar"
                    >
                      <Edit2 className="w-4 h-4 md:mr-0 mr-1.5" />
                      <span className="text-xs font-semibold md:hidden">Editar</span>
                    </button>
                    <button 
                      onClick={() => {
                        if (window.confirm(`Tem certeza de que deseja excluir a pergunta "${q.label}"?`)) {
                          deleteQuestion(q.id);
                        }
                      }} 
                      className="inline-flex items-center justify-center p-2 sm:p-1.5 text-red-500 hover:bg-red-100 hover:text-red-600 rounded-lg transition duration-150 border border-slate-200 md:border-transparent" 
                      title="Excluir"
                    >
                      <Trash2 className="w-4 h-4 md:mr-0 mr-1.5" />
                      <span className="text-xs font-semibold md:hidden">Excluir</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {questions.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-500">Nenhuma pergunta cadastrada.</div>
          )}
        </div>
      </div>

      {/* MODAL DE PERGUNTA DUPLICADA */}
      {duplicateQuestion && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex justify-center items-center z-55 p-4 animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-start gap-4">
              <div className="bg-amber-100 p-3 rounded-full shrink-0 text-amber-600">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1.5 flex-1 min-w-0">
                <h3 className="text-lg font-extrabold text-slate-800">Pergunta já Cadastrada</h3>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider font-mono">
                  {duplicateQuestion.existing.formType === 'IRAS' ? 'Auditoria IRAS' : 'Segurança do Paciente'}
                </p>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-3">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Pergunta Existente:</span>
                <p className="text-xs font-bold text-slate-700 leading-normal">
                  "{duplicateQuestion.existing.label}"
                </p>
                <div className="flex items-center gap-1.5 pt-1 text-[11px] text-slate-500">
                  <span className="font-semibold">Categoria:</span>
                  <span className="bg-slate-200/60 px-2 py-0.2 rounded text-[10px] font-bold text-slate-600">{duplicateQuestion.existing.section}</span>
                  <span className="ml-2 font-semibold">Opções:</span>
                  <span className="bg-slate-200/60 px-2 py-0.2 rounded text-[10px] font-bold text-slate-600">{duplicateQuestion.existing.options.join(', ')}</span>
                </div>
              </div>

              <div className="border-t border-slate-200/60 pt-3 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Novos Dados Propostos:</span>
                <div className="flex items-center gap-1.5 pt-1 text-[11px] text-slate-500">
                  <span className="font-semibold">Nova Categoria:</span>
                  <span className="bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.2 rounded text-[10px] font-bold">{duplicateQuestion.pendingNew.section}</span>
                  <span className="ml-2 font-semibold">Novas Opções:</span>
                  <span className="bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.2 rounded text-[10px] font-bold">{duplicateQuestion.pendingNew.options.join(', ')}</span>
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed font-medium">
              Esta pergunta já existe neste formulário. Deseja <span className="font-bold text-slate-700">substituir</span> os dados da pergunta existente pelas novas definições, <span className="font-bold text-slate-700">cadastrar em duplicidade</span> (criar uma cópia separada) ou <span className="font-bold text-slate-700">cancelar</span>?
            </p>

            <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDuplicateQuestion(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs transition cursor-pointer text-center"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleKeepBothDuplicate}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-white font-semibold rounded-lg text-xs transition cursor-pointer text-center"
              >
                Cadastrar Cópia
              </button>
              <button
                type="button"
                onClick={handleReplaceDuplicate}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg text-xs transition cursor-pointer text-center flex items-center justify-center gap-1.5 shadow-xs"
              >
                <Check className="w-3.5 h-3.5" />
                Substituir Existente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
