import fs from 'fs';
import path from 'path';
import { spawn, spawnSync } from 'child_process';

const distServerPath = path.join(process.cwd(), 'dist', 'server.cjs');
const distHtmlPath = path.join(process.cwd(), 'dist', 'index.html');

function ensureProductionBuild() {
  if (fs.existsSync(distServerPath) && fs.existsSync(distHtmlPath)) {
    return true;
  }

  console.log('======================================================');
  console.log('[HospAudit] Compilacao de producao nao encontrada em dist/.');
  console.log('[HospAudit] Executando "npm run build" automaticamente...');
  console.log('======================================================');

  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const buildResult = spawnSync(npmCmd, ['run', 'build'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  });

  if (buildResult.status !== 0 || !fs.existsSync(distServerPath)) {
    console.error('\n[ERRO] Falha ao compilar o projeto com "npm run build".');
    console.error('Verifique se as dependencias estao instaladas executando: npm install');
    process.exit(buildResult.status || 1);
  }

  console.log('[HospAudit] Compilacao concluida com sucesso!\n');
  return true;
}

function startProductionServer() {
  ensureProductionBuild();

  console.log('[HospAudit] Iniciando servidor em modo de producao (http://localhost:3000)...');
  const child = spawn(process.execPath, [distServerPath], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV || 'production',
    },
  });

  child.on('close', (code) => {
    process.exit(code ?? 0);
  });

  process.on('SIGINT', () => {
    child.kill('SIGINT');
  });
  process.on('SIGTERM', () => {
    child.kill('SIGTERM');
  });
}

startProductionServer();
