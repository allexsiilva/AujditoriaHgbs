import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    base: './',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    esbuild: {
      drop: ['debugger'],
      legalComments: 'none',
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      emptyOutDir: true,
      target: 'es2022',
      minify: 'esbuild',
      cssMinify: true,
      cssCodeSplit: true,
      sourcemap: false,
      assetsInlineLimit: 4096,
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          entryFileNames: 'assets/js/[name]-[hash].js',
          chunkFileNames: 'assets/js/[name]-[hash].js',
          assetFileNames: (assetInfo) => {
            const ext = (assetInfo.names?.[0] || '').split('.').pop()?.toLowerCase() || 'bin';
            if (ext === 'css') return 'assets/css/[name]-[hash][extname]';
            if (['png', 'jpg', 'jpeg', 'webp', 'svg', 'ico'].includes(ext)) return 'assets/img/[name]-[hash][extname]';
            if (['woff', 'woff2', 'ttf', 'eot'].includes(ext)) return 'assets/fonts/[name]-[hash][extname]';
            return 'assets/[name]-[hash][extname]';
          },
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            if (id.includes('recharts') || id.includes('d3-')) return 'charts';
            if (id.includes('jspdf') || id.includes('html-to-image') || id.includes('html2canvas')) return 'pdf-exports';
            if (id.includes('xlsx')) return 'xlsx-exports';
            if (id.includes('socket.io-client') || id.includes('engine.io-client')) return 'realtime';
            if (id.includes('lucide-react') || id.includes('motion')) return 'ui-motion';
            if (id.includes('react-dom') || id.includes('/react/')) return 'vendor-react';
          },
        },
      },
    },
    server: {
      host: '0.0.0.0',
      allowedHosts: true as any,
      proxy: {
        '/api.php': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
          secure: false,
        },
        '/api': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
          secure: false,
        },
        '/socket.io': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
          secure: false,
          ws: true,
        },
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {
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
      },
    },
  };
});
