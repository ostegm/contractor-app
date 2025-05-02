/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

export default defineConfig({
  test: {
    environment: 'node',
    include: ['apps/*/tests/**/*.test.ts'],
  },
});