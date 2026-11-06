import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // A run that finds no test files must fail (plan: "テスト0件を合格にしない").
    passWithNoTests: false,
    allowOnly: false,
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          testTimeout: 60_000,
        },
      },
    ],
  },
});
