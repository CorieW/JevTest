// Single-package TypeScript and Node lint rules.
import eslint from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', 'artifacts/**', 'output/**', 'coverage/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
)
