import React, { useState, useEffect, useRef } from 'react';
import { DbMiddleware } from '../services/dbMiddleware';
import { 
  Database, Play, Upload, Check, AlertCircle, RefreshCw, Table, 
  Search, FileText, Settings, HelpCircle, CheckCircle, Eye, 
  Columns, DatabaseZap, ListCollapse, ArrowDownWideNarrow, CornerDownRight 
} from 'lucide-react';

interface ColumnInfo {
  Field: string;
  Type: string;
  Null: string;
  Key: string;
  Default: any;
  Extra: string;
}

interface TableInfo {
  table: string;
  columns: ColumnInfo[];
  rows_count: number;
  samples: any[];
}

export function DatabaseManager() {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'tables' | 'query' | 'import'>('tables');

  // Direct SQL Editor states
  const [sqlQuery, setSqlQuery] = useState<string>('SELECT * FROM setores LIMIT 10;');
  const [executingQuery, setExecutingQuery] = useState<boolean>(false);
  const [queryResult, setQueryResult] = useState<any>(null);
  const [queryError, setQueryError] = useState<string | null>(null);

  // Import SQL states
  const [safeMode, setSafeMode] = useState<boolean>(true);
  const [importing, setImporting] = useState<boolean>(false);
  const [importProgress, setImportProgress] = useState<{ current: number, total: number } | null>(null);
  const [importResult, setImportResult] = useState<any>(null);
  const [dragOver, setDragOver] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchTables = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await DbMiddleware.getDatabaseTables();
      if (res.success && res.tables) {
        setTables(res.tables);
        if (res.tables.length > 0 && !selectedTable) {
          setSelectedTable(res.tables[0].table);
        }
      } else {
        setError(res.message || 'Falha ao carregar as tabelas do banco de dados.');
      }
    } catch (err: any) {
      setError(err.message || 'Erro inesperado ao carregar tabelas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTables();
  }, []);

  const handleExecuteQuery = async (queryText?: string) => {
    const queryToRun = queryText || sqlQuery;
    if (!queryToRun.trim()) return;

    setExecutingQuery(true);
    setQueryResult(null);
    setQueryError(null);

    try {
      const res = await DbMiddleware.executeSql(queryToRun, false);
      if (res.success) {
        setQueryResult(res);
      } else {
        setQueryError(res.message || 'Erro desconhecido ao executar query.');
      }
    } catch (err: any) {
      setQueryError(err.message || 'Erro de conexão.');
    } finally {
      setExecutingQuery(false);
    }
  };

  const handleImportSql = async (sqlContent: string) => {
    if (!sqlContent.trim()) {
      alert('O arquivo SQL está vazio.');
      return;
    }

    setImporting(true);
    setImportResult(null);
    setImportProgress(null);

    try {
      // Split and clean queries to process line-by-line (statement-by-statement)
      const queries = sqlContent
        .replace(/(--.*)|(\/\*(.|\n)*?\*\/)/g, '') // remove comments
        .split(';')
        .map((q: string) => q.trim())
        .filter((q: string) => q.length > 0);

      if (queries.length === 0) {
        alert('Nenhum comando SQL válido encontrado no arquivo.');
        setImporting(false);
        return;
      }

      setImportProgress({ current: 0, total: queries.length });

      let executed = 0;
      let skipped = 0;
      let errors: any[] = [];

      for (let i = 0; i < queries.length; i++) {
        const currentQuery = queries[i];
        setImportProgress({ current: i + 1, total: queries.length });
        
        try {
          const res = await DbMiddleware.executeSql(currentQuery, safeMode);
          if (res.success) {
            executed += (res.executed || 0);
            skipped += (res.skipped_duplicates || 0);
            if (res.errors && res.errors.length > 0) {
              errors.push(...res.errors);
            }
          } else {
            errors.push({
              query: currentQuery.substring(0, 100) + (currentQuery.length > 100 ? '...' : ''),
              error: res.message || 'Erro desconhecido ao processar instrução'
            });
          }
        } catch (e: any) {
          errors.push({
            query: currentQuery.substring(0, 100) + (currentQuery.length > 100 ? '...' : ''),
            error: e.message || String(e)
          });
        }
      }

      setImportResult({
        success: true,
        message: `Processamento concluído linha a linha. Foram analisados ${queries.length} blocos SQL.`,
        executed,
        skipped_duplicates: skipped,
        errors
      });

      // Refresh tables count
      await fetchTables();
    } catch (err: any) {
      alert('Erro na importação: ' + (err.message || err));
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      handleImportSql(text);
    };
    reader.readAsText(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      handleImportSql(text);
    };
    reader.readAsText(file);
  };

  const currentTableData = tables.find(t => t.table === selectedTable);

  const sqlTemplates = [
    { label: 'Ver Setores', sql: 'SELECT * FROM setores;' },
    { label: 'Ver Usuários', sql: 'SELECT id, nome, email, nivel, cargo FROM usuarios;' },
    { label: 'Ver Perguntas', sql: 'SELECT * FROM perguntas;' },
    { label: 'Estrutura das Perguntas', sql: 'DESCRIBE perguntas;' },
    { label: 'Logs Recentes', sql: 'SELECT * FROM logs_sistema ORDER BY data_hora DESC LIMIT 20;' },
    { label: 'Contar Auditorias', sql: 'SELECT tipo, COUNT(*) as total FROM auditorias GROUP BY tipo;' }
  ];

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6">
      {/* Header com Abas de Controle */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-100 pb-4 gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <DatabaseZap className="w-5 h-5 text-indigo-600" /> Gerenciador Integrado do Banco de Dados
          </h2>
          <p className="text-xs text-slate-500 mt-1">Configure tabelas, execute queries diretas e importe esquemas SQL legados sem perder registros atuais.</p>
        </div>
        
        <div className="flex bg-slate-100 p-1 rounded-xl w-full md:w-auto overflow-x-auto">
          <button 
            type="button"
            onClick={() => setActiveSubTab('tables')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer whitespace-nowrap ${activeSubTab === 'tables' ? 'bg-white text-indigo-600 shadow-sm font-extrabold' : 'text-slate-600 hover:text-slate-800'}`}
          >
            <Table className="w-3.5 h-3.5" /> Inspetor de Tabelas
          </button>
          <button 
            type="button"
            onClick={() => setActiveSubTab('query')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer whitespace-nowrap ${activeSubTab === 'query' ? 'bg-white text-indigo-600 shadow-sm font-extrabold' : 'text-slate-600 hover:text-slate-800'}`}
          >
            <Play className="w-3.5 h-3.5" /> Executar Queries SQL
          </button>
          <button 
            type="button"
            onClick={() => setActiveSubTab('import')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer whitespace-nowrap ${activeSubTab === 'import' ? 'bg-white text-indigo-600 shadow-sm font-extrabold' : 'text-slate-600 hover:text-slate-800'}`}
          >
            <Upload className="w-3.5 h-3.5" /> Importar Backup SQL
          </button>
        </div>
      </div>

      {/* Subtab 1: Inspetor de Tabelas */}
      {activeSubTab === 'tables' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <RefreshCw className="w-8 h-8 animate-spin mb-3 text-indigo-500" />
              <p className="text-sm font-medium">Carregando tabelas do banco de dados...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <div className="text-xs font-semibold">{error}</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Lista de tabelas */}
              <div className="lg:col-span-4 space-y-3">
                <div className="flex justify-between items-center px-1">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Columns className="w-3.5 h-3.5" /> Tabelas Ativas ({tables.length})
                  </h3>
                  <button 
                    onClick={fetchTables} 
                    className="p-1 text-slate-400 hover:text-indigo-600 transition rounded hover:bg-slate-50"
                    title="Atualizar lista"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
                
                <div className="space-y-1.5 max-h-[480px] overflow-y-auto border border-slate-200 rounded-xl p-2 bg-slate-50/50">
                  {tables.map(t => (
                    <button
                      key={t.table}
                      type="button"
                      onClick={() => setSelectedTable(t.table)}
                      className={`w-full text-left p-3 rounded-lg text-sm transition flex items-center justify-between group ${
                        selectedTable === t.table 
                          ? 'bg-indigo-600 text-white font-bold shadow-xs' 
                          : 'bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30 text-slate-700'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <Table className={`w-4 h-4 ${selectedTable === t.table ? 'text-white' : 'text-slate-400'}`} />
                        <span className="font-mono">{t.table}</span>
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                        selectedTable === t.table ? 'bg-indigo-700 text-indigo-100' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {t.rows_count} registros
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Detalhes e amostra da tabela selecionada */}
              <div className="lg:col-span-8 space-y-6">
                {currentTableData ? (
                  <div className="space-y-6">
                    {/* Metadados */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-base font-bold text-slate-800 font-mono">
                            Tabela: {currentTableData.table}
                          </h4>
                          <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] font-bold rounded-md">
                            Active Schema
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          Possui {currentTableData.columns.length} colunas estruturadas e {currentTableData.rows_count} linhas salvas.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setSqlQuery(`SELECT * FROM ${currentTableData.table} LIMIT 50;`);
                            setActiveSubTab('query');
                          }}
                          className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold rounded-lg transition shadow-2xs flex items-center gap-1.5"
                        >
                          <Play className="w-3 h-3 text-indigo-600" /> Analisar
                        </button>
                      </div>
                    </div>

                    {/* Estrutura das Colunas */}
                    <div>
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Columns className="w-3.5 h-3.5" /> Definição de Colunas / Schema
                      </h4>
                      <div className="overflow-x-auto border border-slate-200 rounded-xl">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                            <tr>
                              <th className="p-3 font-bold">Coluna</th>
                              <th className="p-3 font-bold">Tipo</th>
                              <th className="p-3 font-bold">Permite Nulo?</th>
                              <th className="p-3 font-bold">Chave</th>
                              <th className="p-3 font-bold">Padrão</th>
                              <th className="p-3 font-bold">Extra</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-mono text-slate-600">
                            {currentTableData.columns.map(col => (
                              <tr key={col.Field} className="hover:bg-slate-50/50">
                                <td className="p-3 font-semibold text-slate-800">{col.Field}</td>
                                <td className="p-3 text-indigo-600">{col.Type}</td>
                                <td className="p-3">{col.Null}</td>
                                <td className="p-3">
                                  {col.Key ? (
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                      col.Key === 'PRI' ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-slate-100 text-slate-600'
                                    }`}>
                                      {col.Key}
                                    </span>
                                  ) : '-'}
                                </td>
                                <td className="p-3 text-slate-400">{col.Default !== null ? String(col.Default) : 'NULL'}</td>
                                <td className="p-3 text-slate-500 text-[10px]">{col.Extra}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Amostra dos registros */}
                    <div>
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Eye className="w-3.5 h-3.5" /> Pré-visualização de Linhas (Até 100 registros)
                      </h4>
                      {currentTableData.samples.length === 0 ? (
                        <div className="p-6 text-center border border-dashed border-slate-200 rounded-xl text-slate-400 text-xs italic bg-slate-50">
                          Nenhum registro encontrado nesta tabela.
                        </div>
                      ) : (
                        <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-80">
                          <table className="w-full text-left text-xs relative">
                            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0">
                              <tr>
                                {Object.keys(currentTableData.samples[0]).map(key => (
                                  <th key={key} className="p-3 font-bold bg-slate-50 font-mono">{key}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-slate-600">
                              {currentTableData.samples.map((row, rIdx) => (
                                <tr key={rIdx} className="hover:bg-slate-50/50 font-mono">
                                  {Object.values(row).map((val: any, cIdx) => (
                                    <td key={cIdx} className="p-3 max-w-xs truncate" title={val !== null ? String(val) : 'NULL'}>
                                      {val === null ? (
                                        <span className="text-rose-400 italic font-sans">NULL</span>
                                      ) : typeof val === 'object' || (typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))) ? (
                                        <span className="text-slate-400 text-[10px] bg-slate-100 px-1 py-0.5 rounded">Object</span>
                                      ) : (
                                        String(val)
                                      )}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    <Table className="w-10 h-10 mb-2 opacity-50" />
                    <p className="text-xs">Selecione uma tabela ao lado para inspecionar</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Subtab 2: Executar Queries SQL */}
      {activeSubTab === 'query' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl text-xs text-amber-800 flex items-start gap-3">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Aviso de Segurança:</span> Você está acessando o console administrativo direto. Operações como <code className="bg-amber-100 px-1 py-0.2 rounded font-bold">DELETE</code>, <code className="bg-amber-100 px-1 py-0.2 rounded font-bold">UPDATE</code> ou <code className="bg-amber-100 px-1 py-0.2 rounded font-bold">ALTER</code> alteram os dados em tempo real no servidor. Certifique-se de validar as instruções antes de clicar em executar.
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Modelos rápidos de queries */}
            <div className="lg:col-span-3 space-y-3">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 px-1">
                <FileText className="w-3.5 h-3.5" /> Templates de Query
              </h3>
              <div className="space-y-1.5 p-2 bg-slate-50/50 rounded-xl border border-slate-200">
                {sqlTemplates.map((tpl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setSqlQuery(tpl.sql);
                      handleExecuteQuery(tpl.sql);
                    }}
                    className="w-full text-left p-2.5 bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30 text-xs font-medium text-slate-700 rounded-lg transition"
                  >
                    {tpl.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Editor de Código e Resultados */}
            <div className="lg:col-span-9 space-y-4">
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <div className="bg-slate-50 border-b border-slate-200 p-3 flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-500 font-mono">SQL QUERY COMMANDS</span>
                  <button
                    type="button"
                    onClick={() => handleExecuteQuery()}
                    disabled={executingQuery || !sqlQuery.trim()}
                    className="px-4 py-1.5 bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-400 font-bold text-xs rounded-lg shadow-sm transition flex items-center gap-1.5"
                  >
                    {executingQuery ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5 fill-current" />
                    )}
                    Executar Comando
                  </button>
                </div>
                <textarea
                  value={sqlQuery}
                  onChange={e => setSqlQuery(e.target.value)}
                  placeholder="Escreva seu script SQL aqui (ex: SELECT * FROM setores WHERE id = 'uti-1');"
                  className="w-full h-36 p-4 font-mono text-sm bg-slate-900 text-emerald-400 focus:outline-none focus:ring-0 resize-y"
                />
              </div>

              {/* Bloco de resultados */}
              {queryError && (
                <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="text-xs font-bold uppercase tracking-wide">Erro de Execução SQL</div>
                    <pre className="text-xs font-mono whitespace-pre-wrap">{queryError}</pre>
                  </div>
                </div>
              )}

              {queryResult && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center px-1 text-xs">
                    <span className="font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> Resultados da Execução
                    </span>
                    <span className="font-mono text-slate-400">
                      {queryResult.type === 'select' && `${queryResult.count} registros retornados`}
                      {queryResult.type === 'exec' && `${queryResult.affected_rows} linhas afetadas`}
                      {queryResult.type === 'batch' && `Lote processado com sucesso (${queryResult.executed} comandos)`}
                    </span>
                  </div>

                  {queryResult.type === 'select' && (
                    queryResult.rows.length === 0 ? (
                      <div className="p-6 text-center border border-dashed border-slate-200 rounded-xl text-slate-400 text-xs italic bg-slate-50">
                        A consulta retornou 0 linhas.
                      </div>
                    ) : (
                      <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-80">
                        <table className="w-full text-left text-xs relative">
                          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0">
                            <tr>
                              {queryResult.columns.map((key: string) => (
                                <th key={key} className="p-3 font-bold bg-slate-50 font-mono">{key}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-slate-600">
                            {queryResult.rows.map((row: any, rIdx: number) => (
                              <tr key={rIdx} className="hover:bg-slate-50/50 font-mono">
                                {queryResult.columns.map((colName: string, cIdx: number) => {
                                  const val = row[colName];
                                  return (
                                    <td key={cIdx} className="p-3 max-w-xs truncate" title={val !== null ? String(val) : 'NULL'}>
                                      {val === null ? (
                                        <span className="text-rose-400 italic font-sans">NULL</span>
                                      ) : typeof val === 'object' || (typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))) ? (
                                        <span className="text-slate-400 text-[10px] bg-slate-100 px-1 py-0.5 rounded">Object</span>
                                      ) : (
                                        String(val)
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  )}

                  {queryResult.type === 'exec' && (
                    <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl font-medium text-xs">
                      {queryResult.message || 'Comando SQL executado com sucesso.'} (Colunas/Linhas afetadas: {queryResult.affected_rows})
                    </div>
                  )}

                  {queryResult.type === 'batch' && (
                    <div className="space-y-3">
                      <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl font-medium text-xs">
                        Lote SQL finalizado. Executou com sucesso {queryResult.executed} comandos.
                      </div>
                      {queryResult.errors && queryResult.errors.length > 0 && (
                        <div className="border border-rose-200 rounded-xl p-4 bg-rose-50/40 space-y-2">
                          <span className="text-xs font-bold text-rose-700">Ocorreram {queryResult.errors.length} erros no lote:</span>
                          <div className="space-y-1.5 max-h-36 overflow-y-auto">
                            {queryResult.errors.map((err: any, idx: number) => (
                              <div key={idx} className="text-xs font-mono bg-white p-2 rounded border border-rose-100">
                                <span className="font-bold text-rose-600">Query:</span> {err.query}<br />
                                <span className="font-bold text-rose-600">Erro:</span> {err.error}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Subtab 3: Importar Backup SQL */}
      {activeSubTab === 'import' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="bg-indigo-50 border border-indigo-100 p-5 rounded-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-1">
              <h3 className="font-bold text-indigo-950 flex items-center gap-2">
                <Database className="w-5 h-5 text-indigo-600" /> Sincronização Inteligente sem Perda de Dados
              </h3>
              <p className="text-xs text-indigo-800/80 leading-relaxed max-w-2xl">
                O importador analisa scripts SQL legados e executa um mecanismo que detecta e gerencia registros duplicados com base no método escolhido abaixo, garantindo a integridade dos dados existentes.
              </p>
            </div>

            {/* Seletor de Modo de Importação */}
            <div className="flex flex-col sm:flex-row gap-3 bg-white p-2 rounded-xl border border-indigo-100 shadow-2xs">
              <button
                type="button"
                onClick={() => setSafeMode(true)}
                className={`flex flex-col items-start gap-0.5 px-3 py-2 rounded-lg transition-all ${
                  safeMode 
                    ? 'bg-indigo-600 text-white shadow-xs' 
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="text-[11px] font-extrabold uppercase tracking-wider">INSERT IGNORE</span>
                <span className={`text-[9px] ${safeMode ? 'text-indigo-200' : 'text-slate-400'}`}>Pula duplicados existentes</span>
              </button>
              <button
                type="button"
                onClick={() => setSafeMode(false)}
                className={`flex flex-col items-start gap-0.5 px-3 py-2 rounded-lg transition-all ${
                  !safeMode 
                    ? 'bg-indigo-600 text-white shadow-xs' 
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="text-[11px] font-extrabold uppercase tracking-wider">UPSERT / MESCLAR</span>
                <span className={`text-[9px] ${!safeMode ? 'text-indigo-200' : 'text-slate-400'}`}>Sobrescreve registros antigos</span>
              </button>
            </div>
          </div>

          {/* Area de Importação / Dropzone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-2xl p-10 text-center transition flex flex-col items-center justify-center min-h-[220px] ${
              dragOver 
                ? 'border-indigo-500 bg-indigo-50/40' 
                : 'border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            {importing ? (
              <div className="space-y-4 w-full max-w-md mx-auto">
                <RefreshCw className="w-10 h-10 animate-spin text-indigo-600 mx-auto" />
                <div className="space-y-1">
                  <div className="text-sm font-bold text-slate-700">Processando arquivo SQL linha a linha...</div>
                  {importProgress && (
                    <div className="text-xs text-indigo-600 font-extrabold font-mono">
                      Instrução {importProgress.current} de {importProgress.total} ({Math.round((importProgress.current / importProgress.total) * 100)}%)
                    </div>
                  )}
                </div>
                
                {/* Progress Bar */}
                {importProgress && (
                  <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden border border-slate-200/40">
                    <div 
                      className="bg-indigo-600 h-full rounded-full transition-all duration-150"
                      style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                    />
                  </div>
                )}
                <div className="text-[10px] text-slate-400">Verificando IDs, integridade das chaves e aplicando filtros de duplicidade.</div>
              </div>
            ) : (
              <div className="space-y-4 max-w-md">
                <div className="w-12 h-12 bg-white rounded-full border border-slate-200 flex items-center justify-center shadow-xs mx-auto text-indigo-600">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">Arraste e solte seu arquivo SQL antigo aqui</p>
                  <p className="text-xs text-slate-500 mt-1">Compatível com arquivos <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-600">.sql</code> ou dumps estruturados.</p>
                </div>
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm transition"
                  >
                    Selecionar Arquivo SQL
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".sql"
                    className="hidden"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Resumo da Importação */}
          {importResult && (
            <div className="border border-slate-200 rounded-2xl p-5 space-y-4 animate-in slide-in-from-bottom-3 duration-200">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <CheckCircle className="w-5 h-5 text-emerald-500" />
                <h4 className="font-bold text-slate-800 text-sm">Resumo da Importação finalizada</h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-emerald-50/50 border border-emerald-100 p-4 rounded-xl text-center">
                  <span className="block text-2xl font-black text-emerald-700 font-mono">{importResult.executed}</span>
                  <span className="block text-xs font-bold text-emerald-800 uppercase tracking-wide mt-1">Registros Inseridos</span>
                </div>
                <div className="bg-indigo-50/50 border border-indigo-100 p-4 rounded-xl text-center">
                  <span className="block text-2xl font-black text-indigo-700 font-mono">{importResult.skipped_duplicates}</span>
                  <span className="block text-xs font-bold text-indigo-800 uppercase tracking-wide mt-1">Duplicados Mantidos</span>
                </div>
                <div className="bg-rose-50/50 border border-rose-100 p-4 rounded-xl text-center">
                  <span className="block text-2xl font-black text-rose-700 font-mono">{importResult.errors ? importResult.errors.length : 0}</span>
                  <span className="block text-xs font-bold text-rose-800 uppercase tracking-wide mt-1">Erros Críticos</span>
                </div>
              </div>

              {/* Mensagem geral */}
              <div className="text-xs text-slate-600 font-medium">
                {importResult.message}
              </div>

              {/* Erros detalhados se houver */}
              {importResult.errors && importResult.errors.length > 0 && (
                <div className="border border-rose-200 rounded-xl p-4 bg-rose-50/40 space-y-2">
                  <span className="text-xs font-bold text-rose-700">Ocorreram {importResult.errors.length} erros durante a execução:</span>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {importResult.errors.map((err: any, idx: number) => (
                      <div key={idx} className="text-xs font-mono bg-white p-2.5 rounded border border-rose-100">
                        <span className="font-bold text-rose-600">Instrução:</span> {err.query}<br />
                        <span className="font-bold text-rose-600">Erro:</span> {err.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
