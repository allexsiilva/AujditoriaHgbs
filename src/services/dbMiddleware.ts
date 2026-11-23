import { checkApi, saveToServer, loadFromServer } from '../lib/apiClient';
import { DataValidator } from '../lib/dataValidator';

/**
 * DbMiddleware - Classe de serviço para conexão e intermediação segura com o banco de dados MySQL.
 * Contém métodos estáticos de validação que verificam tipos, campos obrigatórios e
 * sanitizam strings contra injeção SQL antes de qualquer operação no banco de dados.
 */
export class DbMiddleware {
  /**
   * Sanitiza strings contra injeção SQL básica e remove tags perigosas
   */
  public static sanitizeForSql(val: any): string {
    if (val === undefined || val === null) return '';
    let str = String(val).trim();
    
    // Anti-SQL injection: escapa aspas simples duplicando-as e barra invertida
    str = str.replace(/'/g, "''");
    str = str.replace(/\\/g, "\\\\");
    // Remove ponto e vírgula para mitigar múltiplos comandos na mesma query
    str = str.replace(/;/g, "");
    
    // Strip HTML tags to avoid XSS
    str = str.replace(/<[^>]*>?/gm, '');
    
    return str;
  }

  /**
   * Valida tipos, campos obrigatórios e sanitiza profundamente contra injeção SQL de forma recursiva
   */
  public static validate(action: string, payload: any): any {
    if (!payload) {
      throw new Error(`Payload vazio para a ação: ${action}`);
    }
    // Executa a validação estrutural do DataValidator existente
    const sanitizedStruct = DataValidator.validateAndSanitize(action, payload);
    
    // Executa a sanitização adicional específica para SQL de forma recursiva
    return DbMiddleware.deepSqlSanitize(sanitizedStruct);
  }

  /**
   * Aplica sanitização de string contra SQL injection de forma recursiva
   */
  private static deepSqlSanitize(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    
    if (typeof obj === 'string') {
      return DbMiddleware.sanitizeForSql(obj);
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => DbMiddleware.deepSqlSanitize(item));
    }
    
    if (typeof obj === 'object') {
      const result: any = {};
      for (const key of Object.keys(obj)) {
        // Sanitiza a chave e o valor
        const sanitizedKey = DbMiddleware.sanitizeForSql(key);
        result[sanitizedKey] = DbMiddleware.deepSqlSanitize(obj[key]);
      }
      return result;
    }
    
    return obj;
  }

  private static lastFetchStatus: 'success' | 'failed' | 'idle' = 'idle';

  public static getLastFetchStatus(): 'success' | 'failed' | 'idle' {
    return this.lastFetchStatus;
  }

  /**
   * Directly verifies the server connectivity and data health status.
   */
  public static async verifyDataFetchStatus(): Promise<boolean> {
    try {
      const online = await checkApi();
      if (!online) {
        this.lastFetchStatus = 'failed';
        return false;
      }
      const test = await loadFromServer(1, 1);
      if (test) {
        this.lastFetchStatus = 'success';
        return true;
      }
      this.lastFetchStatus = 'failed';
      return false;
    } catch {
      this.lastFetchStatus = 'failed';
      return false;
    }
  }

  /**
   * Realiza uma verificação de ping com o banco de dados MySQL, medindo latência e logando o status.
   * Garante que o sistema tenha conectividade estável para realizar operações de leitura e escrita.
   */
  public static async pingDatabase(): Promise<{ 
    online: boolean; 
    latencyMs: number; 
    status: string; 
    timestamp: string; 
    error?: string; 
  }> {
    const start = Date.now();
    try {
      const isOnline = await checkApi();
      if (!isOnline) {
        console.error('[DbMiddleware Diagnostic] Ping falhou: Endpoint da API do MySQL está inacessível ou offline.');
        return {
          online: false,
          latencyMs: Date.now() - start,
          status: 'OFFLINE',
          timestamp: new Date().toISOString(),
          error: 'Endpoint da API do MySQL inacessível.'
        };
      }
      
      const test = await loadFromServer(1, 1);
      const latencyMs = Date.now() - start;
      if (test) {
        console.log(`[DbMiddleware Diagnostic] Ping bem-sucedido. MySQL ONLINE. Latência: ${latencyMs}ms`);
        return {
          online: true,
          latencyMs,
          status: 'ONLINE',
          timestamp: new Date().toISOString()
        };
      } else {
        console.warn('[DbMiddleware Diagnostic] Endpoint respondeu mas a consulta do MySQL retornou dados nulos.');
        return {
          online: false,
          latencyMs,
          status: 'ERROR',
          timestamp: new Date().toISOString(),
          error: 'Consulta de teste no MySQL retornou dados nulos ou vazios.'
        };
      }
    } catch (err: any) {
      const latencyMs = Date.now() - start;
      console.error(`[DbMiddleware Diagnostic] Erro fatal no ping do banco de dados MySQL: ${err.message || err}`);
      return {
        online: false,
        latencyMs,
        status: 'FATAL_ERROR',
        timestamp: new Date().toISOString(),
        error: err.message || String(err)
      };
    }
  }

