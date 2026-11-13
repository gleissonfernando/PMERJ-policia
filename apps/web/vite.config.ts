import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    strictPort: true,
    // /api vai para a API — mesma origem, então o cookie de sessão funciona sem CORS.
    proxy: {
      '/api': { target: 'http://localhost:3333', changeOrigin: false },
    },
  },
  build: {
    sourcemap: false, // não expor o código-fonte em produção
  },
})
