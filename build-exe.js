import fs from 'fs';
import path from 'path';
import { execFileSync, spawnSync } from 'child_process';

const ROOT = process.cwd();
const DIST_DIR = path.join(ROOT, 'dist');
const RELEASE_DIR = path.join(ROOT, 'release');

const MIME_MAP = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_MAP[ext] || 'application/octet-stream';
}

function walkFiles(dir, baseDir, acc = {}) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, baseDir, acc);
    } else if (entry.isFile()) {
      // Não embute arquivos do servidor/mapa/blob dentro dos assets web
      if (
        entry.name.endsWith('.map') ||
        entry.name.endsWith('.cjs') ||
        entry.name.endsWith('.blob') ||
        entry.name === 'sea-config.json' ||
        entry.name === 'embedded-frontend.json'
      ) {
        continue;
      }
      const relUrl = '/' + path.relative(baseDir, fullPath).replace(/\\/g, '/');
      acc[relUrl] = {
        contentType: getMimeType(fullPath),
        base64: fs.readFileSync(fullPath).toString('base64'),
      };
    }
  }
  return acc;
}

/**
 * Remove a assinatura digital Authenticode (Security Directory) do PE Windows
 * sem depender do signtool.exe externo, permitindo injetar o blob SEA no node.exe.
 */
function stripWindowsPeSignature(exePath) {
  const buf = fs.readFileSync(exePath);
  if (buf.length < 64 || buf.readUInt16LE(0) !== 0x5a4d) return false;
  const peOffset = buf.readUInt32LE(0x3c);
  if (peOffset + 24 >= buf.length || buf.readUInt32LE(peOffset) !== 0x00004550) return false;

  const optionalHeaderOffset = peOffset + 24;
  const magic = buf.readUInt16LE(optionalHeaderOffset);
  // PE32 (0x10b) -> DataDirectory começa em +96; PE32+ / x64 (0x20b) -> começa em +112
  const dataDirOffset = magic === 0x20b ? optionalHeaderOffset + 112 : optionalHeaderOffset + 96;
  // Security Directory é o índice 4 (cada entrada tem 8 bytes: VirtualAddress/Offset + Size)
  const securityDirOffset = dataDirOffset + 4 * 8;
  if (securityDirOffset + 8 > buf.length) return false;

  const certOffset = buf.readUInt32LE(securityDirOffset);
  const certSize = buf.readUInt32LE(securityDirOffset + 4);
  if (certOffset === 0 && certSize === 0) return false;

  buf.writeUInt32LE(0, securityDirOffset);
  buf.writeUInt32LE(0, securityDirOffset + 4);
  fs.writeFileSync(exePath, buf);
  return true;
}

