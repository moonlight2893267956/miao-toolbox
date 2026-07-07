import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // 项目使用 context 模式，需要在同一文件导出 hooks 和组件
      'react-refresh/only-export-components': 'warn',
      // 快速迭代中 any 类型不可避免，降级为警告
      '@typescript-eslint/no-explicit-any': 'warn',
      // try/catch 中构造 JSX 在项目中是有意使用的模式
      'react-hooks/error-boundaries': 'warn',
      // 以下为 React Compiler 严格规则，对已有代码过于严格，降级为警告
      // 新代码建议遵循这些规则以启用 React Compiler 优化
      'react-hooks/static-components': 'warn',
      'react-hooks/use-memo': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/globals': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/set-state-in-render': 'warn',
      'react-hooks/config': 'warn',
      'react-hooks/gating': 'warn',
    },
  },
])
