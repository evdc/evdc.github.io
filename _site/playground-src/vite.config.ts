import { defineConfig } from 'vite'

export default defineConfig({
  root: 'playground-src',
  base: '/playground/',
  build: {
    outDir: '../playground',
    emptyOutDir: true,
    sourcemap: true
  }
})