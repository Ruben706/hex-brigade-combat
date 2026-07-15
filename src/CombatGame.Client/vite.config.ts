import { defineConfig } from 'vite';

export default defineConfig({
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
