import { build } from 'esbuild';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

async function start() {
  console.log('======================================================');
  console.log('Iniciando Compilação do Servidor HospAudit...');
  
  // Garantir que a pasta dist exista
  if (!fs.existsSync('dist')) {
    fs.mkdirSync('dist');
  }

  try {
    // Compila o server.ts para JavaScript puro compatível com Node.js
    await build({
      entryPoints: ['server.ts'],
      bundle: true,
      platform: 'node',
      format: 'esm',
      outfile: 'dist/server-dev.js',
      packages: 'external',
      sourcemap: true,
      loader: {
        '.ts': 'ts',
        '.tsx': 'tsx',
        '.js': 'js',
        '.json': 'json'
      }
    });

    console.log('[✓] Servidor compilado com sucesso!');
    console.log('------------------------------------------------------');
    console.log('Iniciando o servidor Node.js...');
    console.log('👉 Acesse em seu navegador: http://localhost:3000');
    console.log('------------------------------------------------------');

    // Executa o arquivo compilado com o Node.js nativo
    const child = spawn('node', ['dist/server-dev.js'], {
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'development' }
    });

    child.on('close', (code) => {
      if (code !== 0 && code !== null) {
        console.log(`\n[AVISO] O servidor encerrou com código de saída ${code}`);
      }
      process.exit(code || 0);
    });

    // Encerrar processo filho ao encerrar processo pai
    process.on('SIGINT', () => {
      child.kill('SIGINT');
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      child.kill('SIGTERM');
      process.exit(0);
    });

  } catch (error) {
    console.error('\n[ERRO] Falha ao compilar o servidor com esbuild:', error);
    process.exit(1);
  }
}

start();
