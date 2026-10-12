import { defineConfig } from 'vite'

// 浏览器直引产物：IIFE（经典 <script>，全局 filpbook）+ UMD（AMD/CJS/全局三合一）。
// ESM 主产物由 tsc 负责（pnpm build 顺序：tsc ESM → vite IIFE+UMD）。
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false, // dist 里还有 tsc 的 ESM 产物，别清
    minify: false, // 交给 CDN 按需（.min.js），发布可读源
    lib: {
      entry: 'src/index.ts',
      name: 'filpbook',
      formats: ['iife', 'umd'],
      fileName: (format) => (format === 'iife' ? 'index.iife.js' : 'index.umd.js'),
    },
  },
})
