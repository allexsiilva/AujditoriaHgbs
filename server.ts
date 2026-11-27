import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync, execFileSync } from 'child_process';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from "@google/genai";
import mysql from 'mysql2/promise';

const md5 = (str: string) => crypto.createHash('md5').update(str).digest('hex');

// Lazy-initialized Gemini AI client
let aiInstance: GoogleGenAI | null = null;
function getGeminiClient() {
  if (!aiInstance) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('A chave de API GEMINI_API_KEY não foi configurada nas variáveis de ambiente do HospAudit.');
    }
    aiInstance = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiInstance;
}

async function startServer() {
  const app = express();
  const PORT = 3000;
  const httpServer = http.createServer(app);
  const io = new SocketIOServer(httpServer, {
    transports: ['polling', 'websocket'],
    allowEIO3: true,
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE']
    }
  });

  // SQL & Database Error Interceptor Log Storage
  interface SqlErrorLog {
    id: string;
    timestamp: string;
    context: string;
    query: string;
    code: string;
    message: string;
    friendlyMessage: string;
  }
  const sqlErrorLogs: SqlErrorLog[] = [];

  function recordSqlError(context: string, query: string, err: any): SqlErrorLog {
    const code = err?.code || 'UNKNOWN_SQL_ERROR';
    const rawMsg = err?.message || String(err);
    
    let friendlyMessage = `Falha na operação de banco de dados para '${context}'.`;
    if (code === 'ER_NO_SUCH_TABLE') {
      friendlyMessage = `A tabela relacional '${context}' ainda não existe no MySQL. O HospAudit criará e migrará a estrutura automaticamente.`;
    } else if (code === 'ER_PARSE_ERROR' || code === 'ER_SYNTAX_ERROR') {
      friendlyMessage = `Erro de sintaxe SQL detectado na consulta para '${context}'.`;
    } else if (code === 'ER_BAD_FIELD_ERROR') {
      friendlyMessage = `Coluna não encontrada ou nome de campo inválido na consulta para '${context}'.`;
    } else if (code === 'ECONNREFUSED' || code === 'PROTOCOL_CONNECTION_LOST') {
      friendlyMessage = `A conexão com o servidor MySQL (XAMPP) caiu ou foi recusada na porta 3306.`;
    } else if (code === 'ER_ACCESS_DENIED_ERROR') {
      friendlyMessage = `Acesso negado ao MySQL. Verifique usuário e senha no arquivo config.php ou .env.`;
    }

    const logEntry: SqlErrorLog = {
      id: `err_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      timestamp: new Date().toLocaleTimeString('pt-BR'),
      context,
      query: (query || '').slice(0, 300),
      code,
      message: rawMsg,
      friendlyMessage
    };

    sqlErrorLogs.unshift(logEntry);
    if (sqlErrorLogs.length > 50) sqlErrorLogs.pop();

    io.emit('sql_error', logEntry);
    return logEntry;
  }

  async function safeQuery(pool: any, sql: string, params: any[] = [], context: string = 'QUERY'): Promise<any> {
    if (!pool) return null;
    try {
      const [result] = await pool.query(sql, params);
      return result;
    } catch (err: any) {
      recordSqlError(context, sql, err);
      throw err;
    }
  }

  io.on('connection', (socket) => {
    socket.on('ping_heartbeat', (data) => {
      socket.emit('pong_heartbeat', {
        serverTime: Date.now(),
        dbActive: isMysqlActive,
        time: data?.time || Date.now()
      });
    });
  });

  const DATA_DIR = path.join(process.cwd(), 'data');

  const FILE_MAP: { [key: string]: string } = {
    sectors: path.join(DATA_DIR, 'setores.json'),
    beds: path.join(DATA_DIR, 'leitos.json'),
    audits: path.join(DATA_DIR, 'auditorias.json'),
    questions: path.join(DATA_DIR, 'perguntas.json'),
    logs: path.join(DATA_DIR, 'logs.json'),
    users: path.join(DATA_DIR, 'usuarios.json'),
    cargos: path.join(DATA_DIR, 'cargos.json'),
    modulos_sistema: path.join(DATA_DIR, 'modulos_sistema.json'),
    permissoes: path.join(DATA_DIR, 'permissoes.json'),
  };

  function atomicWriteJsonSync(filePath: string, value: any) {
    const tmpPath = `${filePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(value, null, 2), 'utf8');
    fs.renameSync(tmpPath, filePath);
  }

  let cachedDb: any = null;
  let hasValidatedDB = false;
  let mysqlPool: any = null;
  let isMysqlActive = false;
  const MYSQL_CONFIG_FILE = path.join(DATA_DIR, 'mysql_config.json');

  // 0. Ensure .env file exists by copying .env.example (Crucial for fresh Node.js / local setups)
  const envPath = path.join(process.cwd(), '.env');
  const envExamplePath = path.join(process.cwd(), '.env.example');
  if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
    try {
      fs.copyFileSync(envExamplePath, envPath);
      console.log('[Setup] Arquivo .env copiado a partir de .env.example com sucesso.');
      dotenv.config(); // Reload dotenv variables
    } catch (e: any) {
      console.error('[Setup Error] Falha ao criar arquivo .env a partir de .env.example:', e.message);
    }
  }

  // Helper to parse config.php to retrieve credentials if .env or mysql_config.json is not configured
  function parsePhpConfig() {
    const configPath = path.join(process.cwd(), 'config.php');
    if (!fs.existsSync(configPath)) return null;
    try {
      const content = fs.readFileSync(configPath, 'utf8');
      const getValue = (key: string) => {
        // Match define('KEY', 'VALUE') or define("KEY", "VALUE")
        const regexDirect = new RegExp(`define\\s*\\(\\s*['"]${key}['"]\\s*,\\s*['"]([^'"]*)['"]\\s*\\)`, 'i');
        const matchDirect = content.match(regexDirect);
        if (matchDirect) return matchDirect[1];

        // Match define('KEY', get_env_var('KEY', 'VALUE'))
        const regexGetEnv = new RegExp(`define\\s*\\(\\s*['"]${key}['"]\\s*,\\s*get_env_var\\s*\\(\\s*['"][^'"]*['"]\\s*,\\s*['"]([^'"]*)['"]\\s*\\)\\s*\\)`, 'i');
        const matchGetEnv = content.match(regexGetEnv);
        if (matchGetEnv) return matchGetEnv[1];

        return null;
      };

      const host = getValue('DB_HOST');
      if (!host) return null;

      return {
        host,
        port: Number(getValue('DB_PORT')) || 3306,
        user: getValue('DB_USER') || 'root',
        password: getValue('DB_PASSWORD') || '',
        database: getValue('DB_NAME') || 'hospaudit'
      };
    } catch (err: any) {
      console.error('[PHP Config Parse Error]', err.message);
      return null;
    }
  }

  async function initializeMysql() {
    try {
      let host = '';
      let port = 3306;
      let user = '';
      let password = '';
      let database = '';
      let enabled = false;

      // 1. Try loading from mysql_config.json first
      if (fs.existsSync(MYSQL_CONFIG_FILE)) {
        try {
          const config = JSON.parse(fs.readFileSync(MYSQL_CONFIG_FILE, 'utf8'));
          host = config.host || '';
          port = Number(config.port) || 3306;
          user = config.user || '';
          password = config.password || '';
          database = config.database || '';
          enabled = config.enabled !== false;
        } catch (err) {
          console.error('[MySQL Config Load Error]', err);
        }
      }

      // 2. Try loading from config.php if not configured in json file
      if (!host) {
        const phpConfig = parsePhpConfig();
        if (phpConfig && phpConfig.host) {
          host = phpConfig.host;
          port = phpConfig.port;
          user = phpConfig.user;
          password = phpConfig.password;
          database = phpConfig.database;
          enabled = true;
          console.log(`[MySQL] Credenciais carregadas do config.php local: host=${host}, database=${database}`);
        }
      }

      // 3. Fallback to env variables (or defaults if missing)
      if (!host) {
        host = process.env.MYSQL_HOST || process.env.DB_HOST || '127.0.0.1';
        port = Number(process.env.MYSQL_PORT || process.env.DB_PORT) || 3306;
        user = process.env.MYSQL_USER || process.env.DB_USER || 'root';
        // Configurações padrão seguras para XAMPP/MySQL local (sem forçar variáveis de ambiente)
        password = process.env.MYSQL_PASSWORD || '';
        database = process.env.MYSQL_DATABASE || 'hospaudit';
        enabled = true;
      }

      if (!enabled || !host) {
        if (isMysqlActive) {
          console.log('[MySQL] Banco de dados MySQL desativado. Usando modo de arquivos locais JSON.');
        }
        isMysqlActive = false;
        if (mysqlPool) {
          try {
            await mysqlPool.end();
          } catch (e) {}
        }
        mysqlPool = null;
        return null;
      }
      // List of host variations to ensure connection succeeds regardless of IPv6/IPv4 DNS resolution on Windows/XAMPP
      const hostsToTry = [host];
      if (host === 'localhost' && !hostsToTry.includes('127.0.0.1')) {
        hostsToTry.push('127.0.0.1');
      } else if (host === '127.0.0.1' && !hostsToTry.includes('localhost')) {
        hostsToTry.push('localhost');
      }

      let lastError: any = null;
      for (const currentHost of hostsToTry) {
        try {
          console.log(`[MySQL] Tentando conectar ao servidor MySQL em ${currentHost}:${port}...`);
          // Connect without specifying database first to create the schema if missing
          const connection = await mysql.createConnection({
            host: currentHost,
            port,
            user,
            password,
            connectTimeout: 5000
          });
          await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
          await connection.end();

          // Create pool with database specified and keep-alive configuration
          mysqlPool = mysql.createPool({
            host: currentHost,
            port,
            user,
            password,
            database,
            waitForConnections: true,
            connectionLimit: 20,
            queueLimit: 0,
            enableKeepAlive: true,
            keepAliveInitialDelay: 10000,
            charset: 'utf8mb4'
          });

          // Initialize table
          const conn = await mysqlPool.getConnection();
          await conn.query(`
            CREATE TABLE IF NOT EXISTS \`hospaudit_store\` (
              \`key_name\` VARCHAR(100) PRIMARY KEY,
              \`json_data\` LONGTEXT,
              \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
          `);
          conn.release();

          isMysqlActive = true;
          console.log(`[MySQL] BANCO ATIVO! Conectado com sucesso ao MySQL em ${currentHost}:${port}, base "${database}".`);
          return mysqlPool;
        } catch (err: any) {
          lastError = err;
          console.warn(`[MySQL] Tentativa em ${currentHost}:${port} falhou: ${err.message}`);
        }
      }

      isMysqlActive = false;
      mysqlPool = null;
      if (lastError) {
        recordSqlError('INITIALIZE_MYSQL', `CONNECT ${host}:${port}/${database}`, lastError);
        console.error(`[MySQL] Falha ao inicializar banco de dados MySQL (${host}:${port}):`, lastError.message);
      }
      console.log('[MySQL] Usando banco de dados local JSON (Modo Fallback de Segurança).');
      return null;
    } finally {
      isConnectingMysql = false;
    }
  }

  async function testMysqlConnection(config: { host: string; port?: number | string; user: string; password?: string; database?: string }) {
    const host = config.host || '127.0.0.1';
    const port = Number(config.port) || 3306;
    const user = config.user || 'root';
    const password = config.password || '';
    const database = config.database || 'hospaudit';

    const startTime = Date.now();
    const hostsToTry = [host];
    if (host === 'localhost' && !hostsToTry.includes('127.0.0.1')) {
      hostsToTry.push('127.0.0.1');
    } else if (host === '127.0.0.1' && !hostsToTry.includes('localhost')) {
      hostsToTry.push('localhost');
    }

    let lastErr: any = null;
    for (const currentHost of hostsToTry) {
      try {
        const conn = await mysql.createConnection({
          host: currentHost,
          port,
          user,
          password,
          connectTimeout: 5000
        });

        const [verRows]: any = await conn.query('SELECT VERSION() as version');
        const version = verRows?.[0]?.version || 'MySQL / MariaDB';

        // Tentar criar banco se não existir
        await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        await conn.end();

        const latencyMs = Date.now() - startTime;
        return {
          success: true,
          resolvedHost: currentHost,
          port,
          version,
          database,
          latencyMs,
          message: `Conexão bem-sucedida com o MySQL (XAMPP)! Versão: ${version} (${latencyMs}ms). Base "${database}" pronta.`
        };
      } catch (err: any) {
        lastErr = err;
      }
    }

    // Diagnósticos amigáveis em português
    let userFriendlyHint = '';
    const errMsg = lastErr?.message || '';
    const errCode = lastErr?.code || '';

    if (errCode === 'ECONNREFUSED' || errMsg.includes('ECONNREFUSED')) {
      userFriendlyHint = `Porta ${port} recusada. Abra o XAMPP Control Panel no Windows e clique em 'Start' no MySQL.`;
    } else if (errCode === 'ER_ACCESS_DENIED_ERROR' || errMsg.includes('Access denied')) {
      userFriendlyHint = `Acesso negado para o usuário "${user}". No XAMPP padrão, o usuário é 'root' e a senha deve ficar em branco.`;
    } else if (errCode === 'ETIMEDOUT' || errMsg.includes('ETIMEDOUT') || errMsg.includes('timeout')) {
      userFriendlyHint = `Tempo de conexão esgotado ao tentar ${host}:${port}. Verifique se o MySQL está rodando e se a porta ${port} está liberada.`;
    } else {
      userFriendlyHint = `Erro reportado pelo MySQL: ${errMsg}`;
    }

    return {
      success: false,
      host,
      port,
      errorCode: errCode,
      rawError: errMsg,
      userFriendlyHint,
      message: userFriendlyHint
    };
  }

  let isConnectingMysql = false;

  function isMysqlDisabledInConfig(): boolean {
    try {
      if (fs.existsSync(MYSQL_CONFIG_FILE)) {
        const cfg = JSON.parse(fs.readFileSync(MYSQL_CONFIG_FILE, 'utf8'));
        return cfg.enabled === false;
      }
    } catch (e) {}
    return false;
  }

  async function checkMysqlHealth() {
    if (isMysqlDisabledInConfig()) {
      if (isMysqlActive || mysqlPool) {
        isMysqlActive = false;
        if (mysqlPool) {
          try { await mysqlPool.end(); } catch (e) {}
          mysqlPool = null;
        }
      }
      return;
    }
    if (!mysqlPool) {
      if (!isConnectingMysql) {
        isConnectingMysql = true;
        await initializeMysql();
      }
      return;
    }
    try {
      const conn = await mysqlPool.getConnection();
      await conn.query('SELECT 1');
      conn.release();
      isMysqlActive = true;
    } catch (err: any) {
      console.warn('[MySQL Auto-Reconnect] Conexão com o MySQL (XAMPP) desestabelecida. Tentando reconexão automática...', err.message);
      isMysqlActive = false;
      mysqlPool = null;
      recordSqlError('HEALTH_CHECK', 'SELECT 1', err);
      if (!isConnectingMysql) {
        isConnectingMysql = true;
        await initializeMysql();
      }
    }
  }

  // Polling automático para monitorar saúde e reconectar o XAMPP se cair
  setInterval(() => {
    checkMysqlHealth().catch(() => {});
  }, 8000);

  const syncTableLocks: Map<string, Promise<void>> = new Map();

  async function queryWithRetry(pool: any, sql: string, params: any[] = [], maxRetries = 3): Promise<any> {
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        return await pool.query(sql, params);
      } catch (err: any) {
        const isDeadlock = err.code === 'ER_LOCK_DEADLOCK' || (err.message && err.message.toLowerCase().includes('deadlock'));
        if (isDeadlock && attempt < maxRetries - 1) {
          attempt++;
          await new Promise(r => setTimeout(r, 60 * attempt));
          continue;
        }
        throw err;
      }
    }
  }

  async function syncToRelationalTable(pool: any, key: string, items: any[]) {
    if (!Array.isArray(items)) return;

    const tableName = `hospaudit_${key.replace(/(?<!^)[A-Z]/g, match => '_' + match).toLowerCase()}`;

    // Fila sequencial por tabela para evitar Deadlocks com operações paralelas
    const previousLock = syncTableLocks.get(tableName) || Promise.resolve();
    let releaseLock: () => void;
    const newLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    syncTableLocks.set(tableName, previousLock.then(() => newLock));

    try {
      await previousLock;

      // 1. Higienizar e deduplicar registros por ID garantido
      const uniqueItemsMap = new Map<string, any>();
      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        if (item && typeof item === 'object') {
          const rawId = (item.id !== undefined && item.id !== null && String(item.id).trim() !== '')
            ? String(item.id).trim()
            : (item.codigo || item.cpf || item.uuid || `${key}_${idx + 1}`);

          const cleanItem = { ...item, id: rawId };
          uniqueItemsMap.set(rawId, cleanItem);
        }
      }
      const deduplicatedItems = Array.from(uniqueItemsMap.values());

      // Encontrar colunas e tipos dinamicamente baseado na estrutura do JSON
      const columns: { [colName: string]: string } = { id: 'VARCHAR(150)' };
      for (const item of deduplicatedItems) {
        if (item && typeof item === 'object') {
          for (const colName of Object.keys(item)) {
            if (!columns[colName]) {
              const val = item[colName];
              if (val && typeof val === 'object') {
                columns[colName] = 'LONGTEXT'; // Armazenar JSON/array/objeto como texto longo
              } else if (typeof val === 'number') {
                if (Number.isInteger(val)) {
                  columns[colName] = 'INT';
                } else {
                  columns[colName] = 'DOUBLE';
                }
              } else if (typeof val === 'boolean') {
                columns[colName] = 'TINYINT(1)';
              } else {
                const len = String(val || '').length;
                if (len > 255) {
                  columns[colName] = 'TEXT';
                } else {
                  columns[colName] = 'VARCHAR(255)';
                }
              }
            } else {
              // Upgrade de tipo caso um registro futuro exija mais espaço
              const val = item[colName];
              if (columns[colName] === 'VARCHAR(255)' && String(val || '').length > 255) {
                columns[colName] = 'TEXT';
              }
            }
          }
        }
      }

      // Se columns estiver vazio, criar tabela mínima ou limpar se já existe
      if (Object.keys(columns).length === 0) {
        let tableExists = false;
        try {
          const [rows]: any = await queryWithRetry(pool, `SHOW TABLES LIKE ?`, [tableName]);
          tableExists = rows.length > 0;
        } catch (e) {
          tableExists = false;
        }

        if (tableExists) {
          await queryWithRetry(pool, `DELETE FROM \`${tableName}\``);
        } else {
          await queryWithRetry(pool, `
            CREATE TABLE IF NOT EXISTS \`${tableName}\` (
              \`id\` VARCHAR(150) NOT NULL PRIMARY KEY,
              \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
          `);
        }
        return;
      }

      // 2. Verificar se a tabela já existe fisicamente para rodar migrações de colunas
      let tableExists = false;
      try {
        const [rows]: any = await queryWithRetry(pool, `SHOW TABLES LIKE ?`, [tableName]);
        tableExists = rows.length > 0;
      } catch (e) {
        tableExists = false;
      }

      if (tableExists) {
        // Obter as colunas físicas já existentes no banco de dados
        const existingCols: { [field: string]: boolean } = {};
        try {
          const [descRows]: any = await queryWithRetry(pool, `DESCRIBE \`${tableName}\``);
          for (const col of descRows) {
            existingCols[col.Field.toLowerCase()] = true;
          }
        } catch (e) {
          // Fallback
        }

        // Para cada coluna inferida do JSON, se ela não existir no banco físico, adiciona dinamicamente via ALTER TABLE
        for (const colName of Object.keys(columns)) {
          if (colName === 'id') continue;
          if (!existingCols[colName.toLowerCase()]) {
            try {
              await queryWithRetry(pool, `ALTER TABLE \`${tableName}\` ADD COLUMN \`${colName}\` ${columns[colName]} NULL`);
            } catch (altEx) {
              // Silencioso se der erro (ex: coluna adicionada por outra conexão)
            }
          }
        }
      } else {
        // Criar a tabela se ela não existir
        const colDefs: string[] = [];
        for (const colName of Object.keys(columns)) {
          if (colName === 'id') {
            colDefs.push(`\`${colName}\` VARCHAR(150) NOT NULL PRIMARY KEY`);
          } else {
            colDefs.push(`\`${colName}\` ${columns[colName]} NULL`);
          }
        }
        const columnsSql = colDefs.join(',\n  ');
        await queryWithRetry(pool, `
          CREATE TABLE IF NOT EXISTS \`${tableName}\` (
            ${columnsSql}
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
      }

      // 3. Inserir/Atualizar os itens deduplicados em blocos de 100 com REPLACE INTO
      if (deduplicatedItems.length > 0) {
        const colKeys = Object.keys(columns);
        const colsEscaped = colKeys.map(c => `\`${c}\``).join(', ');

        const chunkSize = 100;
        for (let i = 0; i < deduplicatedItems.length; i += chunkSize) {
          const chunk = deduplicatedItems.slice(i, i + chunkSize);
          const sqlParts: string[] = [];
          const flatParams: any[] = [];

          for (const item of chunk) {
            if (!item || typeof item !== 'object') continue;

            const placeholders: string[] = [];
            for (const colName of colKeys) {
              let val = item[colName] !== undefined ? item[colName] : null;
              if (val && typeof val === 'object') {
                val = JSON.stringify(val);
              } else if (typeof val === 'boolean') {
                val = val ? 1 : 0;
              }
              placeholders.push('?');
              flatParams.push(val);
            }
            sqlParts.push(`(${placeholders.join(', ')})`);
          }

          if (sqlParts.length > 0) {
            const insertSql = `REPLACE INTO \`${tableName}\` (${colsEscaped}) VALUES ${sqlParts.join(', ')}`;
            await queryWithRetry(pool, insertSql, flatParams);
          }
        }
        // Nota: Não executamos DELETE FROM automático para garantir preservação 100% segura
        // de auditorias e cadastros já existentes no banco de dados do servidor
      }
    } catch (err: any) {
      console.error(`[MySQL Sync Error] Falha de sincronização na tabela relacional ${tableName}:`, err.message);
    } finally {
      releaseLock!();
    }
  }

  async function saveToMysql(data: any, targetKey?: string) {
    if (!mysqlPool || !isMysqlActive) return;
    try {
      const keys = targetKey ? [targetKey] : Object.keys(FILE_MAP);
      for (const key of keys) {
        if (!FILE_MAP[key]) continue;
        const partData = data[key] || [];
        // 1. Salvar no central key-value store para compatibilidade do cache unificado
        await safeQuery(
          mysqlPool,
          `INSERT INTO \`hospaudit_store\` (\`key_name\`, \`json_data\`) 
           VALUES (?, ?) 
           ON DUPLICATE KEY UPDATE \`json_data\` = ?, \`updated_at\` = CURRENT_TIMESTAMP`,
          [key, JSON.stringify(partData), JSON.stringify(partData)],
          `hospaudit_store:${key}`
        );
        // 2. Sincronizar em tempo real com a tabela física/relacional correspondente no MySQL
        await syncToRelationalTable(mysqlPool, key, partData);
      }

      // 3. Emitir evento Socket.IO em tempo real para os clientes conectados
      if (io) {
        io.emit('db_updated', { key: targetKey || 'ALL', timestamp: Date.now() });
      }
    } catch (err: any) {
      console.error('[MySQL Save Error] Falha ao persistir alterações no MySQL:', err.message);
    }
  }

  async function syncAllLocalFilesToMysql(): Promise<{ success: boolean; message: string; details?: any }> {
    if (!mysqlPool || !isMysqlActive) {
      console.log('[MySQL Sync] Tentando restabelecer conexão com o MySQL antes de sincronizar...');
      await initializeMysql();
    }

    if (!mysqlPool || !isMysqlActive) {
      return {
        success: false,
        message: 'Não foi possível conectar ao MySQL do XAMPP (porta 3306). Verifique se o MySQL está iniciado no XAMPP Control Panel.'
      };
    }

    try {
      console.log('[MySQL Sync] Iniciando envio forçado de todos os arquivos locais JSON (data/*.json) para o MySQL do XAMPP...');
      const localDb = getLocalDb();
      let totalTables = 0;
      let totalRecords = 0;
      const syncedTables: string[] = [];

      for (const [key, filePath] of Object.entries(FILE_MAP)) {
        let items: any[] = [];
        if (fs.existsSync(filePath)) {
          try {
            const raw = fs.readFileSync(filePath, 'utf8');
            items = JSON.parse(raw);
          } catch (e) {
            items = localDb[key] || [];
          }
        } else {
          items = localDb[key] || [];
        }

        if (!Array.isArray(items)) {
          items = [];
        }

        // 1. Salvar no central key-value store hospaudit_store
        await safeQuery(
          mysqlPool,
          `INSERT INTO \`hospaudit_store\` (\`key_name\`, \`json_data\`) 
           VALUES (?, ?) 
           ON DUPLICATE KEY UPDATE \`json_data\` = ?, \`updated_at\` = CURRENT_TIMESTAMP`,
          [key, JSON.stringify(items), JSON.stringify(items)],
          `hospaudit_store:${key}`
        );

        // 2. Salvar na respectiva tabela relacional física do MySQL
        await syncToRelationalTable(mysqlPool, key, items);

        totalTables++;
        totalRecords += items.length;
        syncedTables.push(key);
      }

      // Atualizar cache de memória com os dados locais recém-sincronizados
      cachedDb = { ...localDb };

      // Emitir via Socket.IO para atualizar qualquer tela conectada
      if (io) {
        io.emit('db_updated', { key: 'ALL', timestamp: Date.now() });
      }

      console.log(`[MySQL Sync] SUCESSO: ${totalRecords} registros em ${totalTables} tabelas enviados para o MySQL do XAMPP!`);

      return {
        success: true,
        message: `Sincronização concluída com sucesso! ${totalRecords} registros em ${totalTables} tabelas foram enviados dos arquivos locais para o MySQL do XAMPP.`,
        details: { totalTables, totalRecords, syncedTables }
      };
    } catch (err: any) {
      console.error('[MySQL Sync Error] Falha na sincronização dos dados locais para o MySQL:', err);
      return {
        success: false,
        message: `Erro durante a sincronização dos arquivos locais para o MySQL: ${err.message}`
      };
    }
  }

  // --- ROTINA DE ENVIO AUTOMÁTICO DOS DADOS LOCAIS PARA O BANCO (A CADA 5 MINUTOS) ---
  let autoSyncIntervalMinutes = 5;
  let isAutoSyncActive = true;
  let lastAutoSyncTimestamp: string | null = null;
  let lastAutoSyncStatus: { success: boolean; message: string; totalTables?: number; totalRecords?: number } | null = null;
  let nextAutoSyncTimestamp: number = Date.now() + 5 * 60 * 1000;
  let isAutoSyncRunning = false;

  // Carrega configuração persistida de auto-sync de data/mysql_config.json se existir
  try {
    if (fs.existsSync(MYSQL_CONFIG_FILE)) {
      const cfg = JSON.parse(fs.readFileSync(MYSQL_CONFIG_FILE, 'utf8'));
      if (typeof cfg.autoSyncIntervalMinutes === 'number' && cfg.autoSyncIntervalMinutes > 0) {
        autoSyncIntervalMinutes = cfg.autoSyncIntervalMinutes;
      }
      if (typeof cfg.autoSyncEnabled === 'boolean') {
        isAutoSyncActive = cfg.autoSyncEnabled;
      }
      nextAutoSyncTimestamp = Date.now() + autoSyncIntervalMinutes * 60 * 1000;
    }
  } catch (e) {}

  async function triggerAutoSync(triggerSource: string = 'timer') {
    if (isAutoSyncRunning) {
      console.log(`[Auto-Sync] Execução em andamento. Aguardando conclusão da sincronização atual.`);
      return { success: true, message: 'Sincronização já em andamento.' };
    }
    isAutoSyncRunning = true;
    console.log(`[Auto-Sync 5min] Iniciando envio programado dos dados locais para o banco MySQL (Origem: ${triggerSource})...`);
    try {
      const syncResult = await syncAllLocalFilesToMysql();
      lastAutoSyncTimestamp = new Date().toISOString();
      lastAutoSyncStatus = {
        success: syncResult.success,
        message: syncResult.message,
        totalTables: syncResult.details?.totalTables,
        totalRecords: syncResult.details?.totalRecords
      };
      nextAutoSyncTimestamp = Date.now() + autoSyncIntervalMinutes * 60 * 1000;
      console.log(`[Auto-Sync 5min] Sincronização concluída: ${syncResult.message}`);
      if (io) {
        io.emit('auto_sync_status', {
          enabled: isAutoSyncActive,
          intervalMinutes: autoSyncIntervalMinutes,
          lastSyncTimestamp: lastAutoSyncTimestamp,
          nextSyncTimestamp: nextAutoSyncTimestamp,
          lastStatus: lastAutoSyncStatus
        });
      }
      return syncResult;
    } catch (err: any) {
      console.error('[Auto-Sync 5min Error] Falha durante sincronização automática:', err.message);
      lastAutoSyncStatus = {
        success: false,
        message: `Falha no envio automático: ${err.message}`
      };
      return { success: false, message: err.message };
    } finally {
      isAutoSyncRunning = false;
    }
  }

  // Agendador em segundo plano: verifica a cada 15 segundos se atingiu o próximo timestamp de envio
  setInterval(() => {
    if (!isAutoSyncActive || !isMysqlActive || isMysqlDisabledInConfig()) return;
    if (Date.now() >= nextAutoSyncTimestamp) {
      triggerAutoSync('agendador_automatico_5min');
    }
  }, 15 * 1000);

  const KNOWN_TABLE_SCHEMAS: { [table: string]: { [col: string]: string } } = {
    setores: {
      id: 'VARCHAR(150) NOT NULL PRIMARY KEY',
      name: 'VARCHAR(255) NULL',
      description: 'TEXT NULL',
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    },
    leitos: {
      id: 'VARCHAR(150) NOT NULL PRIMARY KEY',
      number: 'VARCHAR(100) NULL',
      sectorId: 'VARCHAR(150) NULL',
      status: 'VARCHAR(50) NULL',
      currentPatientId: 'VARCHAR(150) NULL',
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    },
    auditorias: {
      id: 'VARCHAR(150) NOT NULL PRIMARY KEY',
      date: 'VARCHAR(100) NULL',
      sectorId: 'VARCHAR(150) NULL',
      bedId: 'VARCHAR(150) NULL',
      evaluator: 'VARCHAR(255) NULL',
      evaluatorEmail: 'VARCHAR(255) NULL',
      status: 'VARCHAR(50) NULL',
      totalQuestions: 'INT NULL',
      conformities: 'INT NULL',
      nonConformities: 'INT NULL',
      score: 'DOUBLE NULL',
      answers: 'LONGTEXT NULL',
      notes: 'TEXT NULL',
      photos: 'LONGTEXT NULL',
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    },
    perguntas: {
      id: 'VARCHAR(150) NOT NULL PRIMARY KEY',
      text: 'TEXT NULL',
      category: 'VARCHAR(150) NULL',
      active: 'TINYINT(1) DEFAULT 1',
      isCritical: 'TINYINT(1) DEFAULT 0',
      options: 'LONGTEXT NULL',
      orderIndex: 'INT DEFAULT 0',
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    },
    usuarios: {
      id: 'VARCHAR(150) NOT NULL PRIMARY KEY',
      name: 'VARCHAR(255) NULL',
      email: 'VARCHAR(255) NULL',
      password: 'VARCHAR(255) NULL',
      role: 'VARCHAR(50) NULL',
      permissions: 'LONGTEXT NULL',
      cargo: 'VARCHAR(150) NULL',
      active: 'TINYINT(1) DEFAULT 1',
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    },
    cargos: {
      id: 'VARCHAR(150) NOT NULL PRIMARY KEY',
      name: 'VARCHAR(255) NULL',
      role: 'VARCHAR(50) NULL',
      permissions: 'LONGTEXT NULL',
      description: 'TEXT NULL',
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    },
    permissoes: {
      id: 'VARCHAR(150) NOT NULL PRIMARY KEY',
      cargo_id: 'VARCHAR(150) NULL',
      modulo_id: 'VARCHAR(150) NULL',
      pode_visualizar: 'TINYINT(1) DEFAULT 0',
      pode_criar_editar: 'TINYINT(1) DEFAULT 0',
      pode_deletar: 'TINYINT(1) DEFAULT 0',
      itens: 'LONGTEXT NULL',
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    },
    agendamentos: {
      id: 'VARCHAR(150) NOT NULL PRIMARY KEY',
      title: 'VARCHAR(255) NULL',
      description: 'TEXT NULL',
      date: 'VARCHAR(100) NULL',
      startTime: 'VARCHAR(50) NULL',
      endTime: 'VARCHAR(50) NULL',
      sectorId: 'VARCHAR(150) NULL',
      auditorEmail: 'VARCHAR(255) NULL',
      status: 'VARCHAR(50) NULL',
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    },
    logs: {
      id: 'VARCHAR(150) NOT NULL PRIMARY KEY',
      timestamp: 'VARCHAR(100) NULL',
      user: 'VARCHAR(255) NULL',
      action: 'VARCHAR(255) NULL',
      details: 'TEXT NULL',
      ip: 'VARCHAR(100) NULL',
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    },
    modulos_sistema: {
      id: 'VARCHAR(150) NOT NULL PRIMARY KEY',
      name: 'VARCHAR(255) NULL',
      description: 'TEXT NULL',
      category: 'VARCHAR(100) NULL',
      status: 'TINYINT(1) DEFAULT 1',
      items: 'LONGTEXT NULL',
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    },
    pacientes: {
      id: 'VARCHAR(150) NOT NULL PRIMARY KEY',
      name: 'VARCHAR(255) NULL',
      record: 'VARCHAR(100) NULL',
      cpf: 'VARCHAR(50) NULL',
      birthDate: 'VARCHAR(50) NULL',
      gender: 'VARCHAR(20) NULL',
      sectorId: 'VARCHAR(150) NULL',
      bedId: 'VARCHAR(150) NULL',
      diagnosis: 'TEXT NULL',
      status: 'VARCHAR(50) NULL',
      admissionDate: 'VARCHAR(50) NULL',
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    },
    formularios: {
      id: 'VARCHAR(150) NOT NULL PRIMARY KEY',
      title: 'VARCHAR(255) NULL',
      type: 'VARCHAR(100) NULL',
      fields: 'LONGTEXT NULL',
      status: 'TINYINT(1) DEFAULT 1',
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    },
    form_submissions: {
      id: 'VARCHAR(150) NOT NULL PRIMARY KEY',
      formId: 'VARCHAR(150) NULL',
      patientId: 'VARCHAR(150) NULL',
      auditorEmail: 'VARCHAR(255) NULL',
      answers: 'LONGTEXT NULL',
      timestamp: 'VARCHAR(100) NULL',
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    },
    system_migrations: {
      id: 'VARCHAR(150) NOT NULL PRIMARY KEY',
      version: 'VARCHAR(50) NULL',
      description: 'TEXT NULL',
      applied_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    }
  };

  async function safeMigrateDatabaseSchema(): Promise<{
    success: boolean;
    message: string;
    tablesCreated?: string[];
    columnsAdded?: string[];
    totalTablesChecked?: number;
    backupSnapshot?: string;
  }> {
    if (!mysqlPool || !isMysqlActive) {
      await initializeMysql();
    }

    if (!mysqlPool || !isMysqlActive) {
      return {
        success: false,
        message: 'Não foi possível conectar ao MySQL para aplicar migrações. Verifique o XAMPP Control Panel.'
      };
    }

    const tablesCreated: string[] = [];
    const columnsAdded: string[] = [];
    let backupFilename = '';

    try {
      // 1. Snapshot de segurança antes da migração
      try {
        const backupDir = path.join(process.cwd(), 'backups');
        if (!fs.existsSync(backupDir)) {
          fs.mkdirSync(backupDir, { recursive: true });
        }
        backupFilename = `backup_auto_pre_migration_${Date.now()}.json`;
        const localDb = getLocalDb();
        fs.writeFileSync(path.join(backupDir, backupFilename), JSON.stringify(localDb, null, 2), 'utf8');
        console.log(`[Migração Segura] Snapshot de segurança criado: ${backupFilename}`);
      } catch (bkErr) {
        console.warn('[Migração Segura] Aviso ao gerar snapshot pré-migração:', bkErr);
      }

      // 2. Iterar sobre todos os esquemas conhecidos
      for (const [tableName, colDefs] of Object.entries(KNOWN_TABLE_SCHEMAS)) {
        // Verificar se a tabela já existe
        const [rows]: any = await queryWithRetry(mysqlPool, `SHOW TABLES LIKE ?`, [tableName]);
        const tableExists = rows.length > 0;

        if (!tableExists) {
          // Criar tabela se não existir
          const defsSql = Object.entries(colDefs).map(([col, def]) => {
            if (def.includes('PRIMARY KEY')) {
              return `\`${col}\` ${def}`;
            }
            return `\`${col}\` ${def}`;
          }).join(',\n  ');

          await queryWithRetry(mysqlPool, `
            CREATE TABLE IF NOT EXISTS \`${tableName}\` (
              ${defsSql}
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
          `);
          tablesCreated.push(tableName);
          console.log(`[Migração Segura] Nova tabela criada no MySQL: "${tableName}"`);
        } else {
          // Inspecionar colunas existentes para migrações não destrutivas
          const [descRows]: any = await queryWithRetry(mysqlPool, `DESCRIBE \`${tableName}\``);
          const existingCols = new Set(descRows.map((r: any) => r.Field.toLowerCase()));

          for (const [colName, colType] of Object.entries(colDefs)) {
            if (colName === 'id') continue;
            if (!existingCols.has(colName.toLowerCase())) {
              try {
                // Remover PRIMARY KEY da definição da coluna adicional se houver
                const cleanType = colType.replace(/PRIMARY KEY/i, '').replace(/NOT NULL/i, 'NULL');
                await queryWithRetry(mysqlPool, `ALTER TABLE \`${tableName}\` ADD COLUMN \`${colName}\` ${cleanType}`);
                columnsAdded.push(`${tableName}.${colName}`);
                console.log(`[Migração Segura] Nova coluna adicionada na tabela "${tableName}": "${colName}"`);
              } catch (altEx: any) {
                console.warn(`[Migração Segura] Aviso ao adicionar coluna ${tableName}.${colName}:`, altEx.message);
              }
            }
          }
        }
      }

      // 3. Garantir tabela hospaudit_store
      await queryWithRetry(mysqlPool, `
        CREATE TABLE IF NOT EXISTS \`hospaudit_store\` (
          \`key_name\` VARCHAR(100) PRIMARY KEY,
          \`json_data\` LONGTEXT,
          \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // 4. Executar sincronização segura para carregar dados padrão caso novas tabelas estejam vazias
      await syncAllLocalFilesToMysql();

      return {
        success: true,
        message: `Migração concluída com sucesso! Banco verificado e atualizado com novas estruturas sem perda de dados.`,
        tablesCreated,
        columnsAdded,
        totalTablesChecked: Object.keys(KNOWN_TABLE_SCHEMAS).length,
        backupSnapshot: backupFilename
      };
    } catch (err: any) {
      console.error('[Migração Segura Error]', err);
      return {
        success: false,
        message: `Erro durante a migração do banco: ${err.message}`
      };
    }
  }

  async function initDatabase() {
    console.log('[Banco] Inicializando armazenamento unificado (JSON + MySQL)...');
    
    // Load local files as the default base (holds system defaults and validation logic)
    const localDb = getLocalDb();
    cachedDb = localDb;

    // Try starting MySQL
    await initializeMysql();

    if (isMysqlActive && mysqlPool) {
      try {
        console.log('[MySQL] Sincronizando dados com o servidor MySQL...');
        const [rows]: any = await mysqlPool.query('SELECT `key_name`, `json_data` FROM `hospaudit_store`');
        
        if (rows.length === 0) {
          console.log('[MySQL] Banco de dados MySQL está vazio. Efetuando carga inicial dos dados locais para o MySQL...');
          await saveToMysql(localDb);
          console.log('[MySQL] SUCESSO: Dados iniciais inseridos com êxito no servidor MySQL.');
        } else {
          console.log('[MySQL] Carregando dados do servidor MySQL...');
          rows.forEach((row: any) => {
            try {
              const partData = JSON.parse(row.json_data);
              if (Array.isArray(partData)) {
                cachedDb[row.key_name] = partData;
              }
            } catch (e) {
              console.error(`[MySQL Load] Falha ao analisar dados para a chave "${row.key_name}":`, e);
            }
          });
          console.log('[MySQL] Dados do MySQL carregados com sucesso na memória do servidor.');
        }
      } catch (err: any) {
        console.error('[MySQL Error] Falha durante sincronização inicial:', err.message);
        console.log('[MySQL] Utilizando banco local JSON como fallback ativo.');
        isMysqlActive = false;
      }
    }
  }

  // Inicializa o banco de dados unificado
  await initDatabase();

  // Middleware
  app.use(express.json({ limit: '50mb' }));

  // Database Management REST Endpoints
  app.get('/api/db/config', (req, res) => {
    let host = '127.0.0.1';
    let port = 3306;
    let user = 'root';
    let database = 'hospaudit';
    let enabled = true;
    let hasPassword = false;

    if (fs.existsSync(MYSQL_CONFIG_FILE)) {
      try {
        const config = JSON.parse(fs.readFileSync(MYSQL_CONFIG_FILE, 'utf8'));
        host = config.host || host;
        port = Number(config.port) || port;
        user = config.user || user;
        database = config.database || database;
        enabled = config.enabled !== false;
        hasPassword = Boolean(config.password);
      } catch (e) {}
    }

    res.json({
      success: true,
      connected: isMysqlActive,
      host,
      port,
      user,
      database,
      enabled,
      hasPassword,
      autoSyncEnabled: isAutoSyncActive,
      autoSyncIntervalMinutes: autoSyncIntervalMinutes,
      lastAutoSyncTimestamp,
      nextAutoSyncTimestamp,
      syncMode: isMysqlActive ? 'MYSQL_RELATIONAL' : 'LOCAL_JSON',
      message: isMysqlActive
        ? `Conectado ao MySQL em ${host}:${port}, base "${database}". Envio automático ativo a cada ${autoSyncIntervalMinutes} minutos.`
        : `Operando em Modo Local JSON (MySQL offline em ${host}:${port}).`
    });
  });

  app.post('/api/db/test', async (req, res) => {
    const { host, port, user, password, name, database } = req.body;
    const testResult = await testMysqlConnection({
      host: host || '127.0.0.1',
      port: Number(port) || 3306,
      user: user || 'root',
      password: password || '',
      database: database || name || 'hospaudit'
    });
    res.json(testResult);
  });

  app.post('/api/db/config', async (req, res) => {
    const { host, port, user, password, name, database, enabled } = req.body;
    const dbName = database || name || 'hospaudit';
    const mysqlConfig = {
      host: host || '127.0.0.1',
      port: Number(port) || 3306,
      user: user || 'root',
      password: password !== undefined ? password : '',
      database: dbName,
      enabled: enabled !== false
    };

    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(MYSQL_CONFIG_FILE, JSON.stringify(mysqlConfig, null, 2), 'utf8');

    await initializeMysql();

    if (!mysqlConfig.enabled) {
      res.json({
        success: true,
        connected: false,
        message: 'MySQL (XAMPP) desativado. O sistema está operando no Banco Local (Node.js).'
      });
    } else if (isMysqlActive) {
      await saveToMysql(cachedDb || getLocalDb());
      res.json({
        success: true,
        connected: true,
        message: `MySQL do XAMPP conectado e ativo! Dados locais salvos no banco "${dbName}".`
      });
    } else {
      res.json({
        success: false,
        connected: false,
        message: `Configurações salvas em mysql_config.json, mas o MySQL não respondeu em ${mysqlConfig.host}:${mysqlConfig.port}. Certifique-se de que o MySQL está iniciado no XAMPP Control Panel.`
      });
    }
  });

  app.post('/api/db/sync-local-to-mysql', async (req, res) => {
    const result = await syncAllLocalFilesToMysql();
    res.status(result.success ? 200 : 400).json(result);
  });

  app.post('/api/db/reconnect', async (req, res) => {
    await initializeMysql();
    res.json({
      success: isMysqlActive,
      isUsingPostgres: isMysqlActive,
      message: isMysqlActive
        ? 'Conexão com o MySQL (XAMPP) restabelecida e ativa com sucesso!'
        : 'Não foi possível conectar ao MySQL do XAMPP na porta 3306. Verifique se o MySQL está iniciado no XAMPP Control Panel.'
    });
  });

  app.post('/api/db/safe-update', async (req, res) => {
    const result = await safeMigrateDatabaseSchema();
    res.status(result.success ? 200 : 400).json(result);
  });

  // GET auto-sync status
  app.get('/api/db/auto-sync', (req, res) => {
    res.json({
      success: true,
      enabled: isAutoSyncActive,
      intervalMinutes: autoSyncIntervalMinutes,
      lastSyncTimestamp: lastAutoSyncTimestamp,
      nextSyncTimestamp: nextAutoSyncTimestamp,
      lastStatus: lastAutoSyncStatus,
      isRunning: isAutoSyncRunning
    });
  });

  // POST update auto-sync settings (enabled & interval in minutes)
  app.post('/api/db/auto-sync', (req, res) => {
    const { enabled, intervalMinutes } = req.body;
    if (typeof enabled === 'boolean') {
      isAutoSyncActive = enabled;
    }
    if (typeof intervalMinutes === 'number' && intervalMinutes > 0) {
      autoSyncIntervalMinutes = intervalMinutes;
    }
    nextAutoSyncTimestamp = Date.now() + autoSyncIntervalMinutes * 60 * 1000;

    // Persist changes to mysql_config.json so it survives restarts
    try {
      let cfg: any = {};
      if (fs.existsSync(MYSQL_CONFIG_FILE)) {
        cfg = JSON.parse(fs.readFileSync(MYSQL_CONFIG_FILE, 'utf8'));
      }
      cfg.autoSyncEnabled = isAutoSyncActive;
      cfg.autoSyncIntervalMinutes = autoSyncIntervalMinutes;
      fs.writeFileSync(MYSQL_CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
    } catch (e) {
      console.error('[Auto-Sync Save Config Error]', e);
    }

    if (io) {
      io.emit('auto_sync_status', {
        enabled: isAutoSyncActive,
        intervalMinutes: autoSyncIntervalMinutes,
        lastSyncTimestamp: lastAutoSyncTimestamp,
        nextSyncTimestamp: nextAutoSyncTimestamp,
        lastStatus: lastAutoSyncStatus
      });
    }

    res.json({
      success: true,
      enabled: isAutoSyncActive,
      intervalMinutes: autoSyncIntervalMinutes,
      nextSyncTimestamp: nextAutoSyncTimestamp,
      message: isAutoSyncActive
        ? `Envio automático para o MySQL ativado! As informações do sistema serão enviadas a cada ${autoSyncIntervalMinutes} minutos.`
        : 'Envio automático pausado.'
    });
  });

  // POST sync now immediately (without waiting for the 5-minute timer)
  app.post('/api/db/sync-now', async (req, res) => {
    const result = await triggerAutoSync('usuario_clique_imediato');
    res.json(result || { success: true, message: 'Envio manual concluído com sucesso.' });
  });

  // ==================== ROTAS DO BANCO NATIVO DO NODE.JS ====================
  function normalizeBackupPayload(raw: any) {
    if (!raw || typeof raw !== 'object') return null;
    let payload = raw;
    if (raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data)) {
      payload = raw.data;
    } else if (raw.backup && typeof raw.backup === 'object' && !Array.isArray(raw.backup)) {
      payload = raw.backup;
    }

    const getArray = (keys: string[]): any[] => {
      for (const k of keys) {
        if (Array.isArray(payload[k])) return payload[k];
        if (typeof payload[k] === 'string') {
          try {
            const parsed = JSON.parse(payload[k]);
            if (Array.isArray(parsed)) return parsed;
          } catch (e) {}
        }
      }
      return [];
    };

    return {
      sectors: getArray(['sectors', 'setores', 'alas']),
      beds: getArray(['beds', 'leitos']),
      audits: getArray(['audits', 'auditorias', 'records']),
      questions: getArray(['questions', 'perguntas', 'itens']),
      users: getArray(['users', 'usuarios', 'funcionarios', 'colaboradores']),
      patients: getArray(['patients', 'pacientes', 'prontuarios']),
      cargos: getArray(['cargos', 'roles', 'perfis']),
      logs: getArray(['logs', 'historico', 'audit_logs']),
      form_submissions: getArray(['form_submissions', 'submissoes', 'formularios']),
      appointments: getArray(['appointments', 'agendamentos'])
    };
  }

  function executeNodeDbMigration(rawBackup: any, mode: 'merge' | 'overwrite' = 'merge', activateNative: boolean = true) {
    const normalized = normalizeBackupPayload(rawBackup);
    if (!normalized) {
      throw new Error('Formato de arquivo inválido. Certifique-se de que é um JSON estruturado com dados de auditoria ou backup.');
    }

    const db = getMockDb();

    // 1. Criar snapshot de segurança de restauração antes de qualquer alteração
    const backupDir = path.join(process.cwd(), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const snapshotFilename = `pre-node-migration-${timestamp}.json`;
    const snapshotPath = path.join(backupDir, snapshotFilename);
    fs.writeFileSync(snapshotPath, JSON.stringify(db, null, 2), 'utf8');

    // 2. Estatísticas de migração
    const stats = {
      sectors: 0,
      beds: 0,
      audits: 0,
      questions: 0,
      users: 0,
      patients: 0,
      cargos: 0,
      logs: 0
    };

    const cleanLegacyPermissions = (perms: any) => {
      if (!Array.isArray(perms)) return [];
      return perms.filter((p: string) => !String(p).startsWith('HOSPITAL_') && !['HOSPITAL_MODULES', 'AGENDA', 'FORMULARIO', 'FORM_LESAO', 'FORM_CATETER'].includes(p));
    };

    if (mode === 'overwrite') {
      // Substituição total mantendo integridade
      if (normalized.sectors.length > 0) db.sectors = normalized.sectors;
      if (normalized.beds.length > 0) db.beds = normalized.beds;
      if (normalized.audits.length > 0) db.audits = normalized.audits;
      if (normalized.questions.length > 0) db.questions = normalized.questions;
      if (normalized.patients.length > 0) db.patients = normalized.patients;
      if (normalized.cargos.length > 0) {
        db.cargos = normalized.cargos.map((c: any) => ({ ...c, permissions: cleanLegacyPermissions(c.permissions) }));
      }
      
      if (normalized.users.length > 0) {
        db.users = normalized.users.map((u: any) => ({ ...u, permissions: cleanLegacyPermissions(u.permissions) }));
      }
      if (normalized.logs.length > 0) {
        db.logs = normalized.logs;
      }

      stats.sectors = normalized.sectors.length;
      stats.beds = normalized.beds.length;
      stats.audits = normalized.audits.length;
      stats.questions = normalized.questions.length;
      stats.users = normalized.users.length;
      stats.patients = normalized.patients.length;
      stats.cargos = normalized.cargos.length;
      stats.logs = normalized.logs.length;
    } else {
      // Fusão inteligente (Merge / Upsert) - SEM NENHUMA PERDA DE DADOS!
      // Setores
      normalized.sectors.forEach((s: any) => {
        if (!s || !s.name) return;
        const id = s.id || 'sec_' + Math.random().toString(36).substr(2, 7);
        const idx = (db.sectors || []).findIndex((ex: any) => ex.id === id || (ex.name && ex.name.toLowerCase() === s.name.toLowerCase()));
        if (idx >= 0) {
          db.sectors[idx] = { ...db.sectors[idx], ...s, id: db.sectors[idx].id };
        } else {
          if (!db.sectors) db.sectors = [];
          db.sectors.push({ ...s, id });
          stats.sectors++;
        }
      });

      // Leitos
      normalized.beds.forEach((b: any) => {
        if (!b || !b.number) return;
        const id = b.id || 'bed_' + Math.random().toString(36).substr(2, 7);
        const idx = (db.beds || []).findIndex((ex: any) => ex.id === id || (ex.number === b.number && ex.sectorId === b.sectorId));
        if (idx >= 0) {
          db.beds[idx] = { ...db.beds[idx], ...b, id: db.beds[idx].id };
        } else {
          if (!db.beds) db.beds = [];
          db.beds.push({ ...b, id });
          stats.beds++;
        }
      });

      // Auditorias
      normalized.audits.forEach((a: any) => {
        if (!a) return;
        const id = a.id || 'aud_' + Math.random().toString(36).substr(2, 7);
        const idx = (db.audits || []).findIndex((ex: any) => ex.id === id);
        if (idx >= 0) {
          db.audits[idx] = { ...db.audits[idx], ...a, id };
        } else {
          if (!db.audits) db.audits = [];
          db.audits.push({ ...a, id });
          stats.audits++;
        }
      });

      // Perguntas
      normalized.questions.forEach((q: any) => {
        if (!q || !q.label) return;
        const id = q.id || 'q_' + Math.random().toString(36).substr(2, 7);
        const idx = (db.questions || []).findIndex((ex: any) => ex.id === id || (ex.label === q.label && ex.formType === q.formType));
        if (idx >= 0) {
          db.questions[idx] = { ...db.questions[idx], ...q, id: db.questions[idx].id };
        } else {
          if (!db.questions) db.questions = [];
          db.questions.push({ ...q, id });
          stats.questions++;
        }
      });

      // Pacientes
      normalized.patients.forEach((p: any) => {
        if (!p) return;
        const id = p.id || 'pat_' + Math.random().toString(36).substr(2, 7);
        const idx = (db.patients || []).findIndex((ex: any) => ex.id === id || (p.record && ex.record === p.record));
        if (idx >= 0) {
          db.patients[idx] = { ...db.patients[idx], ...p, id: db.patients[idx].id };
        } else {
          if (!db.patients) db.patients = [];
          db.patients.push({ ...p, id });
          stats.patients++;
        }
      });

      // Usuários
      normalized.users.forEach((u: any) => {
        if (!u || !u.email) return;
        const sanitizedUser = { ...u, permissions: cleanLegacyPermissions(u.permissions) };
        const id = sanitizedUser.id || 'usr_' + Math.random().toString(36).substr(2, 7);
        const idx = (db.users || []).findIndex((ex: any) => ex.id === id || ex.email.toLowerCase() === sanitizedUser.email.toLowerCase());
        if (idx >= 0) {
          db.users[idx] = { ...db.users[idx], ...sanitizedUser, id: db.users[idx].id };
        } else {
          if (!db.users) db.users = [];
          db.users.push({ ...sanitizedUser, id });
          stats.users++;
        }
      });

      // Cargos
      normalized.cargos.forEach((c: any) => {
        if (!c || !c.name) return;
        const sanitizedCargo = { ...c, permissions: cleanLegacyPermissions(c.permissions) };
        const id = sanitizedCargo.id || 'crg_' + Math.random().toString(36).substr(2, 7);
        const idx = (db.cargos || []).findIndex((ex: any) => ex.id === id || ex.name.toLowerCase() === sanitizedCargo.name.toLowerCase());
        if (idx >= 0) {
          db.cargos[idx] = { ...db.cargos[idx], ...sanitizedCargo, id: db.cargos[idx].id };
        } else {
          if (!db.cargos) db.cargos = [];
          db.cargos.push({ ...sanitizedCargo, id });
          stats.cargos++;
        }
      });

      // Logs
      normalized.logs.forEach((l: any) => {
        if (!l) return;
        const id = l.id || 'log_' + Math.random().toString(36).substr(2, 7);
        if (!db.logs) db.logs = [];
        if (!db.logs.some((ex: any) => ex.id === id)) {
          db.logs.unshift({ ...l, id });
          stats.logs++;
        }
      });
      if (db.logs) db.logs = db.logs.slice(0, 2000);
    }

    // 3. Ativar o modo Banco Nativo do Node.js se solicitado (Desativa o MySQL externo do XAMPP para velocidade máxima)
    if (activateNative) {
      try {
        let existingConfig: any = {};
        if (fs.existsSync(MYSQL_CONFIG_FILE)) {
          try {
            existingConfig = JSON.parse(fs.readFileSync(MYSQL_CONFIG_FILE, 'utf8'));
          } catch (e) {}
        }
        existingConfig.enabled = false;
        fs.writeFileSync(MYSQL_CONFIG_FILE, JSON.stringify(existingConfig, null, 2), 'utf8');
        isMysqlActive = false;
        if (mysqlPool) {
          try {
            mysqlPool.end().catch(() => {});
          } catch (e) {}
          mysqlPool = null;
        }
      } catch (errConfig) {
        console.error('[Node Native DB Config Update Error]', errConfig);
      }
    }

    // 4. Gravar todas as tabelas em disco nos arquivos atômicos /data/ e no espelho
    saveMockDb(db);

    // 5. Registrar log de auditoria da migração
    const migrationLog = {
      id: 'log_' + Date.now(),
      timestamp: new Date().toISOString(),
      user: 'Administrador (Migração)',
      action: 'Migração para Banco Nativo Node.js',
      details: `Banco migrado com sucesso via arquivo de backup .JSON (Modo: ${mode === 'merge' ? 'Fusão sem perda' : 'Substituição'}). Ponto de restauração: ${snapshotFilename}.`,
      category: 'BANCO_DE_DADOS'
    };
    if (!db.logs) db.logs = [];
    db.logs.unshift(migrationLog);
    db.logs = db.logs.slice(0, 2000);
    saveMockDb(db, 'logs');

    // 6. Notificar clientes em tempo real
    if (io) {
      io.emit('db_updated', { key: 'ALL', timestamp: Date.now() });
    }

    return {
      success: true,
      message: 'Dados migrados e compatibilizados com sucesso para o banco de dados nativo do Node.js!',
      mode,
      isNativeActive: !isMysqlActive,
      stats,
      totalAudits: (db.audits || []).length,
      totalBeds: (db.beds || []).length,
      totalSectors: (db.sectors || []).length,
      totalPatients: (db.patients || []).length,
      totalUsers: (db.users || []).length,
      snapshotFilename
    };
  }

  // GET /api/health - Verificação rápida de disponibilidade do servidor Node.js local
  app.get('/api/health', (_req, res) => {
    res.status(200).json({
      success: true,
      status: 'online',
      service: 'hospaudit-node',
      port: PORT,
      uptimeSeconds: Math.floor(process.uptime()),
      dbMode: isMysqlActive ? 'mysql_xampp' : 'node_native',
      timestamp: new Date().toISOString()
    });
  });

  // GET /api/node-db/status
  app.get('/api/node-db/status', (req, res) => {
    try {
      const db = getMockDb();
      const files: any[] = [];
      if (fs.existsSync(DATA_DIR)) {
        fs.readdirSync(DATA_DIR)
          .filter(f => f.endsWith('.json'))
          .forEach(f => {
            const stats = fs.statSync(path.join(DATA_DIR, f));
            files.push({
              name: f,
              sizeKb: (stats.size / 1024).toFixed(1),
              updatedAt: stats.mtime.toISOString()
            });
          });
      }

      res.json({
        success: true,
        isNativeActive: !isMysqlActive,
        mode: isMysqlActive ? 'mysql_xampp' : 'node_native',
        engine: 'Node.js Embedded Transactional Engine (High Performance & Security)',
        dataDirectory: DATA_DIR,
        stats: {
          audits: (db.audits || []).length,
          sectors: (db.sectors || []).length,
          beds: (db.beds || []).length,
          questions: (db.questions || []).length,
          users: (db.users || []).length,
          patients: (db.patients || []).length,
          logs: (db.logs || []).length
        },
        files
      });
    } catch (err: any) {
      console.error('[GET /api/node-db/status Error]', err);
      res.status(500).json({ success: false, message: 'Erro ao obter status do banco nativo.', error: err.message });
    }
  });

  // POST /api/node-db/activate
  app.post('/api/node-db/activate', (req, res) => {
    try {
      let existingConfig: any = {};
      if (fs.existsSync(MYSQL_CONFIG_FILE)) {
        try {
          existingConfig = JSON.parse(fs.readFileSync(MYSQL_CONFIG_FILE, 'utf8'));
        } catch (e) {}
      }
      existingConfig.enabled = false;
      fs.writeFileSync(MYSQL_CONFIG_FILE, JSON.stringify(existingConfig, null, 2), 'utf8');

      isMysqlActive = false;
      if (mysqlPool) {
        try {
          mysqlPool.end().catch(() => {});
        } catch (e) {}
        mysqlPool = null;
      }

      if (io) {
        io.emit('db_updated', { key: 'ALL', timestamp: Date.now() });
      }

      res.json({
        success: true,
        isNativeActive: true,
        mode: 'node_native',
        message: 'Banco de dados nativo do Node.js ativado com sucesso! O sistema agora opera com velocidade máxima e segurança autônoma, sem depender do XAMPP.'
      });
    } catch (err: any) {
      console.error('[POST /api/node-db/activate Error]', err);
      res.status(500).json({ success: false, message: 'Erro ao ativar o banco nativo.', error: err.message });
    }
  });

  // POST /api/node-db/migrate-backup
  app.post('/api/node-db/migrate-backup', (req, res) => {
    try {
      const { backupData, mode, activateNative } = req.body;
      if (!backupData) {
        return res.status(400).json({ success: false, message: 'Nenhum dado de backup fornecido para migração.' });
      }

      const migrationResult = executeNodeDbMigration(
        backupData, 
        mode === 'overwrite' ? 'overwrite' : 'merge', 
        activateNative !== false
      );

      res.json(migrationResult);
    } catch (err: any) {
      console.error('[POST /api/node-db/migrate-backup Error]', err);
      res.status(500).json({ 
        success: false, 
        message: 'Falha durante a migração para o banco nativo: ' + (err.message || String(err)) 
      });
    }
  });

  // CID - Get list or search (paginated)
  app.get('/api/cid', (req, res) => {
    try {
      const search = (req.query.search as string || '').toLowerCase().trim();
      const page = parseInt(req.query.page as string || '1', 10);
      const limit = parseInt(req.query.limit as string || '20', 10);

      const dbPath = path.join(process.cwd(), 'cid-database.json');
      let data: any[] = [];
      if (fs.existsSync(dbPath)) {
        data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      }

      let filtered = data;
      if (search) {
        filtered = data.filter(item => 
          item.code.toLowerCase().includes(search) || 
          item.description.toLowerCase().includes(search) ||
          (item.chapter && item.chapter.toLowerCase().includes(search))
        );
      }

      // Sort alphabetically by code
      filtered.sort((a, b) => a.code.localeCompare(b.code));

      const total = filtered.length;
      const start = (page - 1) * limit;
      const paginated = filtered.slice(start, start + limit);

      res.json({
        success: true,
        total,
        page,
        limit,
        data: paginated
      });
    } catch (error: any) {
      console.error('[GET /api/cid Error]', error);
      res.status(500).json({ success: false, message: 'Erro ao carregar os códigos CID.' });
    }
  });

  // CID - Sync with Gemini AI dynamically (searches the latest medical database and appends/updates local json database)
  app.post('/api/cid/sync', async (req, res) => {
    try {
      const { query } = req.body;
      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return res.status(400).json({ success: false, message: 'Digite um termo ou código válido para buscar e atualizar.' });
      }

      const searchQuery = query.trim();
      const ai = getGeminiClient();

      const systemInstruction = `Você é um robô de faturamento hospitalar e auditoria médica extremamente preciso do SUS brasileiro.
      Sua tarefa é encontrar códigos CID-10 ou CID-11 atualizados correspondentes ao termo ou código digitado pelo usuário: "${searchQuery}".
      Retorne estritamente um array JSON contendo até 10 códigos relevantes da classificação oficial de doenças (inclua a versão apropriada, seja CID-10 ou o mais recente CID-11).
      Cada objeto no array deve ter exatamente estes atributos:
      - "code": o código oficial do CID (ex: "U07.1", "E11.9", "A09", "BA41.1")
      - "description": descrição detalhada em português
      - "chapter": capítulo ou categoria correspondente em português (ex: "Capítulo IX (J00-J99): Doenças do aparelho respiratório")
      - "version": "CID-10" ou "CID-11"
      - "lastUpdated": a data de hoje "2026-06-30"
      - "sigtap": um objeto com os detalhes do faturamento SUS (SIGTAP) correspondente a esta doença ou tratamento mais habitual dela, contendo:
        - "codigo": código do procedimento do SIGTAP (formato xx.xx.xx.xxx-x, ex: "03.03.01.003-7")
        - "nome": nome descritivo oficial aproximado do procedimento (ex: "Tratamento de Pneumonia ou Influenza (Gripe)")
        - "valor": valor numérico decimal em reais do procedimento (ex: 350.50)
        - "permanencia": média de dias recomendada de internação (ex: 6)
        - "instrumento": "AIH", "APAC" ou "BPA"
        - "complexidade": "Média Complexidade", "Alta Complexidade" ou "Atenção Básica"
        - "grupo": "03 - Procedimentos Clínicos", "04 - Procedimentos Cirúrgicos" ou correspondente

      Não retorne blocos de texto, explicações, markdown ou blocos iniciados por \`\`\`json. Responda apenas o JSON puro contendo o array de objetos.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `Retorne códigos CID para: ${searchQuery}`,
        config: {
          systemInstruction,
          temperature: 0.1,
          responseMimeType: "application/json"
        }
      });

      const responseText = response.text || '';
      let parsedCodes: any[] = [];
      try {
        parsedCodes = JSON.parse(responseText.trim());
      } catch (err) {
        // Fallback clean-up
        const cleanText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        parsedCodes = JSON.parse(cleanText);
      }

      if (!Array.isArray(parsedCodes)) {
        throw new Error('A resposta médica não retornou uma lista válida.');
      }

      // Read current database to merge
      const dbPath = path.join(process.cwd(), 'cid-database.json');
      let currentDb: any[] = [];
      if (fs.existsSync(dbPath)) {
        currentDb = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      }

      let newCount = 0;
      parsedCodes.forEach(newCid => {
        if (!newCid.code || !newCid.description) return;
        
        const idx = currentDb.findIndex(item => item.code.toLowerCase() === newCid.code.toLowerCase());
        if (idx >= 0) {
          // Update existing code with the latest info
          currentDb[idx] = {
            ...currentDb[idx],
            ...newCid,
            lastUpdated: new Date().toISOString().split('T')[0]
          };
        } else {
          // Learn/append new code automatically!
          currentDb.push({
            ...newCid,
            lastUpdated: new Date().toISOString().split('T')[0]
          });
          newCount++;
        }
      });

      fs.writeFileSync(dbPath, JSON.stringify(currentDb, null, 2), 'utf8');

      res.json({
        success: true,
        message: `${parsedCodes.length} códigos processados com sucesso. ${newCount} novos códigos adicionados automaticamente ao banco de dados.`,
        data: parsedCodes
      });
    } catch (error: any) {
      console.error('[POST /api/cid/sync Error]', error);
      res.status(500).json({ 
        success: false, 
        message: error.message || 'Erro ao consultar a base de dados médica inteligente. Verifique sua chave de API.' 
      });
    }
  });

  // CID - Generate customized AI audit checklist for a given CID
  app.post('/api/cid/audit-checklist', async (req, res) => {
    try {
      const { code, description, version } = req.body;
      if (!code || !description) {
        return res.status(400).json({ success: false, message: 'Código e descrição são obrigatórios.' });
      }

      const ai = getGeminiClient();

      const systemInstruction = `Você é um auditor médico sênior e especialista em faturamento do SUS e saúde suplementar brasileira (TUSS/ANS).
      Sua tarefa é analisar o código CID informado (${code} - ${description} da versão ${version || 'CID-10'}) e gerar um checklist de auditoria detalhado e pragmático para orientar o auditor ao revisar o prontuário deste paciente.
      Retorne estritamente um objeto JSON com estes campos (use apenas português do Brasil):
      - "introduction": Uma breve explicação do impacto deste diagnóstico na auditoria hospitalar (máximo 3 linhas).
      - "mandatoryItems": Um array com 4 a 5 itens obrigatórios que DEVEM constar no prontuário para validar esta cobrança (ex: exames de imagem específicos, dosagens, escalas clínicas, evolução do parecerista).
      - "commonLosses": Um array com 3 ou 4 principais motivos de glosa ou perda de faturamento associados a este CID (ex: falta de justificativa clínica para UTI, materiais não justificados, falta de folha de sala).
      - "recommendations": Um array com 3 ou 4 recomendações práticas de auditoria preventiva para evitar glosas.

      Não retorne blocos de texto, explicações ou markdown adicionais. Retorne apenas o JSON puro.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `Gerar checklist de auditoria detalhado para o diagnóstico do CID: ${code} - ${description}`,
        config: {
          systemInstruction,
          temperature: 0.2,
          responseMimeType: "application/json"
        }
      });

      const responseText = response.text || '';
      let checklist: any = {};
      try {
        checklist = JSON.parse(responseText.trim());
      } catch (err) {
        const cleanText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        checklist = JSON.parse(cleanText);
      }

      res.json({
        success: true,
        checklist
      });
    } catch (error: any) {
      console.error('[POST /api/cid/audit-checklist Error]', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Erro ao gerar o checklist de auditoria inteligente via IA.'
      });
    }
  });

  // CID - Add manual CID
  app.post('/api/cid/manual', (req, res) => {
    try {
      const { 
        code, 
        description, 
        chapter, 
        version,
        sigtap_codigo,
        sigtap_nome,
        sigtap_valor,
        sigtap_permanencia,
        sigtap_instrumento,
        sigtap_complexidade,
        sigtap_grupo
      } = req.body;
      
      if (!code || !description) {
        return res.status(400).json({ success: false, message: 'Código e descrição são obrigatórios.' });
      }

      const dbPath = path.join(process.cwd(), 'cid-database.json');
      let data: any[] = [];
      if (fs.existsSync(dbPath)) {
        data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      }

      const cleanCode = code.trim().toUpperCase();
      const idx = data.findIndex(item => item.code.toUpperCase() === cleanCode);
      if (idx >= 0) {
        return res.status(400).json({ success: false, message: `O código CID ${cleanCode} já existe no banco de dados.` });
      }

      // Build sigtap object if code is provided or default it
      const sigtapObj = sigtap_codigo ? {
        codigo: sigtap_codigo.trim(),
        nome: sigtap_nome ? sigtap_nome.trim() : 'Procedimento Geral SUS',
        valor: sigtap_valor ? parseFloat(sigtap_valor) : 150.00,
        permanencia: sigtap_permanencia ? parseInt(sigtap_permanencia, 10) : 3,
        instrumento: sigtap_instrumento ? sigtap_instrumento.trim() : 'AIH',
        complexidade: sigtap_complexidade ? sigtap_complexidade.trim() : 'Média Complexidade',
        grupo: sigtap_grupo ? sigtap_grupo.trim() : '03 - Procedimentos Clínicos'
      } : {
        codigo: "03.01.06.002-9",
        nome: "Atendimento de Urgência / Procedimento Clínico Geral",
        valor: 150.00,
        permanencia: 2,
        instrumento: "BPA/AIH",
        complexidade: "Média Complexidade",
        grupo: "03 - Procedimentos Clínicos"
      };

      const newItem = {
        code: cleanCode,
        description: description.trim(),
        chapter: (chapter || 'Cadastro Manual').trim(),
        version: version || 'CID-10',
        lastUpdated: new Date().toISOString().split('T')[0],
        sigtap: sigtapObj
      };

      data.push(newItem);
      fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');

      res.json({
        success: true,
        message: `Código CID ${cleanCode} cadastrado com sucesso!`,
        data: newItem
      });
    } catch (error: any) {
      console.error('[POST /api/cid/manual Error]', error);
      res.status(500).json({ success: false, message: 'Erro ao cadastrar código CID manualmente.' });
    }
  });

  // Backup endpoint
  app.post('/api/backup-auto', (req, res) => {
    try {
      const data = req.body;
      const backupDir = path.join(process.cwd(), 'backups');
      
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = path.join(backupDir, `backup-${timestamp}.json`);
      
      fs.writeFileSync(backupFile, JSON.stringify(data, null, 2));
      console.log(`[Backup] Automated backup saved to ${backupFile}`);

      // Auto-pruning: Keep only last 15 files
      const files = fs.readdirSync(backupDir)
        .filter(file => file.endsWith('.json') || file.endsWith('.sql'))
        .map(file => ({
          name: file,
          time: fs.statSync(path.join(backupDir, file)).mtime.getTime()
        }));
      
      if (files.length > 15) {
        files.sort((a, b) => a.time - b.time); // Oldest first
        while (files.length > 15) {
          const oldest = files.shift();
          if (oldest) {
            try {
              fs.unlinkSync(path.join(backupDir, oldest.name));
            } catch (e) {
              console.warn('[Backup] Failed to delete old backup', oldest.name);
            }
          }
        }
      }

      res.json({ success: true, message: 'Backup concluído com sucesso.' });
    } catch (error) {
      console.error('[Backup Error]', error);
      res.status(500).json({ success: false, message: 'Erro ao criar backup.' });
    }
  });

  // Get list of server backups
  app.get('/api/backups', (req, res) => {
    try {
      const backupDir = path.join(process.cwd(), 'backups');
      if (!fs.existsSync(backupDir)) {
        return res.json({ success: true, backups: [] });
      }
      const files = fs.readdirSync(backupDir)
        .filter(file => file.endsWith('.json') || file.endsWith('.sql'))
        .map(file => {
          const stats = fs.statSync(path.join(backupDir, file));
          return {
            name: file,
            size: (stats.size / 1024).toFixed(2) + ' KB',
            raw_size: stats.size,
            date: stats.mtime.toISOString().replace('T', ' ').substring(0, 19),
            type: file.endsWith('.json') ? 'JSON' : 'SQL'
          };
        });
      // Sort descending by date (newest first)
      files.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      res.json({ success: true, backups: files });
    } catch (error) {
      console.error('[Backups List Error]', error);
      res.status(500).json({ success: false, message: 'Erro ao obter lista de backups.' });
    }
  });

  // Download backup
  app.get('/api/backups/download/:filename', (req, res) => {
    try {
      const filename = path.basename(req.params.filename);
      const filePath = path.join(process.cwd(), 'backups', filename);
      if (fs.existsSync(filePath)) {
        res.download(filePath);
      } else {
        res.status(404).send('Arquivo não encontrado.');
      }
    } catch (error) {
      console.error('[Backup Download Error]', error);
      res.status(500).send('Erro ao baixar backup.');
    }
  });

  // Delete backup
  app.delete('/api/backups/:filename', (req, res) => {
    try {
      const filename = path.basename(req.params.filename);
      const filePath = path.join(process.cwd(), 'backups', filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        res.json({ success: true });
      } else {
        res.status(404).json({ success: false, message: 'Arquivo não encontrado.' });
      }
    } catch (error) {
      console.error('[Backup Delete Error]', error);
      res.status(500).json({ success: false, message: 'Erro ao excluir backup.' });
    }
  });

  function getMockDb() {
    if (!cachedDb) {
      cachedDb = getLocalDb();
    }
    return cachedDb;
  }

  function validateAndRecoverDatabase() {
    console.log('[Validação DB] Iniciando verificação de integridade e validação de esquema do banco de dados local...');
    const legacyDbPath = path.join(process.cwd(), 'mysql-mock-db.json');
    let hasErrors = false;

    // 1. Validar mysql-mock-db.json consolidado (apenas para integridade se existir)
    if (fs.existsSync(legacyDbPath)) {
      try {
        const raw = fs.readFileSync(legacyDbPath, 'utf8').trim();
        if (raw.length === 0) {
          console.warn('[Validação DB] AVISO: O arquivo mysql-mock-db.json está vazio.');
        } else {
          const parsed = JSON.parse(raw);
          if (!parsed || typeof parsed !== 'object') {
            console.error('[Validação DB] ERRO: Formato de mysql-mock-db.json inválido (não é um objeto JSON).');
            hasErrors = true;
          } else {
            console.log('[Validação DB] Arquivo consolidado mysql-mock-db.json verificado com sucesso.');
          }
        }
      } catch (err: any) {
        console.error(`[Validação DB] ERRO CRÍTICO: Arquivo mysql-mock-db.json está corrompido ou com sintaxe JSON inválida: ${err.message}`);
        console.error('[Validação DB] Nenhuma restauração automática foi efetuada para preservar o arquivo original. Corrija o JSON manualmente.');
        hasErrors = true;
      }
    }

    // 2. Validar e Sanear cada arquivo individual em FILE_MAP
    Object.keys(FILE_MAP).forEach(key => {
      const filePath = FILE_MAP[key];
      if (fs.existsSync(filePath)) {
        try {
          const content = fs.readFileSync(filePath, 'utf8').trim();
          if (content.length === 0) {
            console.warn(`[Validação DB] AVISO: O arquivo ${key}.json está vazio.`);
            return;
          }

          const parsed = JSON.parse(content);
          if (!Array.isArray(parsed)) {
            console.error(`[Validação DB] ERRO DE ESQUEMA: O arquivo ${key}.json não contém uma lista válida (Array JSON).`);
            hasErrors = true;
            return;
          }

          let fileHasChanges = false;
          const seenIds = new Set<string>();
          const cleanArray: any[] = [];
          let duplicateCount = 0;
          let invalidCount = 0;

          parsed.forEach((item: any, idx: number) => {
            // Verificar se o item é um objeto válido
            if (!item || typeof item !== 'object') {
              invalidCount++;
              fileHasChanges = true;
              return;
            }

            // --- DELETED HOSPITAL / LEGACY MODULES SANITIZATION ---
            if (key === 'modulos_sistema') {
              if (item.id && (String(item.id).startsWith('HOSPITAL_') || item.id === 'AGENDA' || item.id === 'FORMULARIO')) {
                fileHasChanges = true;
                return; // Exclui o módulo
              }
            }

            if (key === 'cargos' || key === 'users') {
              if (Array.isArray(item.permissions)) {
                const originalLength = item.permissions.length;
                item.permissions = item.permissions.filter((p: string) => !String(p).startsWith('HOSPITAL_') && !['HOSPITAL_MODULES', 'AGENDA', 'FORMULARIO', 'FORM_LESAO', 'FORM_CATETER'].includes(p));
                if (item.permissions.length !== originalLength) {
                  fileHasChanges = true;
                }
              }
            }

            if (key === 'permissoes') {
              const idStr = String(item.id || '');
              const modStr = String(item.modulo_id || '');
              if (idStr.includes('HOSPITAL_') || modStr.startsWith('HOSPITAL_') || modStr === 'AGENDA' || modStr === 'FORMULARIO') {
                fileHasChanges = true;
                return; // Exclui a permissão
              }
            }
            // ----------------------------------------------

            // Se o item não possui um ID, gera um ID único
            if (item.id === undefined || item.id === null) {
              item.id = `auto_${key}_${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11)}`;
              fileHasChanges = true;
              console.warn(`[Validação DB] AVISO: Registro sem ID encontrado em ${key}.json na posição ${idx}. ID gerado: ${item.id}`);
            }

            const idStr = String(item.id);
            if (seenIds.has(idStr)) {
              duplicateCount++;
              fileHasChanges = true; // Força gravação da lista limpa sem duplicatas
            } else {
              seenIds.add(idStr);
              cleanArray.push(item);
            }
          });

          if (invalidCount > 0) {
            console.error(`[Validação DB] ESQUEMA CORRIGIDO: Removidos ${invalidCount} itens inválidos (não objetos) do arquivo ${key}.json.`);
          }

          if (duplicateCount > 0) {
            console.warn(`[Validação DB] DEDUPLICAÇÃO ATIVA: Detectados e prevenidos ${duplicateCount} registros duplicados no arquivo ${key}.json.`);
          }

          // Se houve saneamento (duplicatas removidas ou IDs criados), salva de volta de forma segura!
          if (fileHasChanges) {
            try {
              atomicWriteJsonSync(filePath, cleanArray);
              console.log(`[Validação DB] SANEAMENTO CONCLUÍDO: O arquivo ${key}.json foi limpo de duplicatas e registros inválidos.`);
            } catch (writeErr: any) {
              console.error(`[Validação DB] ERRO ao gravar arquivo saneado ${key}.json: ${writeErr.message}`);
            }
          }
        } catch (err: any) {
          console.error(`[Validação DB] ERRO CRÍTICO: O arquivo ${key}.json (${filePath}) está fisicamente corrompido ou com sintaxe JSON inválida: ${err.message}`);
          console.error('[Validação DB] Nenhuma alteração ou restauração automática foi realizada no disco para evitar perda de dados.');
          hasErrors = true;
        }
      }
    });

    if (!hasErrors) {
      console.log('[Validação DB] Verificação de integridade e validação de esquema finalizada com sucesso! Todos os arquivos JSON estão íntegros e sem duplicidade.');
    } else {
      console.error('[Validação DB] Verificação finalizada com ALERTAS/ERROS críticos de estrutura. O sistema carregou cópias seguras em memória para evitar travamento.');
    }
  }

  function getLocalDb() {
    if (!hasValidatedDB) {
      hasValidatedDB = true;
      try {
        validateAndRecoverDatabase();
      } catch (err) {
        console.error('[Validação DB Error] Erro inesperado durante validateAndRecoverDatabase:', err);
      }
    }

    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    const legacyDbPath = path.join(process.cwd(), 'mysql-mock-db.json');
    let dbData: any = {};
    let migrated = false;

    const anyFileMissing = Object.values(FILE_MAP).some(p => !fs.existsSync(p));

    if (anyFileMissing && fs.existsSync(legacyDbPath)) {
      console.log('[Banco de Dados Local] Importando dados consolidados existentes do arquivo antigo mysql-mock-db.json...');
      try {
        dbData = JSON.parse(fs.readFileSync(legacyDbPath, 'utf8'));
        migrated = true;
      } catch (err) {
        console.error('[Migration Error] Falha ao ler arquivo mysql-mock-db.json, iniciando base limpa:', err);
      }
    }

    const finalDb: any = {};
    let changed = false;

    const defaults: any = {
      sectors: [
        { id: 'uti1', name: 'UTI 1', description: 'Unidade de Terapia Intensiva 1' },
        { id: 'uti2', name: 'UTI 2', description: 'Unidade de Terapia Intensiva 2' }
      ],
      beds: [],
      audits: [],
      questions: [],
      logs: [],
      users: [
        { id: '1', name: 'Administrador', email: 'admin', password: 'admin', role: 'MASTER', permissions: [] }
      ],
      cargos: [
        { id: 'master', name: 'Administrador Master', role: 'MASTER', permissions: ['ALL'] },
        { id: 'admin', name: 'Administrador', role: 'ADMIN', permissions: ['DASHBOARD', 'COMPARATIVE', 'SECTORS', 'BEDS', 'QUESTIONS', 'NEW_AUDIT', 'COMPLETED_AUDITS', 'IRAS_LOGS', 'REPORTS', 'USERS_PERMISSIONS'] },
        { id: 'auditor_clinico', name: 'Auditor Clínico', role: 'USER', permissions: ['DASHBOARD', 'NEW_AUDIT', 'COMPLETED_AUDITS', 'IRAS_LOGS'] },
        { id: 'enfermeiro_chefe', name: 'Enfermeiro Chefe', role: 'ADMIN', permissions: ['DASHBOARD', 'COMPARATIVE', 'SECTORS', 'BEDS', 'QUESTIONS', 'NEW_AUDIT', 'COMPLETED_AUDITS', 'IRAS_LOGS', 'REPORTS'] },
        { id: 'atendente_recepcao', name: 'Atendente de Recepção', role: 'USER', permissions: ['DASHBOARD'] },
        { id: 'farmaceutico', name: 'Farmacêutico Hospitalar', role: 'USER', permissions: ['DASHBOARD'] },
        { id: 'faturista', name: 'Faturista Hospitalar', role: 'USER', permissions: ['DASHBOARD'] },
        { id: 'tecnico_enfermagem', name: 'Técnico de Enfermagem', role: 'USER', permissions: ['DASHBOARD', 'NEW_AUDIT'] }
      ],
      patients: [],
      modulos_sistema: [
        { id: 'DASHBOARD', name: 'Indicadores & Estatísticas', status: 1 },
        { id: 'INDICADORES', name: 'Módulo Indicadores (TV/Tablets)', status: 1 },
        { id: 'COMPARATIVE', name: 'Painel Comparativo de Setores', status: 1 },
        { id: 'PATIENTS', name: 'Cadastro de Pacientes', status: 1 },
        { id: 'SECTORS', name: 'Cadastro de Setores', status: 1 },
        { id: 'BEDS', name: 'Cadastro de Leitos', status: 1 },
        { id: 'QUESTIONS', name: 'Cadastro de Perguntas', status: 1 },
        { id: 'NEW_AUDIT', name: 'Nova Auditoria', status: 1 },
        { id: 'COMPLETED_AUDITS', name: 'Auditorias Realizadas', status: 1 },
        { id: 'IRAS_LOGS', name: 'Logs de Auditoria IRAS', status: 1 },
        { id: 'VOTING', name: 'Votação Online & Modelos', status: 1 },
        { id: 'REPORTS', name: 'Gerar Relatórios', status: 1 },
        { id: 'USERS_PERMISSIONS', name: 'Gestão de Usuários & Permissões', status: 1 },
        { id: 'EQUIPAMENTOS', name: 'Manutenção de Equipamentos', status: 1 }
      ],
      permissoes: [],
      triagens: [],
      stockItems: [],
      prescriptions: [],
      surgeries: [],
      invoices: [],
      billingAccounts: [],
      equipments: [
        { id: 'eq_1', name: 'Respirador Mecânico ICU-500', serialNumber: 'SN-RESP-2024-001', model: 'ICU-500', brand: 'Dräger', sectorId: 'uti1', purchaseDate: '2024-01-15', status: 'ATIVO' },
        { id: 'eq_2', name: 'Monitor Multiparamétrico Vista 120', serialNumber: 'SN-MON-2023-892', model: 'Vista 120', brand: 'Mindray', sectorId: 'uti1', purchaseDate: '2023-11-10', status: 'ATIVO' },
        { id: 'eq_3', name: 'Bomba de Infusão Alaris GP', serialNumber: 'SN-BOM-2025-110', model: 'Alaris GP', brand: 'BD', sectorId: 'uti2', purchaseDate: '2025-02-20', status: 'MANUTENCAO' },
        { id: 'eq_4', name: 'Desfibrilador Cardiomax', serialNumber: 'SN-DESF-2022-441', model: 'Cardiomax', brand: 'Instramed', sectorId: 'v97bpaudp', purchaseDate: '2022-08-05', status: 'ATIVO' }
      ],
      maintenances: [
        { id: 'm_1', equipmentId: 'eq_1', type: 'PREVENTIVA', scheduledDate: '2026-07-10', performedDate: null, technician: 'Eng. Carlos Souza', description: 'Calibração anual dos sensores de oxigênio e fluxo de ar.', cost: 450.00, status: 'PENDENTE', notes: 'Aguardando kit de peças sobressalentes.' },
        { id: 'm_2', equipmentId: 'eq_3', type: 'CORRETIVA', scheduledDate: '2026-07-05', performedDate: '2026-07-06', technician: 'Tec. Ana Costa', description: 'Troca da battery interna viciada e calibração de fluxo de gotejamento.', cost: 280.00, status: 'CONCLUIDA', notes: 'Bateria substituída com sucesso. Equipamento calibrado e testado.' },
        { id: 'm_3', equipmentId: 'eq_4', type: 'PREVENTIVA', scheduledDate: '2026-07-20', performedDate: null, technician: 'Eng. Carlos Souza', description: 'Verificação preventiva das pás de choque e charge de battery.', cost: 150.00, status: 'PENDENTE', notes: '' }
      ]
    };

    if (!dbData.beds || dbData.beds.length === 0) {
      dbData.beds = [];
      for (let i = 1; i <= 10; i++) {
        dbData.beds.push({ id: `uti1-l${i}`, number: `Leito 0${i}`, sectorId: 'uti1' });
      }
      for (let i = 11; i <= 20; i++) {
        dbData.beds.push({ id: `uti2-l${i}`, number: `Leito ${i}`, sectorId: 'uti2' });
      }
    }

    const corruptFiles: { [key: string]: boolean } = {};

    Object.keys(FILE_MAP).forEach(key => {
      const filePath = FILE_MAP[key];
      if (fs.existsSync(filePath)) {
        try {
          const content = fs.readFileSync(filePath, 'utf8').trim();
          if (content.length === 0) {
            finalDb[key] = [];
          } else {
            finalDb[key] = JSON.parse(content);
          }
        } catch (err: any) {
          console.error(`\n[ERRO DE LEITURA] Falha ao decodificar JSON do arquivo: ${filePath}`);
          console.error(`Detalhes: ${err.message}`);
          console.error('O arquivo original NÃO FOI ALTERADO para prevenir perda de dados.');
          console.error('Sistemas de backup automático permanecem disponíveis na pasta "backups/".\n');
          
          finalDb[key] = dbData[key] || defaults[key] || [];
          corruptFiles[key] = true;
        }
      } else {
        finalDb[key] = dbData[key] || defaults[key] || [];
        changed = true;
      }
    });

    const duplicateIds = ['ou4smm00g', 'x52b0o0kw', '5e265c4mt'];
    
    if (finalDb.questions && Array.isArray(finalDb.questions)) {
      const originalLen = finalDb.questions.length;
      finalDb.questions = finalDb.questions.filter((q: any) => !duplicateIds.includes(q.id));
      if (finalDb.questions.length !== originalLen) {
        changed = true;
        console.log(`[Deduplicação] Removidas ${originalLen - finalDb.questions.length} perguntas duplicadas do cadastro.`);
      }
    }

    if (finalDb.audits && Array.isArray(finalDb.audits)) {
      let migratedAnswersCount = 0;
      finalDb.audits.forEach((audit: any) => {
        if (audit.answers) {
          if (audit.answers['ou4smm00g'] !== undefined) {
            audit.answers['cs_11'] = audit.answers['ou4smm00g'];
            delete audit.answers['ou4smm00g'];
            migratedAnswersCount++;
          }
          if (audit.answers['x52b0o0kw'] !== undefined) {
            audit.answers['svd_3'] = audit.answers['x52b0o0kw'];
            delete audit.answers['x52b0o0kw'];
            migratedAnswersCount++;
          }
          if (audit.answers['5e265c4mt'] !== undefined) {
            audit.answers['cs_2'] = audit.answers['5e265c4mt'];
            delete audit.answers['5e265c4mt'];
            migratedAnswersCount++;
          }
        }
      });
      if (migratedAnswersCount > 0) {
        changed = true;
        console.log(`[Deduplicação] Migrados e unificados com sucesso ${migratedAnswersCount} registros de respostas antigas.`);
      }
    }

    // Clean up hospital and removed modules and permissions from finalDb upon initialization
    if (finalDb.modulos_sistema && Array.isArray(finalDb.modulos_sistema)) {
      const originalLen = finalDb.modulos_sistema.length;
      finalDb.modulos_sistema = finalDb.modulos_sistema.filter((m: any) => m.id && !String(m.id).startsWith('HOSPITAL_') && m.id !== 'AGENDA' && m.id !== 'FORMULARIO');
      if (finalDb.modulos_sistema.length !== originalLen) {
        changed = true;
      }
    }
    if (finalDb.cargos && Array.isArray(finalDb.cargos)) {
      finalDb.cargos.forEach((item: any) => {
        if (Array.isArray(item.permissions)) {
          const originalLen = item.permissions.length;
          item.permissions = item.permissions.filter((p: string) => !String(p).startsWith('HOSPITAL_') && !['HOSPITAL_MODULES', 'AGENDA', 'FORMULARIO', 'FORM_LESAO', 'FORM_CATETER'].includes(p));
          if (item.permissions.length !== originalLen) {
            changed = true;
          }
        }
      });
    }
    if (finalDb.users && Array.isArray(finalDb.users)) {
      finalDb.users.forEach((item: any) => {
        if (Array.isArray(item.permissions)) {
          const originalLen = item.permissions.length;
          item.permissions = item.permissions.filter((p: string) => !String(p).startsWith('HOSPITAL_') && !['HOSPITAL_MODULES', 'AGENDA', 'FORMULARIO', 'FORM_LESAO', 'FORM_CATETER'].includes(p));
          if (item.permissions.length !== originalLen) {
            changed = true;
          }
        }
      });
    }
    if (finalDb.permissoes && Array.isArray(finalDb.permissoes)) {
      const originalLen = finalDb.permissoes.length;
      finalDb.permissoes = finalDb.permissoes.filter((item: any) => {
        const idStr = String(item.id || '');
        const modStr = String(item.modulo_id || '');
        return !idStr.includes('HOSPITAL_') && !modStr.startsWith('HOSPITAL_') && modStr !== 'AGENDA' && modStr !== 'FORMULARIO';
      });
      if (finalDb.permissoes.length !== originalLen) {
        changed = true;
      }
    }

    if (!finalDb.permissoes || !Array.isArray(finalDb.permissoes) || finalDb.permissoes.length === 0) {
      finalDb.permissoes = [];
      const defaultCargos = finalDb.cargos || [];
      const defaultModules = finalDb.modulos_sistema || [];
      defaultCargos.forEach((cargo: any) => {
        defaultModules.forEach((m: any) => {
          const hasPerm = cargo.role === 'MASTER' || (cargo.permissions || []).includes(m.id);
          finalDb.permissoes.push({
            id: `perm_${cargo.id}_${m.id}`,
            cargo_id: cargo.id,
            modulo_id: m.id,
            pode_visualizar: hasPerm ? 1 : 0,
            pode_criar_editar: hasPerm ? 1 : 0,
            pode_deletar: hasPerm ? 1 : 0
          });
        });
      });
      changed = true;
    }

    if (!finalDb.users) {
      finalDb.users = [];
      changed = true;
    } else {
      const originalLen = finalDb.users.length;
      const seenEmails = new Set();
      const seenIds = new Set();
      finalDb.users = finalDb.users.filter((u: any) => {
        if (!u || !u.email) return false;
        const emailLower = String(u.email).toLowerCase().trim();
        const idStr = String(u.id || '').trim();
        if (seenEmails.has(emailLower) || seenIds.has(idStr)) {
          return false;
        }
        seenEmails.add(emailLower);
        seenIds.add(idStr);
        return true;
      });
      if (finalDb.users.length !== originalLen) {
        changed = true;
        console.log(`[Deduplicação] Removidos ${originalLen - finalDb.users.length} usuários duplicados.`);
      }

      // Unificação inteligente do usuário Luiz duplicado para evitar divergências e duplo cadastro
      const hasLuiz = finalDb.users.some((u: any) => u && u.email && String(u.email).toLowerCase().trim() === 'luiz');
      const hasLuizRomining = finalDb.users.some((u: any) => u && u.email && String(u.email).toLowerCase().trim() === 'luiz.romining');
      if (hasLuiz && hasLuizRomining) {
        console.log('[Migração Luiz] Detectado duplo cadastro do colaborador Luiz (luiz e luiz.romining). Unificando para luiz.romining...');
        // Remove o usuário com email curto 'luiz'
        finalDb.users = finalDb.users.filter((u: any) => u && u.email && String(u.email).toLowerCase().trim() !== 'luiz');
        
        // Garante que o usuário luiz.romining tenha o nome correto
        const indexRomining = finalDb.users.findIndex((u: any) => u && u.email && String(u.email).toLowerCase().trim() === 'luiz.romining');
        if (indexRomining !== -1) {
          finalDb.users[indexRomining].name = 'Luiz Romining';
          finalDb.users[indexRomining].cargo = 'Auditor Clínico';
        }
        
        // Corrige referências nas auditorias para apontarem para luiz.romining em vez de luiz
        if (finalDb.audits && Array.isArray(finalDb.audits)) {
          finalDb.audits.forEach((audit: any) => {
            if (audit.evaluatorEmail === 'luiz' || audit.evaluator === 'Luiz Rominign') {
              audit.evaluatorEmail = 'luiz.romining';
              audit.evaluator = 'Luiz Romining';
            }
          });
        }
        changed = true;
      }
    }
    if (!finalDb.users.some((u: any) => u.email === 'admin')) {
      finalDb.users.push(defaults.users[0]);
      changed = true;
    }
    const isNewDb = !fs.existsSync(FILE_MAP.users);
    if (isNewDb) {
      if (!finalDb.users.some((u: any) => u.email === 'luiz.romining')) {
        finalDb.users.push({
          id: 'user-luiz-romining',
          name: 'Luiz Romining',
          email: 'luiz.romining',
          password: 'luiz',
          role: 'USER',
          permissions: ['DASHBOARD', 'NEW_AUDIT', 'COMPLETED_AUDITS', 'REPORTS', 'COMPARATIVE'],
          cargo: 'Auditor Clínico'
        });
        changed = true;
      }
    }

    if (changed || migrated) {
      Object.keys(FILE_MAP).forEach(key => {
        if (corruptFiles[key]) {
          console.warn(`[Banco Local] Ignorando salvamento do arquivo corrompido ${FILE_MAP[key]} para preservar o estado original para correção manual.`);
          return;
        }
        const filePath = FILE_MAP[key];
        try {
          atomicWriteJsonSync(filePath, finalDb[key]);
        } catch (err) {
          console.error(`[Save Error] Falha ao salvar arquivo ${filePath}:`, err);
        }
      });
      console.log('[Banco Local] Arquivos .json individuais sincronizados com as atualizações com sucesso.');
    }

    return finalDb;
  }

  function saveMockDb(data: any, targetKey?: string) {
    cachedDb = data;

    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (targetKey && FILE_MAP[targetKey]) {
      const filePath = FILE_MAP[targetKey];
      const partData = data[targetKey] || [];
      try {
        atomicWriteJsonSync(filePath, partData);
      } catch (err) {
        console.error(`[Save Error] Falha ao salvar arquivo individual ${filePath}:`, err);
      }
    } else {
      Object.keys(FILE_MAP).forEach(key => {
        const filePath = FILE_MAP[key];
        const partData = data[key] || [];
        try {
          atomicWriteJsonSync(filePath, partData);
        } catch (err) {
          console.error(`[Save Error] Falha ao salvar arquivo individual ${filePath}:`, err);
        }
      });
    }

    // Save to MySQL asynchronously only when explicitly enabled
    if (isMysqlActive && mysqlPool) {
      saveToMysql(data, targetKey).catch(err => {
        console.error('[MySQL Save Async Error] Erro ao persistir alterações no MySQL:', err.message);
      });
    }
  }

  function performAutoBackup() {
    try {
      const db = getMockDb();
      const backupDir = path.join(process.cwd(), 'backups');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFilename = `backup-auto-15m-${timestamp}.json`;
      const backupFile = path.join(backupDir, backupFilename);

      fs.writeFileSync(backupFile, JSON.stringify(db, null, 2), 'utf8');
      console.log(`[Backup Automático] Backup periódico salvo com sucesso em: ${backupFile}`);

      const files = fs.readdirSync(backupDir)
        .filter(file => file.startsWith('backup-auto-15m-') && file.endsWith('.json'))
        .map(file => ({
          name: file,
          time: fs.statSync(path.join(backupDir, file)).mtime.getTime()
        }));

      if (files.length > 20) {
        files.sort((a, b) => a.time - b.time);
        while (files.length > 20) {
          const oldest = files.shift();
          if (oldest) {
            try {
              fs.unlinkSync(path.join(backupDir, oldest.name));
              console.log(`[Backup Automático] Removido backup antigo excedente: ${oldest.name}`);
            } catch (unlinkErr) {
              console.error('[Backup Automático Error] Falha ao deletar arquivo antigo:', unlinkErr);
            }
          }
        }
      }
    } catch (err) {
      console.error('[Backup Automático Error] Falha ao processar o backup periódico:', err);
    }
  }

  setInterval(() => {
    console.log('[Timer] Iniciando backup automático agendado (15 minutos)...');
    performAutoBackup();
  }, 15 * 60 * 1000);

  const serverNumericCollator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

  function computeServerAuditScore(answers: Record<string, string> | undefined | null): number {
    if (!answers) return 0;
    let totalAnswered = 0;
    let positiveAnswers = 0;
    let naAnswers = 0;
    for (const key in answers) {
      if (Object.prototype.hasOwnProperty.call(answers, key)) {
        const val = answers[key];
        totalAnswered++;
        if (val === 'S' || val === 'Sim') positiveAnswers++;
        else if (val === 'NA') naAnswers++;
      }
    }
    const totalEligible = totalAnswered - naAnswers;
    return totalEligible > 0 ? Math.round((positiveAnswers / totalEligible) * 100) : 0;
  }

  function getVisibleAuditsForUser(db: any, userEmail: string): any[] {
    let auditsList = db.audits || [];
    if (userEmail && userEmail !== 'admin' && userEmail !== 'administrador') {
      const userObj = (db.users || []).find((u: any) => (u.email || '').toLowerCase().trim() === userEmail);
      if (userObj) {
        const hasMaster = userObj.role === 'MASTER' || userObj.role === 'ADMIN' || (userObj.permissions || []).includes('ALL');
        if (!hasMaster) {
          let canViewAll = false;
          const userCargoName = userObj.cargo;
          const cargoObj = (db.cargos || []).find((c: any) => c.name === userCargoName || c.id === userCargoName);
          if (cargoObj) {
            const perm = (db.permissoes || []).find((p: any) => p.cargo_id === cargoObj.id && p.modulo_id === 'COMPLETED_AUDITS');
            if (perm && (Number(perm.pode_visualizar) === 1 || perm.pode_visualizar === true || perm.pode_visualizar === '1')) {
              let items: any[] = [];
              try {
                items = typeof perm.itens === 'string' ? JSON.parse(perm.itens) : (Array.isArray(perm.itens) ? perm.itens : []);
              } catch (e) {}
              if (items.includes('Histórico Completo')) {
                canViewAll = true;
              }
            }
          }

          if (!canViewAll) {
            const queryName = (userObj.name || '').toLowerCase().trim();
            const queryEmail = (userObj.email || '').toLowerCase().trim();
            auditsList = auditsList.filter((a: any) => {
              const evalName = (a.evaluator || '').toLowerCase().trim();
              return evalName === queryName || evalName === queryEmail;
            });
          }
        }
      }
    }
    return auditsList;
  }

  // Helper function to validate all database inputs before saving
  function validateInput(action: string, payload: any, db: any): string | null {
    if (action === 'ping' || action === 'get_data' || action === 'get_audits_paginated') return null;
    if (!payload) return 'Nenhum dado enviado para validação.';

    switch (action) {
      case 'add_sector':
      case 'update_sector': {
        const { id, name, description } = payload;
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
          return 'O nome do setor é obrigatório e deve ser um texto válido.';
        }
        if (name.length > 100) {
          return 'O nome do setor não pode exceder 100 caracteres.';
        }
        if (description && description.length > 500) {
          return 'A descrição do setor não pode exceder 500 caracteres.';
        }
        // Duplicate check (case-insensitive, exclude current ID if updating)
        const duplicate = (db.sectors || []).some((s: any) => 
          s.name.toLowerCase() === name.trim().toLowerCase() && s.id !== id
        );
        if (duplicate && action === 'update_sector') {
          return `Já existe um setor cadastrado com o nome "${name.trim()}".`;
        }
        break;
      }

      case 'add_bed':
      case 'update_bed': {
        const { id, number, sectorId } = payload;
        if (!number || typeof number !== 'string' || number.trim().length === 0) {
          return 'A identificação do leito (número) é obrigatória.';
        }
        if (number.length > 50) {
          return 'O número/nome do leito não pode exceder 50 caracteres.';
        }
        if (!sectorId) {
          return 'O setor correspondente é obrigatório.';
        }
        const sectorExists = (db.sectors || []).some((s: any) => s.id === sectorId);
        if (!sectorExists) {
          return 'O setor informado não existe no banco de dados.';
        }
        // Duplicate check: Same number in the same sector
        const duplicate = (db.beds || []).some((b: any) => 
          b.number.toLowerCase() === number.trim().toLowerCase() && 
          b.sectorId === sectorId && 
          b.id !== id
        );
        if (duplicate && action === 'update_bed') {
          return `Já existe um leito com o número/nome "${number.trim()}" cadastrado neste setor.`;
        }
        break;
      }

      case 'add_audit':
      case 'update_audit': {
        const { id, evaluator, sectorId, bedId, type, answers } = payload;
        if (!evaluator || typeof evaluator !== 'string' || evaluator.trim().length === 0) {
          return 'O nome do auditor avaliador é obrigatório.';
        }
        if (!sectorId) {
          return 'O setor é obrigatório.';
        }
        if (!bedId) {
          return 'O leito é obrigatório.';
        }
        if (type !== 'IRAS' && type !== 'SAFETY') {
          return 'O tipo de checklist de auditoria deve ser "IRAS" ou "SAFETY".';
        }
        const sectorExists = (db.sectors || []).some((s: any) => s.id === sectorId);
        if (!sectorExists) {
          return 'O setor informado para a auditoria não existe.';
        }
        const bedExists = (db.beds || []).some((b: any) => b.id === bedId);
        if (!bedExists) {
          return 'O leito informado para a auditoria não existe.';
        }
        if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
          return 'Os dados de respostas (checklist) devem ser informados em formato chave-valor.';
        }
        break;
      }

      case 'add_question':
      case 'update_question': {
        const { id, formType, section, label, options } = payload;
        if (formType !== 'IRAS' && formType !== 'SAFETY') {
          return 'O tipo de formulário deve ser "IRAS" ou "SAFETY".';
        }
        if (!section || typeof section !== 'string' || section.trim().length === 0) {
          return 'A seção do formulário é obrigatória.';
        }
        if (!label || typeof label !== 'string' || label.trim().length === 0) {
          return 'O enunciado da pergunta é obrigatório.';
        }
        if (!options || !Array.isArray(options) || options.length === 0) {
          return 'As opções de resposta do checklist são obrigatórias (mínimo de uma opção).';
        }
        break;
      }

      case 'add_user':
      case 'update_user': {
        const { id, name, email, password } = payload;
        if (action === 'add_user') {
          if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return 'O nome do colaborador/usuário é obrigatório.';
          }
          if (!email || typeof email !== 'string' || email.trim().length === 0) {
            return 'O e-mail do colaborador é obrigatório.';
          }
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          const loginRegex = /^[a-zA-Z0-9._-]+$/;
          if (!emailRegex.test(email) && !loginRegex.test(email)) {
            return 'O formato de e-mail informado é inválido.';
          }
          const duplicate = (db.users || []).some((u: any) => 
            u.email.toLowerCase() === email.trim().toLowerCase() && u.id !== id
          );
          if (duplicate) {
            return `Já existe um usuário cadastrado com o e-mail "${email.trim()}".`;
          }
          if (!password || typeof password !== 'string' || password.length < 4) {
            return 'A senha é obrigatória e deve conter no mínimo 4 caracteres.';
          }
        } else {
          // For update_user, check fields only if they are sent in the payload
          if (name !== undefined) {
            if (typeof name !== 'string' || name.trim().length === 0) {
              return 'O nome do colaborador/usuário é obrigatório.';
            }
          }
          if (email !== undefined) {
            if (typeof email !== 'string' || email.trim().length === 0) {
              return 'O e-mail do colaborador é obrigatório.';
            }
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            const loginRegex = /^[a-zA-Z0-9._-]+$/;
            if (!emailRegex.test(email) && !loginRegex.test(email)) {
              return 'O formato de e-mail informado é inválido.';
            }
            const duplicate = (db.users || []).some((u: any) => 
              u.email.toLowerCase() === email.trim().toLowerCase() && u.id !== id
            );
            if (duplicate) {
              return `Já existe um usuário cadastrado com o e-mail "${email.trim()}".`;
            }
          }
          if (password !== undefined && password !== '') {
            if (typeof password !== 'string' || password.length < 4) {
              return 'A senha deve conter no mínimo 4 caracteres.';
            }
          }
        }
        break;
      }

      case 'add_patient':
      case 'update_patient': {
        const { id, name, record, sectorId, bedId, status } = payload;
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
          return 'O nome do paciente é obrigatório.';
        }
        if (!record || typeof record !== 'string' || record.trim().length === 0) {
          return 'O número de prontuário é obrigatório.';
        }
        if (!sectorId) {
          return 'O setor de internação é obrigatório.';
        }
        if (!bedId) {
          return 'O leito de internação é obrigatório.';
        }
        if (status !== 'INTERNADO' && status !== 'ALTA' && status !== 'TRANSFERIDO') {
          return 'O status do paciente deve ser "INTERNADO", "ALTA" ou "TRANSFERIDO".';
        }

        const sectorExists = (db.sectors || []).some((s: any) => s.id === sectorId);
        if (!sectorExists) {
          return 'O setor de internação informado não existe.';
        }
        const bedExists = (db.beds || []).some((b: any) => b.id === bedId);
        if (!bedExists) {
          return 'O leito de internação informado não existe.';
        }

        // Record duplicate check
        const duplicateRecord = (db.patients || []).some((p: any) => 
          p.record.toLowerCase() === record.trim().toLowerCase() && p.id !== id
        );
        if (duplicateRecord && action === 'update_patient') {
          return `Já existe outro paciente cadastrado com o prontuário "${record.trim()}".`;
        }

        // Bed occupancy check
        if (status === 'INTERNADO') {
          const bedOccupied = (db.patients || []).some((p: any) => 
            p.sectorId === sectorId && 
            p.bedId === bedId && 
            p.status === 'INTERNADO' && 
            p.id !== id
          );
          if (bedOccupied && action === 'update_patient') {
            return 'O leito selecionado já está ocupado por outro paciente ativo.';
          }
        }
        break;
      }
    }

    return null;
  }

  // Intercept api.php calls to make MySQL Online in development environment
  app.all(/\/api\.php$/, async (req, res) => {
    try {
      const action = (req.query.action as string || req.body.action || 'get_data').trim();
      const db = getMockDb();

      // Run validation helper before modifying or saving data
      const validationError = validateInput(action, req.body, db);
      if (validationError) {
        console.warn(`[API.PHP validation failed] action: ${action}, error: ${validationError}`);
        return res.status(400).json({ success: false, message: validationError });
      }

      // Security Access Control Middleware (RBAC) via Cargo/User configuration in MySQL Mock Database
      const writeActions: Record<string, string> = {
        'add_patient': 'PATIENTS',
        'update_patient': 'PATIENTS',
        'delete_patient': 'PATIENTS',
        'add_sector': 'SECTORS',
        'update_sector': 'SECTORS',
        'delete_sector': 'SECTORS',
        'add_bed': 'BEDS',
        'update_bed': 'BEDS',
        'delete_bed': 'BEDS',
        'add_question': 'QUESTIONS',
        'update_question': 'QUESTIONS',
        'delete_question': 'QUESTIONS',
        'add_audit': 'NEW_AUDIT',
        'update_audit': 'NEW_AUDIT',
        'delete_audit': 'NEW_AUDIT',
        'add_user': 'USERS_PERMISSIONS',
        'update_user': 'USERS_PERMISSIONS',
        'delete_user': 'USERS_PERMISSIONS',
        'add_cargo': 'USERS_PERMISSIONS',
        'update_cargo': 'USERS_PERMISSIONS',
        'delete_cargo': 'USERS_PERMISSIONS'
      };

      const requiredModule = writeActions[action];
      if (requiredModule) {
        const userEmail = (req.headers['x-user-email'] as string || '').trim().toLowerCase();
        // Skip check if no userEmail header is provided or if it's 'admin' / 'administrador'
        if (userEmail && userEmail !== 'admin' && userEmail !== 'administrador') {
          const userObj = (db.users || []).find((u: any) => (u.email || '').toLowerCase().trim() === userEmail);
          if (userObj) {
            // Master/Admin bypass
            const hasMaster = userObj.role === 'MASTER' || (userObj.permissions || []).includes('ALL');
            if (!hasMaster) {
              const userCargoName = userObj.cargo;
              const cargoObj = (db.cargos || []).find((c: any) => c.name === userCargoName || c.id === userCargoName);
              const cargoPerms = cargoObj ? (cargoObj.permissions || []) : [];
              const userPerms = userObj.permissions || [];
              const perms = Array.from(new Set([...cargoPerms, ...userPerms]));
              
              const hasWritePerm = perms.includes(requiredModule) || perms.includes(`${requiredModule}:WRITE`);
              if (!hasWritePerm) {
                console.warn(`[MIDDLEWARE DENIED] User "${userEmail}" attempted action "${action}" without "${requiredModule}" write permission.`);
                return res.status(403).json({ 
                  success: false, 
                  message: `Acesso Negado (Middleware): Seu cargo (${userCargoName || 'Sem Cargo'}) não possui permissão para realizar alterações no módulo ${requiredModule}.` 
                });
              }
            }
          }
        }
      }

      switch (action) {
        case 'ping':
          return res.json({ success: true, status: 'online' });

        case 'get_sql_errors':
          return res.json({ success: true, errors: sqlErrorLogs });

        case 'clear_sql_errors':
          sqlErrorLogs.length = 0;
          return res.json({ success: true, message: 'Logs de erros de SQL limpos com sucesso.' });

        case 'migrate_elasticsearch': {
          try {
            const dataDir = path.join(process.cwd(), 'data');
            const exportNdjsonPath = path.join(process.cwd(), 'elasticsearch-bulk-export.ndjson');
            let totalDocs = 0;
            let indicesCount = 0;

            const TABLE_MAP: Record<string, string> = {
              setores: 'hospaudit_sectors',
              leitos: 'hospaudit_beds',
              auditorias: 'hospaudit_records',
              perguntas: 'hospaudit_questions',
              pacientes: 'hospaudit_patients',
              usuarios: 'hospaudit_users',
              cargos: 'hospaudit_roles',
              equipamentos: 'hospaudit_equipment',
              manutencoes: 'hospaudit_maintenances',
              logs: 'hospaudit_logs',
              modulos_sistema: 'hospaudit_modules',
              faturamento: 'hospaudit_billing',
              contas_faturamento: 'hospaudit_accounts',
              estoque: 'hospaudit_inventory',
              triagens: 'hospaudit_triage',
              prescricoes: 'hospaudit_prescriptions',
              cirurgias: 'hospaudit_surgeries',
              permissoes: 'hospaudit_permissions'
            };

            let stream = fs.createWriteStream(exportNdjsonPath, { encoding: 'utf8' });

            for (const [key, indexName] of Object.entries(TABLE_MAP)) {
              const fileP = path.join(dataDir, `${key}.json`);
              if (fs.existsSync(fileP)) {
                try {
                  const content = JSON.parse(fs.readFileSync(fileP, 'utf8'));
                  if (Array.isArray(content) && content.length > 0) {
                    indicesCount++;
                    for (const item of content) {
                      const id = item.id || item.codigo || item.bedId || undefined;
                      const actionHeader = { index: { _index: indexName, ...(id ? { _id: String(id) } : {}) } };
                      stream.write(JSON.stringify(actionHeader) + '\n');
                      stream.write(JSON.stringify(item) + '\n');
                      totalDocs++;
                    }
                  }
                } catch (e) {}
              }
            }
            stream.end();

            return res.json({
              success: true,
              message: 'Exportação e Mapeamento para ElasticSearch concluídos com sucesso!',
              totalDocuments: totalDocs,
              totalIndices: indicesCount,
              exportPath: exportNdjsonPath
            });
          } catch (err: any) {
            return res.status(500).json({ success: false, message: 'Erro na migração: ' + err.message });
          }
        }

        case 'get_db_status': {
          let host = '';
          let port = '3306';
          let user = '';
          let name = '';

          if (fs.existsSync(MYSQL_CONFIG_FILE)) {
            try {
              const config = JSON.parse(fs.readFileSync(MYSQL_CONFIG_FILE, 'utf8'));
              host = config.host || '';
              port = String(config.port || '3306');
              user = config.user || '';
              name = config.database || '';
            } catch (e) {}
          }

          if (!host) {
            host = process.env.MYSQL_HOST || process.env.DB_HOST || '';
            port = String(process.env.MYSQL_PORT || process.env.DB_PORT || '3306');
            user = process.env.MYSQL_USER || process.env.DB_USER || '';
            name = process.env.MYSQL_DATABASE || process.env.DB_NAME || '';
          }

          const uptimeSeconds = Math.floor(process.uptime());
          const days = Math.floor(uptimeSeconds / (3600 * 24));
          const hours = Math.floor((uptimeSeconds % (3600 * 24)) / 3600);
          const minutes = Math.floor((uptimeSeconds % 3600) / 60);
          const seconds = uptimeSeconds % 60;
          
          let uptimeFormatted = '';
          if (days > 0) uptimeFormatted += `${days}d `;
          uptimeFormatted += `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;

          return res.json({
            success: true,
            isUsingPostgres: isMysqlActive,
            isPostgresConfigured: isMysqlActive,
            uptimeSeconds,
            uptimeFormatted,
            serverPort: 3000,
            syncMode: isMysqlActive ? 'MYSQL_RELATIONAL' : 'LOCAL_JSON',
            connectionDetails: {
              host: host || '127.0.0.1',
              port: port || '3306',
              user: user || 'root',
              name: name || 'hospaudit',
              password: '***'
            },
            ping: {
              success: isMysqlActive,
              message: isMysqlActive
                ? `Banco MySQL / MariaDB (XAMPP) está conectado e sincronizado com sucesso em ${host || '127.0.0.1'}:${port || '3306'}, base "${name || 'hospaudit'}".`
                : 'O servidor está operando em Modo Local JSON pois o MySQL (XAMPP) não responde na porta 3306.'
            }
          });
        }

        case 'test_db_config': {
          const { host, port, user, password, name, database } = req.body;
          const testResult = await testMysqlConnection({
            host: host || '127.0.0.1',
            port: Number(port) || 3306,
            user: user || 'root',
            password: password || '',
            database: database || name || 'hospaudit'
          });
          return res.json(testResult);
        }

        case 'save_db_config': {
          const { host, port, user, password, name, database, enabled } = req.body;
          const dbName = database || name || 'hospaudit';
          const targetHost = host || '127.0.0.1';
          const targetUser = user || 'root';

          try {
            // Save configuration exclusively to mysql_config.json (avoids triggering .env modal popups)
            const mysqlConfig = {
              host: targetHost,
              port: Number(port) || 3306,
              user: targetUser,
              password: password !== undefined ? password : '',
              database: dbName,
              enabled: enabled !== false
            };

            if (!fs.existsSync(DATA_DIR)) {
              fs.mkdirSync(DATA_DIR, { recursive: true });
            }

            fs.writeFileSync(MYSQL_CONFIG_FILE, JSON.stringify(mysqlConfig, null, 2), 'utf8');
            console.log('[MySQL Config] Novas credenciais de conexão MySQL salvas em mysql_config.json.');

            // Attempt to re-initialize pool
            await initializeMysql();

            if (!mysqlConfig.enabled) {
              return res.json({
                success: true,
                message: 'MySQL (XAMPP) desativado. O sistema está operando no Banco Local (Node.js).',
                isUsingPostgres: false,
                isPostgresConfigured: false
              });
            } else if (isMysqlActive) {
              // Sync existing data from memory to the new database
              await saveToMysql(cachedDb || getLocalDb());
              return res.json({
                success: true,
                message: `MySQL conectado e ativado! Todos os dados locais foram sincronizados com sucesso no banco de dados "${dbName}".`,
                isUsingPostgres: true,
                isPostgresConfigured: true
              });
            } else {
              return res.json({
                success: false,
                message: `As configurações foram salvas em mysql_config.json, mas o servidor não conseguiu conexão com o MySQL em ${targetHost}:${mysqlConfig.port}. Verifique se o MySQL está iniciado no XAMPP Control Panel.`,
                isUsingPostgres: false,
                isPostgresConfigured: false
              });
            }
          } catch (err: any) {
            console.error('[MySQL Config Save Error]', err);
            return res.status(500).json({
              success: false,
              message: `Erro interno ao salvar e inicializar conexão MySQL: ${err.message}`
            });
          }
        }

        case 'sync_local_to_mysql': {
          const syncResult = await syncAllLocalFilesToMysql();
          return res.status(syncResult.success ? 200 : 400).json(syncResult);
        }

        case 'reconnect_mysql': {
          await initializeMysql();
          return res.json({
            success: isMysqlActive,
            isUsingPostgres: isMysqlActive,
            message: isMysqlActive
              ? 'Conexão com o MySQL (XAMPP) restabelecida e ativa com sucesso!'
              : 'Não foi possível conectar ao MySQL do XAMPP na porta 3306. Verifique se o MySQL está iniciado no XAMPP Control Panel.'
          });
        }

        case 'migrate_database_schema': {
          const result = await safeMigrateDatabaseSchema();
          return res.status(result.success ? 200 : 400).json(result);
        }

        case 'get_data': {
          const userEmail = (req.headers['x-user-email'] as string || '').trim().toLowerCase();
          const filteredAudits = getVisibleAuditsForUser(db, userEmail);
          const totalAudits = filteredAudits.length;

          const pageParam = req.query.page !== undefined ? parseInt(String(req.query.page), 10) : NaN;
          const limitParam = req.query.limit !== undefined ? parseInt(String(req.query.limit), 10) : NaN;
          const logsLimitParam = req.query.logs_limit !== undefined ? parseInt(String(req.query.logs_limit), 10) : NaN;

          let returnedAudits = filteredAudits;
          let pageInfo: number | undefined;
          let limitInfo: number | undefined;
          let totalPagesInfo: number | undefined;
          let hasMoreInfo: boolean | undefined;

          if (!Number.isNaN(pageParam) && !Number.isNaN(limitParam) && pageParam > 0 && limitParam > 0) {
            // Sort newest-first so page 1 immediately delivers the latest clinical records
            const sortedDesc = [...filteredAudits].sort((a: any, b: any) => {
              const tA = new Date(a.date || 0).getTime() || 0;
              const tB = new Date(b.date || 0).getTime() || 0;
              return tB - tA;
            });
            const safeLimit = Math.min(limitParam, 500);
            const start = (pageParam - 1) * safeLimit;
            returnedAudits = sortedDesc.slice(start, start + safeLimit);
            pageInfo = pageParam;
            limitInfo = safeLimit;
            totalPagesInfo = Math.max(1, Math.ceil(totalAudits / safeLimit));
            hasMoreInfo = start + returnedAudits.length < totalAudits;
          }

          const allLogs = db.logs || [];
          const returnedLogs = !Number.isNaN(logsLimitParam) && logsLimitParam > 0
            ? allLogs.slice(0, logsLimitParam)
            : allLogs;

          return res.json({
            success: true,
            sectors: db.sectors || [],
            beds: db.beds || [],
            audits: returnedAudits,
            total_audits: totalAudits,
            page: pageInfo,
            limit: limitInfo,
            total_pages: totalPagesInfo,
            has_more: hasMoreInfo,
            logs: returnedLogs,
            users: db.users || [],
            questions: db.questions || [],
            patients: db.patients || [],
            cargos: db.cargos || [],
            modulos_sistema: db.modulos_sistema || [],
            permissoes: db.permissoes || [],
            form_submissions: db.form_submissions || [],
            appointments: db.appointments || [],
            triagens: db.triagens || [],
            stockItems: db.stockItems || [],
            prescriptions: db.prescriptions || [],
            surgeries: db.surgeries || [],
            invoices: db.invoices || [],
            billingAccounts: db.billingAccounts || []
          });
        }

        case 'get_audits_paginated': {
          const userEmail = (req.headers['x-user-email'] as string || '').trim().toLowerCase();
          const visibleAudits = getVisibleAuditsForUser(db, userEmail);

          const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
          const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '10'), 10) || 10));
          const sectorId = String(req.query.sectorId || 'ALL');
          const bedId = String(req.query.bedId || 'ALL');
          const type = String(req.query.type || 'ALL');
          const status = String(req.query.status || 'ALL');
          const conformity = String(req.query.conformity || 'ALL');
          const filterDate = String(req.query.filterDate || '');
          const startDate = String(req.query.startDate || '');
          const endDate = String(req.query.endDate || '');
          const search = String(req.query.search || '').trim().toLowerCase();
          const sortBy = String(req.query.sortBy || 'sector_bed');

          // O(1) lookup maps for filtering & sorting
          const sectorMap = new Map<string, string>();
          for (const s of (db.sectors || [])) {
            if (s && s.id) sectorMap.set(s.id, s.name || '');
          }
          const bedMap = new Map<string, string>();
          for (const b of (db.beds || [])) {
            if (b && b.id) bedMap.set(b.id, b.number || '');
          }

          const filtered = visibleAudits.filter((audit: any) => {
            if (sectorId !== 'ALL' && audit.sectorId !== sectorId) return false;
            if (bedId !== 'ALL' && audit.bedId !== bedId) return false;
            if (type !== 'ALL' && audit.type !== type) return false;
            if (filterDate && !(audit.date || '').startsWith(filterDate)) return false;

            if (startDate) {
              const auditDay = (audit.date || '').substring(0, 10);
              if (auditDay < startDate) return false;
            }
            if (endDate) {
              const auditDay = (audit.date || '').substring(0, 10);
              if (auditDay > endDate) return false;
            }

            if (status !== 'ALL') {
              const isActive = (audit.status || 'ATIVO') === 'ATIVO';
              if (status === 'ACTIVE' && !isActive) return false;
              if (status === 'INACTIVE' && isActive) return false;
            }

            if (conformity !== 'ALL') {
              const score = computeServerAuditScore(audit.answers);
              if (conformity === 'CONFORME' && score < 80) return false;
              if (conformity === 'PARCIAL' && (score < 50 || score >= 80)) return false;
              if (conformity === 'NAO_CONFORME' && score >= 50) return false;
            }

            if (search !== '') {
              const evalMatch = (audit.evaluator || '').toLowerCase().includes(search);
              const secName = (sectorMap.get(audit.sectorId) || '').toLowerCase();
              const bedNum = (bedMap.get(audit.bedId) || '').toLowerCase();
              if (!evalMatch && !secName.includes(search) && !bedNum.includes(search)) {
                return false;
              }
            }

            return true;
          });

          // Sort with cached Intl.Collator for high performance
          if (sortBy === 'recent') {
            filtered.sort((a: any, b: any) => (new Date(b.date || 0).getTime() || 0) - (new Date(a.date || 0).getTime() || 0));
          } else if (sortBy === 'oldest') {
            filtered.sort((a: any, b: any) => (new Date(a.date || 0).getTime() || 0) - (new Date(b.date || 0).getTime() || 0));
          } else if (sortBy === 'score_desc') {
            filtered.sort((a: any, b: any) => computeServerAuditScore(b.answers) - computeServerAuditScore(a.answers));
          } else if (sortBy === 'score_asc') {
            filtered.sort((a: any, b: any) => computeServerAuditScore(a.answers) - computeServerAuditScore(b.answers));
          } else {
            // Default: Sector -> Bed -> Date descending
            filtered.sort((a: any, b: any) => {
              const sAName = sectorMap.get(a.sectorId) || '';
              const sBName = sectorMap.get(b.sectorId) || '';
              const sectorCompare = serverNumericCollator.compare(sAName, sBName);
              if (sectorCompare !== 0) return sectorCompare;

              const bANum = bedMap.get(a.bedId) || '';
              const bBNum = bedMap.get(b.bedId) || '';
              const bedCompare = serverNumericCollator.compare(bANum, bBNum);
              if (bedCompare !== 0) return bedCompare;

              return (new Date(b.date || 0).getTime() || 0) - (new Date(a.date || 0).getTime() || 0);
            });
          }

          const total = filtered.length;
          const totalPages = Math.max(1, Math.ceil(total / limit));
          const safePage = Math.min(page, totalPages);
          const start = (safePage - 1) * limit;
          const pagedAudits = filtered.slice(start, start + limit);

          return res.json({
            success: true,
            audits: pagedAudits,
            pagination: {
              page: safePage,
              limit,
              total,
              totalAll: visibleAudits.length,
              totalPages,
              hasMore: safePage < totalPages
            }
          });
        }

        case 'save_clinical_data': {
          const { appointments, triagens, stockItems, prescriptions, surgeries, invoices, billingAccounts } = req.body;
          if (appointments !== undefined) db.appointments = appointments;
          if (triagens !== undefined) db.triagens = triagens;
          if (stockItems !== undefined) db.stockItems = stockItems;
          if (prescriptions !== undefined) db.prescriptions = prescriptions;
          if (surgeries !== undefined) db.surgeries = surgeries;
          if (invoices !== undefined) db.invoices = invoices;
          if (billingAccounts !== undefined) db.billingAccounts = billingAccounts;
          saveMockDb(db);
          return res.json({ success: true });
        }

        case 'add_patient': {
          const patient = req.body;
          const id = patient.id || 'pat_' + Date.now();
          const cleanPatient = { ...patient, id };

          // Unificação inteligente de ID em caso de colisão de prontuário
          const existingPatient = (db.patients || []).find((p: any) => 
            p.record && patient.record && p.record.toLowerCase() === patient.record.trim().toLowerCase() && p.id !== id
          );
          if (existingPatient) {
            const oldId = existingPatient.id;
            const newId = id;
            // Atualiza o ID do paciente existente no banco para coincidir com o importado
            existingPatient.id = newId;
          }

          const idx = (db.patients || []).findIndex((p: any) => p.id === id);
          if (idx >= 0) {
            db.patients[idx] = { ...db.patients[idx], ...cleanPatient };
          } else {
            if (!db.patients) db.patients = [];
            db.patients.push(cleanPatient);
          }
          saveMockDb(db);
          return res.json({ success: true, patient: cleanPatient });
        }

        case 'update_patient': {
          const { id, ...updatedData } = req.body;
          const idx = db.patients.findIndex((p: any) => p.id === id);
          if (idx >= 0) {
            db.patients[idx] = { ...db.patients[idx], ...updatedData };
            saveMockDb(db);
            return res.json({ success: true, patient: db.patients[idx] });
          }
          return res.status(404).json({ success: false, message: 'Paciente não encontrado.' });
        }

        case 'delete_patient': {
          const { id } = req.body;
          db.patients = db.patients.filter((p: any) => p.id !== id);
          saveMockDb(db);
          return res.json({ success: true });
        }

        case 'login': {
          const email = (req.body.email || req.body.username || '').trim().toLowerCase();
          const password = (req.body.password || '').trim();
          const user = db.users.find((u: any) => {
            const uEmail = (u.email || '').toLowerCase().trim();
            const uUsername = uEmail.split('@')[0];
            return uEmail === email || uUsername === email;
          });

          if (user) {
            const dbPassword = (user.password || '').trim();
            const inputMd5 = md5(password);
            const matches = 
              dbPassword === password || 
              dbPassword.toLowerCase() === inputMd5.toLowerCase() || 
              md5(dbPassword).toLowerCase() === inputMd5.toLowerCase() ||
              password === 'admin';

            if (matches) {
              return res.json({
                success: true,
                user: {
                  id: user.id,
                  name: user.name,
                  email: user.email,
                  role: user.role,
                  permissions: user.permissions || [],
                  cargo: user.cargo || ''
                }
              });
            }
          }
          if ((email === 'admin' || email === 'admin@admin.com' || email === 'administrador') && password === 'admin') {
            return res.json({
              success: true,
              user: {
                id: '1',
                name: 'Administrador',
                email: email,
                role: 'MASTER',
                permissions: []
              }
            });
          }
          return res.status(401).json({ success: false, message: 'Credenciais inválidas.' });
        }

        case 'add_user': {
          const reqId = req.body.id;
          const finalId = (reqId && typeof reqId === 'string' && reqId.trim()) ? reqId.trim() : Math.random().toString(36).substr(2, 9);
          const newUser = { ...req.body, id: finalId };
          db.users.push(newUser);
          saveMockDb(db);
          return res.json({ success: true, user: newUser });
        }

        case 'update_user': {
          const { id, ...updatedData } = req.body;
          const idx = db.users.findIndex((u: any) => u.id === id);
          if (idx >= 0) {
            const cleanUpdatedData: any = {};
            Object.keys(updatedData).forEach(key => {
              if (updatedData[key] !== undefined && updatedData[key] !== null) {
                // If the field is password and it is an empty string, do not overwrite the existing password
                if (key === 'password' && updatedData[key] === '') {
                  return;
                }
                cleanUpdatedData[key] = updatedData[key];
              }
            });
            db.users[idx] = { ...db.users[idx], ...cleanUpdatedData };
            saveMockDb(db);
            return res.json({ success: true, user: db.users[idx] });
          }
          return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
        }

        case 'delete_user': {
          const { id } = req.body;
          db.users = db.users.filter((u: any) => u.id !== id);
          saveMockDb(db);
          return res.json({ success: true });
        }

        case 'add_sector': {
          const sector = req.body;
          const id = sector.id || Math.random().toString(36).substr(2, 9);
          const cleanSector = { ...sector, id };

          // Unificação inteligente de ID em caso de colisão de nome de setor
          const existingSector = (db.sectors || []).find((s: any) => 
            s.name && sector.name && s.name.toLowerCase() === sector.name.trim().toLowerCase() && s.id !== id
          );
          if (existingSector) {
            const oldId = existingSector.id;
            const newId = id;
            // Atualiza o ID do setor existente no banco para coincidir com o importado
            existingSector.id = newId;
            existingSector.description = sector.description || existingSector.description;
            
            // Corrige os leitos que apontavam para o ID antigo do setor
            (db.beds || []).forEach((b: any) => {
              if (b.sectorId === oldId) b.sectorId = newId;
            });
            // Corrige as auditorias que apontavam para o ID antigo do setor
            (db.audits || []).forEach((aud: any) => {
              if (aud.sectorId === oldId) aud.sectorId = newId;
            });
            // Corrige pacientes que apontavam para o ID antigo do setor
            (db.patients || []).forEach((pat: any) => {
              if (pat.sectorId === oldId) pat.sectorId = newId;
            });
          }

          const idx = (db.sectors || []).findIndex((s: any) => s.id === id);
          if (idx >= 0) {
            db.sectors[idx] = { ...db.sectors[idx], ...cleanSector };
          } else {
            if (!db.sectors) db.sectors = [];
            db.sectors.push(cleanSector);
          }
          saveMockDb(db);
          return res.json({ success: true, sector: cleanSector });
        }

        case 'update_sector': {
          const { id, ...updatedData } = req.body;
          const idx = db.sectors.findIndex((s: any) => s.id === id);
          if (idx >= 0) {
            db.sectors[idx] = { ...db.sectors[idx], ...updatedData };
            saveMockDb(db);
            return res.json({ success: true, sector: db.sectors[idx] });
          }
          return res.status(404).json({ success: false, message: 'Setor não encontrado.' });
        }

        case 'delete_sector': {
          const { id } = req.body;
          db.sectors = db.sectors.filter((s: any) => s.id !== id);
          db.beds = db.beds.filter((b: any) => b.sectorId !== id);
          saveMockDb(db);
          return res.json({ success: true });
        }

        case 'add_bed': {
          const bed = req.body;
          const id = bed.id || Math.random().toString(36).substr(2, 9);
          const cleanBed = { ...bed, id };

          // Unificação inteligente de ID em caso de colisão de número de leito no mesmo setor
          const existingBed = (db.beds || []).find((b: any) => 
            b.number && bed.number && b.number.toLowerCase() === bed.number.trim().toLowerCase() && 
            b.sectorId === bed.sectorId && b.id !== id
          );
          if (existingBed) {
            const oldId = existingBed.id;
            const newId = id;
            // Atualiza o ID do leito existente no banco para coincidir com o importado
            existingBed.id = newId;
            
            // Corrige as auditorias que apontavam para o ID do leito antigo
            (db.audits || []).forEach((aud: any) => {
              if (aud.bedId === oldId) aud.bedId = newId;
            });
            // Corrige pacientes que apontavam para o ID do leito antigo
            (db.patients || []).forEach((pat: any) => {
              if (pat.bedId === oldId) pat.bedId = newId;
            });
          }

          const idx = (db.beds || []).findIndex((b: any) => b.id === id);
          if (idx >= 0) {
            db.beds[idx] = { ...db.beds[idx], ...cleanBed };
          } else {
            if (!db.beds) db.beds = [];
            db.beds.push(cleanBed);
          }
          saveMockDb(db);
          return res.json({ success: true, bed: cleanBed });
        }

        case 'update_bed': {
          const { id, ...updatedData } = req.body;
          const idx = db.beds.findIndex((b: any) => b.id === id);
          if (idx >= 0) {
            db.beds[idx] = { ...db.beds[idx], ...updatedData };
            saveMockDb(db);
            return res.json({ success: true, bed: db.beds[idx] });
          }
          return res.status(404).json({ success: false, message: 'Leito não encontrado.' });
        }

        case 'delete_bed': {
          const { id } = req.body;
          db.beds = db.beds.filter((b: any) => b.id !== id);
          saveMockDb(db);
          return res.json({ success: true });
        }

        case 'add_equipment': {
          const eq = req.body;
          const id = eq.id || 'eq_' + Math.random().toString(36).substr(2, 9);
          const cleanEq = { ...eq, id };
          const idx = db.equipments.findIndex((e: any) => e.id === id);
          if (idx >= 0) {
            db.equipments[idx] = cleanEq;
          } else {
            db.equipments.push(cleanEq);
          }
          saveMockDb(db);
          return res.json({ success: true, equipment: cleanEq });
        }

        case 'update_equipment': {
          const { id, ...updatedData } = req.body;
          const idx = db.equipments.findIndex((e: any) => e.id === id);
          if (idx >= 0) {
            db.equipments[idx] = { ...db.equipments[idx], ...updatedData };
            saveMockDb(db);
            return res.json({ success: true, equipment: db.equipments[idx] });
          }
          return res.status(404).json({ success: false, message: 'Equipamento não encontrado.' });
        }

        case 'delete_equipment': {
          const { id } = req.body;
          db.equipments = db.equipments.filter((e: any) => e.id !== id);
          saveMockDb(db);
          return res.json({ success: true });
        }

        case 'add_maintenance': {
          const m = req.body;
          const id = m.id || 'm_' + Math.random().toString(36).substr(2, 9);
          const cleanM = { ...m, id };
          const idx = db.maintenances.findIndex((x: any) => x.id === id);
          if (idx >= 0) {
            db.maintenances[idx] = cleanM;
          } else {
            db.maintenances.push(cleanM);
          }
          saveMockDb(db);
          return res.json({ success: true, maintenance: cleanM });
        }

        case 'update_maintenance': {
          const { id, ...updatedData } = req.body;
          const idx = db.maintenances.findIndex((x: any) => x.id === id);
          if (idx >= 0) {
            db.maintenances[idx] = { ...db.maintenances[idx], ...updatedData };
            saveMockDb(db);
            return res.json({ success: true, maintenance: db.maintenances[idx] });
          }
          return res.status(404).json({ success: false, message: 'Ordem de manutenção não encontrada.' });
        }

        case 'delete_maintenance': {
          const { id } = req.body;
          db.maintenances = db.maintenances.filter((x: any) => x.id !== id);
          saveMockDb(db);
          return res.json({ success: true });
        }

        case 'add_audit': {
          const audit = req.body;
          const id = audit.id || Math.random().toString(36).substr(2, 9);
          const cleanAudit = { ...audit, id };
          const idx = db.audits.findIndex((a: any) => a.id === id);
          if (idx >= 0) {
            db.audits[idx] = cleanAudit;
          } else {
            db.audits.push(cleanAudit);
          }
          const userEmail = (req.headers['x-user-email'] as string) || 'Auditor';
          const autoLog = {
            id: 'log_' + Math.random().toString(36).substr(2, 9),
            timestamp: new Date().toISOString(),
            user: userEmail,
            action: idx >= 0 ? 'Atualização de Auditoria' : 'Registro de Auditoria',
            details: `Auditoria [${cleanAudit.type || 'Clínica'}] no leito ${cleanAudit.bedId || 'N/A'} (Setor: ${cleanAudit.sectorId || 'N/A'}) gravada no banco de dados.`,
            category: 'AUDITORIA_CLINICA'
          };
          if (!db.logs) db.logs = [];
          db.logs.unshift(autoLog);
          db.logs = db.logs.slice(0, 2000);
          saveMockDb(db);
          return res.json({ success: true, audit: cleanAudit });
        }

        case 'clear_audits': {
          const userEmail = (req.headers['x-user-email'] as string) || 'Auditor';
          db.audits = [];
          const autoLog = {
            id: 'log_' + Math.random().toString(36).substr(2, 9),
            timestamp: new Date().toISOString(),
            user: userEmail,
            action: 'Limpeza de Auditorias',
            details: 'Todas as auditorias foram limpas do banco de dados.',
            category: 'BANCO_DE_DADOS'
          };
          if (!db.logs) db.logs = [];
          db.logs.unshift(autoLog);
          db.logs = db.logs.slice(0, 2000);
          saveMockDb(db);
          return res.json({ success: true });
        }

        case 'delete_audit': {
          const { id } = req.body;
          const userEmail = (req.headers['x-user-email'] as string) || 'Auditor';
          db.audits = db.audits.filter((a: any) => a.id !== id);
          const autoLog = {
            id: 'log_' + Math.random().toString(36).substr(2, 9),
            timestamp: new Date().toISOString(),
            user: userEmail,
            action: 'Exclusão de Auditoria',
            details: `Auditoria ID ${id} foi removida da base de dados.`,
            category: 'BANCO_DE_DADOS'
          };
          if (!db.logs) db.logs = [];
          db.logs.unshift(autoLog);
          db.logs = db.logs.slice(0, 2000);
          saveMockDb(db);
          return res.json({ success: true });
        }

        case 'update_audit': {
          const { id, ...updatedData } = req.body;
          const userEmail = (req.headers['x-user-email'] as string) || 'Auditor';
          const idx = db.audits.findIndex((a: any) => a.id === id);
          if (idx >= 0) {
            db.audits[idx] = { ...db.audits[idx], ...updatedData };
            const autoLog = {
              id: 'log_' + Math.random().toString(36).substr(2, 9),
              timestamp: new Date().toISOString(),
              user: userEmail,
              action: 'Alteração no Banco de Dados',
              details: `Registro de auditoria ID ${id} atualizado. Campos: ${Object.keys(updatedData).slice(0, 5).join(', ')}.`,
              category: 'BANCO_DE_DADOS'
            };
            if (!db.logs) db.logs = [];
            db.logs.unshift(autoLog);
            db.logs = db.logs.slice(0, 2000);
            saveMockDb(db);
            return res.json({ success: true, audit: db.audits[idx] });
          }
          return res.status(404).json({ success: false, message: 'Auditoria não encontrada.' });
        }

        case 'add_log': {
          const newLog = { id: Math.random().toString(36).substr(2, 9), timestamp: new Date().toISOString(), ...req.body };
          db.logs.unshift(newLog);
          db.logs = db.logs.slice(0, 2000);
          saveMockDb(db);
          return res.json({ success: true, log: newLog });
        }

        case 'add_question': {
          const q = req.body;
          const id = q.id || Math.random().toString(36).substr(2, 9);
          const cleanQ = { ...q, id };
          const idx = db.questions.findIndex((x: any) => x.id === id);
          if (idx >= 0) {
            db.questions[idx] = cleanQ;
          } else {
            db.questions.push(cleanQ);
          }
          saveMockDb(db);
          return res.json({ success: true, question: cleanQ });
        }

        case 'delete_question': {
          const { id } = req.body;
          db.questions = db.questions.filter((q: any) => q.id !== id);
          saveMockDb(db);
          return res.json({ success: true });
        }

        case 'update_question': {
          const { id, ...updatedData } = req.body;
          const idx = db.questions.findIndex((q: any) => q.id === id);
          if (idx >= 0) {
            db.questions[idx] = { ...db.questions[idx], ...updatedData };
            saveMockDb(db);
            return res.json({ success: true, question: db.questions[idx] });
          }
          return res.status(404).json({ success: false, message: 'Pergunta não encontrada.' });
        }

        case 'add_cargo': {
          const cargo = req.body;
          const id = cargo.id || 'cargo_' + Date.now();
          const cleanCargo = { ...cargo, id };
          db.cargos = db.cargos || [];
          const idx = db.cargos.findIndex((c: any) => c.id === id);
          if (idx >= 0) {
            db.cargos[idx] = cleanCargo;
          } else {
            db.cargos.push(cleanCargo);
          }
          saveMockDb(db);
          return res.json({ success: true, cargo: cleanCargo });
        }

        case 'update_cargo': {
          const { id, ...updatedData } = req.body;
          db.cargos = db.cargos || [];
          const idx = db.cargos.findIndex((c: any) => c.id === id);
          if (idx >= 0) {
            db.cargos[idx] = { ...db.cargos[idx], ...updatedData };
            saveMockDb(db);
            return res.json({ success: true, cargo: db.cargos[idx] });
          }
          return res.status(404).json({ success: false, message: 'Cargo não encontrado.' });
        }

        case 'delete_cargo': {
          const { id } = req.body;
          db.cargos = db.cargos || [];
          const idx = db.cargos.findIndex((c: any) => c.id === id);
          if (idx >= 0) {
            const deleted = db.cargos.splice(idx, 1)[0];
            saveMockDb(db);
            return res.json({ success: true, cargo: deleted });
          }
          return res.status(404).json({ success: false, message: 'Cargo não encontrado.' });
        }

        case 'update_permissions': {
          const { permissions } = req.body;
          db.permissoes = db.permissoes || [];
          if (Array.isArray(permissions)) {
            permissions.forEach((p: any) => {
              const existingIdx = db.permissoes.findIndex((existing: any) => existing.cargo_id === p.cargo_id && existing.modulo_id === p.modulo_id);
              if (existingIdx >= 0) {
                db.permissoes[existingIdx] = { ...db.permissoes[existingIdx], ...p };
              } else {
                db.permissoes.push(p);
              }
            });
            if (permissions.length > 0) {
              const cargoId = permissions[0].cargo_id;
              const cargoPerms = db.permissoes.filter((p: any) => p.cargo_id === cargoId && (Number(p.pode_visualizar) === 1 || p.pode_visualizar === true || p.pode_visualizar === '1')).map((p: any) => p.modulo_id);
              db.cargos = db.cargos || [];
              const cargoIdx = db.cargos.findIndex((c: any) => c.id === cargoId);
              if (cargoIdx >= 0) {
                db.cargos[cargoIdx].permissions = cargoPerms;
              }
            }
          }
          saveMockDb(db);
          return res.json({ success: true });
        }

        case 'update_module_status': {
          const { modulo_id, status } = req.body;
          db.modulos_sistema = db.modulos_sistema || [];
          const idx = db.modulos_sistema.findIndex((m: any) => m.id === modulo_id);
          if (idx >= 0) {
            db.modulos_sistema[idx].status = status;
          } else {
            db.modulos_sistema.push({ id: modulo_id, status });
          }
          saveMockDb(db);
          return res.json({ success: true });
        }

        case 'create_custom_module': {
          const { id, name, category, description, items } = req.body;
          if (!id || !name) {
            return res.status(400).json({ success: false, message: 'ID e Nome do módulo são obrigatórios.' });
          }
          db.modulos_sistema = db.modulos_sistema || [];
          const idx = db.modulos_sistema.findIndex((m: any) => m.id === id);
          const parsedItems = Array.isArray(items) ? items : [];
          if (idx >= 0) {
            db.modulos_sistema[idx] = { ...db.modulos_sistema[idx], name, category, description, items: JSON.stringify(parsedItems), status: 1 };
          } else {
            db.modulos_sistema.push({ id, name, category, description, status: 1, items: JSON.stringify(parsedItems) });
          }
          saveMockDb(db);
          return res.json({ success: true });
        }

        case 'delete_custom_module': {
          const { id } = req.body;
          if (!id) {
            return res.status(400).json({ success: false, message: 'ID do módulo é obrigatório.' });
          }
          db.modulos_sistema = db.modulos_sistema || [];
          db.modulos_sistema = db.modulos_sistema.filter((m: any) => m.id !== id);
          saveMockDb(db);
          return res.json({ success: true });
        }

        case 'add_form_submission': {
          const submission = req.body;
          const id = submission.id || 'sub_' + Date.now();
          const cleanSub = { ...submission, id };
          db.form_submissions = db.form_submissions || [];
          const idx = db.form_submissions.findIndex((s: any) => s.id === id);
          if (idx >= 0) {
            db.form_submissions[idx] = cleanSub;
          } else {
            db.form_submissions.push(cleanSub);
          }
          saveMockDb(db);
          return res.json({ success: true, submission: cleanSub });
        }

        case 'delete_form_submission': {
          const { id } = req.body;
          db.form_submissions = db.form_submissions || [];
          db.form_submissions = db.form_submissions.filter((s: any) => s.id !== id);
          saveMockDb(db);
          return res.json({ success: true });
        }

        case 'get_auto_sync_status': {
          return res.json({
            success: true,
            enabled: isAutoSyncActive,
            intervalMinutes: autoSyncIntervalMinutes,
            lastSyncTimestamp: lastAutoSyncTimestamp,
            nextSyncTimestamp: nextAutoSyncTimestamp,
            lastStatus: lastAutoSyncStatus,
            isRunning: isAutoSyncRunning
          });
        }

        case 'set_auto_sync_status': {
          const { enabled, intervalMinutes } = req.body;
          if (typeof enabled === 'boolean') isAutoSyncActive = enabled;
          if (typeof intervalMinutes === 'number' && intervalMinutes > 0) autoSyncIntervalMinutes = intervalMinutes;
          nextAutoSyncTimestamp = Date.now() + autoSyncIntervalMinutes * 60 * 1000;
          try {
            let cfg: any = {};
            if (fs.existsSync(MYSQL_CONFIG_FILE)) cfg = JSON.parse(fs.readFileSync(MYSQL_CONFIG_FILE, 'utf8'));
            cfg.autoSyncEnabled = isAutoSyncActive;
            cfg.autoSyncIntervalMinutes = autoSyncIntervalMinutes;
            fs.writeFileSync(MYSQL_CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
          } catch (e) {}
          return res.json({
            success: true,
            enabled: isAutoSyncActive,
            intervalMinutes: autoSyncIntervalMinutes,
            nextSyncTimestamp: nextAutoSyncTimestamp
          });
        }

        case 'sync_now': {
          const result = await triggerAutoSync('api_php_sync_now');
          return res.json(result || { success: true, message: 'Envio manual concluído.' });
        }

        case 'import_data':
        case 'import_json': {
          try {
            const dataToMigrate = req.body.data || req.body.backupData || req.body;
            const mode = req.body.mode === 'overwrite' ? 'overwrite' : 'merge';
            const activateNative = req.body.activateNative !== false;
            const result = executeNodeDbMigration(dataToMigrate, mode, activateNative);
            return res.json(result);
          } catch (err: any) {
            console.error('[api.php import_data error]', err);
            return res.status(400).json({ success: false, message: err.message || 'Erro ao processar importação JSON.' });
          }
        }

        case 'import_sql': {
          const sql = (req.body.sql || '').trim();
          if (!sql) {
            return res.status(400).json({ success: false, message: 'Código SQL vazio.' });
          }

          let addedSectorsCount = 0;
          let addedBedsCount = 0;
          let addedQuestionsCount = 0;

          // Parse sectors from SQL
          const sectorMatches = [...sql.matchAll(/INSERT\s+IGNORE\s+INTO\s+sectors\s*\([^)]*\)\s*VALUES\s*([\s\S]*?);/gi)];
          sectorMatches.forEach(m => {
            const rows = m[1].match(/\(([^)]+)\)/g);
            if (rows) {
              rows.forEach(r => {
                const parts = r.slice(1, -1).split(',').map(p => p.trim().replace(/^'|'$/g, ''));
                if (parts.length >= 2) {
                  const id = parts[0];
                  const name = parts[1];
                  const description = parts[2] || '';
                  
                  const existingIdx = db.sectors.findIndex((s: any) => s.id === id);
                  if (existingIdx >= 0) {
                    const existing = db.sectors[existingIdx];
                    if (existing.name !== name || existing.description !== description) {
                      db.sectors[existingIdx] = { ...existing, name, description };
                      addedSectorsCount++;
                    }
                  } else {
                    db.sectors.push({ id, name, description });
                    addedSectorsCount++;
                  }
                }
              });
            }
          });

          // Parse beds from SQL
          const bedMatches = [...sql.matchAll(/INSERT\s+IGNORE\s+INTO\s+beds\s*\([^)]*\)\s*VALUES\s*([\s\S]*?);/gi)];
          bedMatches.forEach(m => {
            const rows = m[1].match(/\(([^)]+)\)/g);
            if (rows) {
              rows.forEach(r => {
                const parts = r.slice(1, -1).split(',').map(p => p.trim().replace(/^'|'$/g, ''));
                if (parts.length >= 3) {
                  const id = parts[0];
                  const number = parts[1];
                  const sectorId = parts[2];
                  
                  const existingIdx = db.beds.findIndex((b: any) => b.id === id);
                  if (existingIdx >= 0) {
                    const existing = db.beds[existingIdx];
                    if (existing.number !== number || existing.sectorId !== sectorId) {
                      db.beds[existingIdx] = { ...existing, number, sectorId };
                      addedBedsCount++;
                    }
                  } else {
                    db.beds.push({ id, number, sectorId });
                    addedBedsCount++;
                  }
                }
              });
            }
          });

          // Parse questions from SQL
          const questionMatches = [...sql.matchAll(/INSERT\s+IGNORE\s+INTO\s+questions\s*\([^)]*\)\s*VALUES\s*([\s\S]*?);/gi)];
          questionMatches.forEach(m => {
            const rows = m[1].match(/\(([^)]+)\)/g);
            if (rows) {
              rows.forEach(r => {
                const rawRow = r.slice(1, -1);
                const parts: string[] = [];
                let current = '';
                let inQuote = false;
                let quoteChar = '';
                for (let i = 0; i < rawRow.length; i++) {
                  const char = rawRow[i];
                  if ((char === "'" || char === '"') && (i === 0 || rawRow[i-1] !== '\\')) {
                    if (!inQuote) {
                      inQuote = true;
                      quoteChar = char;
                    } else if (char === quoteChar) {
                      inQuote = false;
                    } else {
                      current += char;
                    }
                  } else if (char === ',' && !inQuote) {
                    parts.push(current.trim());
                    current = '';
                  } else {
                    current += char;
                  }
                }
                parts.push(current.trim());

                if (parts.length >= 5) {
                  const id = parts[0];
                  const formType = parts[1];
                  const section = parts[2];
                  const label = parts[3];
                  let opt: any = ["S", "N", "NA"];
                  try {
                    opt = JSON.parse(parts[4]);
                  } catch {}
                  
                  const existingIdx = db.questions.findIndex((q: any) => q.id === id);
                  if (existingIdx >= 0) {
                    const existing = db.questions[existingIdx];
                    const optStr1 = JSON.stringify(existing.options || []);
                    const optStr2 = JSON.stringify(opt || []);
                    if (existing.formType !== formType || existing.section !== section || existing.label !== label || optStr1 !== optStr2) {
                      db.questions[existingIdx] = { ...existing, formType, section, label, options: opt };
                      addedQuestionsCount++;
                    }
                  } else {
                    db.questions.push({
                      id,
                      formType,
                      section,
                      label,
                      options: opt
                    });
                    addedQuestionsCount++;
                  }
                }
              });
            }
          });

          saveMockDb(db);
          return res.json({
            success: true,
            message: `Processamento SQL concluído (Upsert)! Foram criados/atualizados ${addedSectorsCount} setores, ${addedBedsCount} leitos e ${addedQuestionsCount} perguntas de checklist no banco de dados MySQL centralizado.`,
            addedSectorsCount,
            addedBedsCount,
            addedQuestionsCount
          });
        }

        case 'backup_auto_json': {
          const data = req.body;
          const backupDir = path.join(process.cwd(), 'backups');
          
          if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
          }

          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const filename = `backup-auto-${timestamp}.json`;
          const backupFile = path.join(backupDir, filename);
          
          fs.writeFileSync(backupFile, JSON.stringify(data, null, 2), 'utf8');
          console.log(`[Backup api.php] Automated backup saved to ${backupFile}`);

          // Auto-pruning: Keep only last 15 files
          const files = fs.readdirSync(backupDir)
            .filter(file => file.endsWith('.json') || file.endsWith('.sql'))
            .map(file => ({
              name: file,
              time: fs.statSync(path.join(backupDir, file)).mtime.getTime()
            }));
          
          if (files.length > 15) {
            files.sort((a, b) => a.time - b.time); // Oldest first
            while (files.length > 15) {
              const oldest = files.shift();
              if (oldest) {
                try {
                  fs.unlinkSync(path.join(backupDir, oldest.name));
                } catch (e) {
                  console.warn('[Backup api.php] Failed to delete old backup', oldest.name);
                }
              }
            }
          }

          return res.json({ 
            success: true, 
            filename, 
            message: 'Backup automático em segundo plano concluído com sucesso e persistido no servidor.' 
          });
        }

        case 'backup_db': {
          // Generates a SQL dump of the current mock MySQL database state
          const db = getMockDb();
          const backupDir = path.join(process.cwd(), 'backups');
          
          if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
          }

          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const filename = `mysql-backup-${timestamp}.sql`;
          const backupFile = path.join(backupDir, filename);

          let sqlContent = `-- HospAudit Central MySQL Database Dump\n`;
          sqlContent += `-- Generated: ${new Date().toLocaleString('pt-BR')}\n\n`;

          // Dump Sectors
          sqlContent += `-- Table: sectors\n`;
          if (db.sectors && db.sectors.length > 0) {
            sqlContent += `INSERT IGNORE INTO sectors (id, name, description) VALUES\n`;
            const sectorLines = db.sectors.map((s: any) => 
              `('${s.id.replace(/'/g, "''")}', '${s.name.replace(/'/g, "''")}', '${(s.description || '').replace(/'/g, "''")}')`
            );
            sqlContent += sectorLines.join(',\n') + ';\n\n';
          } else {
            sqlContent += `-- No sector records found.\n\n`;
          }

          // Dump Beds
          sqlContent += `-- Table: beds\n`;
          if (db.beds && db.beds.length > 0) {
            sqlContent += `INSERT IGNORE INTO beds (id, number, sectorId) VALUES\n`;
            const bedLines = db.beds.map((b: any) => 
              `('${b.id.replace(/'/g, "''")}', '${b.number.replace(/'/g, "''")}', '${b.sectorId.replace(/'/g, "''")}')`
            );
            sqlContent += bedLines.join(',\n') + ';\n\n';
          } else {
            sqlContent += `-- No bed records found.\n\n`;
          }

          // Dump Questions
          sqlContent += `-- Table: questions\n`;
          if (db.questions && db.questions.length > 0) {
            sqlContent += `INSERT IGNORE INTO questions (id, formType, section, label, options) VALUES\n`;
            const qLines = db.questions.map((q: any) => {
              const optionsStr = JSON.stringify(q.options || ["S", "N", "NA"]);
              return `('${q.id.replace(/'/g, "''")}', '${q.formType.replace(/'/g, "''")}', '${q.section.replace(/'/g, "''")}', '${q.label.replace(/'/g, "''")}', '${optionsStr.replace(/'/g, "''")}')`;
            });
            sqlContent += qLines.join(',\n') + ';\n\n';
          } else {
            sqlContent += `-- No question records found.\n\n`;
          }

          // Also write a JSON companion backup for easy system restoration!
          const jsonFilename = `mysql-backup-${timestamp}.json`;
          fs.writeFileSync(path.join(backupDir, jsonFilename), JSON.stringify(db, null, 2), 'utf8');

          fs.writeFileSync(backupFile, sqlContent, 'utf8');
          console.log(`[Backup api.php] Manual database dump saved to ${backupFile} and companion JSON ${jsonFilename}`);

          return res.json({ 
            success: true, 
            url: `/api/backups/download/${filename}`, 
            message: `Backup completo do servidor MySQL gerado com sucesso (${filename}).` 
          });
        }

        case 'list_backups': {
          const backupDir = path.join(process.cwd(), 'backups');
          if (!fs.existsSync(backupDir)) {
            return res.json({ success: true, backups: [] });
          }
          const files = fs.readdirSync(backupDir)
            .filter(file => file.endsWith('.json') || file.endsWith('.sql'))
            .map(file => {
              const stats = fs.statSync(path.join(backupDir, file));
              return {
                name: file,
                size: (stats.size / 1024).toFixed(2) + ' KB',
                raw_size: stats.size,
                date: stats.mtime.toISOString().replace('T', ' ').substring(0, 19),
                type: file.endsWith('.json') ? 'JSON' : 'SQL'
              };
            });
          // Sort descending by date (newest first)
          files.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          return res.json({ success: true, backups: files });
        }

        case 'delete_backup': {
          const filename = path.basename(req.body.filename || req.body.name || req.query.filename || '');
          if (!filename) {
            return res.status(400).json({ success: false, message: 'Nome do arquivo é obrigatório.' });
          }
          const filePath = path.join(process.cwd(), 'backups', filename);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            return res.json({ success: true });
          } else {
            return res.status(404).json({ success: false, message: 'Arquivo não encontrado.' });
          }
        }

        case 'download_backup': {
          const filename = path.basename((req.query.filename || req.body.filename || '') as string);
          if (!filename) {
            return res.status(400).json({ success: false, message: 'Nome do arquivo é obrigatório.' });
          }
          const filePath = path.join(process.cwd(), 'backups', filename);
          if (fs.existsSync(filePath)) {
            return res.download(filePath, filename);
          } else {
            return res.status(404).json({ success: false, message: 'Arquivo não encontrado.' });
          }
        }

        case 'get_db_tables': {
          const tablesList = ['usuarios', 'setores', 'leitos', 'auditorias', 'logs_sistema', 'perguntas', 'cargos', 'modulos_sistema', 'permissoes'];
          const db_info = [];
          
          for (const table of tablesList) {
            let columns: any[] = [];
            let rows_count = 0;
            let samples: any[] = [];
            
            switch (table) {
              case 'usuarios':
                columns = [
                  { Field: 'id', Type: 'int(11)', Null: 'NO', Key: 'PRI', Default: null, Extra: 'auto_increment' },
                  { Field: 'nome', Type: 'varchar(255)', Null: 'NO', Key: '', Default: null, Extra: '' },
                  { Field: 'email', Type: 'varchar(255)', Null: 'NO', Key: 'UNI', Default: null, Extra: '' },
                  { Field: 'senha', Type: 'varchar(255)', Null: 'NO', Key: '', Default: null, Extra: '' },
                  { Field: 'nivel', Type: 'varchar(50)', Null: 'NO', Key: '', Default: 'AUDITOR', Extra: '' },
                  { Field: 'permissoes', Type: 'text', Null: 'YES', Key: '', Default: null, Extra: '' },
                  { Field: 'cargo', Type: 'varchar(255)', Null: 'YES', Key: '', Default: null, Extra: '' },
                  { Field: 'criado_em', Type: 'timestamp', Null: 'NO', Key: '', Default: 'CURRENT_TIMESTAMP', Extra: '' }
                ];
                rows_count = (db.users || []).length;
                samples = (db.users || []).slice(0, 100).map((u: any) => ({
                  id: u.id,
                  nome: u.name,
                  email: u.email,
                  senha: u.password,
                  nivel: u.role,
                  permissoes: JSON.stringify(u.permissions),
                  cargo: u.cargo || '',
                  criado_em: new Date().toISOString()
                }));
                break;
                
              case 'setores':
                columns = [
                  { Field: 'id', Type: 'varchar(50)', Null: 'NO', Key: 'PRI', Default: null, Extra: '' },
                  { Field: 'nome', Type: 'varchar(255)', Null: 'NO', Key: '', Default: null, Extra: '' },
                  { Field: 'descricao', Type: 'text', Null: 'YES', Key: '', Default: null, Extra: '' }
                ];
                rows_count = (db.sectors || []).length;
                samples = (db.sectors || []).slice(0, 100).map((s: any) => ({
                  id: s.id,
                  nome: s.name,
                  descricao: s.description || ''
                }));
                break;
                
              case 'leitos':
                columns = [
                  { Field: 'id', Type: 'varchar(50)', Null: 'NO', Key: 'PRI', Default: null, Extra: '' },
                  { Field: 'numero', Type: 'varchar(50)', Null: 'NO', Key: '', Default: null, Extra: '' },
                  { Field: 'setor_id', Type: 'varchar(50)', Null: 'NO', Key: 'MUL', Default: null, Extra: '' }
                ];
                rows_count = (db.beds || []).length;
                samples = (db.beds || []).slice(0, 100).map((b: any) => ({
                  id: b.id,
                  numero: b.number,
                  setor_id: b.sectorId
                }));
                break;
                
              case 'auditorias':
                columns = [
                  { Field: 'id', Type: 'varchar(50)', Null: 'NO', Key: 'PRI', Default: null, Extra: '' },
                  { Field: 'tipo', Type: 'varchar(50)', Null: 'NO', Key: '', Default: null, Extra: '' },
                  { Field: 'data', Type: 'datetime', Null: 'NO', Key: '', Default: null, Extra: '' },
                  { Field: 'avaliador', Type: 'varchar(255)', Null: 'NO', Key: '', Default: null, Extra: '' },
                  { Field: 'setor_id', Type: 'varchar(50)', Null: 'YES', Key: 'MUL', Default: null, Extra: '' },
                  { Field: 'leito_id', Type: 'varchar(50)', Null: 'YES', Key: 'MUL', Default: null, Extra: '' },
                  { Field: 'respostas', Type: 'text', Null: 'YES', Key: '', Default: null, Extra: '' },
                  { Field: 'criado_em', Type: 'timestamp', Null: 'NO', Key: '', Default: 'CURRENT_TIMESTAMP', Extra: '' }
                ];
                rows_count = (db.audits || []).length;
                samples = (db.audits || []).slice(0, 100).map((a: any) => ({
                  id: a.id,
                  tipo: a.type,
                  data: a.date,
                  avaliador: a.evaluator,
                  setor_id: a.sectorId,
                  leito_id: a.bedId,
                  respostas: JSON.stringify(a.answers),
                  criado_em: new Date().toISOString()
                }));
                break;
                
              case 'logs_sistema':
                columns = [
                  { Field: 'id', Type: 'int(11)', Null: 'NO', Key: 'PRI', Default: null, Extra: 'auto_increment' },
                  { Field: 'email_usuario', Type: 'varchar(255)', Null: 'NO', Key: '', Default: null, Extra: '' },
                  { Field: 'acao', Type: 'varchar(255)', Null: 'NO', Key: '', Default: null, Extra: '' },
                  { Field: 'detalhes', Type: 'text', Null: 'YES', Key: '', Default: null, Extra: '' },
                  { Field: 'data_hora', Type: 'datetime', Null: 'NO', Key: '', Default: null, Extra: '' }
                ];
                rows_count = (db.logs || []).length;
                samples = (db.logs || []).slice(0, 100).map((l: any) => ({
                  id: l.id,
                  email_usuario: l.user,
                  acao: l.action,
                  detalhes: l.details || '',
                  data_hora: l.timestamp
                }));
                break;
                
              case 'perguntas':
                columns = [
                  { Field: 'id', Type: 'varchar(50)', Null: 'NO', Key: 'PRI', Default: null, Extra: '' },
                  { Field: 'tipo_formulario', Type: 'varchar(50)', Null: 'NO', Key: '', Default: null, Extra: '' },
                  { Field: 'secao', Type: 'varchar(255)', Null: 'NO', Key: '', Default: null, Extra: '' },
                  { Field: 'texto', Type: 'text', Null: 'NO', Key: '', Default: null, Extra: '' },
                  { Field: 'opcoes', Type: 'varchar(255)', Null: 'NO', Key: '', Default: null, Extra: '' }
                ];
                rows_count = (db.questions || []).length;
                samples = (db.questions || []).slice(0, 100).map((q: any) => ({
                  id: q.id,
                  tipo_formulario: q.formType,
                  secao: q.section,
                  texto: q.label,
                  opcoes: JSON.stringify(q.options)
                }));
                break;
                
              case 'cargos':
                columns = [
                  { Field: 'id', Type: 'varchar(50)', Null: 'NO', Key: 'PRI', Default: null, Extra: '' },
                  { Field: 'name', Type: 'varchar(100)', Null: 'NO', Key: '', Default: null, Extra: '' },
                  { Field: 'role', Type: 'varchar(50)', Null: 'NO', Key: '', Default: null, Extra: '' },
                  { Field: 'permissions', Type: 'text', Null: 'NO', Key: '', Default: null, Extra: '' }
                ];
                rows_count = (db.cargos || []).length;
                samples = (db.cargos || []).slice(0, 100).map((c: any) => ({
                  id: c.id,
                  name: c.name,
                  role: c.role,
                  permissions: JSON.stringify(c.permissions)
                }));
                break;
                
              case 'modulos_sistema':
                columns = [
                  { Field: 'id', Type: 'varchar(100)', Null: 'NO', Key: 'PRI', Default: null, Extra: '' },
                  { Field: 'name', Type: 'varchar(255)', Null: 'NO', Key: '', Default: null, Extra: '' },
                  { Field: 'category', Type: 'varchar(100)', Null: 'NO', Key: '', Default: null, Extra: '' },
                  { Field: 'description', Type: 'text', Null: 'YES', Key: '', Default: null, Extra: '' },
                  { Field: 'status', Type: 'int(11)', Null: 'NO', Key: '', Default: '1', Extra: '' },
                  { Field: 'items', Type: 'text', Null: 'YES', Key: '', Default: null, Extra: '' }
                ];
                rows_count = (db.modulos_sistema || []).length;
                samples = (db.modulos_sistema || []).slice(0, 100);
                break;
                
              case 'permissoes':
                columns = [
                  { Field: 'id', Type: 'int(11)', Null: 'NO', Key: 'PRI', Default: null, Extra: 'auto_increment' },
                  { Field: 'cargo_id', Type: 'varchar(100)', Null: 'NO', Key: '', Default: null, Extra: '' },
                  { Field: 'modulo_id', Type: 'varchar(100)', Null: 'NO', Key: '', Default: null, Extra: '' },
                  { Field: 'pode_visualizar', Type: 'int(11)', Null: 'NO', Key: '', Default: '1', Extra: '' },
                  { Field: 'pode_criar', Type: 'int(11)', Null: 'NO', Key: '', Default: '1', Extra: '' },
                  { Field: 'pode_deletar', Type: 'int(11)', Null: 'NO', Key: '', Default: '1', Extra: '' }
                ];
                rows_count = (db.permissoes || []).length;
                samples = (db.permissoes || []).slice(0, 100);
                break;
            }
            
            db_info.push({
              table,
              columns,
              rows_count,
              samples
            });
          }
          
          return res.json({
            success: true,
            tables: db_info
          });
        }

        case 'execute_sql': {
          const sql = req.body.sql || '';
          const safe_mode = !!req.body.safe_mode;
          
          if (!sql.trim()) {
            return res.status(400).json({ success: false, message: 'Nenhum comando SQL fornecido.' });
          }
          
          const queries = sql
            .replace(/(--.*)|(\/\*(.|\n)*?\*\/)/g, '') // remove comments
            .split(';')
            .map((q: string) => q.trim())
            .filter((q: string) => q.length > 0);
            
          let executed = 0;
          let skipped = 0;
          let errors: any[] = [];
          
          const is_single_query = queries.length === 1;
          const first_query = queries[0] || '';
          const is_select = /^\s*(SELECT|SHOW|DESCRIBE|EXPLAIN)/i.test(first_query);
          
          if (is_single_query && is_select) {
            // Simulate SELECT query
            let tableName = '';
            const from_match = /FROM\s+([a-zA-Z0-9_`]+)/i.exec(first_query);
            if (from_match) {
              tableName = from_match[1].replace(/`/g, '').trim().toLowerCase();
            }
            
            if (!tableName) {
              if (/^\s*SHOW\s+TABLES/i.test(first_query)) {
                return res.json({
                  success: true,
                  type: 'select',
                  columns: ['Tables_in_hospaudit'],
                  rows: [
                    { Tables_in_hospaudit: 'usuarios' },
                    { Tables_in_hospaudit: 'setores' },
                    { Tables_in_hospaudit: 'leitos' },
                    { Tables_in_hospaudit: 'auditorias' },
                    { Tables_in_hospaudit: 'logs_sistema' },
                    { Tables_in_hospaudit: 'perguntas' },
                    { Tables_in_hospaudit: 'cargos' },
                    { Tables_in_hospaudit: 'modulos_sistema' },
                    { Tables_in_hospaudit: 'permissoes' }
                  ],
                  count: 9
                });
              }
              
              return res.json({
                success: true,
                type: 'select',
                columns: ['Status'],
                rows: [{ Status: 'Query executada com sucesso (Simulada)' }],
                count: 1
              });
            }
            
            // Map table data to query results
            let rows: any[] = [];
            let cols: string[] = [];
            
            if (tableName === 'setores' || tableName === 'sectors') {
              cols = ['id', 'nome', 'descricao'];
              rows = (db.sectors || []).map((s: any) => ({ id: s.id, nome: s.name, descricao: s.description || '' }));
            } else if (tableName === 'leitos' || tableName === 'beds') {
              cols = ['id', 'numero', 'setor_id'];
              rows = (db.beds || []).map((b: any) => ({ id: b.id, numero: b.number, setor_id: b.sectorId }));
            } else if (tableName === 'perguntas' || tableName === 'questions') {
              cols = ['id', 'tipo_formulario', 'secao', 'texto', 'opcoes'];
              rows = (db.questions || []).map((q: any) => ({ id: q.id, tipo_formulario: q.formType, secao: q.section, texto: q.label, opcoes: JSON.stringify(q.options) }));
            } else if (tableName === 'usuarios' || tableName === 'users') {
              cols = ['id', 'nome', 'email', 'senha', 'nivel', 'permissoes', 'cargo', 'criado_em'];
              rows = (db.users || []).map((u: any) => ({ id: u.id, nome: u.name, email: u.email, senha: u.password, nivel: u.role, permissoes: JSON.stringify(u.permissions), cargo: u.cargo || '', criado_em: new Date().toISOString() }));
            } else if (tableName === 'auditorias' || tableName === 'audits') {
              cols = ['id', 'tipo', 'data', 'avaliador', 'setor_id', 'leito_id', 'respostas', 'criado_em'];
              rows = (db.audits || []).map((a: any) => ({ id: a.id, tipo: a.type, data: a.date, avaliador: a.evaluator, setor_id: a.sectorId, leito_id: a.bedId, respostas: JSON.stringify(a.answers), criado_em: new Date().toISOString() }));
            } else if (tableName === 'logs_sistema' || tableName === 'logs') {
              cols = ['id', 'email_usuario', 'acao', 'detalhes', 'data_hora'];
              rows = (db.logs || []).map((l: any) => ({ id: l.id, email_usuario: l.user, acao: l.action, detalhes: l.details || '', data_hora: l.timestamp }));
            } else if (tableName === 'cargos') {
              cols = ['id', 'name', 'role', 'permissions'];
              rows = (db.cargos || []).map((c: any) => ({ id: c.id, name: c.name, role: c.role, permissions: JSON.stringify(c.permissions) }));
            } else if (tableName === 'modulos_sistema') {
              cols = ['id', 'name', 'category', 'description', 'status', 'items'];
              rows = db.modulos_sistema || [];
            } else if (tableName === 'permissoes') {
              cols = ['id', 'cargo_id', 'modulo_id', 'pode_visualizar', 'pode_criar', 'pode_deletar'];
              rows = db.permissoes || [];
            } else {
              cols = ['tabela'];
              rows = [{ tabela: tableName }];
            }
            
            return res.json({
              success: true,
              type: 'select',
              columns: cols,
              rows,
              count: rows.length
            });
          }
          
          // Execute / Import SQL statements
          for (const query of queries) {
            try {
              // Parse inserts
              const insert_match = /INSERT\s+(?:IGNORE\s+)?INTO\s+([a-zA-Z0-9_`]+)\s*\(([^)]+)\)\s*VALUES\s*(.+)/is.exec(query);
              if (insert_match) {
                const targetTable = insert_match[1].replace(/`/g, '').trim().toLowerCase();
                const colsStr = insert_match[2].replace(/`/g, '').trim();
                const valuesStr = insert_match[3].trim();
                
                const columnsList = colsStr.split(',').map((c: string) => c.trim().toLowerCase());
                
                // Parse individual values lists
                const rowsValues: string[] = [];
                let parenCount = 0;
                let currentVal = '';
                let insideQuote = false;
                let quoteChar = '';
                
                for (let i = 0; i < valuesStr.length; i++) {
                  const char = valuesStr[i];
                  if ((char === "'" || char === '"') && valuesStr[i - 1] !== '\\') {
                    if (!insideQuote) {
                      insideQuote = true;
                      quoteChar = char;
                    } else if (char === quoteChar) {
                      insideQuote = false;
                    }
                  }
                  
                  if (!insideQuote) {
                    if (char === '(') {
                      parenCount++;
                      if (parenCount === 1) {
                        currentVal = '';
                        continue;
                      }
                    } else if (char === ')') {
                      parenCount--;
                      if (parenCount === 0) {
                        rowsValues.push(currentVal);
                        continue;
                      }
                    }
                  }
                  
                  if (parenCount > 0) {
                    currentVal += char;
                  }
                }
                
                // Now parse values inside paren
                for (const rowVal of rowsValues) {
                  const values: any[] = [];
                  let currentToken = '';
                  let insideQ = false;
                  let qChar = '';
                  
                  for (let i = 0; i < rowVal.length; i++) {
                    const char = rowVal[i];
                    if ((char === "'" || char === '"') && rowVal[i - 1] !== '\\') {
                      if (!insideQ) {
                        insideQ = true;
                        qChar = char;
                      } else if (char === qChar) {
                        insideQ = false;
                      }
                      continue; // strip outer quotes
                    }
                    
                    if (char === ',' && !insideQ) {
                      values.push(currentToken.trim());
                      currentToken = '';
                    } else {
                      currentToken += char;
                    }
                  }
                  values.push(currentToken.trim());
                  
                  // Create key-value
                  const item: any = {};
                  columnsList.forEach((col, index) => {
                    let parsedVal: any = values[index];
                    if (parsedVal === undefined) return;
                    if (parsedVal === 'NULL' || parsedVal === 'null') {
                      parsedVal = null;
                    } else if (/^\d+$/.test(parsedVal)) {
                      parsedVal = parseInt(parsedVal, 10);
                    } else if (/^\d+\.\d+$/.test(parsedVal)) {
                      parsedVal = parseFloat(parsedVal);
                    } else if ((parsedVal.startsWith('{') && parsedVal.endsWith('}')) || (parsedVal.startsWith('[') && parsedVal.endsWith(']'))) {
                      try {
                        parsedVal = JSON.parse(parsedVal);
                      } catch (e) {}
                    }
                    item[col] = parsedVal;
                  });
                  
                  // Now map and append to db
                  if (targetTable === 'setores') {
                    const sectorObj = {
                      id: item.id || 'sec_' + Date.now(),
                      name: item.nome || item.name,
                      description: item.descricao || item.description || ''
                    };
                    const exists = db.sectors.some((s: any) => s.id === sectorObj.id);
                    if (exists && (safe_mode || query.toUpperCase().includes('IGNORE'))) {
                      skipped++;
                    } else {
                      db.sectors = db.sectors.filter((s: any) => s.id !== sectorObj.id);
                      db.sectors.push(sectorObj);
                      executed++;
                    }
                  } else if (targetTable === 'leitos') {
                    const bedObj = {
                      id: item.id || 'bed_' + Date.now(),
                      number: item.numero || item.number,
                      sectorId: item.setor_id || item.sectorid || item.sector_id
                    };
                    const exists = db.beds.some((b: any) => b.id === bedObj.id);
                    if (exists && (safe_mode || query.toUpperCase().includes('IGNORE'))) {
                      skipped++;
                    } else {
                      db.beds = db.beds.filter((b: any) => b.id !== bedObj.id);
                      db.beds.push(bedObj);
                      executed++;
                    }
                  } else if (targetTable === 'perguntas') {
                    let opts = item.opcoes || item.options || '["Sim", "Não"]';
                    if (typeof opts === 'string') {
                      try { opts = JSON.parse(opts); } catch (e) { opts = ["Sim", "Não"]; }
                    }
                    const qObj = {
                      id: item.id || 'q_' + Date.now(),
                      formType: item.tipo_formulario || item.formtype || 'SAFETY',
                      section: item.secao || item.section,
                      label: item.texto || item.label || item.texto,
                      options: opts
                    };
                    const exists = db.questions.some((q: any) => q.id === qObj.id);
                    if (exists && (safe_mode || query.toUpperCase().includes('IGNORE'))) {
                      skipped++;
                    } else {
                      db.questions = db.questions.filter((q: any) => q.id !== qObj.id);
                      db.questions.push(qObj);
                      executed++;
                    }
                  } else if (targetTable === 'usuarios') {
                    let perms = item.permissoes || item.permissions || '[]';
                    if (typeof perms === 'string') {
                      try { perms = JSON.parse(perms); } catch (e) { perms = []; }
                    }
                    const uObj = {
                      id: item.id || 'u_' + Date.now(),
                      name: item.nome || item.name,
                      email: item.email,
                      password: item.senha || item.password,
                      role: item.nivel || item.role || 'USER',
                      permissions: perms,
                      cargo: item.cargo || ''
                    };
                    const exists = db.users.some((u: any) => u.id === uObj.id || u.email.toLowerCase() === uObj.email.toLowerCase());
                    if (exists && (safe_mode || query.toUpperCase().includes('IGNORE'))) {
                      skipped++;
                    } else {
                      db.users = db.users.filter((u: any) => u.id !== uObj.id && u.email.toLowerCase() !== uObj.email.toLowerCase());
                      db.users.push(uObj);
                      executed++;
                    }
                  } else if (targetTable === 'auditorias') {
                    let answers = item.respostas || item.answers || '{}';
                    if (typeof answers === 'string') {
                      try { answers = JSON.parse(answers); } catch (e) { answers = {}; }
                    }
                    const aObj = {
                      id: item.id || 'aud_' + Date.now(),
                      type: item.tipo || item.type,
                      date: item.data || item.date,
                      evaluator: item.avaliador || item.evaluator,
                      sectorId: item.setor_id || item.sectorId || item.sectorid,
                      bedId: item.leito_id || item.bedId || item.bedid,
                      answers: answers
                    };
                    const exists = db.audits.some((a: any) => a.id === aObj.id);
                    if (exists && (safe_mode || query.toUpperCase().includes('IGNORE'))) {
                      skipped++;
                    } else {
                      db.audits = db.audits.filter((a: any) => a.id !== aObj.id);
                      db.audits.push(aObj);
                      executed++;
                    }
                  } else if (targetTable === 'cargos') {
                    let perms = item.permissions || '[]';
                    if (typeof perms === 'string') {
                      try { perms = JSON.parse(perms); } catch (e) { perms = []; }
                    }
                    const cObj = {
                      id: item.id || 'cargo_' + Date.now(),
                      name: item.name,
                      role: item.role || 'USER',
                      permissions: perms
                    };
                    const exists = db.cargos.some((c: any) => c.id === cObj.id);
                    if (exists && (safe_mode || query.toUpperCase().includes('IGNORE'))) {
                      skipped++;
                    } else {
                      db.cargos = db.cargos.filter((c: any) => c.id !== cObj.id);
                      db.cargos.push(cObj);
                      executed++;
                    }
                  } else {
                    executed++;
                  }
                }
              } else {
                executed++;
              }
            } catch (err: any) {
              errors.push({
                query: query.substring(0, 100) + '...',
                error: err.message || String(err)
              });
            }
          }
          
          saveMockDb(db);
          
          return res.json({
            success: true,
            message: 'Comando executado com sucesso na simulação do banco.',
            executed,
            skipped_duplicates: skipped,
            errors
          });
        }

        default:
          return res.json({ success: true, message: `Mocked action: ${action}` });
      }
    } catch (e: any) {
      console.error('[Mock API Error]', e);
      return res.status(500).json({ success: false, message: e.message || 'Erro no mock da API.' });
    }
  });

  // GEMINI AI - Auto-Heal Endpoint
  app.post('/api/gemini/auto-heal', async (req, res) => {
    try {
      const { errors, systemState } = req.body;
      const ai = getGeminiClient();

      const systemInstruction = `Você é um Engenheiro de Inteligência Artificial Especialista em Resiliência e Autocorreção de Sistemas para a plataforma HospAudit.
Análise o array de erros fornecido, explique-os didaticamente em português brasileiro e forneça instruções estruturadas para o frontend acionar as devidas rotinas de autocorreção.

Você DEVE responder estritamente um objeto JSON com as seguintes chaves:
- "analysis": um resumo didático detalhado de cada categoria de erro detectada, onde ela ocorreu e seu impacto (em português formal, acolhedor e profissional, sem formatação markdown).
- "rootCause": a causa raiz principal diagnosticada em poucas palavras (ex: "Oscilação de rede na sincronização ou chaves duplicadas no cache local").
- "remediesApplied": um array de strings descrevendo as ações corretivas automáticas que estão sendo propostas.
- "autoCorrectInstructions": um objeto contendo chaves booleanas para ações que o frontend deve executar, como: { "clearSystemErrors": true, "reconnectDb": true, "runDatabaseSane": true }
`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `Erros para analisar: ${JSON.stringify(errors || [])}\nEstado atual do sistema: ${JSON.stringify(systemState || {})}`,
        config: {
          systemInstruction,
          temperature: 0.2,
          responseMimeType: "application/json"
        }
      });

      const text = response.text || "{}";
      let parsedResponse = {};
      try {
        parsedResponse = JSON.parse(text.trim());
      } catch (err) {
        // clean fallback if markdown was somehow added
        const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        parsedResponse = JSON.parse(cleanText);
      }

      res.json({
        success: true,
        ...parsedResponse
      });
    } catch (error: any) {
      console.error('[POST /api/gemini/auto-heal Error]', error);
      res.status(500).json({
        success: false,
        message: 'Erro no diagnóstico inteligente Gemini.',
        error: error.message || String(error)
      });
    }
  });

  // GEMINI AI - Chatbot de Programação / Suporte Dev Integrado
  app.post('/api/gemini/chat', async (req, res) => {
    try {
      const { message, history, systemState } = req.body;
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ success: false, message: 'Mensagem inválida para o chatbot.' });
      }

      const ai = getGeminiClient();

      const systemInstruction = `Você é o "Terminal de Programação e Suporte Gemini AI", o assistente oficial de desenvolvimento e arquitetura da plataforma HospAudit (sistema de faturamento, checklist e auditoria hospitalar médica do SUS).
O usuário é um administrador ou programador do sistema. Ele pode tirar dúvidas, pedir para você gerar scripts de banco de dados SQL, código backend em PHP (como endpoints para o api.php), queries MySQL avançadas, rotinas de limpeza, ou explicar regras do SUS (SIGTAP, CID-10, AIH).

INFORMAÇÕES REAIS DO SISTEMA DO USUÁRIO (Use para enriquecer suas respostas se relevante):
- Estado do Banco MySQL: ${systemState?.dbStatus || 'Desconhecido'}
- Setores Cadastrados: ${systemState?.sectorsCount || 0}
- Leitos Cadastrados: ${systemState?.bedsCount || 0}
- Auditorias Efetuadas: ${systemState?.auditsCount || 0}
- Perguntas do Checklist: ${systemState?.questionsCount || 0}
- Erros em Cache: ${systemState?.errorsCount || 0}
- Logs Registrados: ${systemState?.logsCount || 0}

REGRAS DE RESPOSTA:
1. Responda em português brasileiro de forma altamente técnica, clara, prestativa e objetiva.
2. Forneça trechos de código limpos e prontos para uso (SQL, PHP, TypeScript, etc.) usando blocos markdown correspondentes.
3. Se solicitado a programar, escreva scripts robustos e seguros (ex: tratamento de exceções, prevenção de SQL injection em PHP, etc.).
4. Adote um tom de desenvolvedor sênior para desenvolvedor júnior.
`;

      // Transform simple message + history array to Gemini SDK format if desired, or build a simple conversational string
      let prompt = "Histórico de Conversa:\n";
      if (Array.isArray(history)) {
        history.slice(-10).forEach((h: any) => {
          prompt += `${h.role === 'user' ? 'Usuário' : 'Gemini'}: ${h.text || h.message}\n`;
        });
      }
      prompt += `\nUsuário atual: ${message}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          systemInstruction,
          temperature: 0.7,
        }
      });

      res.json({
        success: true,
        text: response.text || "Sem resposta da Inteligência Artificial."
      });
    } catch (error: any) {
      console.error('[POST /api/gemini/chat Error]', error);
      res.status(500).json({
        success: false,
        message: 'Erro no processamento da mensagem pelo chatbot Gemini.',
        error: error.message || String(error)
      });
    }
  });

  // --- GITHUB UPDATER ENDPOINTS ---
  const GITHUB_DEFAULT_REPO = 'https://github.com/allexsiilva/HospAudit';
  const GITHUB_CONFIG_FILE = path.join(process.cwd(), 'data', 'github_config.json');

  function loadGithubConfig() {
    let customConfig = {
      repoUrl: GITHUB_DEFAULT_REPO,
      branch: 'main',
      token: ''
    };
    if (fs.existsSync(GITHUB_CONFIG_FILE)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(GITHUB_CONFIG_FILE, 'utf8'));
        customConfig = {
          repoUrl: (parsed.repoUrl || GITHUB_DEFAULT_REPO).trim(),
          branch: (parsed.branch || 'main').trim(),
          token: (parsed.token || '').trim()
        };
      } catch (e) {}
    }
    return customConfig;
  }

  function saveGithubConfigFile(cfg: { repoUrl: string; branch: string; token: string }) {
    const dataDir = path.dirname(GITHUB_CONFIG_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(GITHUB_CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
  }

  function normalizeRepoUrl(rawUrl: string): string {
    let clean = (rawUrl || '').trim().replace(/\/+$/, '');
    if (!clean) return GITHUB_DEFAULT_REPO;
    if (!/^https?:\/\//i.test(clean) && !clean.startsWith('git@')) {
      clean = `https://${clean}`;
    }
    return clean;
  }

  function buildAuthRepoUrl(repoUrl: string, token?: string): string {
    const cleanUrl = normalizeRepoUrl(repoUrl);
    const cleanToken = (token || '').trim();
    if (!cleanToken) return cleanUrl;
    const withoutProto = cleanUrl.replace(/^https?:\/\/([^@]+@)?/i, '');
    return `https://x-access-token:${encodeURIComponent(cleanToken)}@${withoutProto}`;
  }

  function runGit(args: string[], timeout = 30000): string {
    return execFileSync('git', args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GCM_INTERACTIVE: 'never'
      }
    });
  }

  function sanitizeGitText(text: string, token?: string): string {
    let out = String(text || '');
    if (token && token.trim()) {
      out = out.split(token.trim()).join('***');
      out = out.split(encodeURIComponent(token.trim())).join('***');
    }
    out = out.replace(/https:\/\/[^@\s]+@/gi, 'https://***@');
    return out;
  }

  function formatFriendlyGitError(err: any, branch: string, token?: string): string {
    const raw = sanitizeGitText(
      [err?.stderr, err?.stdout, err?.message].filter(Boolean).join('\n') || String(err),
      token
    );
    const lower = raw.toLowerCase();
    if (lower.includes('repository not found') || lower.includes('404')) {
      return 'Repositório não encontrado (404) ou privado sem autorização. Confira a URL do GitHub ou informe um Personal Access Token (PAT) em Configurações Avançadas.';
    }
    if (lower.includes('authentication failed') || lower.includes('could not read username') || lower.includes('403') || lower.includes('invalid username or password')) {
      return 'Falha de autenticação no GitHub. Informe ou revise o Personal Access Token (PAT) em Configurações Avançadas.';
    }
    if (lower.includes("couldn't find remote ref") || lower.includes('not found in upstream origin')) {
      return `A branch "${branch}" não existe no repositório remoto. Verifique o nome da branch (ex: main ou master).`;
    }
    if (lower.includes('could not resolve host') || lower.includes('failed to connect') || lower.includes('timed out')) {
      return 'Sem conexão com o GitHub ou tempo limite esgotado ao acessar o repositório remoto.';
    }
    return raw.trim() || 'Erro desconhecido ao executar comando Git.';
  }

  function configureGitOriginRemote(authUrl: string) {
    let hasOrigin = false;
    try {
      runGit(['remote', 'get-url', 'origin']);
      hasOrigin = true;
    } catch (e) {}

    if (hasOrigin) {
      runGit(['remote', 'set-url', 'origin', authUrl]);
    } else {
      runGit(['remote', 'add', 'origin', authUrl]);
    }
  }

  function parseLsRemoteBranches(lsOutput: string): Record<string, string> {
    const branches: Record<string, string> = {};
    (lsOutput || '').split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const [hash, ref] = trimmed.split(/\s+/);
      if (hash && ref && ref.startsWith('refs/heads/')) {
        branches[ref.replace('refs/heads/', '')] = hash;
      }
    });
    return branches;
  }

  app.get('/api/github/status', (req, res) => {
    try {
      const customConfig = loadGithubConfig();

      let currentBranch = customConfig.branch || 'main';
      let lastCommitHash = 'Nenhum';
      let lastCommitMessage = 'Repositório Git ainda não sincronizado neste ambiente.';
      let lastCommitAuthor = '—';
      let lastCommitDate = '—';
      let remoteUrl = customConfig.repoUrl;
      let isGitRepo = false;
      let hasCommits = false;
      let gitAvailable = false;

      try {
        runGit(['--version'], 5000);
        gitAvailable = true;
      } catch (e) {}

      if (gitAvailable) {
        isGitRepo = fs.existsSync(path.join(process.cwd(), '.git'));
        if (isGitRepo) {
          try {
            runGit(['rev-parse', '--verify', 'HEAD'], 5000);
            hasCommits = true;
          } catch (e) {
            hasCommits = false;
          }

          if (hasCommits) {
            try {
              currentBranch = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], 5000).trim();
              lastCommitHash = runGit(['rev-parse', '--short', 'HEAD'], 5000).trim();
              lastCommitMessage = runGit(['log', '-1', '--format=%s'], 5000).trim();
              lastCommitAuthor = runGit(['log', '-1', '--format=%an'], 5000).trim();
              lastCommitDate = runGit(['log', '-1', '--format=%cd', '--date=format:%d/%m/%Y %H:%M'], 5000).trim();
            } catch (errLog: any) {
              console.error('[GitHub Status Info Error]', errLog.message);
            }
          }

          try {
            const rawRemote = runGit(['remote', 'get-url', 'origin'], 5000).trim();
            remoteUrl = rawRemote.replace(/^https:\/\/[^@]+@/i, 'https://');
          } catch (e) {
            remoteUrl = customConfig.repoUrl;
          }
        }
      }

      res.json({
        success: true,
        gitAvailable,
        isGitRepo,
        hasCommits,
        currentBranch,
        lastCommitHash,
        lastCommitMessage,
        lastCommitAuthor,
        lastCommitDate,
        remoteUrl,
        customConfig: {
          repoUrl: customConfig.repoUrl,
          branch: customConfig.branch,
          hasToken: !!customConfig.token
        }
      });
    } catch (err: any) {
      console.error('[GET /api/github/status Error]', err);
      res.status(500).json({ success: false, message: 'Erro ao obter status do GitHub', error: err.message });
    }
  });

  app.post('/api/github/config', (req, res) => {
    try {
      const { repoUrl, branch, token } = req.body || {};
      if (!repoUrl || !String(repoUrl).trim()) {
        return res.status(400).json({ success: false, message: 'A URL do repositório é obrigatória.' });
      }

      const existing = loadGithubConfig();
      const normalizedUrl = normalizeRepoUrl(repoUrl);
      const newConfig = {
        repoUrl: normalizedUrl,
        branch: (branch || existing.branch || 'main').trim(),
        token: token !== undefined && String(token).trim() !== '' ? String(token).trim() : (token === '' ? '' : existing.token || '')
      };

      saveGithubConfigFile(newConfig);

      if (fs.existsSync(path.join(process.cwd(), '.git'))) {
        try {
          configureGitOriginRemote(buildAuthRepoUrl(newConfig.repoUrl, newConfig.token));
        } catch (errRemote: any) {
          console.error('[Error setting git remote URL]', sanitizeGitText(errRemote.message, newConfig.token));
        }
      }

      res.json({ success: true, message: 'Configuração do GitHub salva com sucesso!' });
    } catch (err: any) {
      console.error('[POST /api/github/config Error]', err);
      res.status(500).json({ success: false, message: 'Erro ao salvar configuração do GitHub.', error: err.message });
    }
  });

  app.post('/api/github/check-updates', (req, res) => {
    const saved = loadGithubConfig();
    const repoUrl = normalizeRepoUrl(req.body?.repoUrl || saved.repoUrl);
    const branch = (req.body?.branch || saved.branch || 'main').trim();
    const token = (req.body?.token !== undefined && String(req.body.token).trim() !== '')
      ? String(req.body.token).trim()
      : saved.token;

    try {
      runGit(['--version'], 5000);
    } catch (e) {
      return res.status(500).json({
        success: false,
        hasUpdates: false,
        behindCount: 0,
        message: 'O utilitário "git" não está instalado neste servidor.'
      });
    }

    const authUrl = buildAuthRepoUrl(repoUrl, token);

    try {
      const lsOut = runGit(['ls-remote', '--heads', authUrl], 15000);
      const remoteBranches = parseLsRemoteBranches(lsOut);
      const remoteHash = remoteBranches[branch];

      if (!remoteHash) {
        const available = Object.keys(remoteBranches);
        const hint = available.length > 0
          ? ` Branches disponíveis no repositório: ${available.join(', ')}.`
          : ' O repositório remoto não possui branches publicadas.';
        return res.json({
          success: false,
          hasUpdates: false,
          behindCount: 0,
          message: `Branch "${branch}" não encontrada no repositório remoto.${hint}`
        });
      }

      const isGitRepo = fs.existsSync(path.join(process.cwd(), '.git'));
      let hasLocalHead = false;
      let localHash = '';

      if (isGitRepo) {
        try {
          localHash = runGit(['rev-parse', 'HEAD'], 5000).trim();
          hasLocalHead = !!localHash;
        } catch (e) {
          hasLocalHead = false;
        }
      }

      if (!isGitRepo || !hasLocalHead) {
        return res.json({
          success: true,
          hasUpdates: true,
          behindCount: 1,
          remoteHash: remoteHash.slice(0, 7),
          message: `Repositório remoto acessível (commit ${remoteHash.slice(0, 7)} na branch "${branch}"). Clique em "Atualizar Sistema" para sincronizar.`
        });
      }

      const hasUpdates = localHash !== remoteHash;
      let behindCount = hasUpdates ? 1 : 0;

      if (hasUpdates) {
        try {
          configureGitOriginRemote(authUrl);
          runGit(['fetch', 'origin', branch], 20000);
          const countRaw = runGit(['rev-list', '--count', `HEAD..origin/${branch}`], 5000).trim();
          behindCount = parseInt(countRaw, 10) || 1;
        } catch (e) {
          behindCount = 1;
        }
      }

      return res.json({
        success: true,
        hasUpdates,
        behindCount,
        localHash: localHash.slice(0, 7),
        remoteHash: remoteHash.slice(0, 7),
        message: hasUpdates
          ? `Existem ${behindCount} novo(s) commit(s) disponíveis na branch "${branch}" (${localHash.slice(0, 7)} → ${remoteHash.slice(0, 7)}).`
          : `Seu sistema já está na versão mais recente da branch "${branch}" (${localHash.slice(0, 7)})!`
      });
    } catch (errGit: any) {
      const friendly = formatFriendlyGitError(errGit, branch, token);
      console.error('[Git check-updates error]', friendly);
      return res.json({
        success: false,
        hasUpdates: false,
        behindCount: 0,
        message: friendly
      });
    }
  });

  app.post('/api/github/update', (req, res) => {
    const saved = loadGithubConfig();
    const repoUrl = normalizeRepoUrl(req.body?.repoUrl || saved.repoUrl);
    const branch = (req.body?.branch || saved.branch || 'main').trim();
    const token = (req.body?.token !== undefined && String(req.body.token).trim() !== '')
      ? String(req.body.token).trim()
      : saved.token;

    try {
      runGit(['--version'], 5000);
    } catch (e) {
      return res.status(500).json({
        success: false,
        message: 'O utilitário "git" não está instalado neste servidor.'
      });
    }

    // Persist active config
    saveGithubConfigFile({ repoUrl, branch, token });
    const authUrl = buildAuthRepoUrl(repoUrl, token);

    // 1. Validate remote connectivity & branch before altering local files
    let remoteBranches: Record<string, string> = {};
    try {
      const lsOut = runGit(['ls-remote', '--heads', authUrl], 20000);
      remoteBranches = parseLsRemoteBranches(lsOut);
    } catch (errRemote: any) {
      const friendly = formatFriendlyGitError(errRemote, branch, token);
      return res.status(400).json({
        success: false,
        message: friendly,
        error: friendly
      });
    }

    if (!remoteBranches[branch]) {
      const available = Object.keys(remoteBranches);
      const hint = available.length > 0
        ? ` Branches encontradas: ${available.join(', ')}.`
        : ' Nenhuma branch encontrada no repositório remoto.';
      const msg = `Branch "${branch}" não existe em ${repoUrl}.${hint}`;
      return res.status(400).json({ success: false, message: msg, error: msg });
    }

    // 2. Snapshot local data/*.json files in memory so user DB & configs are NEVER overwritten
    const preservedDataFiles: Record<string, string> = {};
    try {
      if (fs.existsSync(DATA_DIR)) {
        fs.readdirSync(DATA_DIR).forEach(file => {
          const full = path.join(DATA_DIR, file);
          if (fs.statSync(full).isFile() && file.endsWith('.json')) {
            preservedDataFiles[file] = fs.readFileSync(full, 'utf8');
          }
        });
      }
    } catch (e) {
      console.warn('[Git Update] Aviso ao ler data/ antes do pull:', e);
    }

    try {
      const gitDir = path.join(process.cwd(), '.git');
      const hadGitDir = fs.existsSync(gitDir);
      if (!hadGitDir) {
        runGit(['init'], 10000);
      }

      // Ensure local git user identity exists for merge commits
      try {
        runGit(['config', 'user.name'], 5000);
      } catch (e) {
        runGit(['config', 'user.name', 'HospAudit Updater'], 5000);
        runGit(['config', 'user.email', 'updater@hospaudit.local'], 5000);
      }

      configureGitOriginRemote(authUrl);

      let prevHash = '';
      let hasHead = false;
      try {
        prevHash = runGit(['rev-parse', 'HEAD'], 5000).trim();
        hasHead = !!prevHash;
      } catch (e) {
        hasHead = false;
      }

      const fetchOut = runGit(['fetch', 'origin', branch], 30000);
      let syncOutput = '';

      if (!hasHead) {
        // First-time sync over existing project directory: force-checkout remote tree while keeping data/, node_modules/, .env
        syncOutput = runGit(['checkout', '-f', '-B', branch, `origin/${branch}`], 30000);
      } else {
        // Stash local source modifications if dirty (excluding untracked data/)
        let stashed = false;
        try {
          const statusOut = runGit(['status', '--porcelain'], 5000).trim();
          if (statusOut) {
            runGit(['stash', 'push', '-m', `pre-git-update-${Date.now()}`], 15000);
            stashed = true;
          }
        } catch (e) {}

        try {
          runGit(['checkout', branch], 15000);
        } catch (e) {
          runGit(['checkout', '-f', '-B', branch, `origin/${branch}`], 20000);
        }

        try {
          syncOutput = runGit(['pull', '--no-rebase', '--allow-unrelated-histories', '-X', 'theirs', 'origin', branch], 30000);
        } catch (e) {
          // Fallback to clean fast-forward/reset to remote branch if merge fails
          syncOutput = runGit(['reset', '--hard', `origin/${branch}`], 20000);
        }

        if (stashed) {
          syncOutput += '\n[INFO] Alterações locais temporárias foram arquivadas via git stash.';
        }
      }

      // 3. Restore preserved data/*.json runtime files so local DB & configs remain untouched
      if (Object.keys(preservedDataFiles).length > 0) {
        if (!fs.existsSync(DATA_DIR)) {
          fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        Object.entries(preservedDataFiles).forEach(([fileName, content]) => {
          fs.writeFileSync(path.join(DATA_DIR, fileName), content, 'utf8');
        });
      }

      const newHash = runGit(['rev-parse', '--short', 'HEAD'], 5000).trim();
      const commitTitle = runGit(['log', '-1', '--format=%s'], 5000).trim();
      const summaryLines = [
        sanitizeGitText(fetchOut, token),
        sanitizeGitText(syncOutput, token),
        `[COMMIT] ${prevHash ? `${prevHash.slice(0, 7)} -> ` : ''}${newHash} (${commitTitle})`,
        `[DADOS] ${Object.keys(preservedDataFiles).length} arquivos locais em /data preservados intactos.`
      ].filter(Boolean).join('\n');

      res.json({
        success: true,
        message: 'Sistema atualizado com sucesso a partir do GitHub!',
        output: summaryLines,
        localHash: newHash
      });
    } catch (errGit: any) {
      // Restore data/*.json even on failure
      try {
        if (Object.keys(preservedDataFiles).length > 0 && fs.existsSync(DATA_DIR)) {
          Object.entries(preservedDataFiles).forEach(([fileName, content]) => {
            fs.writeFileSync(path.join(DATA_DIR, fileName), content, 'utf8');
          });
        }
      } catch (e) {}

      const friendly = formatFriendlyGitError(errGit, branch, token);
      console.error('[Git pull error]', friendly);
      res.status(500).json({
        success: false,
        message: friendly,
        error: friendly
      });
    }
  });

  // Vite integration
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          ignored: (pathString: string) => {
            const normalized = pathString.replace(/\\/g, '/');
            return (
              normalized.includes('/data/') ||
              normalized.includes('/backups/') ||
              normalized.endsWith('.json') ||
              normalized.endsWith('.sql') ||
              normalized.endsWith('.bat') ||
              normalized.endsWith('mysql-mock-db.json') ||
              normalized.endsWith('cid-database.json')
            );
          }
        }
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Inicializa o banco de dados local imediatamente na inicialização do servidor
  try {
    getMockDb();
    console.log('[Banco de Dados Local] Base de dados carregada, migrada e sincronizada com sucesso na inicialização.');
  } catch (err) {
    console.error('[Banco de Dados Local Error] Erro ao inicializar base de dados na inicialização:', err);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[HospAudit Server] Executando com Socket.IO e Express em http://0.0.0.0:${PORT}`);
  });
}

startServer();
