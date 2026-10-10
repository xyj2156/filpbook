import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  plugins: [vue(), react()],
  resolve: {
    alias: {
      '@x-ac/filpbook-core': r('./packages/core/src/index.ts'),
      '@x-ac/filpbook-vue': r('./packages/vue/src/index.ts'),
      '@x-ac/filpbook-react': r('./packages/react/src/index.ts'),
    },
  },
  server: { port: 5199, strictPort: true },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        smoke: r('./tools/smoke.html'),
        vue: r('./playground/index.html'),
        react: r('./playground/react.html'),
      },
    },
  },
})
