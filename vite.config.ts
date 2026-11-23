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
      allowedHosts: true as any,
      proxy: {
        '/api.php': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
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
