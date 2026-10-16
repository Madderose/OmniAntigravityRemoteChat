import { defineConfig } from 'vitest/config';

const stripShebang = () => ({
  name: 'strip-shebang',
  transform(code) {
    if (code.startsWith('#!')) {
      return {
        code: code.replace(/^#!.*\r?\n/, '// shebang\n'),
        map: null
      };
    }
  }
});

export default defineConfig({
  plugins: [stripShebang()],
  test: {
    environment: 'node',
    include: ['test/unit/**/*.test.js', 'test/e2e/**/*.test.js'],
    exclude: ['test/test.js'],
    clearMocks: true,
    restoreMocks: true,
    testTimeout: 15000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: [
        'src/**/*.js',
      ],
      exclude: ['src/server.js'],
    },
  },
});
