/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // 把体积大且变动少的依赖拆成稳定 vendor chunk,
        // 配合 nginx 的长缓存(immutable),刷新时这些大依赖走 304,
        // 只需重新解析很小的页面 chunk,显著缩短刷新耗时。
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (
            id.includes('antd') ||
            id.includes('@ant-design') ||
            id.includes('/rc-') ||
            id.includes('@rc-component') ||
            id.includes('@rc-util')
          ) {
            return 'antd-vendor';
          }
          if (
            id.includes('react-dom') ||
            id.includes('react-router') ||
            id.includes('scheduler') ||
            /[\\/]node_modules[\\/]react[\\/]/.test(id)
          ) {
            return 'react-vendor';
          }
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'node',
  },
})
