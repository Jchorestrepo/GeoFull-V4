import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 8080,
    host: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor_react: ['react', 'react-dom', 'react-router-dom'],
          vendor_xlsx: ['xlsx'],
          vendor_leaflet: ['leaflet'],
          vendor_icons: ['lucide-react']
        }
      }
    }
  }
});
