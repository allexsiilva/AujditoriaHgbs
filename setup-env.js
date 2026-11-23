import fs from 'fs';
import path from 'path';
import readline from 'readline';

const envPath = path.join(process.cwd(), '.env');
const envExamplePath = path.join(process.cwd(), '.env.example');

// Função utilitária para ler entradas do usuário via terminal
function askQuestion(rl, query, defaultValue) {
  return new Promise((resolve) => {
    const promptText = defaultValue ? `${query} [padrão: ${defaultValue}]: ` : `${query}: `;
    rl.question(promptText, (answer) => {
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

// Ler arquivo .env existente
function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf-8');
  const envVars = {};
  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const parts = trimmed.split('=');
      const key = parts[0].trim();
      let val = parts.slice(1).join('=').trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.substring(1, val.length - 1);
      }
      envVars[key] = val;
    }
  });
  return envVars;
}

async function runSetupEnv() {
  console.log('\n===========================================================');
  console.log('🛠️ CONFIGURADOR AMBIENTAL DE CONEXÃO MYSQL (XAMPP / HOSP-AUDIT)');
  console.log('===========================================================\n');

  const existingEnv = parseEnvFile(envPath);
  const isComplete =
    existingEnv.DB_HOST &&
    existingEnv.DB_PORT &&
    existingEnv.DB_USER !== undefined &&
    existingEnv.DB_NAME;

  if (isComplete && process.argv.includes('--check-only')) {
    console.log('✅ Arquivo .env já está configurado corretamente com todos os parâmetros do MySQL!');
    console.log(`   Host: ${existingEnv.DB_HOST}:${existingEnv.DB_PORT}`);
    console.log(`   Usuário: ${existingEnv.DB_USER}`);
    console.log(`   Banco: ${existingEnv.DB_NAME}\n`);
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('Informe os dados de conexão com o MySQL do seu XAMPP/Servidor:\n');

  const dbHost = await askQuestion(rl, '1. Endereço do Servidor MySQL (Host)', existingEnv.DB_HOST || 'localhost');
  const dbPort = await askQuestion(rl, '2. Porta do MySQL', existingEnv.DB_PORT || '3306');
  const dbUser = await askQuestion(rl, '3. Usuário do Banco de Dados', existingEnv.DB_USER || 'root');
  const dbPassword = await askQuestion(rl, '4. Senha do Banco de Dados (deixe em branco se for padrão do XAMPP)', existingEnv.DB_PASSWORD || '');
  const dbName = await askQuestion(rl, '5. Nome do Banco de Dados', existingEnv.DB_NAME || 'hospaudit');

  rl.close();

  const geminiKey = existingEnv.GEMINI_API_KEY || 'MY_GEMINI_API_KEY';
  const appUrl = existingEnv.APP_URL || 'MY_APP_URL';

  const newEnvContent = `# GEMINI_API_KEY: Configuração automática no AI Studio
GEMINI_API_KEY="${geminiKey}"

# APP_URL: URL do servidor
APP_URL="${appUrl}"

# Configurações de Conexão com o Banco de Dados MySQL (XAMPP / WAMP / Produção)
DB_HOST="${dbHost}"
DB_PORT="${dbPort}"
DB_USER="${dbUser}"
DB_PASSWORD="${dbPassword}"
DB_NAME="${dbName}"
`;

  fs.writeFileSync(envPath, newEnvContent, 'utf-8');

  console.log('\n===========================================================');
  console.log('🎉 ARQUIVO .ENV ATUALIZADO COM SUCESSO!');
  console.log('===========================================================');
  console.log(`📍 DB_HOST     : ${dbHost}`);
  console.log(`🔌 DB_PORT     : ${dbPort}`);
  console.log(`👤 DB_USER     : ${dbUser}`);
  console.log(`🔑 DB_PASSWORD : ${dbPassword ? '********' : '(Sem Senha)'}`);
  console.log(`🗄️ DB_NAME     : ${dbName}`);
  console.log('===========================================================\n');
}

runSetupEnv().catch((err) => {
  console.error('❌ Erro no configurador:', err);
  process.exit(1);
});
