import { defineConfig } from 'vite';

const base = process.env.VITE_BASE_PATH || '/';

export default defineConfig({
  base,
  server: {
    port: 5173,
    proxy: {
      '/hub': {
        target: 'http://localhost:5280',
        changeOrigin: true,
        ws: true,
      },
      '/api': {
        target: 'http://localhost:5280',
        changeOrigin: true,
      },
    },
  },
});
