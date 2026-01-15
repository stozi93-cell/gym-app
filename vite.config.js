import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  build: {
    outDir: 'dist', // Specifies the output directory
    emptyOutDir: true, // Optional: Clears the directory before each build
  },
  plugins: [react()],
  css: {
    postcss: './postcss.config.js' // explicitly point to PostCSS config
  }
})


