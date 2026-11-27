import React, { useState, useRef, useContext } from 'react';
import { 
  Database, 
  Download, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  FileText, 
  RefreshCw, 
  ShieldCheck, 
  Server,
  ArrowDownToLine,
  ArrowUpFromLine,
  FileCode,
  HardDrive
} from 'lucide-react';
import { useAuditData } from '../context/AuditContext';
import { AuthContext } from '../context/AuthContext';
import { useSystemLogs } from '../context/SystemLogContext';
import { createServerBackup } from '../lib/apiClient';

interface UnifiedBackupFieldProps {
  onSuccess?: () => void;
  className?: string;
}

export function UnifiedBackupField({ onSuccess, className = '' }: UnifiedBackupFieldProps) {
  const { 
    audits, 
    sectors, 
    beds, 
    questions, 
    users, 
    patients, 
    cargos, 
    logs,
    pullServerToLocal
  } = useAuditData();
  const { user } = useContext(AuthContext);
  const { addLog } = useSystemLogs();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    title: string;
    message: string;
  } | null>(null);

  // Totais atuais para exibição transparente
  const totalRecords = audits.length + sectors.length + beds.length + questions.length + (users?.length || 0);

  // 1. Exportação Direta (JSON completo de todo o banco)
  const handleExportJSON = () => {
    try {
      setIsExporting(true);
      setFeedback(null);

      const backupData = {
        meta: {
          app: 'HospAudit',
          version: '4.0.0',
          exportedAt: new Date().toISOString(),
          exportedBy: user?.name || 'Administrador',
          description: 'Backup completo do banco de dados e auditorias'
        },
        audits,
        sectors,
        beds,
        questions,
        users,
        patients,
        cargos,
        logs: (logs || []).slice(0, 1000)
      };

      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const dateTag = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      link.href = url;
      link.download = `hospaudit-backup-${dateTag}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      addLog(user?.name || 'Administrador', 'Backup', `Backup JSON baixado com sucesso (${totalRecords} registros).`);
      setFeedback({
        type: 'success',
        title: 'Backup Exportado com Sucesso!',
        message: `Arquivo gerado com ${audits.length} auditorias, ${beds.length} leitos, ${sectors.length} setores e cadastros hospitalares.`
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        title: 'Falha na Exportação',
        message: err.message || 'Não foi possível gerar o arquivo de backup.'
      });
    } finally {
      setIsExporting(false);
    }
  };

  // 2. Exportação Direta em SQL (Dump do MySQL / XAMPP)
  const handleExportSQL = async () => {
    try {
      setIsExporting(true);
      setFeedback(null);

      const backupResult = await createServerBackup();
      if (backupResult.success && backupResult.url) {
        addLog(user?.name || 'Administrador', 'Backup SQL', 'Dump SQL do MySQL gerado com sucesso.');
        const link = document.createElement('a');
        link.href = backupResult.url;
        link.download = backupResult.url.split('/').pop() || 'hospaudit-backup.sql';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setFeedback({
          type: 'success',
          title: 'Dump SQL Gerado com Sucesso!',
          message: backupResult.message || 'Download do arquivo .sql do banco MySQL iniciado.'
        });
      } else {
        // Fallback local se o servidor MySQL não responder
        handleExportJSON();
      }
    } catch (err: any) {
      // Fallback gracioso para JSON
      handleExportJSON();
    } finally {
      setIsExporting(false);
    }
  };

  // 3. Processamento de Arquivo Selecionado (Importação Inteligente .JSON ou .SQL)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setFeedback(null);
  };

  const handleExecuteImport = async () => {
    if (!selectedFile) {
      setFeedback({
        type: 'error',
        title: 'Nenhum Arquivo Selecionado',
        message: 'Por favor, selecione um arquivo de backup (.json ou .sql) antes de importar.'
      });
      return;
    }

    const fileName = selectedFile.name.toLowerCase();
    setIsImporting(true);
    setFeedback({
      type: 'info',
      title: 'Importando Dados...',
      message: `Lendo e aplicando o arquivo '${selectedFile.name}' no banco...`
    });

    try {
      const fileText = await selectedFile.text();

      if (fileName.endsWith('.json')) {
        // Parse e restauração JSON
        const parsed = JSON.parse(fileText);

        const res = await fetch('/api.php?action=import_data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data: parsed,
            mode: 'merge'
          })
        });

        if (!res.ok) {
          throw new Error('Servidor retornou erro ao processar o arquivo JSON.');
        }

        const dataRes = await res.json();
        if (dataRes && dataRes.success === false) {
          throw new Error(dataRes.message || 'Erro ao processar dados.');
        }

        addLog(user?.name || 'Administrador', 'Importação de Backup', `Backup '${selectedFile.name}' importado com sucesso.`);
        
        // Atualiza estado local imediatamente
        await pullServerToLocal();

        setFeedback({
          type: 'success',
          title: 'Importação Concluída com Sucesso!',
          message: `O banco de dados e os arquivos locais foram atualizados perfeitamente com os dados de '${selectedFile.name}'.`
        });

        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        if (onSuccess) onSuccess();

      } else if (fileName.endsWith('.sql')) {
        // Envio e execução SQL
        const res = await fetch('/api.php?action=import_sql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sql: fileText,
            mode: 'merge'
          })
        });

        if (!res.ok) {
          throw new Error('Servidor retornou erro ao executar as instruções SQL.');
        }

        const sqlRes = await res.json();
        if (sqlRes && sqlRes.success) {
          addLog(user?.name || 'Administrador', 'Importação SQL', `Arquivo SQL '${selectedFile.name}' aplicado.`);
          await pullServerToLocal();

          setFeedback({
            type: 'success',
            title: 'Dump SQL Importado com Sucesso!',
            message: `Consultas executadas: ${sqlRes.executed || 0}. Registros existentes foram preservados.`
          });

          setSelectedFile(null);
          if (fileInputRef.current) fileInputRef.current.value = '';
          if (onSuccess) onSuccess();
        } else {
          throw new Error(sqlRes?.message || 'Falha ao executar o arquivo SQL.');
        }
      } else {
        throw new Error('Formato inválido. Por favor envie um arquivo com extensão .json ou .sql.');
      }
    } catch (err: any) {
      console.error('[Backup Import Error]', err);
      setFeedback({
        type: 'error',
        title: 'Erro na Importação',
        message: err.message || 'Não foi possível restaurar os dados do arquivo selecionado.'
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden ${className}`}>
      {/* Top Header */}
      <div className="px-5 py-3.5 bg-slate-50/70 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center shrink-0">
            <Database className="w-4 h-4 text-sky-600" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-slate-900">
              Central de Backup (.JSON e .SQL)
            </h3>
            <p className="text-xs text-slate-500">
              Exporte cópias de segurança ou restaure arquivos mantendo registros existentes.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-xs text-slate-600 shrink-0">
          <HardDrive className="w-3.5 h-3.5 text-emerald-600" />
          <span>Registros ativos: <strong className="text-slate-900 font-mono tabular-nums">{totalRecords}</strong></span>
        </div>
      </div>

      {/* Main Single Box / Field */}
      <div className="p-5 space-y-4">
        {/* Feedback Alert */}
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
            <div>
              <p className="font-bold text-xs">{feedback.title}</p>
              <p className="mt-0.5 leading-relaxed">{feedback.message}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* LADO 1: EXPORTAR */}
          <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center gap-2 text-slate-800 font-bold text-xs uppercase tracking-wider">
                <ArrowDownToLine className="w-4 h-4 text-sky-600" />
                <span>1. Exportar Backup</span>
              </div>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Baixe uma cópia completa com auditorias, pacientes, setores, leitos e configurações.
              </p>
            </div>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={handleExportJSON}
                disabled={isExporting}
                className="w-full bg-sky-600 hover:bg-sky-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-60"
              >
                {isExporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                <span>Baixar Backup Completo (.JSON)</span>
              </button>

              <button
                type="button"
                onClick={handleExportSQL}
                disabled={isExporting}
                className="w-full bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold py-2 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-60"
              >
                <FileCode className="w-4 h-4 text-emerald-600" />
                <span>Baixar Dump SQL (.SQL para MySQL / XAMPP)</span>
              </button>
            </div>
          </div>

          {/* LADO 2: IMPORTAR */}
          <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center gap-2 text-slate-800 font-bold text-xs uppercase tracking-wider">
                <ArrowUpFromLine className="w-4 h-4 text-emerald-600" />
                <span>2. Importar e Restaurar</span>
              </div>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Selecione um arquivo (.json ou .sql). O sistema mescla dados novos sem apagar os existentes.
              </p>
            </div>

            <div className="space-y-2.5">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.sql"
                onChange={handleFileChange}
                className="hidden"
                id="unified-backup-file-input"
              />

              <label
                htmlFor="unified-backup-file-input"
                className="border-2 border-dashed border-slate-300 hover:border-sky-500 rounded-xl p-3.5 flex flex-col items-center justify-center text-center cursor-pointer bg-white transition-all group"
              >
                <Upload className="w-5 h-5 text-slate-400 group-hover:text-sky-600 transition-colors mb-1.5" />
                <span className="text-xs font-bold text-slate-700">
                  {selectedFile ? selectedFile.name : 'Clique para selecionar arquivo (.json ou .sql)'}
                </span>
                <span className="text-[11px] text-slate-400 mt-0.5">
                  {selectedFile 
                    ? `${(selectedFile.size / 1024).toFixed(1)} KB pronto para importar` 
                    : 'Formatos aceitos: .JSON ou .SQL'}
                </span>
              </label>

              {selectedFile && (
                <button
                  type="button"
                  onClick={handleExecuteImport}
                  disabled={isImporting}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-60"
                >
                  {isImporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  <span>Confirmar e Restaurar Arquivo</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
