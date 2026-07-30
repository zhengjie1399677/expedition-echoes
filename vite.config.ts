import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const pagesBase = '/expedition-echoes/';

function prefixRuntimePublicAssets(): Plugin {
  return {
    name: 'prefix-runtime-public-assets',
    apply: 'build',
    renderChunk(code) {
      if (!code.includes('/assets/')) return null;

      return {
        code: code.replaceAll('/assets/', `${pagesBase}assets/`),
        map: null,
      };
    },
  };
}

export default defineConfig({
  base: pagesBase,
  plugins: [prefixRuntimePublicAssets(), react()],
});
