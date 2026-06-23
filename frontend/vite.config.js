import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    alias: {
      'pixi.js': new URL('./src/test/pixiMock.js', import.meta.url).pathname,
    },
  },
});