function copyDirIfMissing(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirIfMissing(srcPath, destPath);
    } else if (!fs.existsSync(destPath)) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function buildExecutable() {
  console.log('==============================================================');
  console.log(' Compilando HospAudit para Executavel Standalone (.exe)');
  console.log('==============================================================');

  // 1. Compilar Frontend (Vite) e arquivos base
  console.log('\n[1/5] Compilando interface web (Vite)...');
  const viteBin = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite');
  const viteRes = spawnSync(viteBin, ['build'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (viteRes.status !== 0) {
    throw new Error('Falha ao compilar o frontend com Vite.');
  }

  // 2. Empacotar dist/ web em mapa embutido
  console.log('\n[2/5] Empacotando interface web dentro do executavel...');
  const embeddedAssets = walkFiles(DIST_DIR, DIST_DIR);
  const embeddedPath = path.join(DIST_DIR, 'embedded-frontend.json');
  fs.writeFileSync(embeddedPath, JSON.stringify(embeddedAssets), 'utf8');
  console.log(`      ${Object.keys(embeddedAssets).length} arquivos de interface incorporados.`);

  // 3. Criar entrypoint unico + bundle Node com todas as dependencias
  console.log('\n[3/5] Gerando bundle unico do servidor Node.js...');
  const entryWrapperPath = path.join(DIST_DIR, '_exe_entry.ts');
  const standaloneBundlePath = path.join(DIST_DIR, 'hospaudit-standalone.cjs');
  fs.writeFileSync(
    entryWrapperPath,
    `import embeddedFrontend from './embedded-frontend.json';\n` +
    `(globalThis as any).__HOSPAUDIT_EMBEDDED_DIST__ = embeddedFrontend;\n` +
    `require('../server');\n`,
    'utf8'
  );

  const esbuildBin = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'esbuild.cmd' : 'esbuild');
  const esbuildRes = spawnSync(
    esbuildBin,
    [
      entryWrapperPath,
      '--bundle',
      '--platform=node',
      '--format=cjs',
      '--external:vite',
      '--external:bufferutil',
      '--external:utf-8-validate',
      `--outfile=${standaloneBundlePath}`,
    ],
    {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    }
  );
  if (esbuildRes.status !== 0) {
    throw new Error('Falha ao empacotar server.ts com esbuild.');
  }

  // 4. Gerar blob Node.js SEA
  console.log('\n[4/5] Preparando blob executavel (Node.js SEA)...');
  const seaConfigPath = path.join(DIST_DIR, 'sea-config.json');
  const seaBlobPath = path.join(DIST_DIR, 'sea-prep.blob');
  fs.writeFileSync(
    seaConfigPath,
    JSON.stringify(
      {
        main: standaloneBundlePath,
        output: seaBlobPath,
        disableExperimentalSEAWarning: true,
        useCodeCache: false,
      },
      null,
      2
    ),
    'utf8'
  );

  execFileSync(process.execPath, ['--experimental-sea-config', seaConfigPath], {
    stdio: 'inherit',
  });

  // 5. Copiar binario Node e injetar aplicacao via postject
  console.log('\n[5/5] Gerando arquivo executavel final em release/...');
  if (!fs.existsSync(RELEASE_DIR)) {
    fs.mkdirSync(RELEASE_DIR, { recursive: true });
  }

  const exeName = process.platform === 'win32' ? 'HospAudit.exe' : 'hospaudit';
  const targetExePath = path.join(RELEASE_DIR, exeName);
  fs.copyFileSync(process.execPath, targetExePath);

  if (process.platform === 'win32') {
    const stripped = stripWindowsPeSignature(targetExePath);
    if (stripped) {
      console.log('      Assinatura base do runtime removida para injeção SEA.');
    }
  } else if (process.platform === 'darwin') {
    try {
      execFileSync('codesign', ['--remove-signature', targetExePath], { stdio: 'ignore' });
    } catch {}
  }

  const postjectBin = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'postject.cmd' : 'postject');
  const postjectArgs = [
    targetExePath,
    'NODE_SEA_BLOB',
    seaBlobPath,
    '--sentinel-fuse',
    'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
    '--overwrite',
  ];
  if (process.platform === 'darwin') {
    postjectArgs.push('--macho-segment-name', 'NODE_SEA');
  }

  const postjectRes = spawnSync(postjectBin, postjectArgs, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (postjectRes.status !== 0) {
    throw new Error('Falha ao injetar blob no executavel com postject.');
  }

  if (process.platform !== 'win32') {
    fs.chmodSync(targetExePath, 0o755);
  }

  // Copia arquivos iniciais de dados e .env para a pasta release/ se ainda nao existirem
  copyDirIfMissing(path.join(ROOT, 'data'), path.join(RELEASE_DIR, 'data'));
  const releaseEnv = path.join(RELEASE_DIR, '.env');
  const rootEnv = path.join(ROOT, '.env');
  const rootEnvExample = path.join(ROOT, '.env.example');
  if (!fs.existsSync(releaseEnv)) {
    if (fs.existsSync(rootEnv)) {
      fs.copyFileSync(rootEnv, releaseEnv);
    } else if (fs.existsSync(rootEnvExample)) {
      fs.copyFileSync(rootEnvExample, releaseEnv);
    }
  }

  // Limpeza de arquivos intermediarios
  [embeddedPath, entryWrapperPath, standaloneBundlePath, seaConfigPath, seaBlobPath].forEach((f) => {
    try {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    } catch {}
  });

  const sizeMb = (fs.statSync(targetExePath).size / (1024 * 1024)).toFixed(1);
  console.log('\n==============================================================');
  console.log(` SUCESSO! Executavel gerado: release/${exeName} (${sizeMb} MB)`);
  console.log(' Basta executar esse arquivo (ou copiar a pasta release/)');
  console.log(' e acessar http://localhost:3000 no navegador.');
  console.log('==============================================================');
}

buildExecutable().catch((err) => {
  console.error('\n[ERRO] Falha ao compilar executavel:', err?.message || err);
  process.exit(1);
});
