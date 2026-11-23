import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const DATA_DIR = path.join(process.cwd(), 'data');
const MYSQL_CONFIG_FILE = path.join(DATA_DIR, 'mysql_config.json');

const FILE_MAP = {
  sectors: path.join(DATA_DIR, 'setores.json'),
  beds: path.join(DATA_DIR, 'leitos.json'),
  audits: path.join(DATA_DIR, 'auditorias.json'),
  questions: path.join(DATA_DIR, 'perguntas.json'),
  logs: path.join(DATA_DIR, 'logs.json'),
  users: path.join(DATA_DIR, 'usuarios.json'),
  cargos: path.join(DATA_DIR, 'cargos.json'),
    modulos_sistema: path.join(DATA_DIR, 'modulos_sistema.json'),
  permissoes: path.join(DATA_DIR, 'permissoes.json'),
  appointments: path.join(DATA_DIR, 'agendamentos.json'),
  form_submissions: path.join(DATA_DIR, 'form_submissions.json'),
};

function parsePhpConfig() {
  const configPath = path.join(process.cwd(), 'config.php');
  if (!fs.existsSync(configPath)) return null;
  try {
    const content = fs.readFileSync(configPath, 'utf8');
    const getValue = (key) => {
      const regexDirect = new RegExp(`define\\s*\\(\\s*['"]${key}['"]\\s*,\\s*['"]([^'"]*)['"]\\s*\\)`, 'i');
      const matchDirect = content.match(regexDirect);
      if (matchDirect) return matchDirect[1];

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
  } catch (err) {
    return null;
  }
}

function getDbCredentials() {
  let host = process.env.DB_HOST || '';
  let port = Number(process.env.DB_PORT) || 3306;
  let user = process.env.DB_USER || '';
  let password = process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '';
  let database = process.env.DB_NAME || 'hospaudit';

  if (!host && fs.existsSync(MYSQL_CONFIG_FILE)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(MYSQL_CONFIG_FILE, 'utf8'));
      if (cfg.host) {
        host = cfg.host;
        port = Number(cfg.port) || 3306;
        user = cfg.user || 'root';
        password = cfg.password !== undefined ? cfg.password : '';
        database = cfg.database || 'hospaudit';
      }
    } catch (e) {}
  }

  if (!host) {
    const phpCfg = parsePhpConfig();
    if (phpCfg) {
      host = phpCfg.host;
      port = phpCfg.port;
      user = phpCfg.user;
      password = phpCfg.password;
      database = phpCfg.database;
    }
  }

  if (!host) host = '127.0.0.1';
  if (!user) user = 'root';

  return { host, port, user, password, database };
}

function camelToSnake(str) {
  return str.replace(/(?<!^)[A-Z]/g, match => '_' + match).toLowerCase();
}

