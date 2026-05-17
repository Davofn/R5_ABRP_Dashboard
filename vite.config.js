import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/R5_ABRP_Dashboard/',
  build: {
    outDir: 'dist'
  }
});
