/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { g92Pwa } from './src/kit/pwa.ts';

export default defineConfig({
  base: '/dots/',
  server: { port: 5178, strictPort: true, host: true },
  preview: { port: 5178, strictPort: true },
  worker: { format: 'es' },
  build: { target: 'es2022', assetsInlineLimit: 4096 },
  plugins: [
    VitePWA(
      g92Pwa('dots', {
        name: 'Dots — částicový život',
        description: 'Simulace „particle life": barevné tečky, jedna matice sil a z ní samovolně vznikají buňky, hadi i lov.',
      }),
    ),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
