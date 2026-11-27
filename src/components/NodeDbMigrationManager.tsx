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
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-5 p-5">
      
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center shrink-0">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-extrabold text-slate-900 tracking-tight">
                Banco de Dados Nativo do Node.js
              </h2>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${
                isNative 
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}>
                {isNative ? 'Ativo & Autônomo' : 'MySQL Externo Ativo'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 max-w-2xl leading-relaxed">
              Armazena os registros diretamente no servidor em <code className="bg-slate-100 text-slate-700 px-1 rounded font-mono">/data/*.json</code>, sem depender de XAMPP ou portas externas.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={loadStatus}
          disabled={loadingStatus}
          className="self-start sm:self-auto px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingStatus ? 'animate-spin text-sky-600' : ''}`} />
          <span>Atualizar Status</span>
        </button>
      </div>

      {/* 2. Comparativo */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        <div className={`p-4 rounded-xl border transition-all ${
          isNative 
            ? 'bg-emerald-50/40 border-emerald-300' 
            : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-600" />
              <span className="font-bold text-xs text-slate-800">Banco Nativo Node.js (Recomendado)</span>
            </div>
            {isNative && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-white px-2 py-0.5 rounded-md border border-emerald-200">
                <Check className="w-3 h-3 text-emerald-600" /> Em Execução
              </span>
            )}
          </div>
          <ul className="text-[11px] text-slate-600 space-y-1">
            <li className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>Cache em memória com gravação atômica em disco.</span>
            </li>
            <li className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>100% autônomo: não precisa abrir XAMPP ou Apache.</span>
            </li>
            <li className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>Snapshots automáticos na pasta <code className="font-mono">/backups</code>.</span>
            </li>
          </ul>

          {!isNative && (
            <button
              type="button"
              onClick={handleActivateNativeDb}
              disabled={activatingNative}
              className="mt-3 w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-3 rounded-lg text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              {activatingNative ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              <span>Ativar Banco Nativo do Node.js</span>
            </button>
          )}
        </div>

        <div className={`p-4 rounded-xl border transition-all ${
          !isNative 
            ? 'bg-sky-50/40 border-sky-300' 
            : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-slate-600" />
              <span className="font-bold text-xs text-slate-800">MySQL Externo (XAMPP)</span>
            </div>
            {!isNative && (
              <span className="text-[10px] font-bold text-sky-700 bg-white px-2 py-0.5 rounded-md border border-sky-200">
                Conectado
              </span>
            )}
          </div>
          <ul className="text-[11px] text-slate-500 space-y-1">
            <li>• Requer inicialização do MySQL no XAMPP Control Panel.</li>
            <li>• Sujeito a conflitos de porta 3306 em máquinas Windows.</li>
            <li>• Indicado apenas se houver necessidade de acesso SQL externo.</li>
          </ul>
        </div>
      </div>

      {/* 3. Feedback Alert */}
      {feedback && (
        <div className={`p-3.5 rounded-xl text-xs border flex items-start gap-2.5 ${
          feedback.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
            : feedback.type === 'error'
            ? 'bg-rose-50 text-rose-800 border-rose-200'
            : 'bg-sky-50 text-sky-800 border-sky-200'
        }`}>
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          ) : feedback.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          ) : (
            <RefreshCw className="w-4 h-4 text-sky-600 shrink-0 mt-0.5 animate-spin" />
          )}
          <div className="space-y-1">
            <p className="font-bold text-xs">{feedback.title}</p>
            <p className="leading-relaxed">{feedback.message}</p>
            {feedback.snapshot && (
              <p className="text-[11px] text-slate-600 mt-1">
                Ponto de restauração: <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200">{feedback.snapshot}</code>
              </p>
            )}
            {feedback.details && (
              <div className="flex flex-wrap gap-1.5 pt-1 text-[11px]">
                <span className="bg-white px-2 py-0.5 rounded font-semibold border border-emerald-200">Auditorias: {feedback.details.audits || 0}</span>
                <span className="bg-white px-2 py-0.5 rounded font-semibold border border-emerald-200">Leitos: {feedback.details.beds || 0}</span>
                <span className="bg-white px-2 py-0.5 rounded font-semibold border border-emerald-200">Setores: {feedback.details.sectors || 0}</span>
                <span className="bg-white px-2 py-0.5 rounded font-semibold border border-emerald-200">Pacientes: {feedback.details.patients || 0}</span>
                <span className="bg-white px-2 py-0.5 rounded font-semibold border border-emerald-200">Usuários: {feedback.details.users || 0}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. Assistente de Migração do Backup Antigo .JSON */}
      <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-4">
        <div>
          <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-sky-600" />
            Importar Backup Antigo (.JSON)
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Compatibiliza backups de versões anteriores do HospAudit com o banco nativo sem apagar dados existentes.
          </p>
        </div>

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
          className="border-2 border-dashed border-slate-300 hover:border-sky-500 rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer bg-white transition-all group"
        >
          <Upload className="w-6 h-6 text-slate-400 group-hover:text-sky-600 transition-colors mb-1.5" />
          <span className="text-xs font-bold text-slate-700">
            {selectedFile ? selectedFile.name : 'Clique para selecionar arquivo .json'}
          </span>
          <span className="text-[11px] text-slate-400 mt-0.5">
            Compatível com backups anteriores e exportações completas
          </span>
        </label>

        {fileAnalysis && (
          <div className="bg-white rounded-xl border border-sky-200 p-4 space-y-3.5">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="font-bold text-xs text-slate-800">
                  <strong className="text-sky-700">{fileAnalysis.totalItems}</strong> registros detectados
                </span>
              </div>
              <span className="text-[10px] font-bold uppercase bg-sky-50 text-sky-700 px-2 py-0.5 rounded-md border border-sky-200">
                Compatível
              </span>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center text-xs">
              <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Auditorias</span>
                <span className="font-extrabold text-slate-800 tabular-nums">{fileAnalysis.audits}</span>
              </div>
              <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Leitos</span>
                <span className="font-extrabold text-slate-800 tabular-nums">{fileAnalysis.beds}</span>
              </div>
              <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Setores</span>
                <span className="font-extrabold text-slate-800 tabular-nums">{fileAnalysis.sectors}</span>
              </div>
              <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Pacientes</span>
                <span className="font-extrabold text-slate-800 tabular-nums">{fileAnalysis.patients}</span>
              </div>
              <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Perguntas</span>
                <span className="font-extrabold text-slate-800 tabular-nums">{fileAnalysis.questions}</span>
              </div>
              <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Usuários</span>
                <span className="font-extrabold text-slate-800 tabular-nums">{fileAnalysis.users}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <label className={`p-3 rounded-xl border cursor-pointer transition flex items-start gap-2.5 ${
                migrationMode === 'merge' 
                  ? 'bg-emerald-50/70 border-emerald-300' 
                  : 'bg-white border-slate-200 hover:bg-slate-50'
              }`}>
                <input
                  type="radio"
                  name="migrationMode"
                  value="merge"
                  checked={migrationMode === 'merge'}
                  onChange={() => setMigrationMode('merge')}
                  className="mt-0.5 text-emerald-600 cursor-pointer"
                />
                <div>
                  <span className="font-bold text-xs text-slate-800 block">Fusão Inteligente (Recomendado)</span>
                  <span className="text-[11px] text-slate-500 block">Preserva registros atuais e mescla os novos dados.</span>
                </div>
              </label>

              <label className={`p-3 rounded-xl border cursor-pointer transition flex items-start gap-2.5 ${
                migrationMode === 'overwrite' 
                  ? 'bg-amber-50/70 border-amber-300' 
                  : 'bg-white border-slate-200 hover:bg-slate-50'
              }`}>
                <input
                  type="radio"
                  name="migrationMode"
                  value="overwrite"
                  checked={migrationMode === 'overwrite'}
                  onChange={() => setMigrationMode('overwrite')}
                  className="mt-0.5 text-amber-600 cursor-pointer"
                />
                <div>
                  <span className="font-bold text-xs text-slate-800 block">Substituição Total</span>
                  <span className="text-[11px] text-slate-500 block">Substitui a base atual (gera snapshot antes).</span>
                </div>
              </label>
            </div>

            <button
              type="button"
              onClick={handleExecuteMigration}
              disabled={migrating}
              className="w-full bg-sky-600 hover:bg-sky-700 text-white font-bold py-2.5 px-4 rounded-xl transition text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {migrating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Migrando dados...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  <span>Executar Migração para Banco Nativo</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* 5. Arquivos Físicos do Banco Nativo no Servidor */}
      {status && status.files && status.files.length > 0 && (
        <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-2.5">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-xs text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <HardDrive className="w-4 h-4 text-slate-500" />
              <span>Arquivos Locais (/data)</span>
            </h4>
            <span className="text-[10px] text-slate-400 font-mono">
              {status.files.length} arquivos
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {status.files.map((file) => (
              <div key={file.name} className="px-2.5 py-2 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 truncate">
                  <FileCode className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                  <span className="font-mono text-[11px] font-semibold text-slate-700 truncate">{file.name}</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono shrink-0 ml-1 tabular-nums">{file.sizeKb} KB</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