async function syncDatabase() {
  console.log('\x1b[36m========================================================================\x1b[0m');
  console.log('\x1b[1m\x1b[36m   🏥 HospAudit - DIAGNÓSTICO E SINCRONIZAÇÃO DE BANCO DE DADOS (MySQL)\x1b[0m');
  console.log('\x1b[36m========================================================================\x1b[0m\n');

  const creds = getDbCredentials();
  console.log(`\x1b[33m[1/5] Parâmetros de Conexão Lidos:\x1b[0m`);
  console.log(`  • Host: ${creds.host}:${creds.port}`);
  console.log(`  • Usuário: ${creds.user}`);
  console.log(`  • Banco de Dados Target: ${creds.database}\n`);

  let rootConnection = null;
  try {
    console.log(`\x1b[33m[2/5] Testando integridade do servidor MySQL (${creds.host}:${creds.port})...\x1b[0m`);
    rootConnection = await mysql.createConnection({
      host: creds.host,
      port: creds.port,
      user: creds.user,
      password: creds.password,
      connectTimeout: 5000
    });
    console.log(`\x1b[32m  [✓] Servidor MySQL respondendo normalmente!\x1b[0m`);

    console.log(`  • Garantindo existência da base "${creds.database}"...`);
    await rootConnection.query(
      `CREATE DATABASE IF NOT EXISTS \`${creds.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await rootConnection.end();
    rootConnection = null;
    console.log(`\x1b[32m  [✓] Banco de dados "${creds.database}" verificado/criado com sucesso.\x1b[0m\n`);
  } catch (err) {
    if (rootConnection) await rootConnection.end().catch(() => {});
    console.error(`\n\x1b[31m  [🚨 ERRO DE CONEXÃO DE REDE / MYSQL]\x1b[0m`);
    console.error(`  Não foi possível conectar ao MySQL em ${creds.host}:${creds.port}.`);
    console.error(`  Mensagem técnica: ${err.message}`);
    console.error(`  Dica XAMPP: Verifique se o MySQL no XAMPP Control Panel está rodando (botão Start ativo em verde).\n`);
    process.exit(1);
  }

  let pool = null;
  try {
    console.log(`\x1b[33m[3/5] Estabelecendo Pool de Conexões no banco "${creds.database}"...\x1b[0m`);
    pool = mysql.createPool({
      host: creds.host,
      port: creds.port,
      user: creds.user,
      password: creds.password,
      database: creds.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      charset: 'utf8mb4'
    });

    const conn = await pool.getConnection();
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`hospaudit_store\` (
        \`key_name\` VARCHAR(100) PRIMARY KEY,
        \`json_data\` LONGTEXT,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    conn.release();
    console.log(`\x1b[32m  [✓] Tabela unificada 'hospaudit_store' garantida.\x1b[0m\n`);
  } catch (err) {
    console.error(`\x1b[31m  [🚨 ERRO AO CRIA POOL DE CONEXÃO]\x1b[0m: ${err.message}\n`);
    process.exit(1);
  }

  console.log(`\x1b[33m[4/5] Sincronizando tabelas relacionais com dados locais...\x1b[0m`);

  let totalSyncedTables = 0;
  let totalRecordsCount = 0;

  for (const [key, filePath] of Object.entries(FILE_MAP)) {
    const tableName = `hospaudit_${camelToSnake(key)}`;
    let items = [];

    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        items = JSON.parse(raw);
      } catch (e) {
        items = [];
      }
    }

    if (!Array.isArray(items)) {
      items = [];
    }

    try {
      // 1. Salvar JSON unificado no hospaudit_store
      await pool.query(
        `INSERT INTO \`hospaudit_store\` (\`key_name\`, \`json_data\`)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE \`json_data\` = ?, \`updated_at\` = CURRENT_TIMESTAMP`,
        [key, JSON.stringify(items), JSON.stringify(items)]
      );

      // 2. Higienizar e deduplicar itens por ID garantido
      const uniqueItemsMap = new Map();
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

      // 3. Inferir colunas
      const columns = { id: 'VARCHAR(150)' };
      for (const item of deduplicatedItems) {
        for (const colName of Object.keys(item)) {
          if (!columns[colName]) {
            const val = item[colName];
            if (val && typeof val === 'object') {
              columns[colName] = 'LONGTEXT';
            } else if (typeof val === 'number') {
              columns[colName] = Number.isInteger(val) ? 'INT' : 'DOUBLE';
            } else if (typeof val === 'boolean') {
              columns[colName] = 'TINYINT(1)';
            } else {
              const len = String(val || '').length;
              columns[colName] = len > 255 ? 'TEXT' : 'VARCHAR(255)';
            }
          } else {
            const val = item[colName];
            if (columns[colName] === 'VARCHAR(255)' && String(val || '').length > 255) {
              columns[colName] = 'TEXT';
            }
          }
        }
      }

      // 4. Verificar se tabela existe
      const [rows] = await pool.query(`SHOW TABLES LIKE ?`, [tableName]);
      const tableExists = Array.isArray(rows) && rows.length > 0;

      if (tableExists) {
        const [descRows] = await pool.query(`DESCRIBE \`${tableName}\``);
        const existingCols = {};
        for (const col of descRows) {
          existingCols[col.Field.toLowerCase()] = true;
        }

        for (const colName of Object.keys(columns)) {
          if (colName === 'id') continue;
          if (!existingCols[colName.toLowerCase()]) {
            try {
              await pool.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${colName}\` ${columns[colName]} NULL`);
            } catch (e) {}
          }
        }
      } else {
        const colDefs = [];
        for (const colName of Object.keys(columns)) {
          if (colName === 'id') {
            colDefs.push(`\`${colName}\` VARCHAR(150) NOT NULL PRIMARY KEY`);
          } else {
            colDefs.push(`\`${colName}\` ${columns[colName]} NULL`);
          }
        }
        await pool.query(`
          CREATE TABLE IF NOT EXISTS \`${tableName}\` (
            ${colDefs.join(',\n            ')}
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
      }

      // 5. Truncar tabela e usar REPLACE INTO
      await pool.query(`DELETE FROM \`${tableName}\``);

      if (deduplicatedItems.length > 0) {
        const colKeys = Object.keys(columns);
        const colsEscaped = colKeys.map(c => `\`${c}\``).join(', ');

        const chunkSize = 100;
        for (let i = 0; i < deduplicatedItems.length; i += chunkSize) {
          const chunk = deduplicatedItems.slice(i, i + chunkSize);
          const sqlParts = [];
          const flatParams = [];

          for (const item of chunk) {
            const placeholders = [];
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
            await pool.query(insertSql, flatParams);
          }
        }
      }

      totalSyncedTables++;
      totalRecordsCount += deduplicatedItems.length;
      console.log(`  \x1b[32m[✓]\x1b[0m \x1b[1m${tableName.padEnd(30)}\x1b[0m -> ${deduplicatedItems.length} registros sincronizados.`);
    } catch (err) {
      console.error(`  \x1b[31m[❌ ERRO na tabela ${tableName}]\x1b[0m: ${err.message}`);
    }
  }

  console.log(`\n\x1b[33m[5/5] Resumo Final da Sincronização:\x1b[0m`);
  console.log(`\x1b[32m========================================================================\x1b[0m`);
  console.log(`\x1b[1m\x1b[32m 🎉 SINCRONIZAÇÃO REALIZADA COM SUCESSO!\x1b[0m`);
  console.log(`  • Host MySQL: ${creds.host}:${creds.port}`);
  console.log(`  • Banco de Dados: ${creds.database}`);
  console.log(`  • Tabelas Sincronizadas: ${totalSyncedTables} de ${Object.keys(FILE_MAP).length}`);
  console.log(`  • Total de Registros Persistidos: ${totalRecordsCount}`);
  console.log(`\x1b[32m========================================================================\x1b[0m\n`);

  await pool.end();
  process.exit(0);
}

syncDatabase().catch((err) => {
  console.error('\n\x1b[31m[🚨 ERRO FATAL NO SCRIPT DE SINCRONIZAÇÃO]\x1b[0m', err);
  process.exit(1);
});
