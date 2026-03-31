import { defineConfig } from 'vite'

export default defineConfig({
  root: 'playground',
  base: '/',
  build: { outDir: '../dist', emptyOutDir: true },
})
