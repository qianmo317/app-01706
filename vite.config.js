import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  root: 'frontend-user',
  base: './',
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'frontend-user/index.html'),
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
})
