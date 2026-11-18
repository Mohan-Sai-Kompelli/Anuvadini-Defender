import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  // Built output is served by the portal under /site/ (see build:site).
  base: command === 'build' ? '/site/' : '/',
  plugins: [react()],
  server: {
    port: 3010,
    proxy: {
      // Backend API
      '/api': 'http://localhost:5001',
      // Portal (login/dashboard) routes
      '/login': 'http://localhost:19055',
      '/dashboard': 'http://localhost:19055',
      '/register': 'http://localhost:19055',
      '/static': 'http://localhost:19055',
      '/manifest.json': 'http://localhost:19055',
      '/sockjs-node': { target: 'http://localhost:19055', ws: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three', '@react-three/fiber'],
          gsap: ['gsap'],
        },
      },
    },
  },
}));
