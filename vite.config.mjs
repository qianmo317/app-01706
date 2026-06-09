import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 保持现有文件结构：以 frontend-user 为 Vite 根目录，
// 业务源码（index.html / js / css / libs）均不改动；
// 构建产物输出到项目根的 dist/。
export default defineConfig({
  root: path.resolve(__dirname, 'frontend-user'),
  base: './',
  publicDir: false,
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    assetsDir: 'assets',
    sourcemap: false,
    rollupOptions: {
      input: path.resolve(__dirname, 'frontend-user/index.html'),
    },
  },
  server: {
    port: 5173,
    open: false,
  },
  preview: {
    port: 4173,
    open: false,
  },
});
