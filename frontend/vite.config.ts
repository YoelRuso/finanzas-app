import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Escucha en todas las interfaces para poder abrir la app desde el móvil
    // por wifi (http://<ip-del-pc>:5173) y fotografiar los tickets ahí.
    host: true,
  },
})
