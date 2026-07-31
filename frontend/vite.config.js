import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const loaderOverrides = {
  '.js': 'jsx',
  '.ts': 'tsx',
  '.tsx': 'tsx',
  '.jsx': 'jsx'
}

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true
      }
    },
    watch: {
      usePolling: true,
      interval: 100
    }
  },
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.[jt]sx?$/,
    exclude: []
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: loaderOverrides
    }
  }
})
