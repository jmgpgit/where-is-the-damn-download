import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Domain, github and storage suites run in "node"; content-script suites
    // opt into jsdom per file with `// @vitest-environment jsdom`.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
