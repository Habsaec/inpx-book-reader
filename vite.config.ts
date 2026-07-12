/**
 * ⚠️ Vite конфиг для INPX Book Reader — Android-приложение (Capacitor).
 * 
 * 📱 Только Android. iOS и десктоп не поддерживаются.
 * 🚫 server.ts — только для dev в браузере, не улучшать.
 * 
 * @see AGENTS.md
 */

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    base: './',
    plugins: [react(), tailwindcss()],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/motion')) return 'motion';
            if (id.includes('node_modules/lucide-react')) return 'icons';
            if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) return 'react-vendor';
            if (id.includes('/src/components/CatalogTab')) return 'catalog';
            if (id.includes('/src/components/FoliateReader')) return 'reader';
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