  /**
   * Helper que executa uma operação com tentativas de re-conexão e backoff exponencial.
   * Evita perdas de dados em oscilações ou quedas momentâneas da conexão MySQL.
   */
  private static async retryWithBackoff<T>(
    operationName: string, 
    fn: () => Promise<T>, 
    retries = 3, 
    delay = 300
  ): Promise<T> {
    try {
      return await fn();
    } catch (err: any) {
      if (retries <= 0) {
        console.error(`[DbMiddleware] Erro persistente em "${operationName}" após várias tentativas. Falha definitiva.`);
        throw err;
      }
      console.warn(`[DbMiddleware] Falha em "${operationName}". Re-tentando em ${delay}ms... (Tentativas restantes: ${retries}). Erro: ${err.message || err}`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return this.retryWithBackoff(operationName, fn, retries - 1, delay * 2);
    }
  }

  /**
   * Executa uma escrita segura no banco de dados MySQL através da API com proteção de reconexão automática
   */
  public static async executeWrite(action: string, payload: any): Promise<boolean> {
    const runWrite = async () => {
      const isOnline = await checkApi();
      if (!isOnline) {
        // Tenta gravar direto no fallback caso o ping esteja instável mas a rota esteja respondendo
        try {
          const safePayload = DbMiddleware.validate(action, payload);
          const success = await saveToServer(action, safePayload);
          if (success) {
            this.lastFetchStatus = 'success';
            return true;
          }
        } catch (err) {
          console.warn(`Direct write fallback failed for action "${action}":`, err);
        }
        this.lastFetchStatus = 'failed';
        throw new Error(`Conexão indisponível: Não foi possível persistir a ação "${action}" no MySQL central.`);
      }

      // Validação e sanitização contra SQL Injection
      const safePayload = DbMiddleware.validate(action, payload);
      const success = await saveToServer(action, safePayload);
      this.lastFetchStatus = success ? 'success' : 'failed';
      return success;
    };

    try {
      return await this.retryWithBackoff(`Escrita: ${action}`, runWrite);
    } catch (e) {
      this.lastFetchStatus = 'failed';
      throw e;
    }
  }

  /**
   * Executa uma consulta de leitura ao servidor MySQL central com tolerância a falhas
   */
  public static async executeRead(page?: number, limit?: number): Promise<any> {
    const runRead = async () => {
      const isOnline = await checkApi();
      if (!isOnline) {
        try {
          const fallbackData = await loadFromServer(page, limit);
          if (fallbackData) {
            this.lastFetchStatus = 'success';
            return fallbackData;
          }
        } catch (err) {
          console.warn('Direct read fallback failed:', err);
        }
        this.lastFetchStatus = 'failed';
        throw new Error('Conexão indisponível: Não foi possível ler os dados do MySQL central.');
      }
      const data = await loadFromServer(page, limit);
      this.lastFetchStatus = data ? 'success' : 'failed';
      return data;
    };

    try {
      return await this.retryWithBackoff('Leitura de Dados', runRead);
    } catch (e) {
      this.lastFetchStatus = 'failed';
      throw e;
    }
  }

  /**
   * Lógica avançada de 'upsert' na camada de serviço.
   * Garante que operações de restauração, importação ou inserções verifiquem chaves únicas de negócios
   * e chaves primárias antes de gravar no MySQL, convertendo inserções em atualizações automáticas
   * para evitar duplicações e assegurar integridade referencial estável.
   */
  public static async executeUpsert(action: string, payload: any): Promise<boolean> {
    try {
      // Se não for uma ação de inserção ("add_"), processa como escrita comum
      if (!action.startsWith('add_')) {
        return this.executeWrite(action, payload);
      }

      const isOnline = await checkApi();
      if (!isOnline) {
        // Se estiver totalmente sem rede de dados, tenta gravar direto como fallback
        return this.executeWrite(action, payload);
      }

      // Carrega os dados existentes do servidor central para validação cruzada das chaves únicas
      const serverData = await this.executeRead();
      if (!serverData) {
        return this.executeWrite(action, payload);
      }

      let existingId: string | null = null;
      const targetType = action.replace('add_', '');

      // Verificação minuciosa de chaves únicas por tipo de recurso
      switch (targetType) {
        case 'sector': {
          const list = serverData.sectors || [];
          const match = list.find((s: any) => 
            s.id === payload.id || 
            s.name.trim().toLowerCase() === payload.name?.trim().toLowerCase()
          );
          if (match) existingId = match.id;
          break;
        }
        case 'bed': {
          const list = serverData.beds || [];
          const match = list.find((b: any) => 
            b.id === payload.id || 
            (b.number === payload.number && b.sectorId === payload.sectorId)
          );
          if (match) existingId = match.id;
          break;
        }
        case 'audit': {
          const list = serverData.audits || [];
          const match = list.find((a: any) => a.id === payload.id);
          if (match) existingId = match.id;
          break;
        }
        case 'question': {
          const list = serverData.questions || [];
          const match = list.find((q: any) => 
            q.id === payload.id || 
            (q.label.trim().toLowerCase() === payload.label?.trim().toLowerCase() && q.formType === payload.formType)
          );
          if (match) existingId = match.id;
          break;
        }
        case 'patient': {
          const list = serverData.patients || [];
          const match = list.find((p: any) => 
            p.id === payload.id || 
            p.record === payload.record || 
            (payload.cpf && p.cpf === payload.cpf.replace(/[^\d]/g, ''))
          );
          if (match) existingId = match.id;
          break;
        }
        case 'user': {
          const list = serverData.users || [];
          const match = list.find((u: any) => 
            u.id === payload.id || 
            u.email.toLowerCase() === payload.email?.toLowerCase()
          );
          if (match) existingId = match.id;
          break;
        }
        case 'cargo': {
          const list = serverData.cargos || [];
          const match = list.find((c: any) => 
            c.id === payload.id || 
            c.name.trim().toLowerCase() === payload.name?.trim().toLowerCase()
          );
          if (match) existingId = match.id;
          break;
        }
      }

      // Se o registro já existir, re-direciona a ação para uma atualização ("update_")
      if (existingId) {
        const updateAction = `update_${targetType}`;
        const updatedPayload = { ...payload, id: existingId };
        console.log(`[Service Layer Upsert] Registro duplicado detectado para '${targetType}'. Chave única já cadastrada. Executando atualização para o ID: ${existingId}`);
        return this.executeWrite(updateAction, updatedPayload);
      }

      // Se for inédito, realiza o cadastro comum
      return this.executeWrite(action, payload);
    } catch (err) {
      console.warn(`[Service Layer Upsert] Falha de verificação. Executando fallback de gravação direta:`, err);
      return this.executeWrite(action, payload);
    }
  }

  /**
   * Diagnostic utility that tests the MySQL connection and logs status/health,
   * specifically trying basic read and write actions to identify root connectivity issues.
   */
  public static async runDiagnostics(): Promise<{
    success: boolean;
    pingOk: boolean;
    readOk: boolean;
    writeOk: boolean;
    logs: string[];
    timestamp: string;
  }> {
    const logs: string[] = [];
    let pingOk = false;
    let readOk = false;
    let writeOk = false;
    const timestamp = new Date().toISOString();

    logs.push(`[Diagnostics ${timestamp}] Iniciando teste de diagnóstico de conexão MySQL.`);

    // 1. Test ping
    try {
      logs.push(`[Diagnostics] Testando ping da API em /api.php?action=ping...`);
      const apiPing = await checkApi();
      pingOk = apiPing;
      logs.push(`[Diagnostics] Status do ping da API: ${apiPing ? 'ONLINE' : 'OFFLINE'}`);
    } catch (err: any) {
      logs.push(`[Diagnostics] Erro ao testar ping: ${err.message || err}`);
    }

    // 2. Test read
    try {
      logs.push(`[Diagnostics] Testando leitura básica (loadFromServer)...`);
      const testData = await loadFromServer();
      if (testData) {
        readOk = true;
        const auditCount = testData.audits ? testData.audits.length : 0;
        const patientCount = testData.patients ? testData.patients.length : 0;
        logs.push(`[Diagnostics] Leitura realizada com sucesso! Auditorias encontradas: ${auditCount}, Pacientes: ${patientCount}`);
      } else {
        logs.push(`[Diagnostics] Leitura retornou dados nulos (vazio ou erro de parse).`);
      }
    } catch (err: any) {
      logs.push(`[Diagnostics] Erro ao carregar dados do servidor: ${err.message || err}`);
    }

    // 3. Test write
    try {
      logs.push(`[Diagnostics] Testando escrita básica de log de diagnóstico...`);
      const testLogPayload = {
        id: 'diag_' + Math.random().toString(36).substr(2, 9),
        user: 'Diagnóstico',
        action: 'DIAGNOSTIC_TEST',
        details: `Teste automático de leitura/escrita de conexão MySQL executado em ${timestamp}.`,
        timestamp: new Date().toLocaleTimeString('pt-BR')
      };
      
      const writeSuccess = await saveToServer('add_log', testLogPayload);
      writeOk = writeSuccess;
      logs.push(`[Diagnostics] Resultado do teste de escrita: ${writeSuccess ? 'SUCESSO' : 'FALHA'}`);
    } catch (err: any) {
      logs.push(`[Diagnostics] Erro ao testar escrita no servidor: ${err.message || err}`);
    }

    const overallSuccess = pingOk && readOk;
    logs.push(`[Diagnostics] Diagnóstico finalizado. Resultado geral: ${overallSuccess ? 'SISTEMA OPERACIONAL' : 'SISTEMA COM ERRO DE CONEXÃO'}`);
    
    // Print logs to console.log as requested by the user
    console.log(`=== HOSPITAL CRUD DIAGNOSTIC REPORT ===`);
    logs.forEach(l => console.log(l));
    console.log(`========================================`);

    return {
      success: overallSuccess,
      pingOk,
      readOk,
      writeOk,
      logs,
      timestamp
    };
  }

  /**
   * Obtém as tabelas do banco de dados e suas estruturas diretamente do sistema.
   */
  public static async getDatabaseTables(): Promise<{
    success: boolean;
    tables?: Array<{
      table: string;
      columns: Array<{
        Field: string;
        Type: string;
        Null: string;
        Key: string;
        Default: any;
        Extra: string;
      }>;
      rows_count: number;
      samples: any[];
    }>;
    message?: string;
  }> {
    try {
      const response = await fetch('/api.php?action=get_db_tables');
      if (!response.ok) {
        throw new Error(`Erro na requisição: ${response.statusText}`);
      }
      return await response.json();
    } catch (err: any) {
      console.error('[DbMiddleware] Erro ao obter tabelas do banco de dados:', err);
      return { success: false, message: err.message || 'Erro ao conectar ao servidor.' };
    }
  }

  /**
   * Executa comandos SQL no banco de dados. Suporta execução direta de queries
   * ou execução no modo seguro (Safe Mode) para mesclar dados/pular duplicatas ao importar dumps.
   */
  public static async executeSql(sql: string, safeMode: boolean = false): Promise<{
    success: boolean;
    type?: 'select' | 'exec' | 'batch';
    columns?: string[];
    rows?: any[];
    count?: number;
    affected_rows?: number;
    executed?: number;
    skipped_duplicates?: number;
    errors?: Array<{ query: string; error: string }>;
    message?: string;
  }> {
    try {
      const response = await fetch('/api.php?action=execute_sql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sql, safe_mode: safeMode })
      });
      if (!response.ok) {
        throw new Error(`Erro na requisição: ${response.statusText}`);
      }
      return await response.json();
    } catch (err: any) {
      console.error('[DbMiddleware] Erro ao executar comandos SQL:', err);
      return { success: false, message: err.message || 'Erro de conexão ao executar SQL.' };
    }
  }
}
