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
import {defineConfig, type Plugin} from 'vite';
import {addFlexGapFallback, physicalizeLogicalCss, unwrapCssLayers} from './scripts/unwrap-css-layers.mjs';

/** Chrome 83 (Android 11 emulator WebView) ignores `@layer` and drops the utilities inside. */
function unwrapCssLayersPlugin(): Plugin {
  return {
    name: 'unwrap-css-layers',
    generateBundle(_options, bundle) {
      for (const item of Object.values(bundle)) {
        if (item.type !== 'asset' || !item.fileName.endsWith('.css')) continue;
        const source = typeof item.source === 'string' ? item.source : Buffer.from(item.source).toString('utf8');
        item.source = addFlexGapFallback(physicalizeLogicalCss(unwrapCssLayers(source)));
      }
    },
  };
}

export default defineConfig(() => {
  return {
    base: './',
    plugins: [react(), tailwindcss(), unwrapCssLayersPlugin()],
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
      // build:android rewrites these trees; watching them crashes dev with EBUSY on Windows.
      watch: process.env.DISABLE_HMR === 'true'
        ? null
        : { ignored: ['**/public/foliate/**', '**/dist/**', '**/android/**'] },
    },
  };
});
