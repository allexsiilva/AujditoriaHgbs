import React, { useState, useEffect, useRef } from 'react';
import { 
  Database, 
  Server, 
  Cpu, 
  Zap, 
  ShieldCheck, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  ArrowRight, 
  HardDrive, 
  FileText, 
  Sparkles, 
  Layers, 
  Lock, 
  Sliders, 
  Check, 
  HelpCircle,
  FileCode,
  FolderOpen
} from 'lucide-react';
import { 
  getNodeDbStatus, 
  activateNodeNativeDb, 
  migrateJsonToNodeDb, 
  NodeDbStatusResponse 
} from '../lib/apiClient';
import { useAuditData } from '../context/AuditContext';

export function NodeDbMigrationManager() {
  const { pullServerToLocal } = useAuditData();

  const [status, setStatus] = useState<NodeDbStatusResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [activatingNative, setActivatingNative] = useState(false);
  const [migrating, setMigrating] = useState(false);

  // Estados do arquivo de backup antigo .JSON
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileAnalysis, setFileAnalysis] = useState<{
    valid: boolean;
    totalItems: number;
    audits: number;
    sectors: number;
    beds: number;
    questions: number;
    users: number;
    patients: number;
    logs: number;
    rawPayload: any;
  } | null>(null);

  const [migrationMode, setMigrationMode] = useState<'merge' | 'overwrite'>('merge');
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    title: string;
    message: string;
    details?: any;
    snapshot?: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Carregar status atual do banco
  const loadStatus = async () => {
    setLoadingStatus(true);
    try {
      const res = await getNodeDbStatus();
      if (res) {
        setStatus(res);
      }
    } catch (e) {
      console.warn('Erro ao carregar status do banco nativo:', e);
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  // Ativar Banco Nativo do Node.js com 1 Clique
  const handleActivateNativeDb = async () => {
    setActivatingNative(true);
    setFeedback(null);
    try {
      const res = await activateNodeNativeDb();
      if (res.success) {
        setFeedback({
          type: 'success',
          title: 'Banco Nativo do Node.js Ativado!',
          message: res.message || 'O sistema agora roda com autonomia total e velocidade máxima, sem depender do XAMPP.'
        });
        await loadStatus();
        await pullServerToLocal();
      } else {
        setFeedback({
          type: 'error',
          title: 'Falha ao Ativar Banco Nativo',
          message: res.message || 'Não foi possível alterar a configuração.'
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        title: 'Erro de Comunicação',
        message: err.message || 'Erro ao conectar ao servidor Node.js.'
      });
    } finally {
      setActivatingNative(false);
    }
  };

  // Análise e Compatibilização do arquivo .JSON antigo
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setFeedback(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        let rawText = (event.target?.result as string || '').trim();
        if (rawText.charCodeAt(0) === 0xFEFF) {
          rawText = rawText.slice(1);
        }

        const parsed = JSON.parse(rawText);
        let payload = parsed;
        if (parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)) {
          payload = parsed.data;
        } else if (parsed.backup && typeof parsed.backup === 'object' && !Array.isArray(parsed.backup)) {
          payload = parsed.backup;
        }

        const getArr = (keys: string[]) => {
          for (const k of keys) {
            if (Array.isArray(payload[k])) return payload[k];
          }
          return [];
        };

        const audits = getArr(['audits', 'auditorias', 'records']);
        const sectors = getArr(['sectors', 'setores', 'alas']);
        const beds = getArr(['beds', 'leitos']);
        const questions = getArr(['questions', 'perguntas', 'itens']);
        const users = getArr(['users', 'usuarios', 'funcionarios', 'colaboradores']);
        const patients = getArr(['patients', 'pacientes', 'prontuarios']);
        const logs = getArr(['logs', 'historico']);

        const totalItems = audits.length + sectors.length + beds.length + questions.length + users.length + patients.length;

        setFileAnalysis({
          valid: true,
          totalItems,
          audits: audits.length,
          sectors: sectors.length,
          beds: beds.length,
          questions: questions.length,
          users: users.length,
          patients: patients.length,
          logs: logs.length,
          rawPayload: parsed
        });

      } catch (err: any) {
        setFileAnalysis(null);
        setFeedback({
          type: 'error',
          title: 'Arquivo JSON Inválido',
          message: 'O arquivo selecionado não contém um formato JSON válido: ' + err.message
        });
      }
    };
    reader.readAsText(file);
  };

  // Executar Migração no Banco Nativo
  const handleExecuteMigration = async () => {
    if (!fileAnalysis || !fileAnalysis.rawPayload) {
      setFeedback({
        type: 'error',
        title: 'Selecione um Arquivo',
        message: 'Por favor, selecione e analise seu arquivo .json de backup antigo antes de migrar.'
      });
      return;
    }

    setMigrating(true);
    setFeedback({
      type: 'info',
      title: 'Executando Migração...',
      message: 'Criando ponto de restauração automático e gravando os dados no banco nativo do Node.js...'
    });

    try {
      const res = await migrateJsonToNodeDb(
        fileAnalysis.rawPayload,
        migrationMode,
        true // Ativa o modo nativo automaticamente
      );

      if (res.success) {
        setFeedback({
          type: 'success',
          title: 'Migração Concluída com Sucesso!',
          message: res.message || 'Seus dados foram integrados perfeitamente ao banco nativo do Node.js.',
          details: res.stats,
          snapshot: res.snapshotFilename
        });

        // Limpa seleção de arquivo e atualiza dados em memória
        setSelectedFile(null);
        setFileAnalysis(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        await loadStatus();
        await pullServerToLocal();

      } else {
        setFeedback({
          type: 'error',
          title: 'Falha na Migração',
          message: res.message || 'Ocorreu um erro ao migrar os dados.'
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        title: 'Erro Inesperado',
        message: err.message || 'Não foi possível concluir a migração para o banco nativo.'
      });
    } finally {
      setMigrating(false);
    }
  };

  const isNative = status ? status.isNativeActive : true;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden space-y-6 p-6">
      
      {/* 1. Header Explicativo com Identidade do Banco Nativo */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-emerald-500/20">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-slate-800 tracking-tight">
                Banco de Dados Nativo do Node.js
              </h2>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                isNative 
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                  : 'bg-amber-100 text-amber-800 border border-amber-200'
              }`}>
                {isNative ? 'Ativo & Autônomo' : 'Modo MySQL Externo'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
              O banco próprio do Node.js grava seus dados diretamente no servidor em arquivos atômicos (<code className="bg-slate-100 text-slate-700 px-1 rounded font-mono">/data/*.json</code>). 
              Ele elimina dependências do XAMPP/Apache, não usa portas bloqueadas e oferece <strong>velocidade máxima instantânea</strong> com total segurança.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={loadStatus}
          disabled={loadingStatus}
          className="self-start md:self-auto px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          title="Atualizar status do banco"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingStatus ? 'animate-spin text-blue-600' : ''}`} />
          <span>Verificar Status</span>
        </button>
      </div>

      {/* 2. Banner de Comparativo e Vantagens */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Card Banco Nativo Node.js */}
        <div className={`p-5 rounded-2xl border transition-all ${
          isNative 
            ? 'bg-gradient-to-br from-emerald-50/70 to-teal-50/40 border-emerald-300 ring-2 ring-emerald-500/10' 
            : 'bg-slate-50 border-slate-200 opacity-90'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-emerald-600" />
              <span className="font-extrabold text-sm text-slate-800">Banco Nativo Node.js (Recomendado)</span>
            </div>
            {isNative && (
              <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-white px-2 py-0.5 rounded-full border border-emerald-200 shadow-2xs">
                <Check className="w-3.5 h-3.5 text-emerald-600" /> Em Execução
              </span>
            )}
          </div>
          <ul className="text-xs text-slate-600 space-y-1.5">
            <li className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span><strong>0ms de latência:</strong> cache em memória com gravação em disco atômica.</span>
            </li>
            <li className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span><strong>100% Autônomo:</strong> funciona sem precisar abrir XAMPP ou Apache.</span>
            </li>
            <li className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span><strong>Zero conflito de porta:</strong> sem erros de porta 3306 bloqueada.</span>
            </li>
            <li className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span><strong>Snapshots automáticos:</strong> backups contínuos na pasta <code className="font-mono text-[10px]">/backups</code>.</span>
            </li>
          </ul>

          {!isNative && (
            <button
              type="button"
              onClick={handleActivateNativeDb}
              disabled={activatingNative}
              className="mt-4 w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-3 rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer"
            >
              {activatingNative ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              <span>Ativar Banco Nativo do Node.js Agora</span>
            </button>
          )}
        </div>

        {/* Card MySQL XAMPP */}
        <div className={`p-5 rounded-2xl border transition-all ${
          !isNative 
            ? 'bg-blue-50/60 border-blue-300 ring-2 ring-blue-500/10' 
            : 'bg-slate-50 border-slate-200 opacity-80'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-slate-600" />
              <span className="font-extrabold text-sm text-slate-800">MySQL Externo (XAMPP)</span>
            </div>
            {!isNative && (
              <span className="text-[11px] font-bold text-blue-700 bg-white px-2 py-0.5 rounded-full border border-blue-200">
                Conectado
              </span>
            )}
          </div>
          <ul className="text-xs text-slate-500 space-y-1.5">
            <li>• Requer inicialização manual do Apache e MySQL no XAMPP Control Panel.</li>
            <li>• Sujeito a conflitos de porta 3306 (outros MySQL nativos do Windows).</li>
            <li>• Requer manutenção de tabelas relacionais e privilégios de usuário root.</li>
          </ul>
        </div>
      </div>

      {/* 3. Feedback Alert */}
      {feedback && (
        <div className={`p-4 rounded-xl text-xs border flex items-start gap-3 transition-all ${
          feedback.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
            : feedback.type === 'error'
            ? 'bg-rose-50 text-rose-800 border-rose-200'
            : 'bg-blue-50 text-blue-800 border-blue-200'
        }`}>
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : feedback.type === 'error' ? (
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          ) : (
            <RefreshCw className="w-5 h-5 text-blue-600 shrink-0 mt-0.5 animate-spin" />
          )}
          <div className="space-y-1">
            <p className="font-bold text-sm">{feedback.title}</p>
            <p className="leading-relaxed">{feedback.message}</p>
            {feedback.snapshot && (
              <p className="text-[11px] text-slate-600 mt-1">
                🛡️ Ponto de restauração salvo em: <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200">{feedback.snapshot}</code>
              </p>
            )}
            {feedback.details && (
              <div className="flex flex-wrap gap-2 pt-1 text-[11px]">
                <span className="bg-white/80 px-2 py-0.5 rounded font-bold border border-emerald-200">
                  Auditorias: {feedback.details.audits || 0}
                </span>
                <span className="bg-white/80 px-2 py-0.5 rounded font-bold border border-emerald-200">
                  Leitos: {feedback.details.beds || 0}
                </span>
                <span className="bg-white/80 px-2 py-0.5 rounded font-bold border border-emerald-200">
                  Setores: {feedback.details.sectors || 0}
                </span>
                <span className="bg-white/80 px-2 py-0.5 rounded font-bold border border-emerald-200">
                  Pacientes: {feedback.details.patients || 0}
                </span>
                <span className="bg-white/80 px-2 py-0.5 rounded font-bold border border-emerald-200">
                  Usuários: {feedback.details.users || 0}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. Assistente de Migração do Backup Antigo .JSON */}
      <div className="bg-slate-50/70 border border-slate-200 rounded-2xl p-6 space-y-5">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-600" />
            <h3 className="font-black text-slate-800 text-sm uppercase tracking-wide">
              Assistente de Migração de Backup Antigo (.JSON)
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Seu backup antigo está em <code className="font-bold text-slate-700">.json</code>? 
            Nosso motor analisa a estrutura antiga, compatibiliza os dados com o banco nativo do Node.js e importa tudo <strong>sem perder nenhuma informação</strong>.
          </p>
        </div>

        {/* Campo de Seleção do Arquivo */}
        <div className="space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileChange}
            className="hidden"
            id="node-db-migration-file"
          />

          <label
            htmlFor="node-db-migration-file"
            className="border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer bg-white transition-all group"
          >
            <Upload className="w-8 h-8 text-slate-400 group-hover:text-indigo-600 transition-colors mb-2" />
            <span className="text-xs font-extrabold text-slate-700">
              {selectedFile ? selectedFile.name : 'Clique para selecionar seu arquivo de backup (.json) antigo'}
            </span>
            <span className="text-[11px] text-slate-400 mt-1">
              Compatível com backups de qualquer versão do HospAudit ou exportações JSON
            </span>
          </label>
        </div>

        {/* Pré-visualização dos Dados Detectados no Backup */}
        {fileAnalysis && (
          <div className="bg-white rounded-xl border border-indigo-200 p-4 space-y-4 shadow-2xs animate-in fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="font-bold text-xs text-slate-800">
                  Arquivo Analisado com Sucesso: <strong className="text-indigo-600">{fileAnalysis.totalItems}</strong> registros detectados
                </span>
              </div>
              <span className="text-[10px] font-bold uppercase bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-200">
                100% Compatível com Node.js
              </span>
            </div>

            {/* Grid com contagem de itens encontrados */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-center text-xs">
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-150">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Auditorias</span>
                <span className="font-black text-slate-800 text-sm">{fileAnalysis.audits}</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-150">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Leitos</span>
                <span className="font-black text-slate-800 text-sm">{fileAnalysis.beds}</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-150">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Setores</span>
                <span className="font-black text-slate-800 text-sm">{fileAnalysis.sectors}</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-150">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Pacientes</span>
                <span className="font-black text-slate-800 text-sm">{fileAnalysis.patients}</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-150">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Perguntas</span>
                <span className="font-black text-slate-800 text-sm">{fileAnalysis.questions}</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-150">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Usuários</span>
                <span className="font-black text-slate-800 text-sm">{fileAnalysis.users}</span>
              </div>
            </div>

            {/* Escolha do Modo de Migração */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600 block">
                Escolha como deseja aplicar os dados:
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className={`p-3.5 rounded-xl border cursor-pointer transition flex items-start gap-2.5 ${
                  migrationMode === 'merge' 
                    ? 'bg-emerald-50/80 border-emerald-300 ring-2 ring-emerald-500/10' 
                    : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}>
                  <input
                    type="radio"
                    name="migrationMode"
                    value="merge"
                    checked={migrationMode === 'merge'}
                    onChange={() => setMigrationMode('merge')}
                    className="mt-0.5 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                  <div>
                    <span className="font-bold text-xs text-slate-800 block">
                      🛡️ Fusão Inteligente (Sem Perda de Dados - Recomendado)
                    </span>
                    <span className="text-[11px] text-slate-500 leading-relaxed block mt-0.5">
                      Preserva os registros existentes no sistema e adiciona os novos dados do backup antigo.
                    </span>
                  </div>
                </label>

                <label className={`p-3.5 rounded-xl border cursor-pointer transition flex items-start gap-2.5 ${
                  migrationMode === 'overwrite' 
                    ? 'bg-amber-50/80 border-amber-300 ring-2 ring-amber-500/10' 
                    : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}>
                  <input
                    type="radio"
                    name="migrationMode"
                    value="overwrite"
                    checked={migrationMode === 'overwrite'}
                    onChange={() => setMigrationMode('overwrite')}
                    className="mt-0.5 text-amber-600 focus:ring-amber-500 cursor-pointer"
                  />
                  <div>
                    <span className="font-bold text-xs text-slate-800 block">
                      ⚠️ Substituição Total
                    </span>
                    <span className="text-[11px] text-slate-500 leading-relaxed block mt-0.5">
                      Substitui a base atual pelos dados do backup. Um ponto de restauração é criado antes da substituição.
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* Botão de Confirmação */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleExecuteMigration}
                disabled={migrating}
                className="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-extrabold py-3.5 px-4 rounded-xl shadow-md shadow-indigo-600/20 hover:shadow-lg hover:shadow-indigo-600/30 transition-all text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {migrating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Migrando e Compatibilizando Dados com Node.js...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 text-amber-300" />
                    <span>Executar Migração para Banco Nativo do Node.js</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 5. Arquivos Físicos do Banco Nativo no Servidor */}
      {status && status.files && status.files.length > 0 && (
        <div className="border border-slate-200 rounded-2xl p-5 bg-white space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-xs text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-slate-500" />
              <span>Arquivos Físicos do Banco Nativo no Servidor (/data)</span>
            </h4>
            <span className="text-[10px] text-slate-400 font-mono">
              {status.files.length} tabelas .JSON sincronizadas
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {status.files.map((file) => (
              <div key={file.name} className="p-2.5 rounded-xl bg-slate-50 border border-slate-150 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 truncate">
                  <FileCode className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <span className="font-mono text-[11px] font-bold text-slate-700 truncate">{file.name}</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono shrink-0 ml-1">{file.sizeKb} KB</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. Rodapé Informativo */}
      <div className="pt-2 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-400 gap-2 border-t border-slate-100">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Segurança de Dados: Todo processo de migração gera snapshot de rollback garantido.</span>
        </div>
        <span className="font-semibold text-slate-500">HospAudit Engine v4.0 (Node.js Embedded)</span>
      </div>

    </div>
  );
}
