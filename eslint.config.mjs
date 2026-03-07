import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    ignores: ['out/', 'node_modules/', 'functions/'],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // TypeScript handles these better than ESLint
      'no-unused-vars': 'off',
      'no-undef': 'off',
    },
  },
];
