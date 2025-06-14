import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  
  // Vite 6 options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 3000,
    strictPort: true,
    // Vite 6 improved HMR for better development experience
    hmr: {
      overlay: true,
    },
  },
  
  // 3. to make use of `TAURI_DEBUG` and other env variables
  // https://tauri.app/v2/guides/frontend/vite/
  envPrefix: ['VITE_', 'TAURI_'],
  
  build: {
    // Updated for modern browser support with Vite 6
    target: process.env.TAURI_PLATFORM == 'windows' ? 'chrome110' : 'safari15',
    // don't minify for debug builds
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    // produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_DEBUG,
    // Vite 6 improved tree-shaking and module resolution
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          tari: ['@tari-project/tarijs-core', '@tari-project/tarijs-wallet'],
        },
      },
    },
  },
  
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  
  // Vite 6 CSS handling improvements
  css: {
    devSourcemap: true,
  },
});
