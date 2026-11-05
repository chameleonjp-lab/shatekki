import { defineConfig } from 'vite';

// base './' keeps the build relocatable (GitHub Pages sub-path). The official
// public URL is not decided yet (open item O14), so nothing here assumes one.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 4096,
  },
  server: { host: '0.0.0.0' },
});
