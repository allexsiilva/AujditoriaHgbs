import React, { useState } from 'react';
import { useAuditData } from '../context/AuditContext';
import { Building2, Plus, Trash2, Edit2, X, Save, AlertTriangle } from 'lucide-react';
import { Sector } from '../types';

export function SectorManager() {
  const { sectors, addSector, updateSector, deleteSector } = useAuditData();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const [editingSector, setEditingSector] = useState<Sector | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const [confirmDeleteSector, setConfirmDeleteSector] = useState<Sector | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    addSector({ name, description });
    setName('');
    setDescription('');
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSector || !editName.trim()) return;
    updateSector(editingSector.id, { name: editName, description: editDescription });
    setEditingSector(null);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="dash-card p-6">
        <div className="flex items-center gap-2.5 pb-4 mb-6 border-b border-slate-100">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Building2 className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">Adicionar Novo Setor</h2>
            <p className="text-xs text-slate-400">Cadastre alas hospitalares e unidades de internação</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Nome do Setor</label>
              <input 
                type="text" 
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white text-sm transition"
                placeholder="Ex: UTI Pediátrica"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Descrição / Localização</label>
              <input 
                type="text" 
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white text-sm transition"
                placeholder="Ex: Bloco B, 3º Andar"
              />
            </div>
          </div>
          <button 
            type="submit"
            className="dash-btn-primary flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Salvar Setor</span>
          </button>
        </form>
      </div>

      <div className="dash-card overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">Setores Cadastrados</h2>
            <p className="text-xs text-slate-400">Total de {sectors.length} setores ativos no hospital</p>
          </div>
          <span className="dash-badge-blue font-mono font-bold">
            {sectors.length} Setores
          </span>
        </div>
        <ul className="divide-y divide-slate-100">
          {sectors.map(sector => (
            <li key={sector.id} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50/80 transition">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200/80 flex items-center justify-center text-slate-600 font-bold">
                  <Building2 className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-800 text-sm">{sector.name}</p>
                  {sector.description && <p className="text-xs text-slate-500 mt-0.5">{sector.description}</p>}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button 
                  onClick={() => {
                    setEditingSector(sector);
                    setEditName(sector.name);
                    setEditDescription(sector.description || '');
                  }}
                  className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                  title="Editar"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => setConfirmDeleteSector(sector)}
                  className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                  title="Excluir"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </li>
          ))}
          {sectors.length === 0 && (
            <li className="px-6 py-12 text-slate-400 text-center text-sm">Nenhum setor cadastrado até o momento.</li>
          )}
        </ul>
      </div>

      {/* EDIT MODAL */}
      {editingSector && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in duration-200">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center">
                <Edit2 className="w-5 h-5 mr-2 text-blue-500" />
                Editar Setor
              </h3>
              <button onClick={() => setEditingSector(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleEditSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Nome do Setor</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Descrição</label>
                <input
                  type="text"
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>

              <div className="pt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingSector(null)}
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

      {/* CONFIRM DELETE MODAL */}
      {confirmDeleteSector && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="bg-rose-100 p-2.5 rounded-full shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold">Excluir Setor?</h3>
            </div>
            
            <p className="text-sm text-slate-600 leading-relaxed font-medium">
              Tem certeza que deseja excluir o setor <strong className="text-slate-800">"{confirmDeleteSector.name}"</strong>? 
              Isso removerá permanentemente o setor e todos os leitos vinculados a ele do servidor.
            </p>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => setConfirmDeleteSector(null)}
                className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 hover:border-slate-300 text-slate-700 font-medium text-xs rounded-lg transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  const targetId = confirmDeleteSector.id;
                  setConfirmDeleteSector(null);
                  await deleteSector(targetId);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs rounded-lg transition shadow-sm cursor-pointer"
              >
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
