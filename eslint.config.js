import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  { ignores: ['**/dist/**', '**/dist-card/**', 'test-results/**', 'playwright-report/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Node scripts (the core's generator of the coasts).
  { files: ['**/scripts/**/*.mjs'], languageOptions: { globals: { process: 'readonly', console: 'readonly', fetch: 'readonly', URL: 'readonly', URLSearchParams: 'readonly', WebSocket: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly', AbortSignal: 'readonly' } } },
  // The site (docs/), plain browser scripts.
  { files: ['docs/assets/*.js'], languageOptions: { globals: { document: 'readonly', location: 'readonly', window: 'readonly', navigator: 'readonly', setTimeout: 'readonly' } } },
];
