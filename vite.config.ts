import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  plugins: [vue(), react()],
  optimizeDeps: {
    // playground 首次请求 vue/react 会触发按需预构建 → server 中途重启，
    // headless + virtual-time 的页面加载会撞上卡死；启动时预先备好
    include: ['vue', 'react', 'react-dom', 'react-dom/client'],
  },
  resolve: {
    alias: {
      '@x-ac/filpbook-core': r('./packages/core/src/index.ts'),
      '@x-ac/filpbook-vue': r('./packages/vue/src/index.ts'),
      '@x-ac/filpbook-react': r('./packages/react/src/index.tsx'),
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
