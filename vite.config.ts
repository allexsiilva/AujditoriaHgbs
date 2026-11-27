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
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'lucide-react', 'motion'],
            charts: ['recharts'],
            exports: ['jspdf', 'jspdf-autotable', 'xlsx', 'html-to-image'],
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
