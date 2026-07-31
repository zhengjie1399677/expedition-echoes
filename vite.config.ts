import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const pagesBase = '/expedition-echoes/';

function prefixRuntimePublicAssets(): Plugin {
  return {
    name: 'prefix-runtime-public-assets',
    transform(code, id) {
      // 只处理 React/TS/CSS 源码，跳过 node_modules 与虚拟模块
      if (id.includes('node_modules') || id.startsWith('\0')) return null;
      if (!code.includes('/assets/')) return null;

      const replaced = code.replaceAll(
        '/assets/',
        `${pagesBase}assets/`,
      );
      return { code: replaced, map: null };
    },
  };
}

export default defineConfig({
  base: pagesBase,
  plugins: [prefixRuntimePublicAssets(), react()],
});
