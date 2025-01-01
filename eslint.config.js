import prettier from 'eslint-config-prettier'
import js from '@eslint/js'
import globals from 'globals'

export default [
  js.configs.recommended,
  prettier,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },
  {
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', errorIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-case-declarations': 'off',
    },
  },
]
