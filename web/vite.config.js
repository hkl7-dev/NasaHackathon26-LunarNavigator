import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Serve the repo-level public/ folder (engine output lives in public/data)
export default defineConfig({
  plugins: [react()],
  publicDir: '../public',
  base: './',
})
