/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // 少し古いスマホのブラウザでも動くように、新しい構文を変換する
  build: { target: ['es2019', 'safari13', 'chrome80'] },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
  },
});
