// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// https://astro.build/config
export default defineConfig({
  integrations: [react()],

  vite: {
    plugins: [
      tailwindcss(),
      nodePolyfills({
        include: ['buffer', 'process'],
        globals: {
          Buffer: true,
          global: true,
          process: true,
        },
      }),
    ],
    optimizeDeps: {
      exclude: ['webtorrent']
    },
    ssr: {
      external: ['webtorrent']
    },
    server: {
      headers: {
        'Cross-Origin-Opener-Policy': 'unsafe-none',
        'Cross-Origin-Embedder-Policy': 'unsafe-none',
      },
    },
  }
});