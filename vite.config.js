import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('react-router')) return 'vendor-router'
          if (id.includes('/react-dom/') || id.includes('/react/') || id.includes('scheduler')) return 'vendor-react'
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory-vendor')) return 'vendor-recharts'
          if (id.includes('lucide-react')) return 'vendor-icons'
          if (id.includes('@supabase')) return 'vendor-supabase'
          if (id.includes('@uiw/react-md-editor') || id.includes('@uiw/react-markdown-preview') || id.includes('rehype') || id.includes('remark') || id.includes('refractor') || id.includes('micromark') || id.includes('mdast') || id.includes('hast-util') || id.includes('unist-util')) return 'vendor-md'
          if (id.includes('html2canvas')) return 'vendor-html2canvas'
          // Deixar o Rollup decidir os restantes (split natural por entrypoint)
        },
      },
    },
  },
})
