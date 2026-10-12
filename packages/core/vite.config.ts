import { defineConfig } from 'vite'

// IIFE 全局版：供经典 <script> 标签 CDN 直引，挂 window.filpbook。
// ESM 主产物与 AMD 产物由 tsc 负责（pnpm build 顺序：tsc ESM → tsc AMD → vite IIFE）。
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false, // dist 里还有 tsc 的 ESM/AMD 产物，别清
    minify: false, // 交给 CDN 按需（.min.js），发布可读源
    lib: {
      entry: 'src/index.ts',
      name: 'filpbook',
      formats: ['iife'],
      fileName: () => 'index.iife.js',
    },
  },
})
