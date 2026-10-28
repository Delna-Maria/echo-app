import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// base './' makes the built site work on GitHub Pages (it lives in a sub-folder URL)
export default defineConfig({ base: './', plugins: [react()], optimizeDeps: { exclude: ['@huggingface/transformers'] }, build: { chunkSizeWarningLimit: 4000 } });
