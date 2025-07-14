import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/socket.io': {  
        target: 'http://localhost:5000',
        ws: true,      
        changeOrigin: true,
      }
    }
  },
  optimizeDeps: {
    include: ['socket.io-client'],  
    exclude: [],                   
  },
  build: {
    commonjsOptions: {
      include: [/socket.io-client/, /node_modules/],  // Handle CJS modules
    },
    rollupOptions: {
      external: [], 
    }
  }
});